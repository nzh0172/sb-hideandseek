/** Reveal phase: show bot location and validated path */

import { getHideStationForReveal, newRound } from '../game/controller';
import { getStationDisplayNameById } from '../game/displayNames';
import { formatDuration } from '../game/geo';
import { formatValidatedPathText } from '../game/pathFormat';
import { ForceText } from './ForceText';
import { RoundStartInfo } from './RoundStartInfo';
import { useSession } from './useSession';

const api = window.SubwayBuilderAPI;
const { Button, Badge } = api.utils.components as Record<string, React.ComponentType<any>>;

export function RevealPhase() {
  const session = useSession();
  const hideStation = getHideStationForReveal();
  const startLabel = session.startStationId
    ? getStationDisplayNameById(session.startStationId)
    : null;

  const won = session.revealReason === 'correct';
  const pathText = session.validatedPath
    ? formatValidatedPathText(session.validatedPath)
    : '';

  const summaryText = startLabel
    ? `From ${startLabel}${
        session.validatedPath
          ? ` · ${formatDuration(session.validatedPath.totalTimeSeconds)} travel`
          : ''
      }`
    : '';

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
        <ForceText
          text={hideStation?.name ?? 'Unknown'}
          as="div"
          style={{ fontSize: '18px', fontWeight: 600 }}
        />
      </div>

      <RoundStartInfo session={session} />

      {summaryText && (
        <ForceText text={summaryText} as="div" style={{ fontSize: '13px', opacity: 0.75 }} />
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

      <Button onClick={newRound}>New Round</Button>
    </div>
  );
}
