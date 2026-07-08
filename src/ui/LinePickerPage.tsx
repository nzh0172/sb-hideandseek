/** Line picker for seeking-phase line check questions */

import { useMemo, useState } from 'react';
import {
  compareRouteLabels,
  getRouteBulletMeta,
  getRouteDisplayName,
} from '../game/displayNames';
import type { Route } from '../types/game-state';
import { ForceText } from './ForceText';
import { LineBullet } from './LineBullet';

const api = window.SubwayBuilderAPI;
const { Button, Input } = api.utils.components as Record<string, React.ComponentType<any>>;

interface LinePickerPageProps {
  onPick: (routeId: string) => void;
  onBack: () => void;
}

function LineListItem({
  route,
  index,
  onPick,
}: {
  route: Route;
  index: number;
  onPick: () => void;
}) {
  const bullet = getRouteBulletMeta(route, index);

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
        padding: '0.625rem 0.75rem',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        lineHeight: 1.35,
        color: 'var(--foreground, #111827)',
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
