/** Transit schedule graph and path validation */

import type { Route, Station, StComboTiming } from '../types/game-state';
import type { Coordinate } from '../types/core';
import type { HideCandidate, PathLeg, ValidatedPath } from './types';
import { getStationDisplayName } from './displayNames';
import { getCurrentTimeOfDaySeconds } from './geo';
import {
  buildDepartureIndex,
  edgeDepartureKey,
  firstDepartureAtOrAfter,
  type DepartureIndex,
} from './realDepartures';
import { getLogicalLineId, isMovingLeg } from './logicalLines';
import { countRouteTransfers } from './pathFormat';
import { areSameStationGroup } from './stationGroups';

const api = window.SubwayBuilderAPI;

const TRANSFER_WALK_SECONDS = 120;
const AVG_TRAIN_SPEED_MPS = 12;
const DEFAULT_DWELL_SECONDS = 20;
/** Cap graph expansions so large maps cannot freeze the game thread. */
const MAX_SEARCH_EXPANSIONS = 40_000;
/** Bucket visit times to prune duplicate search states. */
const VISIT_TIME_BUCKET_SECONDS = 30;

let cachedStNodeMap: Map<string, string> | null = null;
let cachedStationCount = -1;

interface GraphNode {
  stationId: string;
  routeId: string;
  stopIndex: number;
}

const DAY_SECONDS = 86400;

interface GraphEdge {
  fromStopIndex: number;
  to: GraphNode;
  leg: Omit<PathLeg, 'departureTime' | 'arrivalTime'>;
}

interface ScheduledLeg {
  departure: number;
  arrival: number;
  journeySeconds: number;
  leg: PathLeg;
}

interface SearchState {
  node: GraphNode;
  readyAt: number;
  journeyElapsed: number;
  legs: PathLeg[];
}

interface RealSearchState {
  node: GraphNode;
  readyAtElapsed: number;
  journeyElapsed: number;
  legs: PathLeg[];
}

interface RouteStopInfo {
  route: Route;
  stopStationIds: string[];
  timingsByIndex: StComboTiming[];
  cycleSeconds: number;
}

export type { RouteStopInfo };

function getStationMap(stations: Station[]): Map<string, Station> {
  return new Map(stations.map((s) => [s.id, s]));
}

function buildStationGroups(stations: Station[]): Map<string, string> {
  const canonical = new Map<string, string>();

  for (const station of stations) {
    if (!canonical.has(station.id)) {
      canonical.set(station.id, station.id);
    }
    for (const sib of api.gameState.getSiblingStationIds(station.id)) {
      canonical.set(sib, canonical.get(station.id)!);
    }
  }

  for (const station of stations) {
    if (!canonical.has(station.id)) {
      canonical.set(station.id, station.id);
    }
  }

  return canonical;
}

function canonicalize(stationId: string, groups: Map<string, string>): string {
  return groups.get(stationId) ?? stationId;
}

function getStNodeToStationIdMap(): Map<string, string> {
  const stations = api.gameState.getStations();
  if (cachedStNodeMap && cachedStationCount === stations.length) {
    return cachedStNodeMap;
  }

  const map = new Map<string, string>();
  for (const station of stations) {
    for (const stNodeId of station.stNodeIds) {
      map.set(stNodeId, station.id);
    }
  }

  cachedStNodeMap = map;
  cachedStationCount = stations.length;
  return map;
}

function resolveStNodeToStationId(stNodeId: string, route?: Route): string | null {
  const cached = getStNodeToStationIdMap().get(stNodeId);
  if (cached) return cached;

  for (const station of route?.stations ?? []) {
    if (station.stNodeIds.includes(stNodeId) || station.id === stNodeId) {
      return station.id;
    }
  }

  return null;
}

function getRouteStopStationIds(route: Route, timings: StComboTiming[]): string[] {
  if ((route.stations?.length ?? 0) >= 2) {
    return route.stations!.map((s) => s.id);
  }

  const ordered = [...timings].sort((a, b) => a.stNodeIndex - b.stNodeIndex);
  const ids: string[] = [];

  for (const timing of ordered) {
    const stationId = resolveStNodeToStationId(timing.stNodeId, route);
    if (stationId && !ids.includes(stationId)) ids.push(stationId);
  }

  if (ids.length >= 2) return ids;

  if (route.stations?.length) {
    return route.stations.map((s) => s.id);
  }

  for (const node of route.stNodes ?? []) {
    const stationId = resolveStNodeToStationId(node.id, route);
    if (stationId && !ids.includes(stationId)) ids.push(stationId);
  }

  return ids;
}

function buildRouteStopInfo(route: Route): RouteStopInfo | null {
  const timings = route.stComboTimings ?? [];
  const stopStationIds = getRouteStopStationIds(route, timings);

  if (stopStationIds.length < 2) return null;

  const timingsByIndex = timings.length
    ? [...timings].sort((a, b) => a.stNodeIndex - b.stNodeIndex)
    : [];

  let cycleSeconds = 3600;
  if (timingsByIndex.length > 0) {
    const departures = timingsByIndex.map((t) => t.departureTime);
    const arrivals = timingsByIndex.map((t) => t.arrivalTime);
    const span = Math.max(...departures, ...arrivals) - Math.min(...departures, ...arrivals);
    cycleSeconds = Math.max(span, 300);
  }

  return { route, stopStationIds, timingsByIndex, cycleSeconds };
}

function getRouteHeadwaySeconds(route: Route): number {
  const sched = route.trainSchedule;
  if (sched) {
    const headways = [sched.highDemand, sched.mediumDemand, sched.lowDemand].filter(
      (value) => value > 0,
    );
    if (headways.length > 0) return Math.min(...headways);
  }
  return 900;
}

function usesAbsoluteTimeOfDay(timings: StComboTiming[]): boolean {
  if (timings.length === 0) return false;
  const max = Math.max(...timings.flatMap((t) => [t.arrivalTime, t.departureTime]));
  return max > 3600 * 6;
}

function normalizeTimeOfDay(seconds: number): number {
  return ((seconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
}

/** Pick the next train departure at or after readyAt — bot may wait for a later service */
function scheduleLegFromTimings(
  readyAt: number,
  fromTiming: StComboTiming,
  toTiming: StComboTiming,
  headway: number,
  absoluteTimes: boolean,
  legBase: Omit<PathLeg, 'departureTime' | 'arrivalTime'>,
): ScheduledLeg | null {
  const runDuration = toTiming.arrivalTime - fromTiming.departureTime;
  if (runDuration <= 0 && absoluteTimes) {
    return null;
  }

  let departure: number;
  let arrival: number;

  if (absoluteTimes) {
    departure = fromTiming.departureTime;
    while (departure < readyAt) departure += headway;
    arrival = departure + normalizeDelta(
      fromTiming.departureTime,
      toTiming.arrivalTime,
      headway,
    );
  } else {
    const fromOffset = fromTiming.departureTime;
    const toOffset = toTiming.arrivalTime;
    const segmentDuration = Math.max(0, toOffset - fromOffset);

    let runIndex = Math.floor((readyAt - fromOffset) / headway);
    if (runIndex < 0) runIndex = 0;

    departure = runIndex * headway + fromOffset;
    while (departure < readyAt) {
      runIndex += 1;
      departure = runIndex * headway + fromOffset;
    }

    arrival = runIndex * headway + toOffset;
    if (segmentDuration === 0 && arrival < departure) return null;
  }

  const wait = departure - readyAt;
  const journeySeconds = wait + Math.max(0, arrival - departure);

  return {
    departure: normalizeTimeOfDay(departure),
    arrival: normalizeTimeOfDay(arrival),
    journeySeconds,
    leg: {
      ...legBase,
      departureTime: normalizeTimeOfDay(departure),
      arrivalTime: normalizeTimeOfDay(arrival),
    },
  };
}

function scheduleFallbackLeg(
  readyAt: number,
  travelSeconds: number,
  legBase: Omit<PathLeg, 'departureTime' | 'arrivalTime'>,
): ScheduledLeg {
  const departure = readyAt;
  const arrival = readyAt + travelSeconds;
  return {
    departure: normalizeTimeOfDay(departure),
    arrival: normalizeTimeOfDay(arrival),
    journeySeconds: travelSeconds,
    leg: {
      ...legBase,
      departureTime: normalizeTimeOfDay(departure),
      arrivalTime: normalizeTimeOfDay(arrival),
    },
  };
}

function normalizeDelta(from: number, to: number, cycle: number): number {
  let delta = to - from;
  if (delta < 0) delta += cycle;
  return Math.max(0, delta);
}

function tryTraverseEdge(
  state: SearchState,
  edge: GraphEdge,
  info: RouteStopInfo,
  stationMap: Map<string, Station>,
  maxTravelSeconds: number,
): SearchState | null {
  const fromStation = stationMap.get(edge.leg.fromStationId);
  const toStation = stationMap.get(edge.leg.toStationId);
  if (!fromStation || !toStation) return null;
  if (!isMovingLeg(edge.leg.fromStationId, edge.leg.toStationId)) return null;

  const fromTiming = timingAtStop(info, edge.fromStopIndex);
  const toTiming = timingAtStop(info, edge.to.stopIndex);
  const headway = getRouteHeadwaySeconds(info.route);
  const absoluteTimes = usesAbsoluteTimeOfDay(info.timingsByIndex);

  let scheduled: ScheduledLeg | null = null;
  const forwardHop = edge.fromStopIndex < edge.to.stopIndex;

  if (forwardHop && fromTiming && toTiming) {
    scheduled = scheduleLegFromTimings(
      state.readyAt,
      fromTiming,
      toTiming,
      headway,
      absoluteTimes,
      edge.leg,
    );
  }

  if (!scheduled) {
    const travelSeconds = segmentTravelSeconds(
      info,
      edge.fromStopIndex,
      edge.to.stopIndex,
    );
    if (!Number.isFinite(travelSeconds) || travelSeconds > maxTravelSeconds) return null;
    scheduled = scheduleFallbackLeg(state.readyAt, travelSeconds, edge.leg);
  }

  const newJourneyElapsed = state.journeyElapsed + scheduled.journeySeconds;
  if (newJourneyElapsed > maxTravelSeconds) return null;

  return {
    node: edge.to,
    readyAt: scheduled.arrival,
    journeyElapsed: newJourneyElapsed,
    legs: [...state.legs, scheduled.leg],
  };
}

function timingAtStop(info: RouteStopInfo, stopIndex: number): StComboTiming | null {
  const stationId = info.stopStationIds[stopIndex];
  if (!stationId) return null;
  return (
    info.timingsByIndex.find(
      (t) => resolveStNodeToStationId(t.stNodeId, info.route) === stationId,
    ) ?? info.timingsByIndex[stopIndex] ?? null
  );
}

function segmentTravelSeconds(
  info: RouteStopInfo,
  fromIndex: number,
  toIndex: number,
): number {
  if (fromIndex === toIndex) return Infinity;

  const min = Math.min(fromIndex, toIndex);
  const max = Math.max(fromIndex, toIndex);

  const fromTiming = timingAtStop(info, min);
  const toTiming = timingAtStop(info, max);
  if (fromTiming && toTiming) {
    return normalizeDelta(
      fromTiming.departureTime,
      toTiming.arrivalTime,
      info.cycleSeconds,
    );
  }

  const stCombos = info.route.stCombos ?? [];
  let distance = 0;
  for (let i = min; i < max; i++) {
    const combo = stCombos[i];
    distance += combo?.distance ?? 500;
  }

  const stops = max - min;
  return distance / AVG_TRAIN_SPEED_MPS + stops * DEFAULT_DWELL_SECONDS;
}

function buildRouteEdges(info: RouteStopInfo, stationMap: Map<string, Station>): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const { route, stopStationIds } = info;
  const routeName = route.name ?? route.bullet ?? route.id;
  const routeBullet = route.bullet ?? '?';

  for (let fromIndex = 0; fromIndex < stopStationIds.length - 1; fromIndex++) {
    const toIndex = fromIndex + 1;
    const fromStationId = stopStationIds[fromIndex]!;
    const toStationId = stopStationIds[toIndex]!;
    const fromStation = stationMap.get(fromStationId);
    const toStation = stationMap.get(toStationId);
    if (!fromStation || !toStation) continue;

    edges.push({
      fromStopIndex: fromIndex,
      to: { stationId: toStationId, routeId: route.id, stopIndex: toIndex },
      leg: {
        routeId: route.id,
        routeName,
        routeBullet,
        fromStationId,
        fromStationName: fromStation.name,
        toStationId,
        toStationName: toStation.name,
      },
    });

    // Trains run both ways — required for line-end / line-start stations.
    edges.push({
      fromStopIndex: toIndex,
      to: { stationId: fromStationId, routeId: route.id, stopIndex: fromIndex },
      leg: {
        routeId: route.id,
        routeName,
        routeBullet,
        fromStationId: toStationId,
        fromStationName: toStation.name,
        toStationId: fromStationId,
        toStationName: fromStation.name,
      },
    });
  }

  return edges;
}

function nodeKey(routeId: string, stopIndex: number, stationId: string): string {
  return `${routeId}|${stopIndex}|${stationId}`;
}

function rebuildPath(legs: PathLeg[], totalTimeSeconds: number): ValidatedPath {
  return {
    legs,
    totalTimeSeconds,
    transferCount: countRouteTransfers(legs),
  };
}

/** Prefer shortest schedule-valid path; tie-break on more real transfers. */
function isBetterHidePath(candidate: ValidatedPath, current: ValidatedPath): boolean {
  if (candidate.totalTimeSeconds !== current.totalTimeSeconds) {
    return candidate.totalTimeSeconds < current.totalTimeSeconds;
  }
  return candidate.transferCount > current.transferCount;
}

function heapPush(heap: SearchState[], item: SearchState): void {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent]!.journeyElapsed <= heap[index]!.journeyElapsed) break;
    [heap[parent], heap[index]] = [heap[index]!, heap[parent]!];
    index = parent;
  }
}

function heapPop(heap: SearchState[]): SearchState | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0]!;
  const last = heap.pop()!;
  if (heap.length === 0) return top;

  heap[0] = last;
  let index = 0;
  while (true) {
    let smallest = index;
    const left = index * 2 + 1;
    const right = left + 1;
    if (left < heap.length && heap[left]!.journeyElapsed < heap[smallest]!.journeyElapsed) {
      smallest = left;
    }
    if (right < heap.length && heap[right]!.journeyElapsed < heap[smallest]!.journeyElapsed) {
      smallest = right;
    }
    if (smallest === index) break;
    [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
    index = smallest;
  }

  return top;
}

function buildTransferIndex(
  routeInfos: RouteStopInfo[],
  groups: Map<string, string>,
): Map<string, GraphNode[]> {
  const byCanonical = new Map<string, GraphNode[]>();

  for (const info of routeInfos) {
    for (let i = 0; i < info.stopStationIds.length; i++) {
      const stationId = info.stopStationIds[i]!;
      const canon = canonicalize(stationId, groups);
      const node: GraphNode = { stationId, routeId: info.route.id, stopIndex: i };
      const list = byCanonical.get(canon);
      if (list) list.push(node);
      else byCanonical.set(canon, [node]);
    }
  }

  return byCanonical;
}

export function getPlayableRoutes(): Route[] {
  return api.gameState.getRoutes().filter((route) => {
    const info = buildRouteStopInfo(route);
    return info !== null;
  });
}

export function getPlayableRouteInfos(): RouteStopInfo[] {
  return getPlayableRoutes()
    .map(buildRouteStopInfo)
    .filter((info): info is RouteStopInfo => info !== null);
}

/** Station IDs on a route in stop order (playable or partial routes). */
export function getOrderedStationIdsForRoute(route: Route): string[] {
  const info = buildRouteStopInfo(route);
  if (info) return info.stopStationIds;

  if ((route.stations?.length ?? 0) > 0) {
    return route.stations!.map((s) => s.id);
  }

  const ids: string[] = [];
  for (const station of api.gameState.getStations()) {
    if (station.routeIds.includes(route.id) && !ids.includes(station.id)) {
      ids.push(station.id);
    }
  }
  return ids;
}

/** Station coordinates in route order, for map line overlays. */
export function getRouteStationLineCoords(routeId: string): Coordinate[] {
  const route = api.gameState.getRoutes().find((r) => r.id === routeId);
  if (!route) return [];

  const info = buildRouteStopInfo(route);
  if (!info) return [];

  const stationMap = new Map(api.gameState.getStations().map((s) => [s.id, s]));
  const coords: Coordinate[] = [];
  for (const stationId of info.stopStationIds) {
    const station = stationMap.get(stationId);
    if (station) coords.push(station.coords);
  }
  return coords;
}

function stationCoords(stationId: string): Coordinate | null {
  return api.gameState.getStations().find((s) => s.id === stationId)?.coords ?? null;
}

function findStopIndex(stopStationIds: string[], stationId: string): number {
  return stopStationIds.findIndex((id) => areSameStationGroup(id, stationId));
}

/** Coordinates along a route between two stops (inclusive), following stop order. */
export function getRouteSegmentCoords(
  routeId: string,
  fromStationId: string,
  toStationId: string,
): Coordinate[] {
  const route = api.gameState.getRoutes().find((r) => r.id === routeId);
  if (!route) {
    const from = stationCoords(fromStationId);
    const to = stationCoords(toStationId);
    return from && to ? [from, to] : [];
  }

  const info = buildRouteStopInfo(route);
  if (!info) {
    const from = stationCoords(fromStationId);
    const to = stationCoords(toStationId);
    return from && to ? [from, to] : [];
  }

  const fromIdx = findStopIndex(info.stopStationIds, fromStationId);
  const toIdx = findStopIndex(info.stopStationIds, toStationId);
  if (fromIdx < 0 || toIdx < 0) {
    const from = stationCoords(fromStationId);
    const to = stationCoords(toStationId);
    return from && to ? [from, to] : [];
  }

  const min = Math.min(fromIdx, toIdx);
  const max = Math.max(fromIdx, toIdx);
  const stationMap = new Map(api.gameState.getStations().map((s) => [s.id, s]));
  const coords: Coordinate[] = [];

  for (let i = min; i <= max; i++) {
    const station = stationMap.get(info.stopStationIds[i]!);
    if (station) coords.push(station.coords);
  }

  if (coords.length >= 2) return coords;

  const from = stationCoords(fromStationId);
  const to = stationCoords(toStationId);
  return from && to ? [from, to] : [];
}

export function getTimedRoutes(): Route[] {
  return api.gameState.getRoutes().filter((r) => (r.stComboTimings?.length ?? 0) >= 2);
}

function collectStartNodes(
  routeInfos: RouteStopInfo[],
  startStationId: string,
  groups: Map<string, string>,
): GraphNode[] {
  const startStation = api.gameState.getStations().find((s) => s.id === startStationId);
  if (!startStation) return [];

  const startCanon = canonicalize(startStationId, groups);
  const nodes: GraphNode[] = [];
  const seen = new Set<string>();

  const addNode = (node: GraphNode) => {
    const key = nodeKey(node.routeId, node.stopIndex, node.stationId);
    if (seen.has(key)) return;
    seen.add(key);
    nodes.push(node);
  };

  for (const info of routeInfos) {
    for (let i = 0; i < info.stopStationIds.length; i++) {
      const stationId = info.stopStationIds[i]!;
      if (canonicalize(stationId, groups) === startCanon) {
        addNode({ stationId, routeId: info.route.id, stopIndex: i });
      }
    }
  }

  if (nodes.length === 0 && startStation.routeIds.length > 0) {
    for (const routeId of startStation.routeIds) {
      const info = routeInfos.find((r) => r.route.id === routeId);
      if (!info) continue;

      for (const stNodeId of startStation.stNodeIds) {
        const timingIdx = info.timingsByIndex.findIndex((t) => t.stNodeId === stNodeId);
        if (timingIdx >= 0) {
          addNode({
            stationId: startStationId,
            routeId,
            stopIndex: timingIdx,
          });
          continue;
        }

        const stopIdx = info.stopStationIds.findIndex(
          (id) => canonicalize(id, groups) === startCanon,
        );
        if (stopIdx >= 0) {
          addNode({ stationId: startStationId, routeId, stopIndex: stopIdx });
        }
      }
    }
  }

  return nodes;
}

export function findValidHideCandidates(
  startStationId: string,
  candidateStationIds: string[],
  maxTravelSeconds: number,
): HideCandidate[] {
  const stations = api.gameState.getStations();
  const stationMap = getStationMap(stations);
  const groups = buildStationGroups(stations);
  const startCanon = canonicalize(startStationId, groups);

  if (!stationMap.has(startStationId)) return [];

  const candidateSet = new Set(candidateStationIds);
  const candidateByCanonical = new Map<string, string>();
  for (const id of candidateStationIds) {
    candidateByCanonical.set(canonicalize(id, groups), id);
  }
  const targetCanonical = new Set(candidateByCanonical.keys());

  const routeInfos = getPlayableRoutes()
    .map(buildRouteStopInfo)
    .filter((info): info is RouteStopInfo => info !== null);

  if (routeInfos.length === 0) return [];

  const routeInfoById = new Map(routeInfos.map((info) => [info.route.id, info]));

  const edgesByNode = new Map<string, GraphEdge[]>();
  for (const info of routeInfos) {
    for (const edge of buildRouteEdges(info, stationMap)) {
      const fromKey = nodeKey(
        info.route.id,
        edge.fromStopIndex,
        edge.leg.fromStationId,
      );
      if (!edgesByNode.has(fromKey)) edgesByNode.set(fromKey, []);
      edgesByNode.get(fromKey)!.push(edge);
    }
  }

  const startNodes = collectStartNodes(routeInfos, startStationId, groups);
  if (startNodes.length === 0) return [];

  const transfersByCanonical = buildTransferIndex(routeInfos, groups);
  const startTime = getCurrentTimeOfDaySeconds();
  const bestByStation = new Map<string, ValidatedPath>();
  const heap: SearchState[] = [];
  for (const node of startNodes) {
    heapPush(heap, {
      node,
      readyAt: startTime,
      journeyElapsed: 0,
      legs: [],
    });
  }
  const visited = new Set<string>();
  let expansions = 0;

  while (heap.length > 0) {
    if (expansions++ >= MAX_SEARCH_EXPANSIONS) break;

    const current = heapPop(heap)!;
    const canonStation = canonicalize(current.node.stationId, groups);

    const visitKey = `${canonStation}|${current.node.routeId}|${current.node.stopIndex}|${Math.floor(current.journeyElapsed / VISIT_TIME_BUCKET_SECONDS)}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    if (
      targetCanonical.has(canonStation) &&
      canonStation !== startCanon &&
      current.journeyElapsed <= maxTravelSeconds &&
      current.legs.length > 0
    ) {
      const destStationId =
        candidateByCanonical.get(canonStation) ??
        (candidateSet.has(current.node.stationId) ? current.node.stationId : null);
      if (destStationId) {
        const path = rebuildPath(current.legs, current.journeyElapsed);
        const existing = bestByStation.get(destStationId);
        if (!existing || isBetterHidePath(path, existing)) {
          bestByStation.set(destStationId, path);
        }
      }
    }

    if (current.journeyElapsed >= maxTravelSeconds) continue;

    const fromKey = nodeKey(
      current.node.routeId,
      current.node.stopIndex,
      current.node.stationId,
    );

    for (const edge of edgesByNode.get(fromKey) ?? []) {
      const info = routeInfoById.get(edge.leg.routeId);
      if (!info) continue;

      const next = tryTraverseEdge(current, edge, info, stationMap, maxTravelSeconds);
      if (next) heapPush(heap, next);
    }

    for (const transferNode of transfersByCanonical.get(canonStation) ?? []) {
      if (
        transferNode.routeId === current.node.routeId &&
        transferNode.stopIndex === current.node.stopIndex
      ) {
        continue;
      }

      const transferJourney = current.journeyElapsed + TRANSFER_WALK_SECONDS;
      if (transferJourney <= maxTravelSeconds) {
        heapPush(heap, {
          node: transferNode,
          readyAt: normalizeTimeOfDay(current.readyAt + TRANSFER_WALK_SECONDS),
          journeyElapsed: transferJourney,
          legs: current.legs,
        });
      }
    }
  }

  const results: HideCandidate[] = [];
  for (const [stationId, path] of bestByStation) {
    const station = stationMap.get(stationId);
    if (station) {
      results.push({ stationId, stationName: getStationDisplayName(station), path });
    }
  }

  return results.sort((a, b) => a.stationName.localeCompare(b.stationName));
}

function tryTraverseEdgeReal(
  state: RealSearchState,
  edge: GraphEdge,
  departureIndex: DepartureIndex,
  groups: Map<string, string>,
  maxTravelSeconds: number,
  searchStartElapsed: number,
): RealSearchState | null {
  if (!isMovingLeg(edge.leg.fromStationId, edge.leg.toStationId)) return null;

  const canon = canonicalize(edge.leg.fromStationId, groups);
  const key = edgeDepartureKey(
    canon,
    edge.leg.routeId,
    edge.fromStopIndex,
    edge.to.stopIndex,
  );

  const readyElapsed = searchStartElapsed + state.journeyElapsed;
  const waitReadyAt = Math.max(readyElapsed, state.readyAtElapsed);
  const departure = firstDepartureAtOrAfter(departureIndex.byEdge.get(key) ?? [], waitReadyAt);
  if (!departure) return null;

  const newJourneyElapsed = departure.arriveAt - searchStartElapsed;
  if (newJourneyElapsed > maxTravelSeconds) return null;

  const leg: PathLeg = {
    ...edge.leg,
    departureTime: departure.boardAt,
    arrivalTime: departure.arriveAt,
  };

  return {
    node: edge.to,
    readyAtElapsed: departure.arriveAt,
    journeyElapsed: newJourneyElapsed,
    legs: [...state.legs, leg],
  };
}

function heapPushReal(heap: RealSearchState[], item: RealSearchState): void {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent]!.journeyElapsed <= heap[index]!.journeyElapsed) break;
    [heap[parent], heap[index]] = [heap[index]!, heap[parent]!];
    index = parent;
  }
}

function heapPopReal(heap: RealSearchState[]): RealSearchState | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0]!;
  const last = heap.pop()!;
  if (heap.length === 0) return top;

  heap[0] = last;
  let index = 0;
  while (true) {
    let smallest = index;
    const left = index * 2 + 1;
    const right = left + 1;
    if (left < heap.length && heap[left]!.journeyElapsed < heap[smallest]!.journeyElapsed) {
      smallest = left;
    }
    if (right < heap.length && heap[right]!.journeyElapsed < heap[smallest]!.journeyElapsed) {
      smallest = right;
    }
    if (smallest === index) break;
    [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
    index = smallest;
  }

  return top;
}

/** Pathfind using only real train departures in the hide window. */
export function findValidHideCandidatesReal(
  startStationId: string,
  candidateStationIds: string[],
  maxTravelSeconds: number,
  searchStartElapsed: number,
): HideCandidate[] {
  const stations = api.gameState.getStations();
  const stationMap = getStationMap(stations);
  const groups = buildStationGroups(stations);
  const startCanon = canonicalize(startStationId, groups);

  if (!stationMap.has(startStationId)) return [];

  const trains = api.gameState.getTrains();
  if (trains.length === 0) return [];

  const candidateSet = new Set(candidateStationIds);
  const candidateByCanonical = new Map<string, string>();
  for (const id of candidateStationIds) {
    candidateByCanonical.set(canonicalize(id, groups), id);
  }
  const targetCanonical = new Set(candidateByCanonical.keys());

  const routeInfos = getPlayableRouteInfos();
  if (routeInfos.length === 0) return [];

  const routeInfoById = new Map(routeInfos.map((info) => [info.route.id, info]));
  const departureIndex = buildDepartureIndex(
    trains,
    routeInfos,
    searchStartElapsed,
    searchStartElapsed + maxTravelSeconds,
  );

  const edgesByNode = new Map<string, GraphEdge[]>();
  for (const info of routeInfos) {
    for (const edge of buildRouteEdges(info, stationMap)) {
      const fromKey = nodeKey(
        info.route.id,
        edge.fromStopIndex,
        edge.leg.fromStationId,
      );
      if (!edgesByNode.has(fromKey)) edgesByNode.set(fromKey, []);
      edgesByNode.get(fromKey)!.push(edge);
    }
  }

  const startNodes = collectStartNodes(routeInfos, startStationId, groups);
  if (startNodes.length === 0) return [];

  const transfersByCanonical = buildTransferIndex(routeInfos, groups);
  const bestByStation = new Map<string, ValidatedPath>();
  const heap: RealSearchState[] = [];
  for (const node of startNodes) {
    heapPushReal(heap, {
      node,
      readyAtElapsed: searchStartElapsed,
      journeyElapsed: 0,
      legs: [],
    });
  }

  const visited = new Set<string>();
  let expansions = 0;

  while (heap.length > 0) {
    if (expansions++ >= MAX_SEARCH_EXPANSIONS) break;

    const current = heapPopReal(heap)!;
    const canonStation = canonicalize(current.node.stationId, groups);

    const visitKey = `${canonStation}|${current.node.routeId}|${current.node.stopIndex}|${Math.floor(current.journeyElapsed / VISIT_TIME_BUCKET_SECONDS)}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    if (
      targetCanonical.has(canonStation) &&
      canonStation !== startCanon &&
      current.journeyElapsed <= maxTravelSeconds &&
      current.legs.length > 0
    ) {
      const destStationId =
        candidateByCanonical.get(canonStation) ??
        (candidateSet.has(current.node.stationId) ? current.node.stationId : null);
      if (destStationId) {
        const path = rebuildPath(current.legs, current.journeyElapsed);
        const existing = bestByStation.get(destStationId);
        if (!existing || isBetterHidePath(path, existing)) {
          bestByStation.set(destStationId, path);
        }
      }
    }

    if (current.journeyElapsed >= maxTravelSeconds) continue;

    const fromKey = nodeKey(
      current.node.routeId,
      current.node.stopIndex,
      current.node.stationId,
    );

    for (const edge of edgesByNode.get(fromKey) ?? []) {
      const next = tryTraverseEdgeReal(
        current,
        edge,
        departureIndex,
        groups,
        maxTravelSeconds,
        searchStartElapsed,
      );
      if (next) heapPushReal(heap, next);
    }

    for (const transferNode of transfersByCanonical.get(canonStation) ?? []) {
      if (
        transferNode.routeId === current.node.routeId &&
        transferNode.stopIndex === current.node.stopIndex
      ) {
        continue;
      }

      const transferJourney = current.journeyElapsed + TRANSFER_WALK_SECONDS;
      if (transferJourney <= maxTravelSeconds) {
        heapPushReal(heap, {
          node: transferNode,
          readyAtElapsed: current.readyAtElapsed + TRANSFER_WALK_SECONDS,
          journeyElapsed: transferJourney,
          legs: current.legs,
        });
      }
    }
  }

  const results: HideCandidate[] = [];
  for (const [stationId, path] of bestByStation) {
    const station = stationMap.get(stationId);
    if (station) {
      results.push({ stationId, stationName: getStationDisplayName(station), path });
    }
  }

  return results.sort((a, b) => a.stationName.localeCompare(b.stationName));
}

export function isStationOnRoute(stationId: string, routeId: string): boolean {
  const route = api.gameState.getRoutes().find((r) => r.id === routeId);
  if (!route) return false;
  const groups = buildStationGroups(api.gameState.getStations());
  const target = canonicalize(stationId, groups);
  const info = buildRouteStopInfo(route);
  if (!info) return false;
  return info.stopStationIds.some((id) => canonicalize(id, groups) === target);
}

export function isSameLineWithoutTransfer(
  startStationId: string,
  hideStationId: string,
): boolean {
  const groups = buildStationGroups(api.gameState.getStations());
  const startCanon = canonicalize(startStationId, groups);
  const hideCanon = canonicalize(hideStationId, groups);

  for (const route of getPlayableRoutes()) {
    const info = buildRouteStopInfo(route);
    if (!info) continue;
    const canonOnRoute = info.stopStationIds.map((id) => canonicalize(id, groups));
    if (canonOnRoute.includes(startCanon) && canonOnRoute.includes(hideCanon)) {
      return true;
    }
  }

  const stopsByLogicalLine = new Map<string, Set<string>>();
  for (const route of getPlayableRoutes()) {
    const info = buildRouteStopInfo(route);
    if (!info) continue;
    const lineId = getLogicalLineId(route.id);
    let stops = stopsByLogicalLine.get(lineId);
    if (!stops) {
      stops = new Set<string>();
      stopsByLogicalLine.set(lineId, stops);
    }
    for (const id of info.stopStationIds) {
      stops.add(canonicalize(id, groups));
    }
  }

  for (const stops of stopsByLogicalLine.values()) {
    if (stops.has(startCanon) && stops.has(hideCanon)) {
      return true;
    }
  }

  return false;
}
