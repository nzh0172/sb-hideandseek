/**
 * Hide and Seek Mod
 * Single-player vs bot: player picks start station, bot hides on schedule.
 */

import { tickHideTimer, validateSessionIntegrity } from './game/controller';
import { getSession } from './game/session';
import { initDeductionMapOverlay } from './game/mapOverlay';
import { HideAndSeekPanel } from './ui/HideAndSeekPanel';

const MOD_ID = 'com.naz.hide-and-seek';
const MOD_VERSION = '1.0.0';
const TAG = '[HideAndSeek]';

const api = window.SubwayBuilderAPI;

if (!api) {
  console.error(`${TAG} SubwayBuilderAPI not found!`);
} else {
  console.log(`${TAG} v${MOD_VERSION} | API v${api.version}`);

  let initialized = false;
  let timerId: ReturnType<typeof setInterval> | null = null;

  function startTimer(): void {
    if (timerId) return;
    timerId = setInterval(() => {
      const phase = getSession().phase;
      if (phase === 'hiding') tickHideTimer();
      if (phase === 'seeking' || phase === 'hiding') validateSessionIntegrity();
    }, 500);
  }

  function stopTimer(): void {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function bootstrap(map: Parameters<Parameters<typeof api.hooks.onMapReady>[0]>[0]): void {
    if (initialized) return;
    initialized = true;

    try {
      initDeductionMapOverlay(map);

      api.ui.addFloatingPanel({
        id: 'hide-and-seek-panel',
        title: 'Hide and Seek',
        icon: 'Eye',
        render: HideAndSeekPanel,
      });

      startTimer();

      api.hooks.onGameEnd(() => {
        stopTimer();
      });

      api.hooks.onStationDeleted(() => validateSessionIntegrity());

      console.log(`${TAG} Initialized successfully.`);
    } catch (err) {
      console.error(`${TAG} Failed to initialize:`, err);
      api.ui.showNotification(`${MOD_ID} failed to load. Check console for details.`, 'error');
    }
  }

  api.hooks.onMapReady(bootstrap);

  const existingMap = api.utils.getMap();
  if (existingMap) {
    bootstrap(existingMap);
  }
}
