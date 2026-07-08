/** Compute intersecting valid region and subtractive dark mask for map overlay */

import {
  bbox,
  bboxPolygon,
  buffer,
  difference,
  featureCollection,
  intersect,
  lineString,
  union,
} from '@turf/turf';
import { circlePolygonRing } from './geo';
import { getRouteStationLineCoords } from './scheduleGraph';
import type { MapOverlay } from './types';

const api = window.SubwayBuilderAPI;

const ROUTE_CORRIDOR_KM = 0.35;
const BOUNDS_PADDING_DEG = 0.15;

type Position = [number, number] | [number, number, number];

type AreaFeature = {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: unknown;
  };
  properties: Record<string, unknown> | null;
};

function asArea(feature: unknown): AreaFeature | null {
  if (!feature || typeof feature !== 'object') return null;
  const geom = (feature as AreaFeature).geometry;
  if (!geom) return null;
  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
    return feature as AreaFeature;
  }
  return null;
}

function circleArea(center: [number, number], radiusKm: number): AreaFeature {
  const ring = circlePolygonRing(center, radiusKm);
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {},
  };
}

function intersectArea(a: AreaFeature, b: AreaFeature): AreaFeature | null {
  return asArea(intersect(featureCollection([a, b] as never)));
}

function differenceArea(a: AreaFeature, b: AreaFeature): AreaFeature | null {
  return asArea(difference(featureCollection([a, b] as never)));
}

function unionArea(a: AreaFeature, b: AreaFeature): AreaFeature | null {
  return asArea(union(featureCollection([a, b] as never)));
}

function boundsWithPadding(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
): AreaFeature {
  return asArea(
    bboxPolygon([
      minLon - BOUNDS_PADDING_DEG,
      minLat - BOUNDS_PADDING_DEG,
      maxLon + BOUNDS_PADDING_DEG,
      maxLat + BOUNDS_PADDING_DEG,
    ]),
  )!;
}

function getBoundsPolygon(playArea: AreaFeature | null = null): AreaFeature {
  const stations = api.gameState.getStations();
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const station of stations) {
    minLon = Math.min(minLon, station.coords[0]);
    minLat = Math.min(minLat, station.coords[1]);
    maxLon = Math.max(maxLon, station.coords[0]);
    maxLat = Math.max(maxLat, station.coords[1]);
  }

  if (playArea) {
    const [pMinLon, pMinLat, pMaxLon, pMaxLat] = bbox(playArea as never);
    minLon = Math.min(minLon, pMinLon);
    minLat = Math.min(minLat, pMinLat);
    maxLon = Math.max(maxLon, pMaxLon);
    maxLat = Math.max(maxLat, pMaxLat);
  }

  if (!Number.isFinite(minLon)) {
    if (playArea) {
      const [pMinLon, pMinLat, pMaxLon, pMaxLat] = bbox(playArea as never);
      return boundsWithPadding(pMinLon, pMinLat, pMaxLon, pMaxLat);
    }
    return asArea(bboxPolygon([-180, -85, 180, 85]))!;
  }

  return boundsWithPadding(minLon, minLat, maxLon, maxLat);
}

function routeCorridor(routeId: string): AreaFeature | null {
  const coords = getRouteStationLineCoords(routeId);
  if (coords.length < 2) return null;
  return asArea(
    buffer(lineString(coords), ROUTE_CORRIDOR_KM, {
      units: 'kilometers',
      steps: 8,
    }),
  );
}

function overlayRegion(overlay: MapOverlay): AreaFeature | null {
  if (overlay.kind === 'distance-circle' && overlay.center && overlay.radiusKm) {
    return circleArea(overlay.center, overlay.radiusKm);
  }

  if (overlay.kind === 'route-line') {
    const routeIds = overlay.routeIds ?? (overlay.routeId ? [overlay.routeId] : []);
    let region: AreaFeature | null = null;
    for (const routeId of routeIds) {
      const corridor = routeCorridor(routeId);
      if (!corridor) continue;
      region = region ? unionArea(region, corridor) : corridor;
    }
    return region;
  }

  return null;
}

/** One overlay per question key — latest answer wins. */
export function uniqueOverlays(overlays: MapOverlay[]): MapOverlay[] {
  const byKey = new Map<string, MapOverlay>();
  for (const overlay of overlays) {
    byKey.set(overlay.deductionKey, overlay);
  }
  return [...byKey.values()];
}

function initialValidRegion(
  bounds: AreaFeature,
  playArea: AreaFeature | null,
): AreaFeature | null {
  if (!playArea) return null;
  return intersectArea(bounds, playArea) ?? playArea;
}

/** Intersection of play area and inclusive constraints minus exclusive ones. */
export function computeValidRegion(
  overlays: MapOverlay[],
  playArea: AreaFeature | null = null,
): AreaFeature | null {
  const unique = uniqueOverlays(overlays);
  const bounds = getBoundsPolygon(playArea);

  if (unique.length === 0) {
    return initialValidRegion(bounds, playArea);
  }

  let valid: AreaFeature | null = playArea
    ? initialValidRegion(bounds, playArea)
    : bounds;

  for (const overlay of unique) {
    const region = overlayRegion(overlay);
    if (!region) continue;

    if (overlay.inclusive) {
      valid = valid ? intersectArea(valid, region) : null;
    } else {
      valid = valid ? differenceArea(valid, region) : null;
    }

    if (!valid) return null;
  }

  return valid;
}

/** Dark fill polygon: map bounds minus the bright valid region. */
export function buildSubtractiveMask(
  overlays: MapOverlay[],
  playArea: AreaFeature | null = null,
): AreaFeature | null {
  const bounds = getBoundsPolygon(playArea);
  const valid = computeValidRegion(overlays, playArea);

  if (!valid) {
    return bounds;
  }

  return differenceArea(bounds, valid) ?? bounds;
}

/** Outline rings for the valid bright region (optional border). */
export function validRegionOutlineRings(
  overlays: MapOverlay[],
  playArea: AreaFeature | null = null,
): Position[][] {
  const valid = computeValidRegion(overlays, playArea);
  if (!valid) return [];

  if (valid.geometry.type === 'Polygon') {
    const coords = valid.geometry.coordinates as Position[][];
    return [coords[0]!];
  }

  const multi = valid.geometry.coordinates as Position[][][];
  return multi.map((poly) => poly[0]!);
}

export function playAreaRegion(
  center: [number, number],
  radiusKm: number,
): AreaFeature {
  return circleArea(center, radiusKm);
}
