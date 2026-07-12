/** Hide and Seek game types */

export type GamePhase = 'setup' | 'hiding' | 'seeking' | 'reveal';

/** Quick seek: synthetic timetable, no hide timer. Live: real train departures with hide timer. */
export type GameMode = 'instant' | 'live';

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
  /** Optional map snapshot (e.g. peek near hide). */
  imageDataUrl?: string;
}

export type MapOverlayKind = 'distance-circle' | 'route-line' | 'half-plane';

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

export interface MapOverlay {
  id: string;
  /** Unique key per question — replaces prior overlay for the same question. */
  deductionKey: string;
  kind: MapOverlayKind;
  center?: [number, number];
  radiusKm?: number;
  routeId?: string;
  routeIds?: string[];
  direction?: CardinalDirection;
  /** True when answer was Yes (inside/on); false when No (outside/off). */
  inclusive: boolean;
}

export interface GameConfig {
  mode: GameMode;
  hideRadiusKm: number;
  hideDurationHours: number;
  /** How many rounds to play with the same play-area setup. */
  totalRounds: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'instant',
  hideRadiusKm: 10,
  hideDurationHours: 3,
  totalRounds: 3,
};

export interface HideSeekSession {
  phase: GamePhase;
  config: GameConfig;
  startStationId: string | null;
  /**
   * Fixed play-area center for the whole series (first round's start).
   * Unchanged on later rounds even when startStationId moves to the previous hide.
   */
  playAreaStationId: string | null;
  hideStationId: string | null;
  validatedPath: ValidatedPath | null;
  hideStartElapsed: number;
  hideEndElapsed: number;
  guessCount: number;
  queryLog: QueryLogEntry[];
  revealReason: 'correct' | 'giveUp' | null;
  /** 1-based round within the current series; 0 in setup. */
  currentRound: number;
  /** Schedule-valid hide candidates at round start (updated by deduction queries). */
  possibleStationIds: string[];
  candidatePathsByStation: Record<string, ValidatedPath>;
  mapOverlays: MapOverlay[];
}

export function createInitialSession(): HideSeekSession {
  return {
    phase: 'setup',
    config: { ...DEFAULT_CONFIG },
    startStationId: null,
    playAreaStationId: null,
    hideStationId: null,
    validatedPath: null,
    hideStartElapsed: 0,
    hideEndElapsed: 0,
    guessCount: 0,
    queryLog: [],
    revealReason: null,
    currentRound: 0,
    possibleStationIds: [],
    candidatePathsByStation: {},
    mapOverlays: [],
  };
}
