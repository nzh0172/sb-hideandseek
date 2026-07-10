/** Vertical origin → destination timeline for the reveal phase */

import { formatGameTime } from '../game/geo';
import type { RevealTimelineStop } from '../game/pathFormat';
import { ForceText } from './ForceText';
import { StationLabel } from './StationLabel';

const DOT_SIZE = 14;
const LINE_WIDTH = 4;
const LINE_LEFT = DOT_SIZE / 2 + 4;
const STOP_GAP = 28;
const TIME_COLUMN_MIN_WIDTH = 56;
const TIMELINE_WHITE = '#ffffff';

interface RevealPathTimelineProps {
  stops: RevealTimelineStop[];
}

function stopKey(stop: RevealTimelineStop, index: number): string {
  return `stop-${stop.stationId}-${stop.time}-${index}`;
}

function TimelineStop({
  stationId,
  time,
}: {
  stationId: string;
  time: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        minHeight: 32,
        paddingRight: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: '50%',
            backgroundColor: TIMELINE_WHITE,
            flexShrink: 0,
            position: 'relative',
            zIndex: 1,
          }}
        />
        <StationLabel
          stationId={stationId}
          style={{ fontSize: '15px', fontWeight: 500 }}
          nameStyle={{ fontSize: '15px', fontWeight: 500, color: TIMELINE_WHITE }}
          bulletSize={18}
        />
      </div>
      <ForceText
        text={formatGameTime(time)}
        style={{
          fontSize: '14px',
          color: 'rgba(255,255,255,0.85)',
          flexShrink: 0,
          minWidth: TIME_COLUMN_MIN_WIDTH,
          textAlign: 'right',
        }}
      />
    </div>
  );
}

export function RevealPathTimeline({ stops }: RevealPathTimelineProps) {
  if (stops.length === 0) return null;

  const displayStops = [...stops].reverse();

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        paddingLeft: 4,
        paddingRight: 12,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: LINE_LEFT - LINE_WIDTH / 2,
          top: DOT_SIZE / 2,
          bottom: DOT_SIZE / 2,
          width: LINE_WIDTH,
          backgroundColor: TIMELINE_WHITE,
          borderRadius: LINE_WIDTH / 2,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: STOP_GAP }}>
        {displayStops.map((stop, index) => (
          <TimelineStop
            key={stopKey(stop, index)}
            stationId={stop.stationId}
            time={stop.time}
          />
        ))}
      </div>
    </div>
  );
}
