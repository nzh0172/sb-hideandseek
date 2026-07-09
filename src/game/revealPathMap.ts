/** Map geometry for the reveal-phase traveled path */

import type { Coordinate } from '../types/core';
import type { Route } from '../types/game-state';
import { getRouteBulletMeta } from './displayNames';
import { destinationPointKm } from './geo';
import { getRouteSegmentCoords } from './scheduleGraph';
import type { PathLeg } from './types';

const api = window.SubwayBuilderAPI;

export interface RevealPathLineFeature {
  routeId: string;
  routeColor: string;
  coordinates: Coordinate[];
}

export interface RevealPathBulletFeature {
  routeId: string;
  bulletLabel: string;
  bulletColor: string;
  bulletTextColor: string;
  coordinates: Coordinate;
}

function coordsEqual(a: Coordinate, b: Coordinate): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Append segment coords, dropping duplicate join point. */
export function appendPathCoords(
  path: Coordinate[],
  segment: Coordinate[],
): Coordinate[] {
  if (segment.length === 0) return path;
  if (path.length === 0) return [...segment];

  const last = path[path.length - 1]!;
  const first = segment[0]!;
  if (coordsEqual(last, first)) {
    return [...path, ...segment.slice(1)];
  }
  return [...path, ...segment];
}

/** Group consecutive legs on the same route for one colored map segment. */
export function groupConsecutiveRouteLegs(legs: PathLeg[]): PathLeg[][] {
  const groups: PathLeg[][] = [];
  for (const leg of legs) {
    const current = groups[groups.length - 1];
    if (current && current[0]!.routeId === leg.routeId) {
      current.push(leg);
    } else {
      groups.push([leg]);
    }
  }
  return groups;
}

/** Build line coords for a leg group, passing through every intermediate stop on the route. */
export function coordsForLegGroup(legs: PathLeg[]): Coordinate[] {
  if (legs.length === 0) return [];

  const first = legs[0]!;
  const last = legs[legs.length - 1]!;
  const fullSegment = getRouteSegmentCoords(
    first.routeId,
    first.fromStationId,
    last.toStationId,
  );
  if (fullSegment.length >= 2) return fullSegment;

  let coords: Coordinate[] = [];
  for (const leg of legs) {
    const segment = getRouteSegmentCoords(
      leg.routeId,
      leg.fromStationId,
      leg.toStationId,
    );
    coords = appendPathCoords(coords, segment);
  }
  return coords;
}

export function midpointOfLine(coords: Coordinate[]): Coordinate {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0]!;

  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    lengths.push(len);
    total += len;
  }

  if (total === 0) return coords[Math.floor(coords.length / 2)]!;

  const half = total / 2;
  let walked = 0;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!;
    if (walked + len >= half) {
      const t = (half - walked) / len;
      const a = coords[i]!;
      const b = coords[i + 1]!;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    walked += len;
  }

  return coords[coords.length - 1]!;
}

function bearingDeg(from: Coordinate, to: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Offset a point perpendicular to the line so the bullet sits beside the path. */
export function offsetBesideLine(
  coords: Coordinate[],
  offsetKm = 0.12,
): Coordinate {
  if (coords.length < 2) return midpointOfLine(coords);

  const mid = midpointOfLine(coords);
  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const segMid = midpointOfLine([coords[i]!, coords[i + 1]!]);
    const dx = segMid[0] - mid[0];
    const dy = segMid[1] - mid[1];
    const dist = dx * dx + dy * dy;
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }

  const from = coords[closestIdx]!;
  const to = coords[closestIdx + 1]!;
  const bearing = bearingDeg(from, to);
  return destinationPointKm(mid, bearing + 90, offsetKm);
}

function getRouteForLeg(leg: PathLeg): Route | undefined {
  return api.gameState.getRoutes().find((r) => r.id === leg.routeId);
}

export function buildRevealPathMapFeatures(legs: PathLeg[]): {
  lines: RevealPathLineFeature[];
  bullets: RevealPathBulletFeature[];
  visitedStationIds: string[];
} {
  if (legs.length === 0) {
    return { lines: [], bullets: [], visitedStationIds: [] };
  }

  const lines: RevealPathLineFeature[] = [];
  const bullets: RevealPathBulletFeature[] = [];
  const visitedStationIds: string[] = [];

  for (const leg of legs) {
    if (!visitedStationIds.includes(leg.fromStationId)) {
      visitedStationIds.push(leg.fromStationId);
    }
    if (!visitedStationIds.includes(leg.toStationId)) {
      visitedStationIds.push(leg.toStationId);
    }
  }

  const routes = api.gameState.getRoutes();

  for (const group of groupConsecutiveRouteLegs(legs)) {
    const firstLeg = group[0]!;
    const coords = coordsForLegGroup(group);
    if (coords.length < 2) continue;

    const route = getRouteForLeg(firstLeg);
    const routeIndex = routes.findIndex((r) => r.id === firstLeg.routeId);
    const bullet = route
      ? getRouteBulletMeta(route, routeIndex >= 0 ? routeIndex : undefined)
      : {
          routeId: firstLeg.routeId,
          label: firstLeg.routeBullet || firstLeg.routeName || 'Line',
          color: '#f59e0b',
          textColor: '#111827',
          shape: 'circle' as const,
        };

    lines.push({
      routeId: firstLeg.routeId,
      routeColor: bullet.color,
      coordinates: coords,
    });

    bullets.push({
      routeId: firstLeg.routeId,
      bulletLabel: bullet.label,
      bulletColor: bullet.color,
      bulletTextColor: bullet.textColor,
      coordinates: offsetBesideLine(coords),
    });
  }

  return { lines, bullets, visitedStationIds };
}
