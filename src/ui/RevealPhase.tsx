/** Reveal phase: show bot location and validated path */

import { useState } from 'react';
import { getHideStationForReveal, newRound } from '../game/controller';
import { formatDuration } from '../game/geo';
import {
  isRevealDeductionVisible,
  isRevealPathVisible,
  setRevealDeductionVisible,
  setRevealPathVisible,
  viewAnswerOnMap,
  viewEntirePathOnMap,
  viewPlayAreaOnMap,
} from '../game/mapOverlay';
import { formatValidatedPathText } from '../game/pathFormat';
import { ForceText } from './ForceText';
import { RoundStartInfo } from './RoundStartInfo';
import { StationLabel } from './StationLabel';
import { useSession } from './useSession';

const { Button, Badge, Label, Switch } = window.SubwayBuilderAPI.utils.components as Record<
  string,
  React.ComponentType<any>
>;

export function RevealPhase() {
  const session = useSession();
  const [showPath, setShowPath] = useState(isRevealPathVisible);
  const [showDeduction, setShowDeduction] = useState(isRevealDeductionVisible);
  const hideStation = getHideStationForReveal();
  const won = session.revealReason === 'correct';
  const path = session.validatedPath;
  const pathText = path ? formatValidatedPathText(path) : '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          style={{
            backgroundColor: won ? '#22c55e' : '#ef4444',
            color: '#ffffff',
            borderColor: won ? '#16a34a' : '#dc2626',
          }}
        >
          <ForceText text={won ? 'Correct!' : 'Revealed'} />
        </Badge>
        {session.guessCount > 0 && (
          <ForceText
            text={`${session.guessCount} wrong guess${session.guessCount !== 1 ? 'es' : ''}`}
            style={{ fontSize: '11px', opacity: 0.75 }}
          />
        )}
      </div>

      <div>
        <ForceText
          text="The hider was at"
          as="div"
          style={{ fontSize: '11px', opacity: 0.75 }}
        />
        {hideStation ? (
          <StationLabel
            stationId={hideStation.id}
            as="div"
            style={{ fontSize: '18px', fontWeight: 600 }}
            nameStyle={{ fontSize: '18px', fontWeight: 600 }}
            bulletSize={20}
          />
        ) : (
          <ForceText text="Unknown" as="div" style={{ fontSize: '18px', fontWeight: 600 }} />
        )}
      </div>

      {/* <RoundStartInfo session={session} /> */}



      {session.startStationId && path && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            fontSize: '13px',
            opacity: 0.85,
          }}
        >
          <ForceText text="From" style={{ fontSize: '13px' }} />
          <StationLabel
            stationId={session.startStationId}
            style={{ fontSize: '13px' }}
            nameStyle={{ fontSize: '13px' }}
            bulletSize={15}
          />
          <ForceText
            text={`· ${formatDuration(path.totalTimeSeconds)} travel`}
            style={{ fontSize: '13px' }}
          />
        </div>
      )}



      {pathText && (
        <div className="flex flex-col gap-1 rounded border p-2">
          <ForceText
            text="Schedule-valid path"
            as="div"
            style={{ fontSize: '11px', fontWeight: 600 }}
          />
          <div
            ref={(el) => {
              if (el) el.textContent = pathText;
            }}
            style={{
              fontSize: '11px',
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              color: 'var(--foreground, #111827)',
            }}
          />
        </div>
      )}

      {session.mapOverlays.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="show-deduction-overlay">Show question regions on map</Label>
          <Switch
            id="show-deduction-overlay"
            checked={showDeduction}
            onCheckedChange={(checked: boolean) => {
              setShowDeduction(checked);
              setRevealDeductionVisible(checked);
            }}
          />
        </div>
      )}

      {path && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="show-path-overlay">Show path on map</Label>
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


      <div className="flex flex-wrap gap-2" style={{ marginTop: '4px' }}>
        <Button onClick={newRound}>New Round</Button>
        {path && (
          <Button type="button" variant="secondary" onClick={() => viewEntirePathOnMap()}>
            <ForceText text="View entire path" />
          </Button>
        )}
        {hideStation && (
          <Button type="button" variant="secondary" onClick={() => viewAnswerOnMap()}>
            <ForceText text="View answer" />
          </Button>
        )}
        {session.startStationId && (
          <Button type="button" variant="secondary" onClick={() => viewPlayAreaOnMap()}>
            <ForceText text="View play area" />
          </Button>
        )}
      </div>

    </div>
  );
}
