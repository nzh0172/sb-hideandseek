/** Subtractive map overlay — dark outside, bright inside intersecting valid region */

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import {
  getRouteBulletMeta,
  getRouteBulletsForStationGroup,
  getStationBaseName,
  type RouteBulletMeta,
} from './displayNames';
import { getRouteStationLineCoords } from './scheduleGraph';
import { circlePolygonRing } from './geo';
import {
  buildRevealPathMapFeatures,
  type RevealPathBulletFeature,
} from './revealPathMap';
import { getSession, subscribeOverlay } from './session';
import {
  getAutoZoomValidRegionEnabled as getAutoZoomPref,
  setAutoZoomValidRegionEnabled as setAutoZoomPref,
  setLinePickerRouteId,
} from './seekingPreferences';
import {
  buildDeductionMaskAndOutlines,
  getDeductionGeometryKey,
  playAreaRegion,
  validRegionBboxRing,
} from './validRegion';
import type { HideSeekSession } from './types';

const api = window.SubwayBuilderAPI;

const SOURCE_ID = 'hide-seek-deduction';

const DEPRECATED_LAYER_IDS = [
  `${SOURCE_ID}-circle-fill-yes`,
  `${SOURCE_ID}-circle-fill-no`,
  `${SOURCE_ID}-circle-line-yes`,
  `${SOURCE_ID}-circle-line-no`,
  `${SOURCE_ID}-route-line-yes`,
  `${SOURCE_ID}-route-line-no`,
  `${SOURCE_ID}-circle-centers`,
  `${SOURCE_ID}-possible-stations`,
  `${SOURCE_ID}-reveal-path-bullet-bg`,
  `${SOURCE_ID}-reveal-path-bullet-label`,
];

type OverlayGeoJson = Parameters<GeoJSONSource['setData']>[0];

const EMPTY_FC = { type: 'FeatureCollection', features: [] } as OverlayGeoJson;

const DOM_OVERLAY_ATTR = 'data-hide-seek-dom';

type DomOverlayKind = 'path-bullet' | 'setup-station-label' | 'seeking-picker-station-label';

function tagDomOverlay(element: HTMLElement, kind: DomOverlayKind): void {
  element.setAttribute(DOM_OVERLAY_ATTR, kind);
}

function clearDomOverlays(kind?: DomOverlayKind): void {
  const map = mapRef ?? api.utils.getMap();
  const container = map?.getContainer();
  if (container) {
    const selector = kind
      ? `[${DOM_OVERLAY_ATTR}="${kind}"]`
      : `[${DOM_OVERLAY_ATTR}]`;
    container.querySelectorAll(selector).forEach((node) => node.remove());
  }

  if (!kind || kind === 'path-bullet') pathBulletMarkers = [];
  if (!kind || kind === 'setup-station-label') setupStationLabelMarker = null;
  if (!kind || kind === 'seeking-picker-station-label') seekingPickerStationLabelMarker = null;
}

/** Highlight radius around the revealed hide station. */
const REVEAL_HIGHLIGHT_RADIUS_KM = 0.5;

let mapRef: MapLibreMap | null = null;
let lastRevealZoomKey: string | null = null;
let setupPlayAreaVisible = true;
let setupStationLabelVisible = true;
let revealPathVisible = true;
let revealDeductionVisible = true;
let pathBulletMarkers: Array<{ element: HTMLElement; coordinates: [number, number] }> = [];
let setupStationLabelMarker: {
  element: HTMLElement;
  coordinates: [number, number];
} | null = null;
let seekingPickerStationLabelMarker: {
  element: HTMLElement;
  coordinates: [number, number];
} | null = null;
let seekingPickerStationId: string | null = null;
let seekingPickerRouteId: string | null = null;
let domOverlayListenersAttached = false;
let layersReady = false;
let lastSyncedSetupStationId: string | null = null;
let lastSyncedPickerStationId: string | null = null;
let lastAutoZoomKey: string | null = null;

function isValidCoordinate(coord: [number, number]): boolean {
  return Number.isFinite(coord[0]) && Number.isFinite(coord[1]);
}

function normalizeLineColor(color: string | undefined): string {
  if (color && color.startsWith('#')) return color;
  return '#f59e0b';
}

function clearPathBulletMarkers(): void {
  clearDomOverlays('path-bullet');
}

function clearSetupStationLabel(): void {
  clearDomOverlays('setup-station-label');
}

function clearSeekingPickerStationLabel(): void {
  clearDomOverlays('seeking-picker-station-label');
}

function updateDomOverlayPositions(map: MapLibreMap): void {
  for (const marker of pathBulletMarkers) {
    const point = map.project(marker.coordinates);
    marker.element.style.left = `${point.x}px`;
    marker.element.style.top = `${point.y}px`;
  }

  if (setupStationLabelMarker) {
    const point = map.project(setupStationLabelMarker.coordinates);
    setupStationLabelMarker.element.style.left = `${point.x}px`;
    setupStationLabelMarker.element.style.top = `${point.y}px`;
  }

  if (seekingPickerStationLabelMarker) {
    const point = map.project(seekingPickerStationLabelMarker.coordinates);
    seekingPickerStationLabelMarker.element.style.left = `${point.x}px`;
    seekingPickerStationLabelMarker.element.style.top = `${point.y}px`;
  }
}

function attachDomOverlayListeners(map: MapLibreMap): void {
  if (domOverlayListenersAttached) return;
  domOverlayListenersAttached = true;
  const update = () => updateDomOverlayPositions(map);
  map.on('move', update);
  map.on('zoom', update);
  map.on('resize', update);
}

function isLongBulletLabel(label: string): boolean {
  return label.trim().length > 2;
}

function bulletHorizontalPadding(label: string, size: number, long: boolean): number {
  if (!long) return 0;
  return Math.max(6, Math.min(14, Math.round(label.length * 2.2)), Math.round(size * 0.35));
}

function createRouteBulletElement(bullet: RouteBulletMeta, size = 18): HTMLElement {
  const el = document.createElement('span');
  el.textContent = bullet.label;
  const long = isLongBulletLabel(bullet.label);
  const padX = bulletHorizontalPadding(bullet.label, size, long);
  const fontSize = Math.max(9, Math.round(size * 0.55));
  const minWidth = long ? Math.max(size, size + padX * 2) : size;

  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    `min-width:${minWidth}px`,
    long ? '' : `width:${size}px`,
    `height:${size}px`,
    `padding:0 ${long ? padX : 0}px`,
    'border-radius:999px',
    `background:${bullet.color}`,
    `color:${bullet.textColor}`,
    'font-weight:700',
    `font-size:${fontSize}px`,
    'line-height:1',
    'box-sizing:border-box',
    'flex-shrink:0',
    'white-space:nowrap',
  ]
    .filter(Boolean)
    .join(';');
  return el;
}

function createStationLabelElement(stationId: string, accentColor: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:6px',
    'flex-wrap:wrap',
    'width:max-content',
    'max-width:320px',
    'padding:5px 9px',
    'border-radius:8px',
    'background:#ffffff',
    'color:#111827',
    `border:2px solid ${accentColor}`,
    'box-shadow:0 2px 8px rgba(0,0,0,0.28)',
    'font-family:system-ui,sans-serif',
    'box-sizing:border-box',
  ].join(';');

  const name = document.createElement('span');
  name.textContent = getStationBaseName(stationId);
  name.style.cssText = 'font-weight:600;font-size:12px;line-height:1.2;flex-shrink:0;white-space:nowrap;';

  const bullets = document.createElement('span');
  bullets.style.cssText =
    'display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;flex:1 1 auto;min-width:0;';
  for (const bullet of getRouteBulletsForStationGroup(stationId)) {
    bullets.appendChild(createRouteBulletElement(bullet, 16));
  }

  wrapper.appendChild(name);
  wrapper.appendChild(bullets);
  return wrapper;
}

function createSetupStationLabelElement(stationId: string): HTMLElement {
  const wrapper = createStationLabelElement(stationId, '#f97316');
  tagDomOverlay(wrapper, 'setup-station-label');
  return wrapper;
}

function createSeekingPickerStationLabelElement(stationId: string): HTMLElement {
  const wrapper = createStationLabelElement(stationId, '#3b82f6');
  tagDomOverlay(wrapper, 'seeking-picker-station-label');
  return wrapper;
}

function syncSetupStationLabel(session: HideSeekSession): void {
  const nextId =
    session.phase === 'setup' &&
    setupStationLabelVisible &&
    session.startStationId
      ? session.startStationId
      : null;

  if (nextId === lastSyncedSetupStationId && setupStationLabelMarker) {
    const map = mapRef ?? api.utils.getMap();
    if (map) updateDomOverlayPositions(map);
    return;
  }

  lastSyncedSetupStationId = nextId;
  clearSetupStationLabel();

  const map = mapRef ?? api.utils.getMap();
  if (
    !map ||
    session.phase !== 'setup' ||
    !setupStationLabelVisible ||
    !session.startStationId
  ) {
    return;
  }

  const station = api.gameState
    .getStations()
    .find((s) => s.id === session.startStationId);
  if (!station || !isValidCoordinate(station.coords)) return;

  attachDomOverlayListeners(map);
  const container = map.getContainer();
  container.style.position ||= 'relative';

  const element = createSetupStationLabelElement(session.startStationId);
  element.style.position = 'absolute';
  element.style.transform = 'translate(-50%, calc(-100% - 14px))';
  element.style.zIndex = '6';
  element.style.pointerEvents = 'none';
  container.appendChild(element);
  setupStationLabelMarker = { element, coordinates: station.coords };
  updateDomOverlayPositions(map);
}

function syncSeekingPickerStationLabel(): void {
  const session = getSession();
  const nextId =
    session.phase === 'seeking' && seekingPickerStationId
      ? seekingPickerStationId
      : null;

  if (nextId === lastSyncedPickerStationId && seekingPickerStationLabelMarker) {
    const map = mapRef ?? api.utils.getMap();
    if (map) updateDomOverlayPositions(map);
    return;
  }

  lastSyncedPickerStationId = nextId;
  clearSeekingPickerStationLabel();

  const map = mapRef ?? api.utils.getMap();
  if (!map || !nextId) {
    return;
  }

  const station = api.gameState
    .getStations()
    .find((s) => s.id === nextId);
  if (!station || !isValidCoordinate(station.coords)) return;

  attachDomOverlayListeners(map);
  const container = map.getContainer();
  container.style.position ||= 'relative';

  const element = createSeekingPickerStationLabelElement(nextId);
  element.style.position = 'absolute';
  element.style.transform = 'translate(-50%, calc(-100% - 14px))';
  element.style.zIndex = '6';
  element.style.pointerEvents = 'none';
  container.appendChild(element);
  seekingPickerStationLabelMarker = { element, coordinates: station.coords };
  updateDomOverlayPositions(map);
}

function createPathBulletElement(bullet: RevealPathBulletFeature): HTMLElement {
  const el = document.createElement('span');
  el.textContent = bullet.bulletLabel;
  const long = bullet.bulletLabel.trim().length > 2;
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    `min-width:${long ? 28 : 22}px`,
    'height:22px',
    `padding:0 ${long ? 8 : 4}px`,
    'border-radius:999px',
    `background:${bullet.bulletColor}`,
    `color:${bullet.bulletTextColor}`,
    'font-weight:700',
    'font-size:11px',
    'line-height:1',
    'border:2px solid #fff',
    'box-shadow:0 1px 4px rgba(0,0,0,0.35)',
    'pointer-events:none',
    'white-space:nowrap',
  ].join(';');
  tagDomOverlay(el, 'path-bullet');
  return el;
}

function syncPathBulletMarkers(session: HideSeekSession): void {
  clearPathBulletMarkers();

  const map = mapRef ?? api.utils.getMap();
  if (
    !map ||
    !revealPathVisible ||
    session.phase !== 'reveal' ||
    !session.validatedPath?.legs.length
  ) {
    return;
  }

  attachDomOverlayListeners(map);
  const container = map.getContainer();
  container.style.position ||= 'relative';

  const { bullets } = buildRevealPathMapFeatures(session.validatedPath.legs);
  for (const bullet of bullets) {
    if (!isValidCoordinate(bullet.coordinates)) continue;
    const element = createPathBulletElement(bullet);
    element.style.position = 'absolute';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.zIndex = '6';
    element.style.pointerEvents = 'none';
    container.appendChild(element);
    pathBulletMarkers.push({ element, coordinates: bullet.coordinates });
  }

  updateDomOverlayPositions(map);
}

export function isRevealPathVisible(): boolean {
  return revealPathVisible;
}

export function setRevealPathVisible(visible: boolean): void {
  revealPathVisible = visible;
  refreshDeductionOverlay();
}

export function isRevealDeductionVisible(): boolean {
  return revealDeductionVisible;
}

export function setRevealDeductionVisible(visible: boolean): void {
  revealDeductionVisible = visible;
  refreshDeductionOverlay();
}

export function isSetupPlayAreaVisible(): boolean {
  return setupPlayAreaVisible;
}

export function setSetupPlayAreaVisible(visible: boolean): void {
  setupPlayAreaVisible = visible;
  refreshDeductionOverlay();
}

export function isSetupStationLabelVisible(): boolean {
  return setupStationLabelVisible;
}

export function setSetupStationLabelVisible(visible: boolean): void {
  setupStationLabelVisible = visible;
  refreshDeductionOverlay();
}

export function setSeekingPickerStationHighlight(stationId: string | null): void {
  if (seekingPickerStationId === stationId) return;
  seekingPickerStationId = stationId;
  refreshDeductionOverlay({ allowZoom: false });
}

export function setSeekingPickerRouteHighlight(routeId: string | null): void {
  if (seekingPickerRouteId === routeId) return;
  seekingPickerRouteId = routeId;
  setLinePickerRouteId(routeId);
  refreshDeductionOverlay({ allowZoom: false });
}

export function clearSeekingPickerHighlight(): void {
  if (seekingPickerStationId === null && seekingPickerRouteId === null) return;
  seekingPickerStationId = null;
  seekingPickerRouteId = null;
  refreshDeductionOverlay({ allowZoom: false });
}

function buildPlayAreaFeatures(
  session: HideSeekSession,
  stationMap: Map<string, { coords: [number, number] }>,
): Array<Record<string, unknown>> {
  if (!session.startStationId) return [];

  const start = stationMap.get(session.startStationId);
  if (!start) return [];

  const ring = circlePolygonRing(start.coords, session.config.hideRadiusKm);
  return [
    {
      type: 'Feature',
      properties: { kind: 'play-area-fill' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
    {
      type: 'Feature',
      properties: { kind: 'play-area-outline' },
      geometry: { type: 'LineString', coordinates: ring },
    },
  ];
}

function getPlayAreaForSession(session: HideSeekSession): ReturnType<typeof playAreaRegion> | null {
  if (!session.startStationId) return null;
  const start = api.gameState.getStations().find((s) => s.id === session.startStationId);
  if (!start) return null;
  return playAreaRegion(start.coords, session.config.hideRadiusKm);
}

function buildSetupFeatures(
  session: HideSeekSession,
  stationMap: Map<string, { coords: [number, number] }>,
): Array<Record<string, unknown>> {
  const features: Array<Record<string, unknown>> = [];

  if (setupPlayAreaVisible) {
    features.push(...buildPlayAreaFeatures(session, stationMap));
  }

  if (!session.startStationId) return features;

  if (!setupStationLabelVisible) return features;

  const start = stationMap.get(session.startStationId);
  if (!start) return features;

  features.push({
    type: 'Feature',
    properties: { kind: 'start-station' },
    geometry: { type: 'Point', coordinates: start.coords },
  });

  return features;
}

function buildRevealPathFeatures(session: HideSeekSession): Array<Record<string, unknown>> {
  if (!revealPathVisible || !session.validatedPath) return [];

  const features: Array<Record<string, unknown>> = [];
  const { lines, visitedStationIds } = buildRevealPathMapFeatures(
    session.validatedPath.legs,
  );

  for (const line of lines) {
    const coordinates = line.coordinates.filter(isValidCoordinate);
    if (coordinates.length < 2) continue;

    features.push({
      type: 'Feature',
      properties: {
        kind: 'reveal-path-line',
        routeColor: normalizeLineColor(line.routeColor),
      },
      geometry: { type: 'LineString', coordinates },
    });
  }

  const stationMap = new Map(
    api.gameState.getStations().map((s) => [s.id, s]),
  );
  for (const stationId of visitedStationIds) {
    const station = stationMap.get(stationId);
    if (!station || !isValidCoordinate(station.coords)) continue;
    features.push({
      type: 'Feature',
      properties: { kind: 'reveal-path-station' },
      geometry: { type: 'Point', coordinates: station.coords },
    });
  }

  if (session.startStationId) {
    const start = api.gameState.getStations().find((s) => s.id === session.startStationId);
    if (start) {
      features.push({
        type: 'Feature',
        properties: { kind: 'reveal-path-start' },
        geometry: { type: 'Point', coordinates: start.coords },
      });
    }
  }

  return features;
}

function buildRevealFeatures(
  session: HideSeekSession,
  stationMap: Map<string, { coords: [number, number] }>,
): Array<Record<string, unknown>> {
  if (!session.hideStationId) return [];

  const hideStation = stationMap.get(session.hideStationId);
  if (!hideStation) return [];

  const ring = circlePolygonRing(hideStation.coords, REVEAL_HIGHLIGHT_RADIUS_KM);
  const features: Array<Record<string, unknown>> = [
    {
      type: 'Feature',
      properties: { kind: 'reveal-circle-fill' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
    {
      type: 'Feature',
      properties: { kind: 'reveal-circle-outline' },
      geometry: { type: 'LineString', coordinates: ring },
    },
    {
      type: 'Feature',
      properties: { kind: 'hide-station' },
      geometry: { type: 'Point', coordinates: hideStation.coords },
    },
    ...buildRevealPathFeatures(session),
  ];

  return features;
}

function fitBoundsToRing(
  ring: [number, number][],
  options?: { padding?: number; maxZoom?: number },
): void {
  const map = mapRef ?? api.utils.getMap();
  if (!map) return;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }

  if (!Number.isFinite(minLon)) return;

  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    {
      padding: options?.padding ?? 56,
      duration: 900,
      maxZoom: options?.maxZoom,
    },
  );
}

function zoomToRevealStation(coords: [number, number]): void {
  const ring = circlePolygonRing(coords, REVEAL_HIGHLIGHT_RADIUS_KM);
  fitBoundsToRing(ring, { padding: 56, maxZoom: 17 });
}

/** Fit the map to the full play-area circle around the starting station. */
export function viewPlayAreaOnMap(): void {
  const session = getSession();
  if (!session.startStationId) return;

  const start = api.gameState.getStations().find((s) => s.id === session.startStationId);
  if (!start) return;

  const ring = circlePolygonRing(start.coords, session.config.hideRadiusKm);
  fitBoundsToRing(ring, { padding: 72, maxZoom: 14 });
}

export function getAutoZoomValidRegionEnabled(): boolean {
  return getAutoZoomPref();
}

export function setAutoZoomValidRegionEnabled(enabled: boolean): void {
  if (getAutoZoomPref() === enabled) return;
  setAutoZoomPref(enabled);
  if (enabled) lastAutoZoomKey = null;
  refreshDeductionOverlay();
}

function maybeZoomToValidRegion(session: HideSeekSession): void {
  if (!getAutoZoomPref() || session.phase !== 'seeking') return;

  const playArea = getPlayAreaForSession(session);
  const key = getDeductionGeometryKey(session.mapOverlays, playArea);
  if (key === lastAutoZoomKey) return;
  lastAutoZoomKey = key;

  const ring = validRegionBboxRing(session.mapOverlays, playArea);
  if (!ring) {
    viewPlayAreaOnMap();
    return;
  }
  fitBoundsToRing(ring, { padding: 56, maxZoom: 15 });
}

/** Pan/zoom to the revealed hide station. */
export function viewAnswerOnMap(): void {
  const session = getSession();
  if (!session.hideStationId) return;

  const hideStation = api.gameState.getStations().find((s) => s.id === session.hideStationId);
  if (!hideStation) return;

  zoomToRevealStation(hideStation.coords);
}

/** Fit the map to the full revealed travel path (start → hide station). */
export function viewEntirePathOnMap(): void {
  const session = getSession();
  const legs = session.validatedPath?.legs;
  if (!legs?.length) return;

  const coords: [number, number][] = [];
  const { lines, visitedStationIds } = buildRevealPathMapFeatures(legs);

  for (const line of lines) {
    for (const point of line.coordinates) {
      if (isValidCoordinate(point)) coords.push(point);
    }
  }

  const stationMap = new Map(
    api.gameState.getStations().map((s) => [s.id, s]),
  );
  for (const stationId of visitedStationIds) {
    const station = stationMap.get(stationId);
    if (station && isValidCoordinate(station.coords)) {
      coords.push(station.coords);
    }
  }

  if (session.startStationId) {
    const start = stationMap.get(session.startStationId);
    if (start && isValidCoordinate(start.coords)) coords.push(start.coords);
  }
  if (session.hideStationId) {
    const hide = stationMap.get(session.hideStationId);
    if (hide && isValidCoordinate(hide.coords)) coords.push(hide.coords);
  }

  if (coords.length === 0) return;

  fitBoundsToRing(coords, { padding: 72, maxZoom: 14 });
}

export function centerMapOnStation(stationId: string): void {
  const station = api.gameState.getStations().find((s) => s.id === stationId);
  if (!station) return;

  const map = mapRef ?? api.utils.getMap();
  if (!map) return;

  map.easeTo({
    center: station.coords,
    duration: 700,
  });
}

function buildSeekingPickerFeatures(
  stationMap: Map<string, { coords: [number, number] }>,
): Array<Record<string, unknown>> {
  const features: Array<Record<string, unknown>> = [];

  if (seekingPickerStationId) {
    const station = stationMap.get(seekingPickerStationId);
    if (station) {
      features.push({
        type: 'Feature',
        properties: { kind: 'picker-station' },
        geometry: { type: 'Point', coordinates: station.coords },
      });
    }
  }

  if (seekingPickerRouteId) {
    const coords = getRouteStationLineCoords(seekingPickerRouteId).filter(isValidCoordinate);
    if (coords.length >= 2) {
      const routes = api.gameState.getRoutes();
      const routeIndex = routes.findIndex((r) => r.id === seekingPickerRouteId);
      const route = routeIndex >= 0 ? routes[routeIndex] : undefined;
      const routeColor = route
        ? normalizeLineColor(getRouteBulletMeta(route, routeIndex).color)
        : '#3b82f6';

      features.push({
        type: 'Feature',
        properties: {
          kind: 'picker-route-line',
          routeColor,
        },
        geometry: { type: 'LineString', coordinates: coords },
      });
    }
  }

  return features;
}

function buildQuestionDeductionFeatures(
  session: HideSeekSession,
  stationMap: Map<string, { coords: [number, number] }>,
): Array<Record<string, unknown>> {
  const features: Array<Record<string, unknown>> = [];
  const playArea = getPlayAreaForSession(session);

  features.push(...buildPlayAreaFeatures(session, stationMap));

  const { darkMask, outlineRings } = buildDeductionMaskAndOutlines(
    session.mapOverlays,
    playArea,
  );
  if (darkMask) {
    features.push({
      type: 'Feature',
      properties: { kind: 'dark-mask' },
      geometry: darkMask.geometry,
    });
  }

  if (outlineRings.length > 0) {
    for (const ring of outlineRings) {
      features.push({
        type: 'Feature',
        properties: { kind: 'valid-outline' },
        geometry: { type: 'LineString', coordinates: ring },
      });
    }
  }

  if (session.startStationId) {
    const start = stationMap.get(session.startStationId);
    if (start) {
      features.push({
        type: 'Feature',
        properties: { kind: 'start-station' },
        geometry: { type: 'Point', coordinates: start.coords },
      });
    }
  }

  features.push(...buildSeekingPickerFeatures(stationMap));

  return features;
}

function buildOverlayGeoJson(session: HideSeekSession): OverlayGeoJson {
  const stations = api.gameState.getStations();
  const stationMap = new Map(stations.map((s) => [s.id, s]));

  if (session.phase === 'setup') {
    const features = buildSetupFeatures(session, stationMap);
    return { type: 'FeatureCollection', features } as unknown as OverlayGeoJson;
  }

  if (session.phase === 'reveal') {
    const features: Array<Record<string, unknown>> = [
      ...buildRevealFeatures(session, stationMap),
    ];
    if (revealDeductionVisible) {
      features.unshift(...buildQuestionDeductionFeatures(session, stationMap));
    } else {
      features.unshift(...buildPlayAreaFeatures(session, stationMap));
    }
    return { type: 'FeatureCollection', features } as unknown as OverlayGeoJson;
  }

  if (session.phase !== 'seeking') return EMPTY_FC;

  const features = buildQuestionDeductionFeatures(session, stationMap);
  return { type: 'FeatureCollection', features } as unknown as OverlayGeoJson;
}

function removeDeprecatedLayers(map: MapLibreMap): void {
  for (const id of DEPRECATED_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
}

function ensureLayers(map: MapLibreMap): void {
  if (layersReady && map.getSource(SOURCE_ID)) return;

  removeDeprecatedLayers(map);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC });
  }

  const addIfMissing = (id: string, layer: maplibregl.LayerSpecification) => {
    try {
      if (!map.getLayer(id)) map.addLayer(layer);
    } catch (err) {
      console.warn(`[HideAndSeek] Could not add layer ${id}:`, err);
    }
  };

  addIfMissing(`${SOURCE_ID}-play-area-fill`, {
    id: `${SOURCE_ID}-play-area-fill`,
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'play-area-fill'],
    paint: {
      'fill-color': '#a855f7',
      'fill-opacity': 0.12,
    },
  });

  addIfMissing(`${SOURCE_ID}-play-area-outline`, {
    id: `${SOURCE_ID}-play-area-outline`,
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'play-area-outline'],
    paint: {
      'line-color': '#a855f7',
      'line-width': 2.5,
      'line-opacity': 0.95,
      'line-dasharray': [2, 2],
    },
  });

  addIfMissing(`${SOURCE_ID}-dark-mask`, {
    id: `${SOURCE_ID}-dark-mask`,
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'dark-mask'],
    paint: {
      'fill-color': '#020617',
      'fill-opacity': 0.55,
    },
  });

  addIfMissing(`${SOURCE_ID}-valid-outline`, {
    id: `${SOURCE_ID}-valid-outline`,
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'valid-outline'],
    paint: {
      'line-color': '#38bdf8',
      'line-width': 2,
      'line-opacity': 0.9,
    },
  });

  addIfMissing(`${SOURCE_ID}-start-station`, {
    id: `${SOURCE_ID}-start-station`,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'start-station'],
    paint: {
      'circle-radius': 7,
      'circle-color': '#f97316',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  addIfMissing(`${SOURCE_ID}-reveal-circle-fill`, {
    id: `${SOURCE_ID}-reveal-circle-fill`,
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'reveal-circle-fill'],
    paint: {
      'fill-color': '#22c55e',
      'fill-opacity': 0.2,
    },
  });

  addIfMissing(`${SOURCE_ID}-reveal-circle-outline`, {
    id: `${SOURCE_ID}-reveal-circle-outline`,
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'reveal-circle-outline'],
    paint: {
      'line-color': '#22c55e',
      'line-width': 3,
      'line-opacity': 0.95,
    },
  });

  addIfMissing(`${SOURCE_ID}-hide-station`, {
    id: `${SOURCE_ID}-hide-station`,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'hide-station'],
    paint: {
      'circle-radius': 11,
      'circle-color': '#22c55e',
      'circle-opacity': 0.95,
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  });

  addIfMissing(`${SOURCE_ID}-reveal-path-line`, {
    id: `${SOURCE_ID}-reveal-path-line`,
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'reveal-path-line'],
    paint: {
      'line-color': ['get', 'routeColor'],
      'line-width': 10,
      'line-opacity': 0.95,
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
  });

  if (map.getLayer(`${SOURCE_ID}-reveal-path-line`)) {
    map.setPaintProperty(`${SOURCE_ID}-reveal-path-line`, 'line-width', 10);
    map.setPaintProperty(`${SOURCE_ID}-reveal-path-line`, 'line-opacity', 0.95);
  }

  addIfMissing(`${SOURCE_ID}-reveal-path-station`, {
    id: `${SOURCE_ID}-reveal-path-station`,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'reveal-path-station'],
    paint: {
      'circle-radius': 5,
      'circle-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#f97316',
    },
  });

  addIfMissing(`${SOURCE_ID}-reveal-path-start`, {
    id: `${SOURCE_ID}-reveal-path-start`,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'reveal-path-start'],
    paint: {
      'circle-radius': 8,
      'circle-color': '#f97316',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  addIfMissing(`${SOURCE_ID}-picker-station`, {
    id: `${SOURCE_ID}-picker-station`,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'picker-station'],
    paint: {
      'circle-radius': 9,
      'circle-color': '#3b82f6',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  addIfMissing(`${SOURCE_ID}-picker-route-line`, {
    id: `${SOURCE_ID}-picker-route-line`,
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'picker-route-line'],
    paint: {
      'line-color': ['get', 'routeColor'],
      'line-width': 7,
      'line-opacity': 0.95,
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
  });
  layersReady = true;
}

export function initDeductionMapOverlay(map: MapLibreMap): void {
  clearDomOverlays();
  mapRef = map;
  ensureLayers(map);
  subscribeOverlay(() => refreshDeductionOverlay());
  refreshDeductionOverlay();
}

export function refreshDeductionOverlay(options?: { allowZoom?: boolean }): void {
  const map = mapRef ?? api.utils.getMap();
  if (!map) return;

  ensureLayers(map);
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;

  const session = getSession();

  try {
    source.setData(buildOverlayGeoJson(session));
  } catch (err) {
    console.error('[HideAndSeek] Failed to update map overlay:', err);
    source.setData(EMPTY_FC);
  }

  syncPathBulletMarkers(session);
  syncSetupStationLabel(session);
  syncSeekingPickerStationLabel();

  if (session.phase === 'reveal' && session.hideStationId) {
    if (lastRevealZoomKey !== session.hideStationId) {
      lastRevealZoomKey = session.hideStationId;
      const hideStation = api.gameState
        .getStations()
        .find((s) => s.id === session.hideStationId);
      if (hideStation) {
        zoomToRevealStation(hideStation.coords);
      }
    }
    return;
  }

  lastRevealZoomKey = null;

  if (options?.allowZoom !== false) {
    maybeZoomToValidRegion(session);
  }
}

export function clearDeductionOverlay(): void {
  const map = mapRef ?? api.utils.getMap();
  if (!map) return;

  lastRevealZoomKey = null;
  lastSyncedSetupStationId = null;
  lastSyncedPickerStationId = null;
  lastAutoZoomKey = null;
  revealPathVisible = true;
  revealDeductionVisible = true;
  seekingPickerStationId = null;
  seekingPickerRouteId = null;
  clearDomOverlays();
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(EMPTY_FC);
}
