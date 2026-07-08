/** Setup phase: pick starting station and start round */

import { useEffect, useState } from 'react';
import { canStartRound, startRound } from '../game/controller';
import {
  clampDurationHours,
  clampRadiusKm,
  DURATION_MAX_HOURS,
  DURATION_MIN_HOURS,
  DURATION_STEP_HOURS,
  formatHideHours,
  formatRadiusKm,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  RADIUS_STEP_KM,
} from '../game/configScale';
import {
  compareStationLabels,
  getSortedStations,
  invalidateStationLabels,
} from '../game/displayNames';
import { centerMapOnStation, isSetupPlayAreaVisible, setSetupPlayAreaVisible } from '../game/mapOverlay';
import { getSession, setGameConfig, setStartStationId } from '../game/session';
import { StationPickerPage } from './StationPickerPage';
import { ForceText } from './ForceText';
import { useSession } from './useSession';

const api = window.SubwayBuilderAPI;
const { Button, Label, Slider, Switch } = api.utils.components as Record<
  string,
  React.ComponentType<any>
>;

export function SetupPhase() {
  const session = useSession();
  const [stations, setStations] = useState(getSortedStations);
  const [canStart, setCanStart] = useState(canStartRound);
  const [showPlayArea, setShowPlayArea] = useState(isSetupPlayAreaVisible);

  const { hideRadiusKm, hideDurationHours } = session.config;

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
        Pick where you start — the bot hides somewhere reachable by train within your
        play area and hide time.
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="play-area-radius">Play area radius</Label>
          <ForceText text={formatRadiusKm(hideRadiusKm)} className="text-sm tabular-nums" />
        </div>
        <Slider
          id="play-area-radius"
          min={RADIUS_MIN_KM}
          max={RADIUS_MAX_KM}
          step={RADIUS_STEP_KM}
          value={[hideRadiusKm]}
          onValueChange={(values: number[]) => {
            setGameConfig({
              ...session.config,
              hideRadiusKm: clampRadiusKm(values[0] ?? hideRadiusKm),
            });
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="hide-duration">Hide time</Label>
          <ForceText text={formatHideHours(hideDurationHours)} className="text-sm tabular-nums" />
        </div>
        <Slider
          id="hide-duration"
          min={DURATION_MIN_HOURS}
          max={DURATION_MAX_HOURS}
          step={DURATION_STEP_HOURS}
          value={[hideDurationHours]}
          onValueChange={(values: number[]) => {
            setGameConfig({
              ...session.config,
              hideDurationHours: clampDurationHours(values[0] ?? hideDurationHours),
            });
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="show-play-area">Show play area on map</Label>
        <Switch
          id="show-play-area"
          checked={showPlayArea}
          onCheckedChange={(checked: boolean) => {
            setShowPlayArea(checked);
            setSetupPlayAreaVisible(checked);
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <StationPickerPage
          value={selectedId}
          stations={stations}
          onChange={(id) => {
            setStartStationId(id || null);
            if (id) centerMapOnStation(id);
          }}
          title="Starting station"
        />
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
