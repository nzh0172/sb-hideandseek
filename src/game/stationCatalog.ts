/** Route-grouped station lists for the station picker UI */

import type { Station } from '../types/game-state';
import {
  compareRouteLabels,
  compareStationLabels,
  getRouteDisplayName,
  getStationBaseName,
  getStationDisplayName,
} from './displayNames';
import { getOrderedStationIdsForRoute } from './scheduleGraph';
import { collapseStationIdsByGroup, getGroupRepresentative } from './stationGroups';

const api = window.SubwayBuilderAPI;

export const OTHER_ROUTE_ID = '__other__';

export interface RouteCatalogEntry {
  routeId: string;
  displayName: string;
  routeColor?: string;
  stationIds: string[];
}

export function buildStationCatalog(allowedStations: Station[]): RouteCatalogEntry[] {
  const allowedIds = new Set(allowedStations.map((s) => s.id));
  const assigned = new Set<string>();

  const routes = [...api.gameState.getRoutes()].sort(compareRouteLabels);
  const entries: RouteCatalogEntry[] = [];

  routes.forEach((route, index) => {
    const rawIds = getOrderedStationIdsForRoute(route).filter((id) => allowedIds.has(id));
    const stationIds = collapseStationIdsByGroup(rawIds);

    for (const id of rawIds) {
      assigned.add(id);
    }

    if (stationIds.length === 0) return;

    entries.push({
      routeId: route.id,
      displayName: getRouteDisplayName(route, index),
      routeColor: route.color,
      stationIds,
    });
  });

  const otherIds = collapseStationIdsByGroup(
    allowedStations
      .filter((s) => !assigned.has(s.id))
      .sort(compareStationLabels)
      .map((s) => s.id),
  );

  if (otherIds.length > 0) {
    entries.push({
      routeId: OTHER_ROUTE_ID,
      displayName: 'Other stations',
      stationIds: otherIds,
    });
  }

  return entries;
}

export function findRouteIdForStation(
  catalog: RouteCatalogEntry[],
  stationId: string,
): string {
  const rep = getGroupRepresentative(stationId);
  for (const entry of catalog) {
    if (entry.stationIds.some((id) => getGroupRepresentative(id) === rep)) {
      return entry.routeId;
    }
  }
  return catalog[0]?.routeId ?? OTHER_ROUTE_ID;
}

export function searchStations(
  allowedStations: Station[],
  query: string,
): Station[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const byId = new Map(allowedStations.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const results: Station[] = [];

  for (const station of allowedStations) {
    const display = getStationDisplayName(station).toLowerCase();
    const base = getStationBaseName(station.id).toLowerCase();
    if (!display.includes(trimmed) && !base.includes(trimmed)) continue;

    const rep = getGroupRepresentative(station.id);
    if (seen.has(rep)) continue;
    seen.add(rep);

    results.push(byId.get(rep) ?? station);
  }

  return results.sort(compareStationLabels);
}
