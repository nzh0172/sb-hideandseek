/** Group split game routes that share the same circle/loop track */

import type { Route } from '../types/game-state';
import { areSameStationGroup } from './stationGroups';

const api = window.SubwayBuilderAPI;

let routeToLogicalLine: Map<string, string> | null = null;
let routeCount = -1;

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

function getRouteStopIds(route: Route, groups: Map<string, string>): string[] {
  if ((route.stations?.length ?? 0) >= 2) {
    return route.stations!.map((s) => s.id);
  }

  const timings = route.stComboTimings ?? [];
  if (timings.length >= 2) {
    const ordered = [...timings].sort((a, b) => a.stNodeIndex - b.stNodeIndex);
    const ids: string[] = [];
    for (const timing of ordered) {
      const station = api.gameState.getStations().find(
        (s) => s.stNodeIds.includes(timing.stNodeId) || s.id === timing.stNodeId,
      );
      if (station && !ids.includes(station.id)) ids.push(station.id);
    }
    if (ids.length >= 2) return ids;
  }

  const ids: string[] = [];
  for (const station of api.gameState.getStations()) {
    if (station.routeIds.includes(route.id) && !ids.includes(station.id)) {
      ids.push(station.id);
    }
  }
  return ids;
}

function routeCanonicalStops(route: Route, groups: Map<string, string>): Set<string> {
  return new Set(getRouteStopIds(route, groups).map((id) => canonicalize(id, groups)));
}

function isLoopRoute(stopIds: string[], groups: Map<string, string>): boolean {
  if (stopIds.length < 3) return false;
  const first = canonicalize(stopIds[0]!, groups);
  const last = canonicalize(stopIds[stopIds.length - 1]!, groups);
  return first === last;
}

function shouldShareLogicalLine(
  stopsA: Set<string>,
  stopsB: Set<string>,
  loopA: boolean,
  loopB: boolean,
): boolean {
  if (stopsA.size === 0 || stopsB.size === 0) return false;

  let overlap = 0;
  for (const stop of stopsA) {
    if (stopsB.has(stop)) overlap++;
  }
  if (overlap < 2) return false;

  const minSize = Math.min(stopsA.size, stopsB.size);
  if (overlap === stopsA.size && overlap === stopsB.size) return true;
  if (overlap / minSize >= 0.5) return true;
  if (loopA && overlap >= Math.ceil(stopsA.size * 0.4)) return true;
  if (loopB && overlap >= Math.ceil(stopsB.size * 0.4)) return true;

  return false;
}

function ensureLogicalLineCache(): void {
  const routes = api.gameState.getRoutes();
  if (routeToLogicalLine && routeCount === routes.length) return;

  const stations = api.gameState.getStations();
  const groups = buildStationGroups(stations);
  const playable = routes.filter((r) => getRouteStopIds(r, groups).length >= 2);

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const root = parent.get(id) ?? id;
    if (root === id) return id;
    const compressed = find(root);
    parent.set(id, compressed);
    return compressed;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  for (const route of playable) {
    parent.set(route.id, route.id);
  }

  const meta = playable.map((route) => {
    const stopIds = getRouteStopIds(route, groups);
    return {
      routeId: route.id,
      stops: routeCanonicalStops(route, groups),
      loop: isLoopRoute(stopIds, groups),
    };
  });

  for (let i = 0; i < meta.length; i++) {
    for (let j = i + 1; j < meta.length; j++) {
      const a = meta[i]!;
      const b = meta[j]!;
      if (shouldShareLogicalLine(a.stops, b.stops, a.loop, b.loop)) {
        union(a.routeId, b.routeId);
      }
    }
  }

  routeToLogicalLine = new Map(
    playable.map((route) => [route.id, find(route.id)]),
  );
  routeCount = routes.length;
}

export function invalidateLogicalLines(): void {
  routeToLogicalLine = null;
  routeCount = -1;
}

export function getLogicalLineId(routeId: string): string {
  ensureLogicalLineCache();
  return routeToLogicalLine!.get(routeId) ?? routeId;
}

export function isSameLogicalLine(routeIdA: string, routeIdB: string): boolean {
  if (routeIdA === routeIdB) return true;
  return getLogicalLineId(routeIdA) === getLogicalLineId(routeIdB);
}

/** True when a leg moves between different station groups. */
export function isMovingLeg(fromStationId: string, toStationId: string): boolean {
  return !areSameStationGroup(fromStationId, toStationId);
}
