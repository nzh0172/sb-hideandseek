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
    const stationIds = getOrderedStationIdsForRoute(route).filter((id) => {
      if (!allowedIds.has(id)) return false;
      assigned.add(id);
      return true;
    });

    if (stationIds.length === 0) return;

    entries.push({
      routeId: route.id,
      displayName: getRouteDisplayName(route, index),
      routeColor: route.color,
      stationIds,
    });
  });

  const otherIds = allowedStations
    .filter((s) => !assigned.has(s.id))
    .sort(compareStationLabels)
    .map((s) => s.id);

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
  for (const entry of catalog) {
    if (entry.stationIds.includes(stationId)) return entry.routeId;
  }
  return catalog[0]?.routeId ?? OTHER_ROUTE_ID;
}

export function searchStations(
  allowedStations: Station[],
  query: string,
): Station[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  return allowedStations
    .filter((station) => {
      const display = getStationDisplayName(station).toLowerCase();
      const base = getStationBaseName(station.id).toLowerCase();
      return display.includes(trimmed) || base.includes(trimmed);
    })
    .sort(compareStationLabels);
}
