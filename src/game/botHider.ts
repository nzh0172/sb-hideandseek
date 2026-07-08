/** Bot hider: pick a schedule-valid destination within the play area */

import { collapseStationIdsByGroup } from './stationGroups';
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

function isBetterBotCandidate(
  startCoords: [number, number],
  candidate: HideCandidate,
  best: HideCandidate,
): boolean {
  const candidateTransfers = candidate.path.transferCount;
  const bestTransfers = best.path.transferCount;
  if (candidateTransfers !== bestTransfers) {
    return candidateTransfers > bestTransfers;
  }

  const candidateStation = window.SubwayBuilderAPI.gameState
    .getStations()
    .find((s) => s.id === candidate.stationId);
  const bestStation = window.SubwayBuilderAPI.gameState
    .getStations()
    .find((s) => s.id === best.stationId);
  if (!candidateStation || !bestStation) return false;

  const candidateDistance = haversineKm(startCoords, candidateStation.coords);
  const bestDistance = haversineKm(startCoords, bestStation.coords);
  if (candidateDistance !== bestDistance) {
    return candidateDistance > bestDistance;
  }

  return candidate.path.totalTimeSeconds > best.path.totalTimeSeconds;
}

function pickBotCandidate(
  startStationId: string,
  candidates: HideCandidate[],
): HideCandidate {
  const start = window.SubwayBuilderAPI.gameState
    .getStations()
    .find((s) => s.id === startStationId)!;

  let best = candidates[0]!;
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    if (isBetterBotCandidate(start.coords, candidate, best)) {
      best = candidate;
    }
  }
  return best;
}

function isDestinationInPlayArea(
  stationId: string,
  startCoords: [number, number],
  radiusKm: number,
): boolean {
  const station = window.SubwayBuilderAPI.gameState
    .getStations()
    .find((s) => s.id === stationId);
  if (!station) return false;
  return haversineKm(startCoords, station.coords) <= radiusKm;
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
  // Search the full network; only hide destinations must land inside the play area.
  const allDestinationIds = collapseStationIdsByGroup(
    stations.filter((s) => s.id !== startStationId).map((s) => s.id),
  );

  const reachable = findValidHideCandidates(
    startStationId,
    allDestinationIds,
    maxTravelSeconds,
  );

  const candidates = reachable.filter((candidate) =>
    isDestinationInPlayArea(
      candidate.stationId,
      startStation.coords,
      config.hideRadiusKm,
    ),
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: 'no_candidates',
      message:
        'No train-reachable stations within range and time limit. Make sure your starting station is on a route with other stops nearby.',
    };
  }

  const candidate = pickBotCandidate(startStationId, candidates);
  return { ok: true, candidate, allCandidates: candidates };
}
