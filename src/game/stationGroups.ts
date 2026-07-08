/** Interchange station groups via the game station group API */

const api = window.SubwayBuilderAPI;

let representativeByStationId: Map<string, string> | null = null;
let membersByRepresentative: Map<string, string[]> | null = null;

export function invalidateStationGroups(): void {
  representativeByStationId = null;
  membersByRepresentative = null;
}

function ensureGroupCaches(): void {
  if (representativeByStationId && membersByRepresentative) return;

  const repMap = new Map<string, string>();
  const membersMap = new Map<string, Set<string>>();

  for (const station of api.gameState.getStations()) {
    repMap.set(station.id, station.id);
    membersMap.set(station.id, new Set([station.id]));
  }

  const mergeInto = (representative: string, stationId: string) => {
    const currentRep = repMap.get(stationId) ?? stationId;
    if (currentRep === representative) return;

    const targetMembers = membersMap.get(representative) ?? new Set([representative]);
    const sourceMembers = membersMap.get(currentRep) ?? new Set([stationId]);

    for (const id of sourceMembers) {
      repMap.set(id, representative);
      targetMembers.add(id);
    }

    membersMap.set(representative, targetMembers);
    if (currentRep !== representative) {
      membersMap.delete(currentRep);
    }
  };

  const absorbGroup = (stationIds: string[]) => {
    const sorted = [...stationIds].sort();
    if (sorted.length === 0) return;
    const representative = sorted[0]!;
    for (const id of sorted) {
      mergeInto(representative, id);
    }
  };

  for (const group of api.gameState.getStationGroups()) {
    absorbGroup(group.stationIds);
    for (const id of group.stationIds) {
      absorbGroup([id, ...api.gameState.getSiblingStationIds(id)]);
    }
  }

  representativeByStationId = repMap;
  membersByRepresentative = new Map(
    [...membersMap.entries()].map(([rep, ids]) => [rep, [...ids].sort()]),
  );
}

export function getGroupRepresentative(stationId: string): string {
  ensureGroupCaches();
  return representativeByStationId!.get(stationId) ?? stationId;
}

export function getStationsInGroup(stationId: string): string[] {
  ensureGroupCaches();
  const rep = getGroupRepresentative(stationId);
  return membersByRepresentative!.get(rep) ?? [stationId];
}

export function areSameStationGroup(a: string, b: string): boolean {
  return getGroupRepresentative(a) === getGroupRepresentative(b);
}

export function collapseStationIdsByGroup(stationIds: string[]): string[] {
  const seen = new Set<string>();
  const collapsed: string[] = [];

  for (const id of stationIds) {
    const rep = getGroupRepresentative(id);
    if (seen.has(rep)) continue;
    seen.add(rep);
    collapsed.push(rep);
  }

  return collapsed;
}
