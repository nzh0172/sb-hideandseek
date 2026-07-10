/** Format validated path for display */

import {
  formatStationForPath,
  getRouteDisplayName,
} from './displayNames';
import { isSameLogicalLine } from './logicalLines';
import { areSameStationGroup } from './stationGroups';
import { formatGameTime } from './geo';
import type { PathLeg, ValidatedPath } from './types';

export interface RevealTimelineStop {
  stationId: string;
  time: number;
}

function getRouteLabel(routeId: string, fallbackBullet: string): string {
  const routes = window.SubwayBuilderAPI.gameState.getRoutes();
  const index = routes.findIndex((r) => r.id === routeId);
  if (index >= 0) return getRouteDisplayName(routes[index]!, index);
  if (fallbackBullet && !/^[0-9a-f-]{36}$/i.test(fallbackBullet)) {
    return fallbackBullet;
  }
  return 'Line';
}

/** Count real line changes — circle-loop splits and same-line hops are not transfers. */
export function countRouteTransfers(legs: PathLeg[]): number {
  let count = 0;
  for (let i = 1; i < legs.length; i++) {
    if (!isSameLogicalLine(legs[i]!.routeId, legs[i - 1]!.routeId)) {
      count++;
    }
  }
  return count;
}

/** Merge consecutive legs on the same route into one segment */
export function mergeLegsByRoute(legs: PathLeg[]): PathLeg[] {
  if (legs.length === 0) return [];

  const merged: PathLeg[] = [{ ...legs[0]! }];

  for (let i = 1; i < legs.length; i++) {
    const current = legs[i]!;
    const previous = merged[merged.length - 1]!;

    if (isSameLogicalLine(current.routeId, previous.routeId)) {
      merged[merged.length - 1] = {
        ...previous,
        toStationId: current.toStationId,
        toStationName: current.toStationName,
        arrivalTime: current.arrivalTime,
      };
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/** Start, transfer, and end stops for the reveal-phase vertical timeline. */
export function buildRevealTimelineStops(legs: PathLeg[]): RevealTimelineStop[] {
  const segments = mergeLegsByRoute(legs);
  if (segments.length === 0) return [];

  const stops: RevealTimelineStop[] = [];

  const pushStop = (stationId: string, time: number) => {
    const last = stops[stops.length - 1];
    if (last && areSameStationGroup(last.stationId, stationId)) {
      last.time = time;
      return;
    }
    stops.push({ stationId, time });
  };

  pushStop(segments[0]!.fromStationId, segments[0]!.departureTime);

  for (let i = 1; i < segments.length; i++) {
    pushStop(segments[i]!.fromStationId, segments[i]!.departureTime);
  }

  const last = segments[segments.length - 1]!;
  pushStop(last.toStationId, last.arrivalTime);

  return stops;
}

export function formatValidatedPathText(path: ValidatedPath): string {
  const segments = mergeLegsByRoute(path.legs);
  const transferCount = countRouteTransfers(path.legs);
  const lines: string[] = [];

  segments.forEach((leg, index) => {
    if (index > 0) {
      lines.push('↳ Transfer');
    }

    const line = getRouteLabel(leg.routeId, leg.routeBullet);
    const from = formatStationForPath(leg.fromStationId);
    const to = formatStationForPath(leg.toStationId);

    lines.push(`${line}: ${from} → ${to}`);
    lines.push(
      `  Depart ${formatGameTime(leg.departureTime)} · Arrive ${formatGameTime(leg.arrivalTime)}`,
    );
  });

  lines.push('');
  lines.push(`Transfers: ${transferCount}`);

  return lines.join('\n');
}
