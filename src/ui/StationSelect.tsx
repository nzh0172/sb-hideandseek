/** Custom station picker — avoid UUID React keys (game renders keys as text) */

import { useState } from 'react';
import { getStationDisplayName, invalidateStationLabels } from '../game/displayNames';
import type { Station } from '../types/game-state';
import { ForceText, StationListItem } from './ForceText';

const api = window.SubwayBuilderAPI;
const { Button } = api.utils.components as Record<string, React.ComponentType<any>>;

interface StationSelectProps {
  id?: string;
  value: string;
  stations: Station[];
  onChange: (stationId: string) => void;
  placeholder?: string;
}

export function StationSelect({
  id,
  value,
  stations,
  onChange,
  placeholder = 'Pick a station',
}: StationSelectProps) {
  const [open, setOpen] = useState(false);

  const buildOptions = () => {
    invalidateStationLabels();
    return stations.map((station) => ({
      id: station.id,
      label: getStationDisplayName(station),
    }));
  };

  const options = buildOptions();
  const selectedLabel =
    options.find((opt) => opt.id === value)?.label ?? placeholder;

  return (
    <div id={id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: '100%',
          justifyContent: 'flex-start',
          textAlign: 'left',
          whiteSpace: 'normal',
          height: 'auto',
          minHeight: '2.25rem',
          padding: '0.5rem 0.75rem',
        }}
      >
        <ForceText text={selectedLabel} />
      </Button>

      {open && (
        <div
          style={{
            width: '100%',
            maxHeight: '9rem',
            overflowY: 'auto',
            border: '1px solid rgba(128,128,128,0.45)',
            borderRadius: '6px',
            background: 'var(--background, #fff)',
            flexShrink: 0,
          }}
        >
          {options.map((opt, index) => (
            <StationListItem
              key={index}
              label={opt.label}
              selected={opt.id === value}
              onPick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
