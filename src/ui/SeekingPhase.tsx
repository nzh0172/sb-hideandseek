/** Seeking phase: deduction tools and guess */

import { useState } from 'react';
import {
  compareRouteLabels,
  getRouteDisplayName,
  getSortedStations,
} from '../game/displayNames';
import {
  giveUp,
  guessStation,
  queryOnLine,
  querySameLineAsStart,
  queryTransferCount,
  queryWithinKmFromMe,
  queryWithinKmFromStation,
} from '../game/controller';
import { LabeledButton } from './LabeledButton';
import { QuestionLog } from './QuestionLog';
import { RoundStartInfo } from './RoundStartInfo';
import { StationSelect } from './StationSelect';
import { useSession } from './useSession';

const api = window.SubwayBuilderAPI;
const { Button, Label } = api.utils.components as Record<string, React.ComponentType<any>>;

const DISTANCE_OPTIONS = [1, 2, 5, 10, 20];

export function SeekingPhase() {
  const session = useSession();
  const [stations] = useState(getSortedStations);
  const [routes] = useState(() =>
    [...api.gameState.getRoutes()].sort(compareRouteLabels),
  );
  const [refStationId, setRefStationId] = useState(stations[0]?.id ?? '');
  const [guessId, setGuessId] = useState(stations[0]?.id ?? '');

  return (
    <div className="flex flex-col gap-3">
      <RoundStartInfo session={session} />

      <p className="text-sm" style={{ opacity: 0.75 }}>
        Ask questions to narrow down the hider. Wrong guesses: {session.guessCount}
      </p>
      <p className="text-xs" style={{ opacity: 0.65 }}>
        Map dims ruled-out areas. Overlapping questions cut to their intersection.
        Green dots = {session.possibleStationIds.length} possible hide spot
        {session.possibleStationIds.length !== 1 ? 's' : ''}.
      </p>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">Distance from me (start station)</span>
        <div className="flex flex-wrap gap-1">
          {DISTANCE_OPTIONS.map((km, index) => (
            <LabeledButton
              key={index}
              label={`≤ ${km} km`}
              onClick={() => queryWithinKmFromMe(km)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">Distance from station</span>
        <StationSelect
          value={refStationId}
          stations={stations}
          onChange={setRefStationId}
        />
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
        <span className="text-xs font-medium">Line check</span>
        <div className="flex flex-wrap gap-1">
          {routes.map((r, index) => (
            <LabeledButton
              key={index}
              label={getRouteDisplayName(r, index)}
              onClick={() => queryOnLine(r.id)}
            />
          ))}
        </div>
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
        <StationSelect
          id="guess-station"
          value={guessId}
          stations={stations}
          onChange={setGuessId}
        />
        <div className="flex gap-2">
          <Button onClick={() => guessStation(guessId)}>Submit Guess</Button>
          <Button variant="outline" onClick={giveUp}>Give Up</Button>
        </div>
      </div>
    </div>
  );
}
