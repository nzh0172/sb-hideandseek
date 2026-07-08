/** Subtractive map overlay — dark outside, bright inside intersecting valid region */

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { circlePolygonRing } from './geo';
import { getSession, subscribe } from './session';
import { buildSubtractiveMask, playAreaRegion, validRegionOutlineRings } from './validRegion';
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
];

type OverlayGeoJson = Parameters<GeoJSONSource['setData']>[0];

const EMPTY_FC = { type: 'FeatureCollection', features: [] } as OverlayGeoJson;

/** Highlight radius around the revealed hide station. */
const REVEAL_HIGHLIGHT_RADIUS_KM = 0.5;

let mapRef: MapLibreMap | null = null;
let lastRevealZoomKey: string | null = null;
let setupPlayAreaVisible = true;

export function isSetupPlayAreaVisible(): boolean {
  return setupPlayAreaVisible;
}

export function setSetupPlayAreaVisible(visible: boolean): void {
  setupPlayAreaVisible = visible;
  refreshDeductionOverlay();
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

  const start = stationMap.get(session.startStationId);
  if (!start) return features;

  features.push({
    type: 'Feature',
    properties: { kind: 'start-station' },
    geometry: { type: 'Point', coordinates: start.coords },
  });

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
  return [
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
  ];
}

function zoomToRevealStation(coords: [number, number]): void {
  const map = mapRef ?? api.utils.getMap();
  if (!map) return;

  const ring = circlePolygonRing(coords, REVEAL_HIGHLIGHT_RADIUS_KM);
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

  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    { padding: 56, duration: 900, maxZoom: 17 },
  );
}

export function centerMapOnStation(stationId: string): void {
  const session = getSession();
  if (session.phase !== 'setup') return;

  const station = api.gameState.getStations().find((s) => s.id === stationId);
  if (!station) return;

  const map = mapRef ?? api.utils.getMap();
  if (!map) return;

  map.easeTo({
    center: station.coords,
    duration: 700,
  });
}

function buildOverlayGeoJson(session: HideSeekSession): OverlayGeoJson {
  const stations = api.gameState.getStations();
  const stationMap = new Map(stations.map((s) => [s.id, s]));

  if (session.phase === 'setup') {
    const features = buildSetupFeatures(session, stationMap);
    return { type: 'FeatureCollection', features } as unknown as OverlayGeoJson;
  }

  if (session.phase === 'reveal') {
    const features = buildRevealFeatures(session, stationMap);
    return { type: 'FeatureCollection', features } as unknown as OverlayGeoJson;
  }

  if (session.phase !== 'seeking') return EMPTY_FC;

  const features: Array<Record<string, unknown>> = [];
  const playArea = getPlayAreaForSession(session);

  features.push(...buildPlayAreaFeatures(session, stationMap));

  const darkMask = buildSubtractiveMask(session.mapOverlays, playArea);
  if (darkMask) {
    features.push({
      type: 'Feature',
      properties: { kind: 'dark-mask' },
      geometry: darkMask.geometry,
    });
  }

  if (session.mapOverlays.length > 0) {
    for (const ring of validRegionOutlineRings(session.mapOverlays, playArea)) {
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

  return { type: 'FeatureCollection', features } as unknown as OverlayGeoJson;
}

function removeDeprecatedLayers(map: MapLibreMap): void {
  for (const id of DEPRECATED_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
}

function ensureLayers(map: MapLibreMap): void {
  removeDeprecatedLayers(map);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC });
  }

  const addIfMissing = (id: string, layer: maplibregl.LayerSpecification) => {
    if (!map.getLayer(id)) map.addLayer(layer);
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
}

export function initDeductionMapOverlay(map: MapLibreMap): void {
  mapRef = map;
  ensureLayers(map);
  subscribe(() => refreshDeductionOverlay());
  refreshDeductionOverlay();
}

export function refreshDeductionOverlay(): void {
  const map = mapRef ?? api.utils.getMap();
  if (!map) return;

  ensureLayers(map);
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;

  const session = getSession();
  source.setData(buildOverlayGeoJson(session));

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
}

export function clearDeductionOverlay(): void {
  const map = mapRef ?? api.utils.getMap();
  if (!map) return;

  lastRevealZoomKey = null;
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(EMPTY_FC);
}
