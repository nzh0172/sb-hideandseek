/** Human-readable labels for stations and routes */

import type { RouteShape } from '../types/core';
import type { Route, Station } from '../types/game-state';
import {
  getStationsInGroup,
  invalidateStationGroups,
} from './stationGroups';

export { areSameStationGroup, getGroupRepresentative } from './stationGroups';

export interface RouteBulletMeta {
  routeId: string;
  label: string;
  color: string;
  textColor: string;
  shape: RouteShape;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let stationLabelCache: Map<string, string> | null = null;

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function isReadableName(value: string | undefined | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || isUuid(trimmed)) return false;
  return true;
}


export function invalidateStationLabels(): void {
  stationLabelCache = null;
  invalidateStationGroups();
}

function sortRouteLabels(labels: string[]): string[] {
  return [...labels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Interchange-aware label: "Station Name (1, 4, 6)" */
export function getGroupedStationDisplayName(stationId: string): string {
  const base = getStationBaseName(stationId);
  const members = getStationsInGroup(stationId);
  const routeLabels = new Set<string>();

  for (const id of members) {
    for (const label of getRouteLabelsForStation(id)) {
      routeLabels.add(label);
    }
  }

  const sorted = sortRouteLabels([...routeLabels]);
  if (sorted.length === 0) {
    if (members.length > 1) return base;
    const station = window.SubwayBuilderAPI.gameState
      .getStations()
      .find((s) => s.id === stationId);
    if (!station) return base;
    const [lng, lat] = station.coords;
    return `${base} @ ${lat.toFixed(2)}°N ${lng.toFixed(2)}°E`;
  }

  return `${base} (${sorted.join(', ')})`;
}

function rebuildStationLabelCache(): void {
  const api = window.SubwayBuilderAPI;
  const stations = [...api.gameState.getStations()].sort(
    (a, b) => a.coords[1] - b.coords[1] || a.coords[0] - b.coords[0],
  );

  stationLabelCache = new Map();

  for (const station of stations) {
    stationLabelCache!.set(station.id, getGroupedStationDisplayName(station.id));
  }
}

export function getStationDisplayName(station: Station): string {
  if (!stationLabelCache) rebuildStationLabelCache();
  return stationLabelCache!.get(station.id) ?? `Stop ${coordLabel(station.coords)}`;
}

export function getStationDisplayNameById(stationId: string): string {
  const station = window.SubwayBuilderAPI.gameState
    .getStations()
    .find((s) => s.id === stationId);
  if (!station) return 'Unknown station';
  return getStationDisplayName(station);
}

/** Station name without route suffix — for path display */
export function getStationBaseName(stationId: string): string {
  const api = window.SubwayBuilderAPI;
  const station = api.gameState.getStations().find((s) => s.id === stationId);
  if (!station) return 'Unknown station';

  for (const group of api.gameState.getStationGroups()) {
    if (group.stationIds.includes(stationId) && isReadableName(group.name)) {
      return group.name;
    }
  }

  if (isReadableName(station.name)) return station.name.trim();

  const [lng, lat] = station.coords;
  return `Stop @ ${lat.toFixed(2)}°N ${lng.toFixed(2)}°E`;
}

function contrastTextColor(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return '#ffffff';
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return '#ffffff';
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#ffffff';
}

export function getRouteBulletMeta(route: Route, index?: number): RouteBulletMeta {
  const color =
    route.color && route.color.startsWith('#') ? route.color : '#6b7280';
  const textColor =
    route.textColor && route.textColor.startsWith('#')
      ? route.textColor
      : contrastTextColor(color);

  return {
    routeId: route.id,
    label: getRouteDisplayName(route, index),
    color,
    textColor,
    shape: route.shape ?? 'circle',
  };
}

/** Lines serving a single platform/station stop. */
export function getRouteBulletsForStation(stationId: string): RouteBulletMeta[] {
  const api = window.SubwayBuilderAPI;
  const station = api.gameState.getStations().find((s) => s.id === stationId);
  if (!station) return [];

  const routes = api.gameState.getRoutes();
  const bullets: RouteBulletMeta[] = [];

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    const onRoute =
      station.routeIds.includes(route.id) ||
      route.stations?.some((s) => s.id === stationId);
    if (!onRoute) continue;
    bullets.push(getRouteBulletMeta(route, i));
  }

  return bullets.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/** All lines at an interchange (station group). */
export function getRouteBulletsForStationGroup(stationId: string): RouteBulletMeta[] {
  const byId = new Map<string, RouteBulletMeta>();
  for (const memberId of getStationsInGroup(stationId)) {
    for (const bullet of getRouteBulletsForStation(memberId)) {
      byId.set(bullet.routeId, bullet);
    }
  }
  return [...byId.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/** All line names serving a station */
export function getRouteLabelsForStation(stationId: string): string[] {
  return getRouteBulletsForStation(stationId).map((b) => b.label);
}

/** Path label: base name + all lines at multi-route (transfer) stations */
export function formatStationForPath(stationId: string): string {
  return getGroupedStationDisplayName(stationId);
}

function coordLabel(coords: Station['coords']): string {
  const [lng, lat] = coords;
  return `@ ${lat.toFixed(2)}°N ${lng.toFixed(2)}°E`;
}

export function getRouteDisplayName(route: Route, index?: number): string {
  if (route.bullet && !isUuid(route.bullet)) return route.bullet;
  if (route.name && !isUuid(route.name)) return route.name;

  const letter = String.fromCharCode(65 + (index ?? 0) % 26);
  return `Line ${letter}`;
}

export function compareStationLabels(a: Station, b: Station): number {
  return getStationDisplayName(a).localeCompare(getStationDisplayName(b));
}

export function compareRouteLabels(a: Route, b: Route): number {
  return getRouteDisplayName(a).localeCompare(getRouteDisplayName(b));
}

export function getSortedStations(): Station[] {
  invalidateStationLabels();
  return [...window.SubwayBuilderAPI.gameState.getStations()].sort(compareStationLabels);
}
