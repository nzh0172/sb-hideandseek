/** Seeking phase: deduction tools and guess */

import { useEffect, useState } from 'react';
import { getGroupRepresentative, getSortedStations } from '../game/displayNames';
import type { CardinalDirection } from '../game/types';
import {
  giveUp,
  guessStation,
  queryDirectionFromStation,
  queryMapNearHide,
  queryOnLine,
  querySameLineAsStart,
  queryTransferCount,
  queryWithinKmFromStation,
} from '../game/controller';
import { getAutoZoomValidRegionEnabled } from '../game/seekingPreferences';
import {
  clearSeekingPickerHighlight,
  setAutoZoomValidRegionEnabled,
  viewPlayAreaOnMap,
} from '../game/mapOverlay';
import { ForceText } from './ForceText';
import { LabeledButton } from './LabeledButton';
import { LinePickerPage } from './LinePickerPage';
import { getPhaseColors } from './phaseTheme';
import { QuestionLog } from './QuestionLog';
import { SeekingPathHeader } from './SeekingPathHeader';
import { StationLabel } from './StationLabel';
import { StationPickerPage } from './StationPickerPage';
import { useSession } from './useSession';

const { Button } = window.SubwayBuilderAPI.utils.components as Record<
  string,
  React.ComponentType<any>
>;

const DISTANCE_OPTIONS = [1, 2, 5, 10, 20];
const DIRECTION_OPTIONS: CardinalDirection[] = ['north', 'south', 'east', 'west'];

type PickerTarget = 'ref' | 'guess' | 'line' | null;

function StatusPill({
  text,
  backgroundColor,
}: {
  text: string;
  backgroundColor: string;
}) {
  return (
    <div
      style={{
        backgroundColor,
        color: '#ffffff',
        borderRadius: 999,
        padding: '5px 14px',
        fontSize: '13px',
        fontWeight: 600,
      }}
    >
      <ForceText text={text} style={{ color: '#ffffff' }} />
    </div>
  );
}

function SectionLabel({ text, color }: { text: string; color: string }) {
  return (
    <ForceText
      text={text}
      as="div"
      style={{ fontSize: '12px', color, fontWeight: 500 }}
    />
  );
}

export function SeekingPhase() {
  const session = useSession();
  const colors = getPhaseColors();
  const [stations] = useState(getSortedStations);
  const defaultRefId =
    session.startStationId
      ? getGroupRepresentative(session.startStationId)
      : (stations[0]?.id ?? '');
  const [refStationId, setRefStationId] = useState(defaultRefId);
  const [guessId, setGuessId] = useState('');
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [mapPeekBusy, setMapPeekBusy] = useState(false);

  useEffect(() => {
    setAutoZoomValidRegionEnabled(getAutoZoomValidRegionEnabled());
  }, []);

  useEffect(() => {
    if (!mapPeekBusy) return;
    if (document.getElementById('hide-seek-spin-style')) return;
    const style = document.createElement('style');
    style.id = 'hide-seek-spin-style';
    style.textContent =
      '@keyframes hide-seek-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }, [mapPeekBusy]);

  const startStationId = session.startStationId
    ? getGroupRepresentative(session.startStationId)
    : null;

  const roundLabel =
    session.currentRound > 0
      ? `Round ${session.currentRound} of ${session.config.totalRounds}`
      : null;

  if (pickerTarget === 'ref') {
    return (
      <div className="flex flex-col gap-3">
        <StationPickerPage
          value={refStationId}
          stations={stations}
          onChange={setRefStationId}
          title="Reference station"
          pinnedStationId={startStationId ?? undefined}
          pinnedLabel="Starting station"
          highlightOnMap
          onBack={() => {
            clearSeekingPickerHighlight();
            setPickerTarget(null);
          }}
        />
        <QuestionLog entries={session.queryLog} />
      </div>
    );
  }

  if (pickerTarget === 'guess') {
    return (
      <StationPickerPage
        value={guessId}
        stations={stations}
        onChange={setGuessId}
        title="Guess station"
        highlightOnMap
        onBack={() => {
          clearSeekingPickerHighlight();
          setPickerTarget(null);
        }}
        belowList={<QuestionLog entries={session.queryLog} />}
        footer={
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!guessId}
              onClick={() => {
                if (!guessId) return;
                guessStation(guessId);
              }}
            >
              <ForceText text="Submit Guess" />
            </Button>
            <Button variant="destructive" onClick={giveUp}>
              <ForceText text="Give Up" />
            </Button>
            {(session.playAreaStationId || session.startStationId) && (
              <Button type="button" variant="secondary" onClick={() => viewPlayAreaOnMap()}>
                <ForceText text="View play area" />
              </Button>
            )}
          </div>
        }
      />
    );
  }

  if (pickerTarget === 'line') {
    return (
      <div className="flex flex-col gap-3">
        <LinePickerPage
          onPick={(routeId) => {
            queryOnLine(routeId);
            clearSeekingPickerHighlight();
            setPickerTarget(null);
          }}
          onBack={() => {
            clearSeekingPickerHighlight();
            setPickerTarget(null);
          }}
        />
        <QuestionLog entries={session.queryLog} />
      </div>
    );
  }

  return (
    <div
      style={{
        color: colors.foreground,
        borderRadius: 12,
        padding: '4px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        width: '100%',
        position: 'relative',
      }}
    >
      {mapPeekBusy && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            background: 'rgba(0,0,0,1)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            pointerEvents: 'all',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              border: '3px solid rgba(255,255,255,0.25)',
              borderTopColor: '#ffffff',
              borderRadius: '50%',
              animation: 'hide-seek-spin 0.8s linear infinite',
            }}
          />
          <ForceText
            text="Capturing map…"
            style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600 }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {roundLabel && (
          <StatusPill text={roundLabel} backgroundColor="#2563eb" />
        )}
        <StatusPill
          text={`Wrong guess: ${session.guessCount}`}
          backgroundColor="#ef4444"
        />
      </div>

      <SeekingPathHeader
        startStationId={startStationId}
        startTimeSeconds={session.hideStartElapsed}
        guessStationId={guessId || null}
        onGuessClick={() => setPickerTarget('guess')}
      />

      <div className="flex flex-col gap-2">
        <SectionLabel text="Reference station" color={colors.muted} />
        <div className="flex items-center gap-2">
          {refStationId ? (
            <StationLabel
              stationId={refStationId}
              style={{ flex: 1, minWidth: 0, fontSize: '0.875rem' }}
              nameStyle={{ fontSize: '0.875rem', color: colors.foreground }}
              bulletSize={16}
            />
          ) : (
            <ForceText
              text="Pick a station"
              className="text-sm"
              style={{ flex: 1, minWidth: 0, color: colors.muted }}
            />
          )}
          {startStationId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRefStationId(startStationId)}
              style={{ flexShrink: 0 }}
            >
              <ForceText text="Starting station" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerTarget('ref')}
            style={{ flexShrink: 0 }}
          >
            <ForceText text="Change" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel text="Distance from reference" color={colors.muted} />
        <div className="flex flex-wrap gap-1">
          {DISTANCE_OPTIONS.map((km) => (
            <LabeledButton
              key={`dist-${km}`}
              label={`≤ ${km} km`}
              onClick={() => queryWithinKmFromStation(refStationId, km)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel text="Direction from reference" color={colors.muted} />
        <div className="flex flex-wrap gap-1">
          {DIRECTION_OPTIONS.map((direction) => (
            <LabeledButton
              key={`dir-${direction}`}
              label={direction.charAt(0).toUpperCase() + direction.slice(1)}
              onClick={() => queryDirectionFromStation(refStationId, direction)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel text="Line check" color={colors.muted} />
        <Button variant="secondary" onClick={() => setPickerTarget('line')} style={{ width: '100%' }}>
          <ForceText text="Select line" />
        </Button>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="secondary"
            onClick={queryTransferCount}
            style={{ flex: '1 1 0' }}
          >
            <ForceText text="Transfer count" />
          </Button>
          <Button
            variant="secondary"
            onClick={querySameLineAsStart}
            style={{ flex: '1 1 0' }}
          >
            <ForceText text="Same line as start?" />
          </Button>
        </div>
        <Button
          variant="secondary"
          disabled={mapPeekBusy}
          onClick={() => {
            if (mapPeekBusy) return;
            setMapPeekBusy(true);
            void queryMapNearHide().finally(() => setMapPeekBusy(false));
          }}
          style={{ width: '100%' }}
        >
          <ForceText text={mapPeekBusy ? 'Capturing map…' : 'Photo of your station surroundings'} />
        </Button>
      </div>

      <QuestionLog entries={session.queryLog} />
    </div>
  );
}
