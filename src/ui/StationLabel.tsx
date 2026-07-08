/** Station name with colored line bullets for every serving route */

import {
  getRouteBulletsForStationGroup,
  getStationBaseName,
} from '../game/displayNames';
import { ForceText } from './ForceText';
import { LineBulletRow } from './LineBullet';

interface StationLabelProps {
  stationId: string;
  prefix?: string;
  style?: React.CSSProperties;
  nameStyle?: React.CSSProperties;
  className?: string;
  as?: 'span' | 'div';
  bulletSize?: number;
}

export function StationLabel({
  stationId,
  prefix,
  style,
  nameStyle,
  className,
  as = 'span',
  bulletSize = 18,
}: StationLabelProps) {
  const baseName = getStationBaseName(stationId);
  const bullets = getRouteBulletsForStationGroup(stationId);
  const Tag = as;

  return (
    <Tag
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        minWidth: 0,
        ...style,
      }}
    >
      {prefix ? (
        <ForceText text={prefix} style={{ ...nameStyle, flexShrink: 0 }} />
      ) : null}
      <ForceText text={baseName} style={{ ...nameStyle, minWidth: 0 }} />
      <LineBulletRow bullets={bullets} size={bulletSize} />
    </Tag>
  );
}

/** List row with station name + line bullets */
export function StationListItem({
  stationId,
  selected,
  onPick,
}: {
  stationId: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onPick();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0.5rem 0.75rem',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        lineHeight: 1.35,
        fontWeight: selected ? 600 : 400,
        color: 'var(--foreground, #111827)',
        background: selected ? 'rgba(128,128,128,0.15)' : 'transparent',
        borderBottom: '1px solid rgba(128,128,128,0.12)',
      }}
    >
      <StationLabel
        stationId={stationId}
        style={{ width: '100%' }}
        nameStyle={{ fontWeight: selected ? 600 : 400, fontSize: '0.8125rem' }}
        bulletSize={16}
      />
    </div>
  );
}
