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

export type MapOverlayKind = 'distance-circle' | 'route-line';

export interface MapOverlay {
  id: string;
  /** Unique key per question — replaces prior overlay for the same question. */
  deductionKey: string;
  kind: MapOverlayKind;
  center?: [number, number];
  radiusKm?: number;
  routeId?: string;
  routeIds?: string[];
  /** True when answer was Yes (inside/on); false when No (outside/off). */
  inclusive: boolean;
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
    hideStationId: null,
    validatedPath: null,
    hideStartElapsed: 0,
    hideEndElapsed: 0,
    guessCount: 0,
    queryLog: [],
    revealReason: null,
    possibleStationIds: [],
    candidatePathsByStation: {},
    mapOverlays: [],
  };
}
