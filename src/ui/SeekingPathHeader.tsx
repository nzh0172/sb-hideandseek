/** Horizontal start → guess path header for the seeking phase */

import {
  getRouteBulletsForStationGroup,
  getStationBaseName,
} from '../game/displayNames';
import { formatGameTime } from '../game/geo';
import { ForceText } from './ForceText';
import { LineBulletRow } from './LineBullet';

const DOT_SIZE = 14;
const LINE_HEIGHT = 4;
const WHITE = '#ffffff';

const { Button } = window.SubwayBuilderAPI.utils.components as Record<
  string,
  React.ComponentType<any>
>;

interface SeekingPathHeaderProps {
  startStationId: string | null;
  startTimeSeconds: number;
  guessStationId: string | null;
  onGuessClick: () => void;
}

const GUESS_BTN_STYLE: React.CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#111827',
  borderColor: '#e5e7eb',
  flexShrink: 0,
  margin: '0 6px',
  height: 28,
  minWidth: 60,
  padding: '0 12px',
  fontWeight: 600,
  borderRadius: 999,
};

function PathDot() {
  return (
    <div
      style={{
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: '50%',
        backgroundColor: WHITE,
        flexShrink: 0,
      }}
    />
  );
}

function PathLine() {
  return (
    <div
      style={{
        flex: 1,
        height: LINE_HEIGHT,
        backgroundColor: WHITE,
        minWidth: 0,
      }}
    />
  );
}

/** Keeps the middle grid column the same width on every row. */
function GuessSlot({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={visible ? onClick : undefined}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      style={{
        ...GUESS_BTN_STYLE,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <ForceText text="Guess" />
    </Button>
  );
}

function StationAbove({
  stationId,
  fallback,
}: {
  stationId: string | null;
  fallback: string;
}) {
  const name = stationId ? getStationBaseName(stationId) : fallback;
  const bullets = stationId ? getRouteBulletsForStationGroup(stationId) : [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        minWidth: 0,
      }}
    >
      <ForceText
        text={name}
        as="div"
        style={{
          fontSize: '18px',
          fontWeight: 700,
          color: WHITE,
          textAlign: 'center',
          width: '100%',
        }}
      />
      {bullets.length > 0 ? (
        <LineBulletRow bullets={bullets} size={16} align="center" />
      ) : null}
    </div>
  );
}

function LeftPathSegment() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }} />
      <PathDot />
      <PathLine />
    </div>
  );
}

function RightPathSegment() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        minWidth: 0,
      }}
    >
      <PathLine />
      <PathDot />
      <div style={{ flex: 1, minWidth: 0 }} />
    </div>
  );
}

export function SeekingPathHeader({
  startStationId,
  startTimeSeconds,
  guessStationId,
  onGuessClick,
}: SeekingPathHeaderProps) {
  const startTime =
    startTimeSeconds > 0 ? formatGameTime(startTimeSeconds) : null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        gridTemplateRows: 'auto auto auto',
        alignItems: 'center',
        rowGap: 6,
        width: '100%',
        padding: '4px 0',
      }}
    >
      <StationAbove stationId={startStationId} fallback="Unknown" />
      <GuessSlot visible={false} />
      <StationAbove stationId={guessStationId} fallback="???" />

      <LeftPathSegment />
      <GuessSlot visible onClick={onGuessClick} />
      <RightPathSegment />

      <ForceText
        text={startTime ?? ' '}
        as="div"
        style={{
          fontSize: '13px',
          color: startTime ? 'rgba(255,255,255,0.85)' : 'transparent',
          textAlign: 'center',
          width: '100%',
          minHeight: 18,
        }}
      />
      <GuessSlot visible={false} />
      <div />
    </div>
  );
}
