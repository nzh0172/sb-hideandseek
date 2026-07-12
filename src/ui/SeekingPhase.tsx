/** Seeking phase: deduction tools and guess */

import { useEffect, useState } from 'react';
import { getGroupRepresentative, getSortedStations } from '../game/displayNames';
import type { CardinalDirection } from '../game/types';
import {
  giveUp,
  guessStation,
  queryDirectionFromStation,
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

const SEEK_BG = '#0a0a0a';
const SEEK_MUTED = 'rgba(255,255,255,0.65)';
const WHITE_BTN = {
  backgroundColor: '#ffffff',
  color: '#111827',
  borderColor: '#e5e7eb',
  flexShrink: 0,
} as const;
const SECONDARY_BTN = {
  backgroundColor: '#3f3f46',
  color: '#ffffff',
  borderColor: '#52525b',
} as const;

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
      <ForceText text={text} />
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <ForceText
      text={text}
      as="div"
      style={{ fontSize: '12px', color: SEEK_MUTED, fontWeight: 500 }}
    />
  );
}

export function SeekingPhase() {
  const session = useSession();
  const [stations] = useState(getSortedStations);
  const defaultRefId =
    session.startStationId
      ? getGroupRepresentative(session.startStationId)
      : (stations[0]?.id ?? '');
  const [refStationId, setRefStationId] = useState(defaultRefId);
  const [guessId, setGuessId] = useState('');
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  useEffect(() => {
    setAutoZoomValidRegionEnabled(getAutoZoomValidRegionEnabled());
  }, []);

  const startStationId = session.startStationId
    ? getGroupRepresentative(session.startStationId)
    : null;

  const roundLabel =
    session.currentRound > 0
      ? `Round ${session.currentRound} of ${session.config.totalRounds}`
      : null;

  if (pickerTarget === 'ref') {
    return (
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
    );
  }

  return (
    <div
      style={{
        backgroundColor: SEEK_BG,
        color: '#ffffff',
        borderRadius: 12,
        padding: '18px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        width: '100%',
      }}
    >
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
        <SectionLabel text="Reference station" />
        <div className="flex items-center gap-2">
          {refStationId ? (
            <StationLabel
              stationId={refStationId}
              style={{ flex: 1, minWidth: 0, fontSize: '0.875rem' }}
              nameStyle={{ fontSize: '0.875rem', color: '#ffffff' }}
              bulletSize={16}
            />
          ) : (
            <ForceText
              text="Pick a station"
              className="text-sm"
              style={{ flex: 1, minWidth: 0, color: SEEK_MUTED }}
            />
          )}
          {startStationId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRefStationId(startStationId)}
              style={WHITE_BTN}
            >
              <ForceText text="Starting station" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerTarget('ref')}
            style={WHITE_BTN}
          >
            <ForceText text="Change" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel text="Distance from reference" />
        <div className="flex flex-wrap gap-1">
          {DISTANCE_OPTIONS.map((km) => (
            <LabeledButton
              key={`dist-${km}`}
              label={`≤ ${km} km`}
              onClick={() => queryWithinKmFromStation(refStationId, km)}
              style={SECONDARY_BTN}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel text="Direction from reference" />
        <div className="flex flex-wrap gap-1">
          {DIRECTION_OPTIONS.map((direction) => (
            <LabeledButton
              key={`dir-${direction}`}
              label={direction.charAt(0).toUpperCase() + direction.slice(1)}
              onClick={() => queryDirectionFromStation(refStationId, direction)}
              style={SECONDARY_BTN}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel text="Line check" />
        <Button
          variant="secondary"
          onClick={() => setPickerTarget('line')}
          style={{ ...SECONDARY_BTN, width: '100%' }}
        >
          <ForceText text="Select line" />
        </Button>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="secondary"
            onClick={queryTransferCount}
            style={{ ...SECONDARY_BTN, flex: '1 1 0' }}
          >
            <ForceText text="Transfer count" />
          </Button>
          <Button
            variant="secondary"
            onClick={querySameLineAsStart}
            style={{ ...SECONDARY_BTN, flex: '1 1 0' }}
          >
            <ForceText text="Same line as start?" />
          </Button>
        </div>
      </div>

      <QuestionLog
        entries={session.queryLog}
      />

    </div>
  );
}
