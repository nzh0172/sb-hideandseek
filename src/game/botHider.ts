/** Bot hider: pick a schedule-valid destination within the play area */

import { collapseStationIdsByGroup } from './stationGroups';
import { haversineKm, stationsWithinRadiusKm } from './geo';
import {
  findValidHideCandidates,
  findValidHideCandidatesReal,
  getPlayableRoutes,
  type PlayAreaConstraint,
} from './scheduleGraph';
import type { HideCandidate, GameConfig } from './types';

/** Max synthetic journey time in instant mode (no hide timer). */
const INSTANT_MAX_TRAVEL_SECONDS = 24 * 3600;

/** Outer ring of the play area (stations near the edge). */
const BOUNDARY_MARGIN_RATIO = 0.12;

/** Distance bands as a fraction of play-area radius from the start station. */
const NEAR_BAND: [number, number] = [0.12, 0.42];
const FAR_BAND: [number, number] = [0.42, 0.72];

/** Relative chance of each hide zone (must sum to 1). Boundary is allowed but uncommon. */
const ZONE_WEIGHTS = { near: 0.4, far: 0.4, boundary: 0.2 } as const;

export interface BotHideResult {
  ok: true;
  candidate: HideCandidate;
  allCandidates: HideCandidate[];
}

export interface BotHideFailure {
  ok: false;
  reason: 'no_timed_routes' | 'no_candidates' | 'start_not_found' | 'no_trains';
  message: string;
}

export type BotHideOutcome = BotHideResult | BotHideFailure;

function stationCoords(stationId: string): [number, number] | null {
  return (
    window.SubwayBuilderAPI.gameState
      .getStations()
      .find((s) => s.id === stationId)?.coords ?? null
  );
}

function distanceRatioFromStart(
  startCoords: [number, number],
  stationId: string,
  radiusKm: number,
): number | null {
  const coords = stationCoords(stationId);
  if (!coords || radiusKm <= 0) return null;
  return haversineKm(startCoords, coords) / radiusKm;
}

function isNearPlayAreaBoundary(
  startCoords: [number, number],
  stationId: string,
  radiusKm: number,
): boolean {
  const ratio = distanceRatioFromStart(startCoords, stationId, radiusKm);
  return ratio !== null && ratio >= 1 - BOUNDARY_MARGIN_RATIO;
}

function isInDistanceBand(
  startCoords: [number, number],
  stationId: string,
  radiusKm: number,
  band: [number, number],
): boolean {
  const ratio = distanceRatioFromStart(startCoords, stationId, radiusKm);
  return ratio !== null && ratio >= band[0] && ratio <= band[1];
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

type HideZone = keyof typeof ZONE_WEIGHTS;

function pickHideZone(): HideZone {
  const r = Math.random();
  if (r < ZONE_WEIGHTS.near) return 'near';
  if (r < ZONE_WEIGHTS.near + ZONE_WEIGHTS.far) return 'far';
  return 'boundary';
}

function candidatesInZone(
  startCoords: [number, number],
  candidates: HideCandidate[],
  radiusKm: number,
  zone: HideZone,
): HideCandidate[] {
  if (zone === 'boundary') {
    return candidates.filter((c) =>
      isNearPlayAreaBoundary(startCoords, c.stationId, radiusKm),
    );
  }

  const band = zone === 'near' ? NEAR_BAND : FAR_BAND;
  return candidates.filter(
    (c) =>
      isInDistanceBand(startCoords, c.stationId, radiusKm, band) &&
      !isNearPlayAreaBoundary(startCoords, c.stationId, radiusKm),
  );
}

function pickBotCandidate(
  startStationId: string,
  candidates: HideCandidate[],
  radiusKm: number,
): HideCandidate {
  const startCoords = stationCoords(startStationId);
  if (!startCoords || candidates.length === 1) return candidates[0]!;

  const zoneOrder: HideZone[] = [pickHideZone(), 'near', 'far', 'boundary'];
  const tried = new Set<HideZone>();

  for (const zone of zoneOrder) {
    if (tried.has(zone)) continue;
    tried.add(zone);

    const pool = candidatesInZone(startCoords, candidates, radiusKm, zone);
    if (pool.length > 0) return pickRandom(pool);
  }

  const nonBoundary = candidates.filter(
    (c) => !isNearPlayAreaBoundary(startCoords, c.stationId, radiusKm),
  );
  if (nonBoundary.length > 0) return pickRandom(nonBoundary);

  return pickRandom(candidates);
}

function isDestinationInPlayArea(
  stationId: string,
  playArea: PlayAreaConstraint,
): boolean {
  const station = window.SubwayBuilderAPI.gameState
    .getStations()
    .find((s) => s.id === stationId);
  if (!station) return false;
  return haversineKm(playArea.startCoords, station.coords) <= playArea.radiusKm;
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

  if (config.mode === 'live' && api.gameState.getTrains().length === 0) {
    return {
      ok: false,
      reason: 'no_trains',
      message: 'Live mode needs trains running. Buy and assign trains to your routes first.',
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

  const maxTravelSeconds =
    config.mode === 'instant'
      ? INSTANT_MAX_TRAVEL_SECONDS
      : config.hideDurationHours * 3600;

  const playArea: PlayAreaConstraint = {
    startCoords: startStation.coords,
    radiusKm: config.hideRadiusKm,
  };

  const allDestinationIds = collapseStationIdsByGroup(
    inRadius.map((s) => s.id),
  );

  const searchStartElapsed = api.gameState.getElapsedSeconds();
  const reachable =
    config.mode === 'live'
      ? findValidHideCandidatesReal(
          startStationId,
          allDestinationIds,
          maxTravelSeconds,
          searchStartElapsed,
          playArea,
        )
      : findValidHideCandidates(
          startStationId,
          allDestinationIds,
          maxTravelSeconds,
          playArea,
        );

  const candidates = reachable.filter((candidate) =>
    isDestinationInPlayArea(candidate.stationId, playArea),
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: 'no_candidates',
      message:
        config.mode === 'live'
          ? 'No train-reachable stations within range and hide time. Run more trains or increase hide time.'
          : 'No train-reachable stations within the play area. Make sure your starting station is on a route with other stops nearby.',
    };
  }

  const candidate = pickBotCandidate(startStationId, candidates, config.hideRadiusKm);
  return { ok: true, candidate, allCandidates: candidates };
}
