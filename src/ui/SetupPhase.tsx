/** Setup phase: pick mode, starting station, and start round */

import { useEffect, useState } from 'react';
import { canStartRound, startRound } from '../game/controller';
import { getPlayableRoutes } from '../game/scheduleGraph';
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
  getGroupRepresentative,
  getSortedStations,
  invalidateStationLabels,
} from '../game/displayNames';
import { invalidateValidRegionCache } from '../game/validRegion';
import {
  centerMapOnStation,
  isSetupPlayAreaVisible,
  isSetupStationLabelVisible,
  setSetupPlayAreaVisible,
  setSetupStationLabelVisible,
  refreshDeductionOverlay,
  viewPlayAreaOnMap,
} from '../game/mapOverlay';
import { getSession, setGameConfig, setStartStationId } from '../game/session';
import type { GameMode } from '../game/types';
import { StationPickerPage } from './StationPickerPage';
import { ForceText } from './ForceText';
import { StartingRoundView } from './StartingRoundView';
import { useSession } from './useSession';

const api = window.SubwayBuilderAPI;
const { Button, Label, Slider, Switch } = api.utils.components as Record<
  string,
  React.ComponentType<any>
>;

const MODE_OPTIONS: { id: GameMode; label: string; description: string }[] = [
  {
    id: 'instant',
    label: 'Quick seek',
    description:
      'Synthetic timetable — no hide timer. Start deducing immediately after the round begins.',
  },
  {
    id: 'live',
    label: 'Live',
    description:
      'The hider travels on real running trains. Simulation runs during hide time, then you seek.',
  },
];

export function SetupPhase() {
  const session = useSession();
  const [stations, setStations] = useState(getSortedStations);
  const [canStart, setCanStart] = useState(() => canStartRound(session.config.mode));
  const [showPlayArea, setShowPlayArea] = useState(isSetupPlayAreaVisible);
  const [showStationLabel, setShowStationLabel] = useState(isSetupStationLabelVisible);
  const [isStarting, setIsStarting] = useState(false);

  const { mode, hideRadiusKm, hideDurationHours } = session.config;
  const isLive = mode === 'live';

  useEffect(() => {
    const refreshNetwork = () => {
      invalidateStationLabels();
      invalidateValidRegionCache();
      const sorted = [...api.gameState.getStations()].sort(compareStationLabels);
      setStations(sorted);
      setCanStart(canStartRound(getSession().config.mode));
      if (!getSession().startStationId && sorted[0]) {
        setStartStationId(sorted[0].id);
      }
      refreshDeductionOverlay();
    };
    const refreshTrains = () => {
      setCanStart(canStartRound(getSession().config.mode));
    };

    refreshNetwork();
    api.hooks.onStationBuilt(refreshNetwork);
    api.hooks.onStationDeleted(refreshNetwork);
    api.hooks.onRouteCreated(refreshNetwork);
    api.hooks.onRouteDeleted(refreshNetwork);
    api.hooks.onTrainSpawned(refreshTrains);
    api.hooks.onTrainDeleted(refreshTrains);
  }, []);

  useEffect(() => {
    setCanStart(canStartRound(mode));
  }, [mode]);

  const selectedId = session.startStationId ?? stations[0]?.id ?? '';
  const trainCount = api.gameState.getTrains().length;

  const handleStartRound = () => {
    if (!selectedId || !canStart || isStarting) return;

    setIsStarting(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const ok = startRound(selectedId);
        if (!ok) setIsStarting(false);
      }, 0);
    });
  };

  if (isStarting) {
    return <StartingRoundView mode={mode} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Pick a mode and starting station — the bot hides somewhere reachable by train
        within your play area{isLive ? ' and hide time' : ''}.
      </p>

      <div className="flex flex-col gap-2">
        <Label>Game mode</Label>
        <div className="flex gap-2">
          {MODE_OPTIONS.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={mode === option.id ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => {
                setGameConfig({ ...session.config, mode: option.id });
              }}
            >
              <ForceText text={option.label} />
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {MODE_OPTIONS.find((o) => o.id === mode)?.description}
        </p>
      </div>

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

      {isLive && (
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
      )}

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

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="show-station-label">Show selected station on map</Label>
        <Switch
          id="show-station-label"
          checked={showStationLabel}
          disabled={!selectedId}
          onCheckedChange={(checked: boolean) => {
            setShowStationLabel(checked);
            setSetupStationLabelVisible(checked);
          }}
        />
      </div>



      <div className="flex flex-col gap-1">
        <StationPickerPage
          value={selectedId}
          stations={stations}
          onChange={(id) => {
            const rep = id ? getGroupRepresentative(id) : null;
            setStartStationId(rep);
            if (rep) centerMapOnStation(rep);
          }}
          title="Starting station"
        />
      </div>

      {!canStart && (
        <p className="text-xs text-amber-600">
          {getPlayableRoutesMessage(mode, trainCount)}
        </p>
      )}

      <div className="flex gap-2" style={{ marginTop: '4px' }}>
        <Button
          disabled={!canStart || !selectedId || stations.length === 0 || isStarting}
          onClick={handleStartRound}
        >
          Start Round
        </Button>

        <Button
        type="button"
        variant="secondary"
        disabled={!selectedId}
        onClick={() => {
          setShowPlayArea(true);
          setSetupPlayAreaVisible(true);
          viewPlayAreaOnMap();
        }}
      >
        <ForceText text="View play area" />
      </Button>
      </div>
    </div>
  );
}

function getPlayableRoutesMessage(mode: GameMode, trainCount: number): string {
  if (getPlayableRoutes().length === 0) {
    return 'No playable routes yet. Create a route with at least 2 stations.';
  }
  if (mode === 'live' && trainCount === 0) {
    return 'Live mode needs trains on your routes. Buy and assign trains first.';
  }
  return 'Cannot start round yet.';
}
