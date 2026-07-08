/** Subtractive map overlay — dark outside, bright inside intersecting valid region */

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { circlePolygonRing } from './geo';
import { getSession, subscribe } from './session';
import { buildSubtractiveMask, validRegionOutlineRings } from './validRegion';
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
];

type OverlayGeoJson = Parameters<GeoJSONSource['setData']>[0];

const EMPTY_FC = { type: 'FeatureCollection', features: [] } as OverlayGeoJson;

let mapRef: MapLibreMap | null = null;

function buildSetupFeatures(
  session: HideSeekSession,
  stationMap: Map<string, { coords: [number, number] }>,
): Array<Record<string, unknown>> {
  if (!session.startStationId) return [];

  const start = stationMap.get(session.startStationId);
  if (!start) return [];

  const ring = circlePolygonRing(start.coords, session.config.hideRadiusKm);
  const features: Array<Record<string, unknown>> = [
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
    {
      type: 'Feature',
      properties: { kind: 'start-station' },
      geometry: { type: 'Point', coordinates: start.coords },
    },
  ];

  return features;
}

function buildOverlayGeoJson(session: HideSeekSession): OverlayGeoJson {
  const stations = api.gameState.getStations();
  const stationMap = new Map(stations.map((s) => [s.id, s]));

  if (session.phase === 'setup') {
    const features = buildSetupFeatures(session, stationMap);
    return { type: 'FeatureCollection', features } as unknown as OverlayGeoJson;
  }

  if (session.phase !== 'seeking') return EMPTY_FC;

  const features: Array<Record<string, unknown>> = [];

  const darkMask = buildSubtractiveMask(session.mapOverlays);
  if (darkMask) {
    features.push({
      type: 'Feature',
      properties: { kind: 'dark-mask' },
      geometry: darkMask.geometry,
    });
  }

  for (const ring of validRegionOutlineRings(session.mapOverlays)) {
    features.push({
      type: 'Feature',
      properties: { kind: 'valid-outline' },
      geometry: { type: 'LineString', coordinates: ring },
    });
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

  for (const stationId of session.possibleStationIds) {
    const station = stationMap.get(stationId);
    if (station) {
      features.push({
        type: 'Feature',
        properties: { kind: 'possible-station' },
        geometry: { type: 'Point', coordinates: station.coords },
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

  addIfMissing(`${SOURCE_ID}-possible-stations`, {
    id: `${SOURCE_ID}-possible-stations`,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'possible-station'],
    paint: {
      'circle-radius': 9,
      'circle-color': '#22c55e',
      'circle-opacity': 0.85,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
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

  source.setData(buildOverlayGeoJson(getSession()));
}

export function clearDeductionOverlay(): void {
  const map = mapRef ?? api.utils.getMap();
  if (!map) return;

  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(EMPTY_FC);
}
