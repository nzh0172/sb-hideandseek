/** In-memory session state with pub/sub for React UI */

import {
  createInitialSession,
  type GameConfig,
  type GamePhase,
  type HideSeekSession,
  type MapOverlay,
  type QueryLogEntry,
  type ValidatedPath,
} from './types';

type Listener = () => void;

let session = createInitialSession();
const uiListeners = new Set<Listener>();
const overlayListeners = new Set<Listener>();

export function getSession(): HideSeekSession {
  return session;
}

/** React UI updates — fires on any session change. */
export function subscribe(listener: Listener): () => void {
  uiListeners.add(listener);
  return () => uiListeners.delete(listener);
}

/** Map overlay updates — skips query log and guess-count-only changes. */
export function subscribeOverlay(listener: Listener): () => void {
  overlayListeners.add(listener);
  return () => overlayListeners.delete(listener);
}

function notifyUI(): void {
  uiListeners.forEach((l) => l());
}

function notifyOverlay(): void {
  overlayListeners.forEach((l) => l());
}

function notifyAll(): void {
  notifyUI();
  notifyOverlay();
}

export function resetSession(): void {
  session = createInitialSession();
  notifyAll();
}

/** Reset to setup, keeping config and optionally a starting station. */
export function resetForNewRound(nextStartStationId: string | null): void {
  const { config } = session;
  session = {
    ...createInitialSession(),
    startStationId: nextStartStationId,
    config: { ...config },
    currentRound: 0,
  };
  notifyAll();
}

export function setDeductionState(data: {
  possibleStationIds: string[];
  mapOverlays: MapOverlay[];
}): void {
  session = {
    ...session,
    possibleStationIds: data.possibleStationIds,
    mapOverlays: data.mapOverlays,
  };
  notifyAll();
}

export function setStartStationId(stationId: string | null): void {
  session = { ...session, startStationId: stationId };
  notifyAll();
}

export function setGameConfig(config: GameConfig): void {
  session = { ...session, config: { ...config } };
  notifyAll();
}

export function transitionTo(phase: GamePhase): void {
  session = { ...session, phase };
  notifyAll();
}

export function setRoundData(data: {
  hideStationId: string;
  validatedPath: HideSeekSession['validatedPath'];
  hideStartElapsed: number;
  hideEndElapsed: number;
  possibleStationIds: string[];
  candidatePathsByStation: Record<string, ValidatedPath>;
  phase: 'hiding' | 'seeking';
  currentRound: number;
  playAreaStationId: string;
}): void {
  session = {
    ...session,
    hideStationId: data.hideStationId,
    validatedPath: data.validatedPath,
    hideStartElapsed: data.hideStartElapsed,
    hideEndElapsed: data.hideEndElapsed,
    possibleStationIds: data.possibleStationIds,
    candidatePathsByStation: data.candidatePathsByStation,
    mapOverlays: [],
    guessCount: 0,
    queryLog: [],
    revealReason: null,
    phase: data.phase,
    currentRound: data.currentRound,
    playAreaStationId: data.playAreaStationId,
  };
  notifyAll();
}

export function addQueryLog(entry: Omit<QueryLogEntry, 'id' | 'timestamp'>): void {
  const logEntry: QueryLogEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  session = { ...session, queryLog: [...session.queryLog, logEntry] };
  notifyUI();
}

export function incrementGuessCount(): void {
  session = { ...session, guessCount: session.guessCount + 1 };
  notifyUI();
}

export function reveal(reason: 'correct' | 'giveUp'): void {
  session = { ...session, phase: 'reveal', revealReason: reason };
  notifyAll();
}
