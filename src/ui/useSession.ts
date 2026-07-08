/** Subscribe to session state changes in React */

import { useEffect, useState } from 'react';
import { getSession, subscribe } from '../game/session';
import type { HideSeekSession } from '../game/types';

export function useSession(): HideSeekSession {
  const [session, setSession] = useState(getSession);

  useEffect(() => subscribe(() => setSession(getSession())), []);

  return session;
}
