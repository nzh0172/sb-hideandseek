/** Compute intersecting valid region and subtractive dark mask for map overlay */

import bbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';
import buffer from '@turf/buffer';
import difference from '@turf/difference';
import { featureCollection, lineString } from '@turf/helpers';
import intersect from '@turf/intersect';
import union from '@turf/union';
import { circlePolygonRing } from './geo';
import type { CardinalDirection } from './types';
import { getRouteStationLineCoords } from './scheduleGraph';
import type { MapOverlay } from './types';

const api = window.SubwayBuilderAPI;

/** Buffer around route lines for line-check region — wider than the drawn track. */
const ROUTE_CORRIDOR_KM = 0.20;
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

const corridorCache = new Map<string, AreaFeature | null>();
let corridorCacheRevision = '';

function routeNetworkRevision(): string {
  return api.gameState
    .getRoutes()
    .map((r) => `${r.id}:${r.stComboTimings?.length ?? 0}`)
    .join('|');
}

function routeCorridor(routeId: string): AreaFeature | null {
  const revision = routeNetworkRevision();
  if (revision !== corridorCacheRevision) {
    corridorCache.clear();
    corridorCacheRevision = revision;
  }

  if (corridorCache.has(routeId)) {
    return corridorCache.get(routeId) ?? null;
  }

  const coords = getRouteStationLineCoords(routeId);
  let corridor: AreaFeature | null = null;
  if (coords.length >= 2) {
    corridor = asArea(
      buffer(lineString(coords), ROUTE_CORRIDOR_KM, {
        units: 'kilometers',
        steps: 8,
      }),
    );
  }

  corridorCache.set(routeId, corridor);
  return corridor;
}

function halfPlaneArea(
  ref: [number, number],
  direction: CardinalDirection,
  bounds: AreaFeature,
): AreaFeature {
  const [lon, lat] = ref;
  const [minLon, minLat, maxLon, maxLat] = bbox(bounds as never);

  let ring: [number, number][];
  switch (direction) {
    case 'north':
      ring = [
        [minLon, lat],
        [maxLon, lat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, lat],
      ];
      break;
    case 'south':
      ring = [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, lat],
        [minLon, lat],
        [minLon, minLat],
      ];
      break;
    case 'east':
      ring = [
        [lon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [lon, maxLat],
        [lon, minLat],
      ];
      break;
    case 'west':
      ring = [
        [minLon, minLat],
        [lon, minLat],
        [lon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ];
      break;
  }

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {},
  };
}

function overlayRegion(overlay: MapOverlay): AreaFeature | null {
  if (overlay.kind === 'distance-circle' && overlay.center && overlay.radiusKm) {
    return circleArea(overlay.center, overlay.radiusKm);
  }

  if (overlay.kind === 'half-plane' && overlay.center && overlay.direction) {
    const bounds = getBoundsPolygon();
    return halfPlaneArea(overlay.center, overlay.direction, bounds);
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

function extractOutlineRings(valid: AreaFeature | null): Position[][] {
  if (!valid) return [];

  const rings: Position[][] = [];

  if (valid.geometry.type === 'Polygon') {
    const coords = valid.geometry.coordinates as Position[][];
    for (const ring of coords) {
      if (ring.length >= 2) rings.push(ring);
    }
    return rings;
  }

  const multi = valid.geometry.coordinates as Position[][][];
  for (const poly of multi) {
    for (const ring of poly) {
      if (ring.length >= 2) rings.push(ring);
    }
  }
  return rings;
}

function deductionCacheKey(
  overlays: MapOverlay[],
  playArea: AreaFeature | null,
): string {
  const unique = uniqueOverlays(overlays);
  const overlayKey = unique
    .map((o) => `${o.deductionKey}:${o.inclusive}`)
    .join(';');
  const playKey = playArea
    ? JSON.stringify(playArea.geometry)
    : 'none';
  return `${overlayKey}|${playKey}|${api.gameState.getStations().length}`;
}

/** Cache key for deduction geometry — used to skip redundant map zooms. */
export function getDeductionGeometryKey(
  overlays: MapOverlay[],
  playArea: AreaFeature | null = null,
): string {
  return deductionCacheKey(overlays, playArea);
}

let deductionGeometryCache: {
  key: string;
  darkMask: AreaFeature | null;
  outlineRings: Position[][];
} | null = null;

export function invalidateValidRegionCache(): void {
  deductionGeometryCache = null;
  corridorCache.clear();
  corridorCacheRevision = '';
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

/** Dark mask + outline rings in one pass, cached by overlay set. */
export function buildDeductionMaskAndOutlines(
  overlays: MapOverlay[],
  playArea: AreaFeature | null = null,
): { darkMask: AreaFeature | null; outlineRings: Position[][] } {
  const key = deductionCacheKey(overlays, playArea);
  if (deductionGeometryCache?.key === key) {
    return {
      darkMask: deductionGeometryCache.darkMask,
      outlineRings: deductionGeometryCache.outlineRings,
    };
  }

  const bounds = getBoundsPolygon(playArea);
  const valid = computeValidRegion(overlays, playArea);
  const darkMask = !valid ? bounds : differenceArea(bounds, valid) ?? bounds;
  const outlineRings = extractOutlineRings(valid);

  deductionGeometryCache = { key, darkMask, outlineRings };
  return { darkMask, outlineRings };
}

/** Dark fill polygon: map bounds minus the bright valid region. */
export function buildSubtractiveMask(
  overlays: MapOverlay[],
  playArea: AreaFeature | null = null,
): AreaFeature | null {
  return buildDeductionMaskAndOutlines(overlays, playArea).darkMask;
}

/** Outline rings for the valid bright region (outer boundary and hole edges). */
export function validRegionOutlineRings(
  overlays: MapOverlay[],
  playArea: AreaFeature | null = null,
): Position[][] {
  return buildDeductionMaskAndOutlines(overlays, playArea).outlineRings;
}

export function playAreaRegion(
  center: [number, number],
  radiusKm: number,
): AreaFeature {
  return circleArea(center, radiusKm);
}

/** Bounding ring for the bright valid region (for map fitBounds). */
export function validRegionBboxRing(
  overlays: MapOverlay[],
  playArea: AreaFeature | null = null,
): [number, number][] | null {
  const valid = computeValidRegion(overlays, playArea);
  if (!valid) return null;

  const [minLon, minLat, maxLon, maxLat] = bbox(valid as never);
  if (!Number.isFinite(minLon)) return null;

  return [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat],
  ];
}
