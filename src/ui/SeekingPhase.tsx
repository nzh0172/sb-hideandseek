/** Seeking phase: deduction tools and guess */

import { useState } from 'react';
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
import { ForceText } from './ForceText';
import { LabeledButton } from './LabeledButton';
import { LinePickerPage } from './LinePickerPage';
import { QuestionLog } from './QuestionLog';
import { RoundStartInfo } from './RoundStartInfo';
import { StationLabel } from './StationLabel';
import { StationPickerPage } from './StationPickerPage';
import {
  clearSeekingPickerHighlight,
  viewPlayAreaOnMap,
} from '../game/mapOverlay';
import { useSession } from './useSession';

const { Button, Label } = window.SubwayBuilderAPI.utils.components as Record<
  string,
  React.ComponentType<any>
>;

const DISTANCE_OPTIONS = [1, 2, 5, 10, 20];
const DIRECTION_OPTIONS: CardinalDirection[] = ['north', 'south', 'east', 'west'];

type PickerTarget = 'ref' | 'guess' | 'line' | null;

export function SeekingPhase() {
  const session = useSession();
  const [stations] = useState(getSortedStations);
  const defaultRefId =
    session.startStationId
      ? getGroupRepresentative(session.startStationId)
      : (stations[0]?.id ?? '');
  const [refStationId, setRefStationId] = useState(defaultRefId);
  const [guessId, setGuessId] = useState(stations[0]?.id ?? '');
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [lineHighlightEnabled, setLineHighlightEnabled] = useState(false);

  const startStationId = session.startStationId
    ? getGroupRepresentative(session.startStationId)
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
      />
    );
  }

  if (pickerTarget === 'line') {
    return (
      <LinePickerPage
        showLineHighlight={lineHighlightEnabled}
        onShowLineHighlightChange={setLineHighlightEnabled}
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
    <div className="flex flex-col gap-3">
      <RoundStartInfo session={session} />

      <p className="text-sm" style={{ opacity: 0.75 }}>
        Ask questions to narrow down the hider. Wrong guesses: {session.guessCount}
      </p>
      <p className="text-xs" style={{ opacity: 0.65 }}>
        Map dims ruled-out areas. The purple circle is the play area; questions
        narrow the bright region inside it.
      </p>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">Reference station</span>
        <div className="flex items-center gap-2">
          {refStationId ? (
            <StationLabel
              stationId={refStationId}
              style={{ flex: 1, minWidth: 0, fontSize: '0.875rem' }}
              nameStyle={{ fontSize: '0.875rem' }}
              bulletSize={16}
            />
          ) : (
            <ForceText
              text="Pick a station"
              className="text-sm"
              style={{ flex: 1, minWidth: 0 }}
            />
          )}
          {startStationId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRefStationId(startStationId)}
              style={{
                backgroundColor: '#ffffff',
                color: '#111827',
                borderColor: 'rgba(128,128,128,0.45)',
                flexShrink: 0,
              }}
            >
              <ForceText text="Starting station" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerTarget('ref')}
            style={{
              backgroundColor: '#ffffff',
              color: '#111827',
              borderColor: 'rgba(128,128,128,0.45)',
              flexShrink: 0,
            }}
          >
            <ForceText text="Change" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">Distance from reference</span>
        <div className="flex flex-wrap gap-1">
          {DISTANCE_OPTIONS.map((km, index) => (
            <LabeledButton
              key={index}
              label={`≤ ${km} km`}
              onClick={() => queryWithinKmFromStation(refStationId, km)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">Direction from reference</span>
        <div className="flex flex-wrap gap-1">
          {DIRECTION_OPTIONS.map((direction, index) => (
            <LabeledButton
              key={index}
              label={direction.charAt(0).toUpperCase() + direction.slice(1)}
              onClick={() => queryDirectionFromStation(refStationId, direction)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">Line check</span>
        <Button variant="secondary" onClick={() => setPickerTarget('line')}>
          <ForceText text="Select line" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        <Button variant="secondary" onClick={queryTransferCount}>
          Transfer count
        </Button>
        <Button variant="secondary" onClick={querySameLineAsStart}>
          Same line as start?
        </Button>
      </div>

      <QuestionLog entries={session.queryLog} />

      <div className="flex flex-col gap-1 border-t pt-3">
        <Label htmlFor="guess-station">Guess station</Label>
        <div className="flex items-center gap-2">
          {guessId ? (
            <StationLabel
              stationId={guessId}
              style={{ flex: 1, minWidth: 0, fontSize: '0.875rem' }}
              nameStyle={{ fontSize: '0.875rem' }}
              bulletSize={16}
            />
          ) : (
            <ForceText
              text="Pick a station"
              className="text-sm"
              style={{ flex: 1, minWidth: 0 }}
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerTarget('guess')}
            style={{
              backgroundColor: '#ffffff',
              color: '#111827',
              borderColor: 'rgba(128,128,128,0.45)',
            }}
          >
            <ForceText text="Change" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => guessStation(guessId)}>Submit Guess</Button>
          <Button variant="destructive" onClick={giveUp}>Give Up</Button>
          {session.startStationId && (
          <Button type="button" variant="secondary" onClick={() => viewPlayAreaOnMap()}>
            <ForceText text="View play area" />
          </Button>
          )}
        </div>
      </div>
    </div>
  );
}
