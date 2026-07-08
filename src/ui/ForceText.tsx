/** Force visible text in-game — React children/keys render incorrectly */

interface ForceTextProps {
  text: string;
  style?: React.CSSProperties;
  className?: string;
  as?: 'span' | 'div';
}

export function ForceText({
  text,
  style,
  className,
  as = 'span',
}: ForceTextProps) {
  const setText = (el: HTMLSpanElement | HTMLDivElement | null) => {
    if (el) el.textContent = text;
  };

  const sharedStyle: React.CSSProperties = {
    color: 'var(--foreground, #111827)',
    ...style,
  };

  if (as === 'div') {
    return <div ref={setText} className={className} style={sharedStyle} />;
  }

  return <span ref={setText} className={className} style={sharedStyle} />;
}

/** List row with label set directly on the element (avoid nested keys) */
export function StationListItem({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      ref={(el) => {
        if (el) el.textContent = label;
      }}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onPick();
      }}
      style={{
        padding: '0.5rem 0.75rem',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        lineHeight: 1.35,
        fontWeight: selected ? 600 : 400,
        color: 'var(--foreground, #111827)',
        background: selected ? 'rgba(128,128,128,0.15)' : 'transparent',
        borderBottom: '1px solid rgba(128,128,128,0.12)',
      }}
    />
  );
}
