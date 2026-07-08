/** Geographic helpers */

import type { Coordinate } from '../types/core';
import type { Station } from '../types/game-state';

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function stationsWithinRadiusKm(
  start: Station,
  candidates: Station[],
  radiusKm: number,
  excludeStart = true,
): Station[] {
  return candidates.filter((s) => {
    if (excludeStart && s.id === start.id) return false;
    return haversineKm(start.coords, s.coords) <= radiusKm;
  });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatGameTime(seconds: number): string {
  const daySeconds = 86400;
  const normalized = ((seconds % daySeconds) + daySeconds) % daySeconds;
  const h = Math.floor(normalized / 3600);
  const m = Math.floor((normalized % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAY_SECONDS = 86400;

/** Current in-game time as seconds into the day (0–86400) */
export function getCurrentTimeOfDaySeconds(): number {
  return window.SubwayBuilderAPI.gameState.getElapsedSeconds() % DAY_SECONDS;
}
