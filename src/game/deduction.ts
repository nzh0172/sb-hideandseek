/** Apply deduction query results to possible locations and map overlays */

import { getRouteIdsForStationGroup } from './displayNames';
import { haversineKm, isCardinalDirectionOf } from './geo';
import { isSameLineWithoutTransfer, isStationOnRoute } from './scheduleGraph';
import { getSession, setDeductionState } from './session';
import type { CardinalDirection, MapOverlay } from './types';

const api = window.SubwayBuilderAPI;

function stationMap(): Map<string, ReturnType<typeof api.gameState.getStations>[number]> {
  return new Map(api.gameState.getStations().map((s) => [s.id, s]));
}

function overlayId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

/** Replace overlays that share the same deductionKey instead of stacking. */
function mergeOverlays(existing: MapOverlay[], incoming: MapOverlay[]): MapOverlay[] {
  const replaceKeys = new Set(incoming.map((o) => o.deductionKey));
  const kept = existing.filter((o) => !replaceKeys.has(o.deductionKey));
  return [...kept, ...incoming];
}

function applyDeductionUpdate(
  possibleStationIds: string[],
  newOverlays: MapOverlay[],
): void {
  const session = getSession();
  setDeductionState({
    possibleStationIds,
    mapOverlays: mergeOverlays(session.mapOverlays, newOverlays),
  });
}

export function applyDistanceFromStation(
  refStationId: string,
  radiusKm: number,
  within: boolean,
): void {
  const session = getSession();
  const stations = stationMap();
  const ref = stations.get(refStationId);
  if (!ref) return;

  const filtered = session.possibleStationIds.filter((id) => {
    const station = stations.get(id);
    if (!station) return false;
    const dist = haversineKm(ref.coords, station.coords);
    return within ? dist <= radiusKm : dist > radiusKm;
  });

  applyDeductionUpdate(filtered, [
    {
      id: overlayId('dist-station'),
      deductionKey: `dist-station:${refStationId}:${radiusKm}:${within}`,
      kind: 'distance-circle',
      center: ref.coords,
      radiusKm,
      inclusive: within,
    },
  ]);
}

export function applyCardinalDirection(
  refStationId: string,
  direction: CardinalDirection,
  onSide: boolean,
): void {
  const session = getSession();
  const stations = stationMap();
  const ref = stations.get(refStationId);
  if (!ref) return;

  const filtered = session.possibleStationIds.filter((id) => {
    const station = stations.get(id);
    if (!station) return false;
    const matches = isCardinalDirectionOf(station.coords, ref.coords, direction);
    return onSide ? matches : !matches;
  });

  applyDeductionUpdate(filtered, [
    {
      id: overlayId('dir'),
      deductionKey: `dir:${refStationId}:${direction}:${onSide}`,
      kind: 'half-plane',
      center: ref.coords,
      direction,
      inclusive: onSide,
    },
  ]);
}

export function applyLineCheck(routeId: string, onLine: boolean): void {
  const session = getSession();
  const filtered = session.possibleStationIds.filter((id) => {
    const stationOnLine = isStationOnRoute(id, routeId);
    return onLine ? stationOnLine : !stationOnLine;
  });

  applyDeductionUpdate(filtered, [
    {
      id: overlayId('line'),
      deductionKey: `line:${routeId}:${onLine}`,
      kind: 'route-line',
      routeId,
      inclusive: onLine,
    },
  ]);
}

export function applySameLineAsStart(same: boolean): void {
  const session = getSession();
  if (!session.startStationId) return;

  const routeIds = getRouteIdsForStationGroup(session.startStationId);

  const filtered = session.possibleStationIds.filter((id) => {
    if (!session.startStationId) return false;
    const matches = isSameLineWithoutTransfer(session.startStationId, id);
    return same ? matches : !matches;
  });

  applyDeductionUpdate(filtered, [
    {
      id: overlayId('same-line'),
      deductionKey: `same-line:${same}`,
      kind: 'route-line',
      routeIds,
      inclusive: same,
    },
  ]);
}

export function applyTransferCount(transferCount: number): void {
  const session = getSession();
  const filtered = session.possibleStationIds.filter((id) => {
    const path = session.candidatePathsByStation[id];
    return path?.transferCount === transferCount;
  });

  applyDeductionUpdate(filtered, []);
}
