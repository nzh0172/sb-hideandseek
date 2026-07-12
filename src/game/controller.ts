/** Game controller: round lifecycle, timer, deduction queries */

import { pickBotHideSpot } from './botHider';
import {
  applyCardinalDirection,
  applyDistanceFromStation,
  applyLineCheck,
  applySameLineAsStart,
  applyTransferCount,
} from './deduction';
import { areSameStationGroup, getGroupRepresentative, getRouteDisplayName, getStationDisplayNameById } from './displayNames';
import { formatCardinalDirection, haversineKm, isCardinalDirectionOf } from './geo';
import {
  captureMapNearHide,
  clearDeductionOverlay,
  refreshDeductionOverlay,
} from './mapOverlay';
import {
  getPlayableRoutes,
  isSameLineWithoutTransfer,
  isStationOnRoute,
} from './scheduleGraph';
import {
  addQueryLog,
  getSession,
  incrementGuessCount,
  reveal,
  resetForNewRound,
  resetSession,
  setRoundData,
  setStartStationId,
  transitionTo,
} from './session';
import type { CardinalDirection } from './types';

const api = window.SubwayBuilderAPI;

export function startRound(
  startStationId: string,
  options?: { round?: number },
): boolean {
  const session = getSession();
  const currentRound = options?.round ?? 1;
  const playAreaStationId =
    currentRound > 1 && session.playAreaStationId
      ? session.playAreaStationId
      : startStationId;

  const outcome = pickBotHideSpot(startStationId, session.config, playAreaStationId);

  if (!outcome.ok) {
    api.ui.showNotification(outcome.message, 'warning');
    return false;
  }

  const hideStartElapsed = api.gameState.getElapsedSeconds();
  const isLive = session.config.mode === 'live';
  const hideEndElapsed = isLive
    ? hideStartElapsed + session.config.hideDurationHours * 3600
    : hideStartElapsed;

  setStartStationId(startStationId);
  setRoundData({
    hideStationId: outcome.candidate.stationId,
    validatedPath: outcome.candidate.path,
    hideStartElapsed,
    hideEndElapsed,
    possibleStationIds: outcome.allCandidates.map((c) => c.stationId),
    candidatePathsByStation: Object.fromEntries(
      outcome.allCandidates.map((c) => [c.stationId, c.path]),
    ),
    phase: isLive ? 'hiding' : 'seeking',
    currentRound,
    playAreaStationId,
  });

  clearDeductionOverlay();

  if (isLive) {
    api.actions.setPause(false);
    api.ui.showNotification('The hider is on the move. Good luck!', 'info');
  } else {
    refreshDeductionOverlay();
    api.ui.showNotification('The hider has hidden. Start deducing!', 'info');
  }
  return true;
}

export function tickHideTimer(): void {
  const session = getSession();
  if (session.phase !== 'hiding' || session.config.mode !== 'live') return;

  const elapsed = api.gameState.getElapsedSeconds();
  if (elapsed >= session.hideEndElapsed) {
    api.actions.setPause(true);
    transitionTo('seeking');
    refreshDeductionOverlay();
    api.ui.showNotification('Hide time is up. Start deducing!', 'info');
  }
}

export function getRemainingHideSeconds(): number {
  const session = getSession();
  if (session.phase !== 'hiding') return 0;
  return Math.max(0, session.hideEndElapsed - api.gameState.getElapsedSeconds());
}

export function giveUp(): void {
  reveal('giveUp');
}

export function guessStation(stationId: string): boolean {
  const session = getSession();
  if (!session.hideStationId) return false;

  if (areSameStationGroup(stationId, session.hideStationId)) {
    reveal('correct');
    return true;
  }

  incrementGuessCount();
  addQueryLog({
    question: `Guess: ${getStationDisplayNameById(stationId)}`,
    answer: 'Incorrect',
  });
  return false;
}

function getStationCoords(stationId: string) {
  return api.gameState.getStations().find((s) => s.id === stationId)?.coords;
}

export function queryWithinKmFromStation(
  refStationId: string,
  radiusKm: number,
): void {
  const session = getSession();
  if (!session.hideStationId) return;

  const ref = api.gameState.getStations().find((s) => s.id === refStationId);
  const hideCoords = getStationCoords(session.hideStationId);
  if (!ref || !hideCoords) return;

  const dist = haversineKm(ref.coords, hideCoords);
  const within = dist <= radiusKm;
  const answer = within ? 'Yes' : 'No';
  addQueryLog({
    question: `Within ${radiusKm} km from ${getStationDisplayNameById(refStationId)}?`,
    answer: `${answer} (${dist.toFixed(1)} km)`,
  });
  applyDistanceFromStation(refStationId, radiusKm, within);
}

export function queryDirectionFromStation(
  refStationId: string,
  direction: CardinalDirection,
): void {
  const session = getSession();
  if (!session.hideStationId) return;

  const ref = api.gameState.getStations().find((s) => s.id === refStationId);
  const hideCoords = getStationCoords(session.hideStationId);
  if (!ref || !hideCoords) return;

  const onSide = isCardinalDirectionOf(hideCoords, ref.coords, direction);
  const refName = getStationDisplayNameById(refStationId);
  const dirLabel = formatCardinalDirection(direction);
  addQueryLog({
    question: `${dirLabel} of ${refName}?`,
    answer: onSide ? 'Yes' : 'No',
  });
  applyCardinalDirection(refStationId, direction, onSide);
}

export function queryOnLine(routeId: string): void {
  const session = getSession();
  if (!session.hideStationId) return;

  const route = api.gameState.getRoutes().find((r) => r.id === routeId);
  const onLine = isStationOnRoute(session.hideStationId, routeId);
  const routeIndex = api.gameState.getRoutes().findIndex((r) => r.id === routeId);
  const label = route ? getRouteDisplayName(route, routeIndex) : 'Unknown line';
  addQueryLog({
    question: `On ${label}?`,
    answer: onLine ? 'Yes' : 'No',
  });
  applyLineCheck(routeId, onLine);
}

export function queryTransferCount(): void {
  const session = getSession();
  if (!session.validatedPath) return;

  addQueryLog({
    question: 'How many transfers?',
    answer: String(session.validatedPath.transferCount),
  });
  applyTransferCount(session.validatedPath.transferCount);
}

export function querySameLineAsStart(): void {
  const session = getSession();
  if (!session.startStationId || !session.hideStationId) return;

  const same = isSameLineWithoutTransfer(
    session.startStationId,
    session.hideStationId,
  );
  addQueryLog({
    question: 'Same line as start (no transfer)?',
    answer: same ? 'Yes' : 'No',
  });
  applySameLineAsStart(same);
}

/** Capture a map snapshot near the hide (jittered) and add it to the question log. */
export async function queryMapNearHide(): Promise<boolean> {
  const session = getSession();
  if (!session.hideStationId) return false;

  api.ui.showNotification('Capturing map near the hide…', 'info');
  const imageDataUrl = await captureMapNearHide();

  if (!imageDataUrl) {
    api.ui.showNotification(
      'Could not capture the map. Try again in a moment.',
      'warning',
    );
    return false;
  }

  addQueryLog({
    question: 'Map near the hide?',
    answer: 'See peek below',
    imageDataUrl,
  });
  return true;
}

/** True when more rounds remain in the current series after reveal. */
export function hasNextRound(): boolean {
  const session = getSession();
  return session.currentRound > 0 && session.currentRound < session.config.totalRounds;
}

/** Start the next round from the previous hide station, or return to setup. */
export function nextRound(): void {
  const session = getSession();
  const nextStartStationId = session.hideStationId
    ? getGroupRepresentative(session.hideStationId)
    : session.startStationId;

  if (!hasNextRound() || !nextStartStationId) {
    finishSeries(nextStartStationId);
    return;
  }

  const round = session.currentRound + 1;
  clearDeductionOverlay();
  const ok = startRound(nextStartStationId, { round });
  if (!ok) {
    resetForNewRound(nextStartStationId);
    refreshDeductionOverlay();
  }
}

/** End the series and return to setup, carrying the last hide as the start pick. */
export function finishSeries(nextStartStationId?: string | null): void {
  const session = getSession();
  const startId =
    nextStartStationId !== undefined
      ? nextStartStationId
      : session.hideStationId
        ? getGroupRepresentative(session.hideStationId)
        : session.startStationId;

  clearDeductionOverlay();
  resetForNewRound(startId);
  refreshDeductionOverlay();
}

export function canStartRound(mode = getSession().config.mode): boolean {
  if (getPlayableRoutes().length === 0) return false;
  if (mode === 'live' && api.gameState.getTrains().length === 0) return false;
  return true;
}

export function validateSessionIntegrity(): void {
  const session = getSession();
  if (session.phase === 'setup' || session.phase === 'reveal') return;

  const stations = api.gameState.getStations();
  const stationIds = new Set(stations.map((s) => s.id));

  if (
    session.startStationId &&
    !stationIds.has(session.startStationId)
  ) {
    // api.ui.showNotification('Starting station was removed. Round cancelled.', 'warning');
    clearDeductionOverlay();
    resetSession();
    return;
  }

  if (
    session.playAreaStationId &&
    !stationIds.has(session.playAreaStationId)
  ) {
    clearDeductionOverlay();
    resetSession();
    return;
  }

  if (session.hideStationId && !stationIds.has(session.hideStationId)) {
    // api.ui.showNotification('Hide station was removed. Round cancelled.', 'warning');
    clearDeductionOverlay();
    resetSession();
  }
}

export function getHideStationForReveal(): {
  id: string;
  name: string;
} | null {
  const session = getSession();
  if (!session.hideStationId) return null;
  const station = api.gameState.getStations().find(
    (s) => s.id === session.hideStationId,
  );
  if (!station) return null;
  return { id: station.id, name: getStationDisplayNameById(station.id) };
}
