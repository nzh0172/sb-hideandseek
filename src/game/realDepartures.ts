/** Index real train departures for live-mode pathfinding */

import type { Route, StComboTiming, Train } from '../types/game-state';
import type { RouteStopInfo } from './scheduleGraph';

const api = window.SubwayBuilderAPI;

const DEFAULT_DWELL_SECONDS = 20;
const MAX_EVENTS_PER_TRAIN = 400;

export interface DepartureEvent {
  trainId: string;
  routeId: string;
  fromStopIndex: number;
  toStopIndex: number;
  fromStationId: string;
  toStationId: string;
  /** Absolute game elapsed seconds when boarding is allowed */
  boardAt: number;
  /** Absolute game elapsed seconds at arrival */
  arriveAt: number;
}

export interface DepartureIndex {
  byEdge: Map<string, DepartureEvent[]>;
}

export function edgeDepartureKey(
  canonStop: string,
  routeId: string,
  fromStopIndex: number,
  toStopIndex: number,
): string {
  return `${canonStop}|${routeId}|${fromStopIndex}|${toStopIndex}`;
}

export function firstDepartureAtOrAfter(
  sorted: DepartureEvent[],
  readyAt: number,
): DepartureEvent | null {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.boardAt < readyAt) lo = mid + 1;
    else hi = mid;
  }
  return sorted[lo] ?? null;
}

function buildStationGroups(stations: { id: string }[]): Map<string, string> {
  const canonical = new Map<string, string>();
  for (const station of stations) {
    if (!canonical.has(station.id)) canonical.set(station.id, station.id);
    for (const sib of api.gameState.getSiblingStationIds(station.id)) {
      canonical.set(sib, canonical.get(station.id)!);
    }
  }
  for (const station of stations) {
    if (!canonical.has(station.id)) canonical.set(station.id, station.id);
  }
  return canonical;
}

function canonicalize(stationId: string, groups: Map<string, string>): string {
  return groups.get(stationId) ?? stationId;
}

function resolveStNodeToStationId(stNodeId: string, route: Route): string | null {
  for (const station of api.gameState.getStations()) {
    if (station.stNodeIds.includes(stNodeId) || station.id === stNodeId) {
      return station.id;
    }
  }
  for (const station of route.stations ?? []) {
    if (station.stNodeIds.includes(stNodeId) || station.id === stNodeId) {
      return station.id;
    }
  }
  return null;
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

function stopIndexForStNode(info: RouteStopInfo, stNodeId: string): number {
  const stationId = resolveStNodeToStationId(stNodeId, info.route);
  if (stationId) {
    const idx = info.stopStationIds.indexOf(stationId);
    if (idx >= 0) return idx;
  }

  const timing = info.timingsByIndex.find((t) => t.stNodeId === stNodeId);
  if (timing) {
    const byStation = resolveStNodeToStationId(timing.stNodeId, info.route);
    if (byStation) {
      const idx = info.stopStationIds.indexOf(byStation);
      if (idx >= 0) return idx;
    }
    if (timing.stNodeIndex >= 0 && timing.stNodeIndex < info.stopStationIds.length) {
      return timing.stNodeIndex;
    }
  }

  return -1;
}

function segmentRideSeconds(
  info: RouteStopInfo,
  fromIndex: number,
  toIndex: number,
): number {
  const min = Math.min(fromIndex, toIndex);
  const max = Math.max(fromIndex, toIndex);
  const fromTiming = timingAtStop(info, min);
  const toTiming = timingAtStop(info, max);
  if (!fromTiming || !toTiming) return 0;

  let delta = toTiming.arrivalTime - fromTiming.departureTime;
  if (delta < 0) delta += info.cycleSeconds;
  return Math.max(0, delta);
}

function isLoopRoute(info: RouteStopInfo, groups: Map<string, string>): boolean {
  if (info.stopStationIds.length < 3) return false;
  const first = canonicalize(info.stopStationIds[0]!, groups);
  const last = canonicalize(
    info.stopStationIds[info.stopStationIds.length - 1]!,
    groups,
  );
  return first === last;
}

function nextHopIndices(
  info: RouteStopInfo,
  fromIdx: number,
  dir: 1 | -1,
  groups: Map<string, string>,
): { fromIdx: number; toIdx: number; dir: 1 | -1 } | null {
  const toIdx = fromIdx + dir;
  if (toIdx >= 0 && toIdx < info.stopStationIds.length) {
    return { fromIdx, toIdx, dir };
  }

  if (isLoopRoute(info, groups)) {
    if (dir === 1 && toIdx >= info.stopStationIds.length) {
      return { fromIdx, toIdx: 0, dir };
    }
    if (dir === -1 && toIdx < 0) {
      return { fromIdx, toIdx: info.stopStationIds.length - 1, dir };
    }
  }

  const reverseDir = (dir === 1 ? -1 : 1) as 1 | -1;
  const reverseTo = fromIdx + reverseDir;
  if (reverseTo >= 0 && reverseTo < info.stopStationIds.length) {
    return { fromIdx, toIdx: reverseTo, dir: reverseDir };
  }

  return null;
}

function resolveTrainSegment(
  train: Train,
  info: RouteStopInfo,
): { fromIdx: number; toIdx: number; dir: 1 | -1 } | null {
  const combo = train.currentStComboInfo;
  if (!combo) return null;

  const fromTiming = info.timingsByIndex.find((t) => t.stNodeIndex === combo.index);
  const fromIdx = fromTiming
    ? stopIndexForStNode(info, fromTiming.stNodeId)
    : stopIndexForStNode(info, combo.endStNodeId);
  const toIdx = stopIndexForStNode(info, combo.endStNodeId);

  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return null;

  const dir = (toIdx > fromIdx ? 1 : -1) as 1 | -1;
  return { fromIdx, toIdx, dir };
}

function projectTrainDepartures(
  train: Train,
  info: RouteStopInfo,
  groups: Map<string, string>,
  nowElapsed: number,
  horizonElapsed: number,
): DepartureEvent[] {
  const combo = train.currentStComboInfo;
  if (!combo || info.timingsByIndex.length < 2) return [];

  const segment = resolveTrainSegment(train, info);
  if (!segment) return [];

  const events: DepartureEvent[] = [];
  let { fromIdx, toIdx, dir } = segment;
  let readyAt = nowElapsed;

  if (combo.timeAtStopEnd != null) {
    readyAt = Math.max(nowElapsed, combo.timeAtStopEnd);
  } else if (combo.timeAtStop != null) {
    const rideSeconds = segmentRideSeconds(info, fromIdx, toIdx);
    const departAt = combo.timeAtStop;
    const arriveAt = departAt + rideSeconds;
    if (arriveAt > horizonElapsed) return events;
    readyAt = arriveAt + DEFAULT_DWELL_SECONDS;
    fromIdx = toIdx;
    const next = nextHopIndices(info, fromIdx, dir, groups);
    if (!next) return events;
    ({ fromIdx, toIdx, dir } = next);
  }

  let safety = 0;
  while (readyAt < horizonElapsed && safety++ < MAX_EVENTS_PER_TRAIN) {
    const hop = nextHopIndices(info, fromIdx, dir, groups);
    if (!hop) break;
    ({ fromIdx, toIdx, dir } = hop);

    const rideSeconds = segmentRideSeconds(info, fromIdx, toIdx);
    if (rideSeconds <= 0) break;

    const boardAt = readyAt;
    const arriveAt = boardAt + rideSeconds;

    if (boardAt <= horizonElapsed) {
      events.push({
        trainId: train.id,
        routeId: train.routeId,
        fromStopIndex: fromIdx,
        toStopIndex: toIdx,
        fromStationId: info.stopStationIds[fromIdx]!,
        toStationId: info.stopStationIds[toIdx]!,
        boardAt,
        arriveAt,
      });
    }

    readyAt = arriveAt + DEFAULT_DWELL_SECONDS;
    fromIdx = toIdx;
  }

  return events;
}

export function buildDepartureIndex(
  trains: Train[],
  routeInfos: RouteStopInfo[],
  nowElapsed: number,
  horizonElapsed: number,
): DepartureIndex {
  const groups = buildStationGroups(api.gameState.getStations());
  const infoByRoute = new Map(routeInfos.map((info) => [info.route.id, info]));
  const byEdge = new Map<string, DepartureEvent[]>();

  for (const train of trains) {
    const info = infoByRoute.get(train.routeId);
    if (!info) continue;

    const events = projectTrainDepartures(
      train,
      info,
      groups,
      nowElapsed,
      horizonElapsed,
    );

    for (const event of events) {
      const canon = canonicalize(event.fromStationId, groups);
      const key = edgeDepartureKey(
        canon,
        event.routeId,
        event.fromStopIndex,
        event.toStopIndex,
      );
      if (!byEdge.has(key)) byEdge.set(key, []);
      byEdge.get(key)!.push(event);
    }
  }

  for (const list of byEdge.values()) {
    list.sort((a, b) => a.boardAt - b.boardAt);
  }

  return { byEdge };
}
