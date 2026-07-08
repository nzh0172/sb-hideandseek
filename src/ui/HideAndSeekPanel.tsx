/** Main Hide and Seek panel — routes to phase views */

import { HidingPhase } from './HidingPhase';
import { RevealPhase } from './RevealPhase';
import { SeekingPhase } from './SeekingPhase';
import { SetupPhase } from './SetupPhase';
import { useSession } from './useSession';

export function HideAndSeekPanel() {
  const session = useSession();

  return (
    <div className="flex flex-col gap-3 p-3">
      {session.phase === 'setup' && <SetupPhase />}
      {session.phase === 'hiding' && <HidingPhase />}
      {session.phase === 'seeking' && <SeekingPhase />}
      {session.phase === 'reveal' && <RevealPhase />}
    </div>
  );
}
