/** Reveal phase: show bot location and validated path */

import { useEffect, useState } from 'react';
import { getHideStationForReveal, newRound } from '../game/controller';
import { formatDuration, formatGameTime } from '../game/geo';
import {
  setRevealPathVisible,
  viewAnswerOnMap,
  viewEntirePathOnMap,
  viewPlayAreaOnMap,
} from '../game/mapOverlay';
import { buildRevealTimelineStops } from '../game/pathFormat';
import { getRevealPathOnMapEnabled } from '../game/seekingPreferences';
import { ForceText } from './ForceText';
import { RevealPathTimeline } from './RevealPathTimeline';
import { StationLabel } from './StationLabel';
import { useSession } from './useSession';

const { Button, Badge, Label, Switch } = window.SubwayBuilderAPI.utils.components as Record<
  string,
  React.ComponentType<any>
>;

const REVEAL_BG = '#0a0a0a';
const REVEAL_MUTED = 'rgba(255,255,255,0.72)';
const SECONDARY_BTN = {
  backgroundColor: '#3f3f46',
  color: '#ffffff',
  borderColor: '#52525b',
} as const;

export function RevealPhase() {
  const session = useSession();
  const [showPath, setShowPath] = useState(getRevealPathOnMapEnabled);
  const hideStation = getHideStationForReveal();
  const won = session.revealReason === 'correct';
  const path = session.validatedPath;
  const timelineStops = path ? buildRevealTimelineStops(path.legs) : [];
  const startTimeLabel =
    session.hideStartElapsed > 0 ? formatGameTime(session.hideStartElapsed) : null;

  useEffect(() => {
    setRevealPathVisible(getRevealPathOnMapEnabled());
  }, []);

  return (
    <div
      style={{
        backgroundColor: REVEAL_BG,
        color: '#ffffff',
        borderRadius: 12,
        padding: '22px 18px 18px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        width: '100%',
      }}
    >
      <Badge
        variant="outline"
        style={{
          backgroundColor: won ? '#22c55e' : '#ef4444',
          color: '#ffffff',
          borderColor: won ? '#16a34a' : '#dc2626',
          borderRadius: 999,
          padding: '4px 14px',
          fontSize: '13px',
          fontWeight: 600,
        }}
      >
        <ForceText text={won ? 'Correct!' : 'Revealed'} />
      </Badge>

      {won && session.guessCount > 0 && (
        <ForceText
          text={`${session.guessCount} wrong guess${session.guessCount !== 1 ? 'es' : ''}`}
          style={{ fontSize: '12px', color: REVEAL_MUTED, marginTop: -10 }}
        />
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <ForceText
          text="The hider was at"
          as="div"
          style={{ fontSize: '13px', color: REVEAL_MUTED }}
        />

        {hideStation ? (
          <StationLabel
            stationId={hideStation.id}
            as="div"
            style={{
              fontSize: '26px',
              fontWeight: 700,
              justifyContent: 'center',
            }}
            nameStyle={{ fontSize: '26px', fontWeight: 700, color: '#ffffff' }}
            bulletSize={24}
          />
        ) : (
          <ForceText text="Unknown" as="div" style={{ fontSize: '26px', fontWeight: 700 }} />
        )}

        {session.startStationId && path && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 6,
              fontSize: '13px',
              color: REVEAL_MUTED,
              marginTop: 4,
            }}
          >
            <ForceText text="From" style={{ fontSize: '13px', color: REVEAL_MUTED }} />
            <StationLabel
              stationId={session.startStationId}
              style={{ fontSize: '13px' }}
              nameStyle={{ fontSize: '13px', color: REVEAL_MUTED }}
              bulletSize={16}
            />
            <ForceText
              text={`· ${formatDuration(path.totalTimeSeconds)} travel`}
              style={{ fontSize: '13px', color: REVEAL_MUTED }}
            />
            {startTimeLabel && (
              <ForceText
                text={`· Run started at ${startTimeLabel}`}
                style={{ fontSize: '13px', color: REVEAL_MUTED }}
              />
            )}
          </div>
        )}
      </div>

      {timelineStops.length > 0 && (
        <div style={{ width: '100%', marginTop: 4 }}>
          <RevealPathTimeline stops={timelineStops} />
        </div>
      )}

      {path && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            width: '100%',
            marginTop: 4,
          }}
        >
          <Label
            htmlFor="show-path-overlay"
            style={{ color: '#ffffff', fontSize: '14px', fontWeight: 500 }}
          >
            Show path on map
          </Label>
          <Switch
            id="show-path-overlay"
            checked={showPath}
            onCheckedChange={(checked: boolean) => {
              setShowPath(checked);
              setRevealPathVisible(checked);
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          width: '100%',
          marginTop: 6,
        }}
      >
        <Button
          onClick={newRound}
          style={{
            backgroundColor: '#ffffff',
            color: '#111827',
            borderColor: '#e5e7eb',
            flex: '1 1 auto',
            minWidth: 0,
          }}
        >
          New Round
        </Button>
        {path && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => viewEntirePathOnMap()}
            style={SECONDARY_BTN}
          >
            <ForceText text="View entire path" />
          </Button>
        )}
        {hideStation && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => viewAnswerOnMap()}
            style={SECONDARY_BTN}
          >
            <ForceText text="View answer" />
          </Button>
        )}
        {session.startStationId && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => viewPlayAreaOnMap()}
            style={SECONDARY_BTN}
          >
            <ForceText text="View play area" />
          </Button>
        )}
      </div>
    </div>
  );
}
