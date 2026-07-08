/** Human-readable labels for stations and routes */

import type { Route, Station } from '../types/game-state';

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

function getRouteHintForStation(stationId: string): string | null {
  const api = window.SubwayBuilderAPI;
  const station = api.gameState.getStations().find((s) => s.id === stationId);
  if (!station) return null;

  const hints: string[] = [];
  const routes = api.gameState.getRoutes();

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    const onRoute =
      station.routeIds.includes(route.id) ||
      route.stations?.some((s) => s.id === stationId);
    if (onRoute) hints.push(getRouteDisplayName(route, i));
  }

  if (hints.length === 0) return null;
  return hints.slice(0, 2).join(', ');
}

export function invalidateStationLabels(): void {
  stationLabelCache = null;
}

function rebuildStationLabelCache(): void {
  const api = window.SubwayBuilderAPI;
  const stations = [...api.gameState.getStations()].sort(
    (a, b) => a.coords[1] - b.coords[1] || a.coords[0] - b.coords[0],
  );

  stationLabelCache = new Map();

  stations.forEach((station, index) => {
    const [lng, lat] = station.coords;
    const stopNum = index + 1;

    let label: string | null = null;

    for (const group of api.gameState.getStationGroups()) {
      if (group.stationIds.includes(station.id) && isReadableName(group.name)) {
        label = group.name;
        break;
      }
    }

    if (!label && isReadableName(station.name)) {
      label = station.name.trim();
    }

    const routeHint = getRouteHintForStation(station.id);
    const coordSuffix = `@ ${lat.toFixed(2)}°N ${lng.toFixed(2)}°E`;

    if (label) {
      stationLabelCache!.set(
        station.id,
        routeHint ? `${label} (${routeHint})` : `${label} ${coordSuffix}`,
      );
    } else if (routeHint) {
      stationLabelCache!.set(station.id, `${routeHint} · Stop ${stopNum} ${coordSuffix}`);
    } else {
      stationLabelCache!.set(station.id, `Stop ${stopNum} ${coordSuffix}`);
    }
  });
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

/** All line names serving a station */
export function getRouteLabelsForStation(stationId: string): string[] {
  const api = window.SubwayBuilderAPI;
  const station = api.gameState.getStations().find((s) => s.id === stationId);
  if (!station) return [];

  const labels: string[] = [];
  const routes = api.gameState.getRoutes();

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    const onRoute =
      station.routeIds.includes(route.id) ||
      route.stations?.some((s) => s.id === stationId);
    if (onRoute) {
      const label = getRouteDisplayName(route, i);
      if (!labels.includes(label)) labels.push(label);
    }
  }

  return labels;
}

/** Path label: base name + all lines at multi-route (transfer) stations */
export function formatStationForPath(stationId: string): string {
  const base = getStationBaseName(stationId);
  const routes = getRouteLabelsForStation(stationId);
  if (routes.length === 0) return base;
  return `${base} (${routes.join(', ')})`;
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
