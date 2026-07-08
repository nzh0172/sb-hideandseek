/** In-memory session state with pub/sub for React UI */

import {
  createInitialSession,
  type GamePhase,
  type HideSeekSession,
  type MapOverlay,
  type QueryLogEntry,
  type ValidatedPath,
} from './types';

type Listener = () => void;

let session = createInitialSession();
const listeners = new Set<Listener>();

export function getSession(): HideSeekSession {
  return session;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function resetSession(): void {
  session = createInitialSession();
  notify();
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
  notify();
}

export function setStartStationId(stationId: string | null): void {
  session = { ...session, startStationId: stationId };
  notify();
}

export function transitionTo(phase: GamePhase): void {
  session = { ...session, phase };
  notify();
}

export function setRoundData(data: {
  hideStationId: string;
  validatedPath: HideSeekSession['validatedPath'];
  hideStartElapsed: number;
  hideEndElapsed: number;
  possibleStationIds: string[];
  candidatePathsByStation: Record<string, ValidatedPath>;
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
    phase: 'hiding',
  };
  notify();
}

export function addQueryLog(entry: Omit<QueryLogEntry, 'id' | 'timestamp'>): void {
  const logEntry: QueryLogEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  session = { ...session, queryLog: [...session.queryLog, logEntry] };
  notify();
}

export function incrementGuessCount(): void {
  session = { ...session, guessCount: session.guessCount + 1 };
  notify();
}

export function reveal(reason: 'correct' | 'giveUp'): void {
  session = { ...session, phase: 'reveal', revealReason: reason };
  notify();
}
