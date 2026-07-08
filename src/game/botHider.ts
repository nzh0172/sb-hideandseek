/** Bot hider: pick the furthest schedule-valid destination from start */

import { haversineKm, stationsWithinRadiusKm } from './geo';
import { findValidHideCandidates, getPlayableRoutes } from './scheduleGraph';
import type { HideCandidate, GameConfig } from './types';

export interface BotHideResult {
  ok: true;
  candidate: HideCandidate;
  allCandidates: HideCandidate[];
}

export interface BotHideFailure {
  ok: false;
  reason: 'no_timed_routes' | 'no_candidates' | 'start_not_found';
  message: string;
}

export type BotHideOutcome = BotHideResult | BotHideFailure;

function pickFurthestCandidate(
  startStationId: string,
  candidates: HideCandidate[],
): HideCandidate {
  const api = window.SubwayBuilderAPI;
  const start = api.gameState.getStations().find((s) => s.id === startStationId)!;

  let best = candidates[0]!;
  let bestDistance = 0;

  for (const candidate of candidates) {
    const station = api.gameState.getStations().find((s) => s.id === candidate.stationId);
    if (!station) continue;

    const distance = haversineKm(start.coords, station.coords);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

export function pickBotHideSpot(
  startStationId: string,
  config: GameConfig,
): BotHideOutcome {
  const api = window.SubwayBuilderAPI;
  const stations = api.gameState.getStations();
  const startStation = stations.find((s) => s.id === startStationId);

  if (!startStation) {
    return {
      ok: false,
      reason: 'start_not_found',
      message: 'Starting station not found.',
    };
  }

  if (getPlayableRoutes().length === 0) {
    return {
      ok: false,
      reason: 'no_timed_routes',
      message: 'No playable routes yet. Create a route with at least 2 stations.',
    };
  }

  const inRadius = stationsWithinRadiusKm(
    startStation,
    stations,
    config.hideRadiusKm,
    true,
  );

  if (inRadius.length === 0) {
    return {
      ok: false,
      reason: 'no_candidates',
      message: `No other stations within ${config.hideRadiusKm} km. Pick a more central starting station.`,
    };
  }

  const maxTravelSeconds = config.hideDurationHours * 3600;
  const candidates = findValidHideCandidates(
    startStationId,
    inRadius.map((s) => s.id),
    maxTravelSeconds,
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: 'no_candidates',
      message:
        'No train-reachable stations within range and time limit. Make sure your starting station is on a route with other stops nearby.',
    };
  }

  const candidate = pickFurthestCandidate(startStationId, candidates);
  return { ok: true, candidate, allCandidates: candidates };
}
