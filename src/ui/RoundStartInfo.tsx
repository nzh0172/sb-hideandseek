/** Starting station and time for an active round */

import { getStationDisplayNameById } from '../game/displayNames';
import { formatGameTime } from '../game/geo';
import type { HideSeekSession } from '../game/types';
import { ForceText } from './ForceText';

export function RoundStartInfo({ session }: { session: HideSeekSession }) {
  const startLabel = session.startStationId
    ? getStationDisplayNameById(session.startStationId)
    : null;
  const startTimeLabel =
    session.hideStartElapsed > 0
      ? formatGameTime(session.hideStartElapsed)
      : null;

  if (!startLabel && !startTimeLabel) return null;

  return (
    <div className="flex flex-col gap-1 rounded border p-2">
      {startLabel && (
        <ForceText
          text={`Starting station: ${startLabel}`}
          as="div"
          style={{ fontSize: '13px' }}
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
