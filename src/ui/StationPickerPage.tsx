/** Full-page station picker — routes on the left, stations on the right */

import { useEffect, useMemo, useState } from 'react';
import {
  buildStationCatalog,
  findRouteIdForStation,
  searchStations,
} from '../game/stationCatalog';
import { getStationDisplayName, invalidateStationLabels } from '../game/displayNames';
import type { Station } from '../types/game-state';
import { ForceText, StationListItem } from './ForceText';

const api = window.SubwayBuilderAPI;
const { Button, Input } = api.utils.components as Record<string, React.ComponentType<any>>;

interface StationPickerPageProps {
  value: string;
  stations: Station[];
  onChange: (stationId: string) => void;
  title?: string;
  onBack?: () => void;
}

function RouteListItem({
  label,
  color,
  selected,
  count,
  onPick,
}: {
  label: string;
  color?: string;
  selected: boolean;
  count: number;
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
        gap: '0.5rem',
        padding: '0.5rem 0.625rem',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        lineHeight: 1.35,
        fontWeight: selected ? 600 : 400,
        color: 'var(--foreground, #111827)',
        background: selected ? 'rgba(128,128,128,0.15)' : 'transparent',
        borderBottom: '1px solid rgba(128,128,128,0.12)',
      }}
    >
      <span
        style={{
          width: '0.625rem',
          height: '0.625rem',
          borderRadius: '999px',
          flexShrink: 0,
          background: color && color.startsWith('#') ? color : 'rgba(128,128,128,0.55)',
        }}
      />
      <ForceText text={label} style={{ flex: 1, minWidth: 0 }} />
      <ForceText
        text={String(count)}
        style={{ fontSize: '0.75rem', opacity: 0.6, flexShrink: 0 }}
      />
    </div>
  );
}

export function StationPickerPage({
  value,
  stations,
  onChange,
  title = 'Pick a station',
  onBack,
}: StationPickerPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogVersion, setCatalogVersion] = useState(0);

  const catalog = useMemo(() => {
    invalidateStationLabels();
    return buildStationCatalog(stations);
  }, [stations, catalogVersion]);

  const [selectedRouteId, setSelectedRouteId] = useState(() =>
    findRouteIdForStation(catalog, value),
  );

  useEffect(() => {
    if (value) {
      setSelectedRouteId(findRouteIdForStation(catalog, value));
    }
  }, [value, catalog]);

  useEffect(() => {
    const refresh = () => setCatalogVersion((v) => v + 1);
    api.hooks.onStationBuilt(refresh);
    api.hooks.onStationDeleted(refresh);
    api.hooks.onRouteCreated(refresh);
    api.hooks.onRouteDeleted(refresh);
  }, []);

  const searching = searchQuery.trim().length > 0;
  const searchResults = useMemo(
    () => (searching ? searchStations(stations, searchQuery) : []),
    [stations, searchQuery, searching],
  );

  const selectedEntry = catalog.find((e) => e.routeId === selectedRouteId) ?? catalog[0];
  const routeStations = useMemo(() => {
    if (!selectedEntry) return [];
    const byId = new Map(stations.map((s) => [s.id, s]));
    return selectedEntry.stationIds
      .map((id) => byId.get(id))
      .filter((s): s is Station => s !== undefined);
  }, [selectedEntry, stations]);

  const visibleStations = searching ? searchResults : routeStations;

  const pickStation = (stationId: string) => {
    onChange(stationId);
    setSearchQuery('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ForceText text="Back" />
          </Button>
        )}
        <ForceText text={title} className="text-sm font-medium" />
      </div>

      <Input
        type="search"
        placeholder="Search stations…"
        value={searchQuery}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
        style={{ width: '100%' }}
      />

      {stations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stations built</p>
      ) : catalog.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stations available</p>
      ) : (
        <div
          style={{
            display: 'flex',
            border: '1px solid rgba(128,128,128,0.45)',
            borderRadius: '6px',
            overflow: 'hidden',
            minHeight: '14rem',
            maxHeight: '18rem',
          }}
        >
          <div
            style={{
              width: '38%',
              flexShrink: 0,
              overflowY: 'auto',
              borderRight: '1px solid rgba(128,128,128,0.25)',
              background: 'rgba(128,128,128,0.04)',
              opacity: searching ? 0.55 : 1,
            }}
          >
            {catalog.map((entry, index) => (
              <RouteListItem
                key={index}
                label={entry.displayName}
                color={entry.routeColor}
                selected={!searching && entry.routeId === selectedRouteId}
                count={entry.stationIds.length}
                onPick={() => {
                  setSearchQuery('');
                  setSelectedRouteId(entry.routeId);
                }}
              />
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {searching && searchResults.length === 0 && (
              <div style={{ padding: '0.75rem', fontSize: '0.8125rem', opacity: 0.65 }}>
                <ForceText text="No stations match your search" />
              </div>
            )}

            {!searching && visibleStations.length === 0 && (
              <div style={{ padding: '0.75rem', fontSize: '0.8125rem', opacity: 0.65 }}>
                <ForceText text="No stations on this route" />
              </div>
            )}

            {visibleStations.map((station, index) => (
              <StationListItem
                key={index}
                label={getStationDisplayName(station)}
                selected={station.id === value}
                onPick={() => pickStation(station.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
