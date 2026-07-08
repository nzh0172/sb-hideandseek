/** Colored route bullet matching game line shape/color */

import type { RouteBulletMeta } from '../game/displayNames';
import { ForceText } from './ForceText';

interface LineBulletProps {
  bullet: RouteBulletMeta;
  size?: number;
}

function isLongLabel(label: string): boolean {
  return label.trim().length > 2;
}

function horizontalPadding(label: string, size: number, long: boolean): number {
  if (!long) return 0;
  return Math.max(6, Math.min(14, Math.round(label.length * 2.2)), Math.round(size * 0.35));
}

function bulletShellStyle(
  bullet: RouteBulletMeta,
  size: number,
): React.CSSProperties {
  const shape = (bullet.shape || 'circle').toLowerCase();
  const long = isLongLabel(bullet.label);
  const fontSize = Math.max(9, Math.round(size * 0.55));
  const padX = horizontalPadding(bullet.label, size, long);

  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: bullet.color,
    color: bullet.textColor,
    fontWeight: 700,
    fontSize,
    lineHeight: 1,
    minWidth: size,
    height: size,
    padding: `0 ${padX}px`,
    boxSizing: 'border-box',
    verticalAlign: 'middle',
  };

  // Long names render as an elongated capsule so the label fits inside.
  if (long || shape === 'pill') {
    return {
      ...base,
      borderRadius: 999,
      minWidth: Math.max(size, size + padX * 2),
    };
  }

  if (shape === 'square') {
    return { ...base, borderRadius: 3, width: size, padding: 0 };
  }

  if (shape === 'diamond') {
    return {
      ...base,
      width: size,
      padding: 0,
      borderRadius: 2,
      transform: 'rotate(45deg)',
    };
  }

  // Short single/double-char circle
  return { ...base, borderRadius: 999, width: size, padding: 0 };
}

export function LineBullet({ bullet, size = 18 }: LineBulletProps) {
  const shape = (bullet.shape || 'circle').toLowerCase();
  const long = isLongLabel(bullet.label);
  const isDiamond = shape === 'diamond' && !long;

  return (
    <span style={bulletShellStyle(bullet, size)} title={bullet.label}>
      <ForceText
        text={bullet.label}
        style={{
          color: bullet.textColor,
          fontWeight: 700,
          fontSize: Math.max(9, Math.round(size * 0.55)),
          transform: isDiamond ? 'rotate(-45deg)' : undefined,
          whiteSpace: 'nowrap',
        }}
      />
    </span>
  );
}

export function LineBulletRow({
  bullets,
  size = 18,
}: {
  bullets: RouteBulletMeta[];
  size?: number;
}) {
  if (bullets.length === 0) return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexWrap: 'wrap',
        verticalAlign: 'middle',
      }}
    >
      {bullets.map((bullet, index) => (
        <LineBullet key={index} bullet={bullet} size={size} />
      ))}
    </span>
  );
}
