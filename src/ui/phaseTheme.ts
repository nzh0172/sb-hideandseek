/** Theme-aware colors for seeking/reveal panels */

export type PhaseColors = {
  isDark: boolean;
  foreground: string;
  muted: string;
  /** Solid color for path dots/lines — CSS vars often fail as backgroundColor in-game. */
  path: string;
};

function resolveIsDark(): boolean {
  try {
    const resolved = window.SubwayBuilderAPI.ui.getResolvedTheme();
    if (resolved === 'dark') return true;
    if (resolved === 'light') return false;
  } catch {
    // fall through
  }

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root.classList.contains('dark')) return true;
    if (root.classList.contains('light')) return false;
    if (root.dataset.theme === 'dark') return true;
    if (root.dataset.theme === 'light') return false;
  }

  return false;
}

/** Resolve --foreground to a concrete rgb()/hex the game can paint as a fill. */
function resolveForegroundSolid(fallback: string): string {
  if (typeof document === 'undefined') return fallback;

  try {
    const probe = document.createElement('span');
    probe.style.cssText =
      'position:absolute;left:-9999px;top:0;color:var(--foreground, inherit);';
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    document.body.removeChild(probe);

    if (
      computed &&
      computed !== 'rgba(0, 0, 0, 0)' &&
      computed !== 'transparent'
    ) {
      return computed;
    }
  } catch {
    // fall through
  }

  return fallback;
}

export function getPhaseColors(): PhaseColors {
  const isDark = resolveIsDark();
  const fallbackFg = isDark ? '#ffffff' : '#111827';
  const foreground = resolveForegroundSolid(fallbackFg);

  return {
    isDark,
    foreground,
    muted: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(17,24,39,0.55)',
    path: foreground,
  };
}
