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
