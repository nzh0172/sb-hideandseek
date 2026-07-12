/** Starting station, time, and round for an active round */

import { formatGameTime } from '../game/geo';
import type { HideSeekSession } from '../game/types';
import { ForceText } from './ForceText';
import { StationLabel } from './StationLabel';

export function RoundStartInfo({ session }: { session: HideSeekSession }) {
  const startTimeLabel =
    session.hideStartElapsed > 0
      ? formatGameTime(session.hideStartElapsed)
      : null;
  const showRound =
    session.currentRound > 0 && session.config.totalRounds > 0;

  if (!session.startStationId && !startTimeLabel && !showRound) return null;

  return (
    <div className="flex flex-col gap-1 rounded border p-2">
      {showRound && (
        <ForceText
          text={`Round ${session.currentRound} of ${session.config.totalRounds}`}
          as="div"
          style={{ fontSize: '13px', fontWeight: 600 }}
        />
      )}
      {session.startStationId && (
        <StationLabel
          stationId={session.startStationId}
          prefix="Starting station:"
          as="div"
          style={{ fontSize: '13px' }}
          nameStyle={{ fontSize: '13px' }}
          bulletSize={16}
        />
      )}
      {startTimeLabel && (
        <ForceText
          text={`Started at: ${startTimeLabel}`}
          as="div"
          style={{ fontSize: '13px', opacity: 0.75 }}
        />
      )}
    </div>
  );
}
