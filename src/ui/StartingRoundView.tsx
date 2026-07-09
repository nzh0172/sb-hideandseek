/** Shown while the bot hide spot is being computed */

import { ForceText } from './ForceText';
import type { GameMode } from '../game/types';

const MESSAGES: Record<GameMode, string> = {
  instant: 'Finding a hide spot…',
  live: 'Planning the hider’s route…',
};

export function StartingRoundView({ mode }: { mode: GameMode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10">
      <div
        role="status"
        aria-label="Loading"
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '2px solid rgba(128,128,128,0.35)',
          borderTopColor: 'currentColor',
          animation: 'hide-seek-spin 0.75s linear infinite',
        }}
      />
      <style>{`@keyframes hide-seek-spin { to { transform: rotate(360deg); } }`}</style>
      <div className="flex flex-col items-center gap-1 text-center">
        <ForceText text={MESSAGES[mode]} className="text-sm font-medium" />
        <ForceText
          text="This can take a moment on large networks."
          className="text-xs text-muted-foreground"
        />
      </div>
    </div>
  );
}
