/** Hide and Seek game types */

export type GamePhase = 'setup' | 'hiding' | 'seeking' | 'reveal';

export interface PathLeg {
  routeId: string;
  routeName: string;
  routeBullet: string;
  fromStationId: string;
  fromStationName: string;
  toStationId: string;
  toStationName: string;
  departureTime: number;
  arrivalTime: number;
}

export interface ValidatedPath {
  legs: PathLeg[];
  totalTimeSeconds: number;
  transferCount: number;
}

export interface HideCandidate {
  stationId: string;
  stationName: string;
  path: ValidatedPath;
}

export interface QueryLogEntry {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
}

export interface GameConfig {
  hideRadiusKm: number;
  hideDurationHours: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  hideRadiusKm: 10,
  hideDurationHours: 3,
};

export interface HideSeekSession {
  phase: GamePhase;
  config: GameConfig;
  startStationId: string | null;
  hideStationId: string | null;
  validatedPath: ValidatedPath | null;
  hideStartElapsed: number;
  hideEndElapsed: number;
  guessCount: number;
  queryLog: QueryLogEntry[];
  revealReason: 'correct' | 'giveUp' | null;
}

export function createInitialSession(): HideSeekSession {
  return {
    phase: 'setup',
    config: { ...DEFAULT_CONFIG },
    startStationId: null,
    hideStationId: null,
    validatedPath: null,
    hideStartElapsed: 0,
    hideEndElapsed: 0,
    guessCount: 0,
    queryLog: [],
    revealReason: null,
  };
}
