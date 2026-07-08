/** Setup phase: pick starting station and start round */

import { useEffect, useState } from 'react';
import { canStartRound, startRound } from '../game/controller';
import {
  compareStationLabels,
  getSortedStations,
  invalidateStationLabels,
} from '../game/displayNames';
import { getSession, setStartStationId } from '../game/session';
import { DEFAULT_CONFIG } from '../game/types';
import { StationSelect } from './StationSelect';
import { useSession } from './useSession';

const api = window.SubwayBuilderAPI;
const { Button, Label } = api.utils.components as Record<string, React.ComponentType<any>>;

export function SetupPhase() {
  const session = useSession();
  const [stations, setStations] = useState(getSortedStations);
  const [canStart, setCanStart] = useState(canStartRound);

  useEffect(() => {
    const refresh = () => {
      invalidateStationLabels();
      const sorted = [...api.gameState.getStations()].sort(compareStationLabels);
      setStations(sorted);
      setCanStart(canStartRound());
      if (!getSession().startStationId && sorted[0]) {
        setStartStationId(sorted[0].id);
      }
    };
    refresh();
    api.hooks.onStationBuilt(refresh);
    api.hooks.onStationDeleted(refresh);
    api.hooks.onRouteCreated(refresh);
    api.hooks.onRouteDeleted(refresh);
  }, []);

  const selectedId = session.startStationId ?? stations[0]?.id ?? '';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        You are the seeker. Pick where you start — the bot will hide somewhere
        reachable by train within {DEFAULT_CONFIG.hideRadiusKm} km and{' '}
        {DEFAULT_CONFIG.hideDurationHours} in-game hours.
      </p>

      <div className="flex flex-col gap-1">
        <Label htmlFor="start-station">Starting station</Label>
        {stations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stations built</p>
        ) : (
          <StationSelect
            id="start-station"
            value={selectedId}
            stations={stations}
            onChange={(id) => setStartStationId(id || null)}
          />
        )}
      </div>

      {!canStart && (
        <p className="text-xs text-amber-600">
          No playable routes yet. Create a route with at least 2 stations.
        </p>
      )}

      <div style={{ marginTop: '4px' }}>
        <Button
          disabled={!canStart || !selectedId || stations.length === 0}
          onClick={() => startRound(selectedId)}
        >
          Start Round
        </Button>
      </div>
    </div>
  );
}
