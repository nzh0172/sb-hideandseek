/** Line picker for seeking-phase line check questions */

import { useEffect, useMemo, useState } from 'react';
import {
  compareRouteLabels,
  getRouteBulletMeta,
  getRouteDisplayName,
} from '../game/displayNames';
import { setSeekingPickerRouteHighlight } from '../game/mapOverlay';
import {
  getLinePickerRouteId,
  getSeekingLineHighlightEnabled,
  setLinePickerRouteId,
  setSeekingLineHighlightEnabled,
} from '../game/seekingPreferences';
import type { Route } from '../types/game-state';
import { ForceText } from './ForceText';
import { LineBullet } from './LineBullet';

const api = window.SubwayBuilderAPI;
const { Button, Input, Label, Switch } = api.utils.components as Record<
  string,
  React.ComponentType<any>
>;

interface LinePickerPageProps {
  onPick: (routeId: string) => void;
  onBack: () => void;
}

function LineListItem({
  route,
  index,
  selected,
  onPick,
  onHighlight,
}: {
  route: Route;
  index: number;
  selected: boolean;
  onPick: () => void;
  onHighlight: () => void;
}) {
  const bullet = getRouteBulletMeta(route, index);
  const hoverBg = 'rgba(128,128,128,0.08)';
  const selectedBg = 'rgba(59,130,246,0.12)';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = hoverBg;
        onHighlight();
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
      onFocus={onHighlight}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onPick();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.625rem 0.75rem',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        lineHeight: 1.35,
        fontWeight: selected ? 600 : 400,
        color: 'var(--foreground, #111827)',
        background: selected ? selectedBg : 'transparent',
        borderBottom: '1px solid rgba(128,128,128,0.12)',
      }}
    >
      <LineBullet bullet={bullet} size={20} />
      <ForceText text={bullet.label} style={{ flex: 1, minWidth: 0 }} />
    </div>
  );
}

export function LinePickerPage({ onPick, onBack }: LinePickerPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showLineHighlight, setShowLineHighlight] = useState(getSeekingLineHighlightEnabled);
  const [highlightedRouteId, setHighlightedRouteId] = useState<string | null>(
    () => (getSeekingLineHighlightEnabled() ? getLinePickerRouteId() : null),
  );
  const routes = useMemo(
    () => [...api.gameState.getRoutes()].sort(compareRouteLabels),
    [],
  );

  const visibleRoutes = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return routes;

    return routes.filter((route, index) => {
      const label = getRouteDisplayName(route, index).toLowerCase();
      const name = route.name?.toLowerCase() ?? '';
      const bullet = route.bullet?.toLowerCase() ?? '';
      return label.includes(trimmed) || name.includes(trimmed) || bullet.includes(trimmed);
    });
  }, [routes, searchQuery]);

  useEffect(() => {
    if (!showLineHighlight) {
      setSeekingPickerRouteHighlight(null);
      return;
    }

    let routeId = highlightedRouteId;
    if (
      !routeId ||
      !visibleRoutes.some((route) => route.id === routeId)
    ) {
      routeId = visibleRoutes[0]?.id ?? null;
      if (routeId !== highlightedRouteId) {
        setHighlightedRouteId(routeId);
        return;
      }
    }

    setSeekingPickerRouteHighlight(routeId);
  }, [showLineHighlight, highlightedRouteId, visibleRoutes]);

  const handleHighlightToggle = (checked: boolean) => {
    setSeekingLineHighlightEnabled(checked);
    setShowLineHighlight(checked);
    if (!checked) {
      setHighlightedRouteId(null);
      setLinePickerRouteId(null);
    }
  };

  const handleRouteHighlight = (routeId: string) => {
    if (!showLineHighlight) return;
    setHighlightedRouteId(routeId);
    setLinePickerRouteId(routeId);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ForceText text="Back" />
        </Button>
        <ForceText text="Line check" className="text-sm font-medium" />
      </div>

      <Input
        type="search"
        placeholder="Search lines…"
        value={searchQuery}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
        style={{ width: '100%' }}
      />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="show-line-highlight">Highlight line on map</Label>
          <Switch
            id="show-line-highlight"
            checked={showLineHighlight}
            onCheckedChange={handleHighlightToggle}
          />
        </div>
        <ForceText
          text="May affect performance on large networks."
          style={{ fontSize: '11px', opacity: 0.65 }}
        />
      </div>

      {routes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No routes built</p>
      ) : (
        <div
          style={{
            border: '1px solid rgba(128,128,128,0.45)',
            borderRadius: '6px',
            overflowY: 'auto',
            minHeight: '14rem',
            maxHeight: '18rem',
          }}
        >
          {visibleRoutes.length === 0 && (
            <div style={{ padding: '0.75rem', fontSize: '0.8125rem', opacity: 0.65 }}>
              <ForceText text="No lines match your search" />
            </div>
          )}

          {visibleRoutes.map((route: Route, index) => {
            const routeIndex = routes.findIndex((r) => r.id === route.id);
            return (
              <LineListItem
                key={index}
                route={route}
                index={routeIndex >= 0 ? routeIndex : index}
                selected={showLineHighlight && route.id === highlightedRouteId}
                onHighlight={() => handleRouteHighlight(route.id)}
                onPick={() => onPick(route.id)}
              />
            );
          })}
        </div>
      )}

      <ForceText
        text="Tap a line to ask if the hider is on it."
        style={{ fontSize: '11px', opacity: 0.65 }}
      />
    </div>
  );
}
