/** Compute intersecting valid region and subtractive dark mask for map overlay */

import mask from '@turf/mask';
import {
  bbox,
  bboxPolygon,
  buffer,
  circle,
  difference,
  featureCollection,
  intersect,
  lineString,
  point,
  union,
} from '@turf/turf';
import { getRouteStationLineCoords } from './scheduleGraph';
import type { MapOverlay } from './types';

const api = window.SubwayBuilderAPI;

const ROUTE_CORRIDOR_KM = 0.35;
const BOUNDS_PADDING_DEG = 0.4;

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

function intersectArea(a: AreaFeature, b: AreaFeature): AreaFeature | null {
  return asArea(intersect(featureCollection([a, b] as never)));
}

function differenceArea(a: AreaFeature, b: AreaFeature): AreaFeature | null {
  return asArea(difference(featureCollection([a, b] as never)));
}

function unionArea(a: AreaFeature, b: AreaFeature): AreaFeature | null {
  return asArea(union(featureCollection([a, b] as never)));
}

function getBoundsPolygon(): AreaFeature {
  const stations = api.gameState.getStations();
  if (stations.length === 0) {
    return asArea(bboxPolygon([-180, -85, 180, 85]))!;
  }

  const points = featureCollection(stations.map((s) => point(s.coords)));
  const [minLon, minLat, maxLon, maxLat] = bbox(points);

  return asArea(
    bboxPolygon([
      minLon - BOUNDS_PADDING_DEG,
      minLat - BOUNDS_PADDING_DEG,
      maxLon + BOUNDS_PADDING_DEG,
      maxLat + BOUNDS_PADDING_DEG,
    ]),
  )!;
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
    return circle(overlay.center, overlay.radiusKm, {
      units: 'kilometers',
      steps: 64,
    });
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

/** Intersection of all inclusive constraints minus exclusive ones. */
export function computeValidRegion(overlays: MapOverlay[]): AreaFeature | null {
  const unique = uniqueOverlays(overlays);
  if (unique.length === 0) return null;

  const bounds = getBoundsPolygon();
  let valid: AreaFeature | null = bounds;

  for (const overlay of unique) {
    const region = overlayRegion(overlay);
    if (!region) continue;

    if (overlay.inclusive) {
      valid = valid ? intersectArea(valid, region) : region;
    } else {
      valid = valid ? differenceArea(valid, region) : differenceArea(bounds, region);
    }

    if (!valid) return null;
  }

  return valid;
}

/** Dark fill polygon: map bounds with valid region cut out as hole(s). */
export function buildSubtractiveMask(overlays: MapOverlay[]): AreaFeature | null {
  const valid = computeValidRegion(overlays);
  if (!valid) return null;

  const bounds = getBoundsPolygon();
  try {
    const dark = mask(valid as never, bounds as never);
    if (!dark?.geometry) return null;
    return asArea(dark);
  } catch {
    return bounds;
  }
}

/** Outline rings for the valid bright region (optional border). */
export function validRegionOutlineRings(overlays: MapOverlay[]): Position[][] {
  const valid = computeValidRegion(overlays);
  if (!valid) return [];

  if (valid.geometry.type === 'Polygon') {
    const coords = valid.geometry.coordinates as Position[][];
    return [coords[0]!];
  }

  const multi = valid.geometry.coordinates as Position[][][];
  return multi.map((poly) => poly[0]!);
}
