/** Hiding phase: bot is traveling, show countdown */

import { useEffect, useState } from 'react';
import { getRemainingHideSeconds } from '../game/controller';
import { formatDuration } from '../game/geo';
import { RoundStartInfo } from './RoundStartInfo';
import { useSession } from './useSession';

const api = window.SubwayBuilderAPI;
const { Progress } = api.utils.components as Record<string, React.ComponentType<any>>;

export function HidingPhase() {
  const session = useSession();
  const [remaining, setRemaining] = useState(getRemainingHideSeconds);

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemainingHideSeconds()), 500);
    return () => clearInterval(id);
  }, []);

  const totalSeconds = session.config.hideDurationHours * 3600;
  const elapsed = totalSeconds - remaining;
  const progress = totalSeconds > 0 ? Math.min(100, (elapsed / totalSeconds) * 100) : 0;

  const day = api.gameState.getCurrentDay();
  const hour = api.gameState.getCurrentHour();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">The hider is on the move…</p>
      <p className="text-sm text-muted-foreground">
        Simulation is running. The game will pause when hide time expires.
      </p>

      <RoundStartInfo session={session} />

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Time remaining</span>
        <span className="text-lg font-semibold tabular-nums">
          {formatDuration(remaining)}
        </span>
        <Progress value={progress} className="h-2" />
      </div>

      <p className="text-xs text-muted-foreground">
        In-game: Day {day}, {String(hour).padStart(2, '0')}:00
      </p>

      <p className="text-xs text-muted-foreground">
        Timer only advances while the game is unpaused.
      </p>
    </div>
  );
}
