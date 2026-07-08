/** Game controller: round lifecycle, timer, deduction queries */

import { pickBotHideSpot } from './botHider';
import {
  applyDistanceFromStart,
  applyDistanceFromStation,
  applyLineCheck,
  applySameLineAsStart,
  applyTransferCount,
} from './deduction';
import { getRouteDisplayName, getStationDisplayNameById } from './displayNames';
import { haversineKm } from './geo';
import { clearDeductionOverlay, refreshDeductionOverlay } from './mapOverlay';
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
  resetSession,
  setRoundData,
  setStartStationId,
  transitionTo,
} from './session';

const api = window.SubwayBuilderAPI;

export function startRound(startStationId: string): boolean {
  const session = getSession();
  const outcome = pickBotHideSpot(startStationId, session.config);

  if (!outcome.ok) {
    api.ui.showNotification(outcome.message, 'warning');
    return false;
  }

  const hideStartElapsed = api.gameState.getElapsedSeconds();
  const hideEndElapsed =
    hideStartElapsed + session.config.hideDurationHours * 3600;

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
  });

  clearDeductionOverlay();

  api.actions.setPause(false);
  api.ui.showNotification('The hider is on the move. Good luck!', 'info');
  return true;
}

export function tickHideTimer(): void {
  const session = getSession();
  if (session.phase !== 'hiding') return;

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

  if (stationId === session.hideStationId) {
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

export function queryWithinKmFromMe(radiusKm: number): void {
  const session = getSession();
  if (!session.startStationId || !session.hideStationId) return;

  const startCoords = getStationCoords(session.startStationId);
  const hideCoords = getStationCoords(session.hideStationId);
  if (!startCoords || !hideCoords) return;

  const dist = haversineKm(startCoords, hideCoords);
  const within = dist <= radiusKm;
  const answer = within ? 'Yes' : 'No';
  addQueryLog({
    question: `Within ${radiusKm} km from me?`,
    answer: `${answer} (${dist.toFixed(1)} km)`,
  });
  applyDistanceFromStart(radiusKm, within);
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

export function newRound(): void {
  clearDeductionOverlay();
  resetSession();
  refreshDeductionOverlay();
}

export function canStartRound(): boolean {
  return getPlayableRoutes().length > 0;
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
    api.ui.showNotification('Starting station was removed. Round cancelled.', 'warning');
    clearDeductionOverlay();
    resetSession();
    return;
  }

  if (session.hideStationId && !stationIds.has(session.hideStationId)) {
    api.ui.showNotification('Hide station was removed. Round cancelled.', 'warning');
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
