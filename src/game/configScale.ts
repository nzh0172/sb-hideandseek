/** Play area radius and hide duration bounds for setup sliders */

import type { GameConfig } from './types';

export const RADIUS_MIN_KM = 1;
export const RADIUS_MAX_KM = 200;
export const RADIUS_STEP_KM = 1;

export const DURATION_MIN_HOURS = 0.5;
export const DURATION_MAX_HOURS = 12;
export const DURATION_STEP_HOURS = 0.5;

export const ROUNDS_MIN = 1;
export const ROUNDS_MAX = 20;
export const ROUNDS_STEP = 1;

export function clampRadiusKm(radiusKm: number): number {
  const stepped = Math.round(radiusKm / RADIUS_STEP_KM) * RADIUS_STEP_KM;
  return Math.min(RADIUS_MAX_KM, Math.max(RADIUS_MIN_KM, stepped));
}

export function clampDurationHours(hours: number): number {
  const stepped = Math.round(hours / DURATION_STEP_HOURS) * DURATION_STEP_HOURS;
  return Math.min(DURATION_MAX_HOURS, Math.max(DURATION_MIN_HOURS, stepped));
}

export function formatRadiusKm(km: number): string {
  return `${km} km`;
}

export function formatHideHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
}

export function clampTotalRounds(rounds: number): number {
  const stepped = Math.round(rounds / ROUNDS_STEP) * ROUNDS_STEP;
  return Math.min(ROUNDS_MAX, Math.max(ROUNDS_MIN, stepped));
}

export function formatTotalRounds(rounds: number): string {
  return rounds === 1 ? '1 round' : `${rounds} rounds`;
}
