/** Seeking-phase UI preferences — persist across picker navigation and remounts. */

let lineHighlightEnabled = false;
let linePickerRouteId: string | null = null;
let autoZoomValidRegionEnabled = true;

export function getSeekingLineHighlightEnabled(): boolean {
  return lineHighlightEnabled;
}

export function setSeekingLineHighlightEnabled(enabled: boolean): void {
  lineHighlightEnabled = enabled;
  if (!enabled) linePickerRouteId = null;
}

export function getLinePickerRouteId(): string | null {
  return linePickerRouteId;
}

export function setLinePickerRouteId(routeId: string | null): void {
  linePickerRouteId = routeId;
}

export function getAutoZoomValidRegionEnabled(): boolean {
  return autoZoomValidRegionEnabled;
}

export function setAutoZoomValidRegionEnabled(enabled: boolean): void {
  autoZoomValidRegionEnabled = enabled;
}
