/** Full-page station picker — routes on the left, stations on the right */

import { useEffect, useMemo, useState } from 'react';
import {
  buildStationCatalog,
  findRouteIdForStation,
  OTHER_ROUTE_ID,
  searchStations,
} from '../game/stationCatalog';
import {
  areSameStationGroup,
  getGroupRepresentative,
  getRouteBulletMeta,
} from '../game/displayNames';
import {
  centerMapOnStation,
  setSeekingPickerRouteHighlight,
  setSeekingPickerStationHighlight,
} from '../game/mapOverlay';
import type { Station } from '../types/game-state';
import { ForceText } from './ForceText';
import { LineBullet } from './LineBullet';
import { StationLabel, StationListItem } from './StationLabel';

const api = window.SubwayBuilderAPI;
const { Button, Input } = api.utils.components as Record<string, React.ComponentType<any>>;

interface StationPickerPageProps {
  value: string;
  stations: Station[];
  onChange: (stationId: string) => void;
  title?: string;
  onBack?: () => void;
  /** Pinned quick-pick row shown above the route station list. */
  pinnedStationId?: string;
  pinnedLabel?: string;
  /** Highlight the selected station on the game map. */
  highlightOnMap?: boolean;
}

function RouteListItem({
  routeId,
  displayName,
  routeColor,
  selected,
  count,
  onPick,
}: {
  routeId: string;
  displayName: string;
  routeColor?: string;
  selected: boolean;
  count: number;
  onPick: () => void;
}) {
  const routes = api.gameState.getRoutes();
  const routeIndex = routes.findIndex((r) => r.id === routeId);
  const route = routeIndex >= 0 ? routes[routeIndex] : null;
  const bullet =
    routeId !== OTHER_ROUTE_ID && route
      ? getRouteBulletMeta(route, routeIndex)
      : null;
  const hoverBg = 'rgba(128,128,128,0.08)';
  const selectedBg = 'rgba(128,128,128,0.15)';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
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
        background: selected ? selectedBg : 'transparent',
        borderBottom: '1px solid rgba(128,128,128,0.12)',
      }}
    >
      {bullet ? (
        <LineBullet bullet={bullet} size={18} />
      ) : (
        <span
          style={{
            width: '0.625rem',
            height: '0.625rem',
            borderRadius: '999px',
            flexShrink: 0,
            background:
              routeColor && routeColor.startsWith('#')
                ? routeColor
                : 'rgba(128,128,128,0.55)',
          }}
        />
      )}
      <ForceText
        text={bullet?.label ?? displayName}
        style={{ flex: 1, minWidth: 0 }}
      />
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
  pinnedStationId,
  pinnedLabel = 'Starting station',
  highlightOnMap = false,
}: StationPickerPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [hoveredStationId, setHoveredStationId] = useState<string | null>(null);

  const catalog = useMemo(() => buildStationCatalog(stations), [stations, catalogVersion]);

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

  useEffect(() => {
    if (!highlightOnMap) return;

    setSeekingPickerRouteHighlight(null);

    const stationId = hoveredStationId
      ? getGroupRepresentative(hoveredStationId)
      : value;

    if (stationId) {
      setSeekingPickerStationHighlight(stationId);
    } else {
      setSeekingPickerStationHighlight(null);
    }
  }, [highlightOnMap, hoveredStationId, value]);

  useEffect(() => {
    if (!highlightOnMap || !value) return;
    centerMapOnStation(value);
  }, [highlightOnMap, value]);

  const searchResults = useMemo(
    () => (searching ? searchStations(stations, searchQuery) : []),
    [stations, searchQuery, searching],
  );

  const selectedEntry = catalog.find((e) => e.routeId === selectedRouteId) ?? catalog[0];
  const routeStations = useMemo(() => {
    if (!selectedEntry) return [];
    const byId = new Map(stations.map((s) => [s.id, s]));
    return selectedEntry.stationIds
      .map((id) => byId.get(id) ?? byId.get(getGroupRepresentative(id)))
      .filter((s): s is Station => s !== undefined);
  }, [selectedEntry, stations]);

  const visibleStations = searching ? searchResults : routeStations;

  const pickStation = (stationId: string) => {
    onChange(getGroupRepresentative(stationId));
    setSearchQuery('');
    setHoveredStationId(null);
  };

  const stationHoverHandlers = highlightOnMap
    ? {
        onHover: (stationId: string) =>
          setHoveredStationId(getGroupRepresentative(stationId)),
        onHoverEnd: () => setHoveredStationId(null),
      }
    : {};

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ForceText text="Back" />
          </Button>
        )}
        {value ? (
          <StationLabel
            stationId={value}
            prefix={`${title}:`}
            style={{ minWidth: 0, flex: 1 }}
            nameStyle={{ fontSize: '0.875rem', fontWeight: 500 }}
            bulletSize={16}
          />
        ) : (
          <ForceText text={title} className="text-sm font-medium" />
        )}
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
                routeId={entry.routeId}
                displayName={entry.displayName}
                routeColor={entry.routeColor}
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
            {pinnedStationId && !searching && (
              <div
                style={{
                  borderBottom: '2px solid rgba(128,128,128,0.2)',
                  background: 'rgba(249,115,22,0.06)',
                }}
              >
                <div
                  style={{
                    padding: '0.375rem 0.75rem 0',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    opacity: 0.65,
                  }}
                >
                  <ForceText text={pinnedLabel} />
                </div>
                <StationListItem
                  stationId={pinnedStationId}
                  selected={areSameStationGroup(pinnedStationId, value)}
                  onPick={() => pickStation(pinnedStationId)}
                  onHover={() => stationHoverHandlers.onHover?.(pinnedStationId)}
                  onHoverEnd={stationHoverHandlers.onHoverEnd}
                />
              </div>
            )}

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
                stationId={station.id}
                selected={areSameStationGroup(station.id, value)}
                onPick={() => pickStation(station.id)}
                onHover={() => stationHoverHandlers.onHover?.(station.id)}
                onHoverEnd={stationHoverHandlers.onHoverEnd}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
