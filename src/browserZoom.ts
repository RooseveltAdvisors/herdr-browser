export type ViewportGeometry = {
  width: number;
  height: number;
  rasterWidth: number;
  rasterHeight: number;
  browserZoom: number;
};

export const DEFAULT_BROWSER_ZOOM = 1;
export const MIN_BROWSER_ZOOM = 0.5;
export const MAX_BROWSER_ZOOM = 2.5;

export function validBrowserZoom(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_BROWSER_ZOOM &&
    value <= MAX_BROWSER_ZOOM
  );
}

export function nextBrowserZoom(current: number, direction: "in" | "out"): number {
  const offset = direction === "in" ? 0.0001 : -0.0001;
  const step = direction === "in"
    ? Math.ceil((current + offset) * 10) / 10
    : Math.floor((current + offset) * 10) / 10;
  return clampBrowserZoom(step);
}

export function viewportGeometry(
  rasterWidth: number,
  rasterHeight: number,
  browserZoom: number,
): ViewportGeometry {
  const normalizedZoom = validBrowserZoom(browserZoom)
    ? browserZoom
    : DEFAULT_BROWSER_ZOOM;
  return {
    width: Math.max(1, Math.round(rasterWidth / normalizedZoom)),
    height: Math.max(1, Math.round(rasterHeight / normalizedZoom)),
    rasterWidth: Math.max(1, Math.round(rasterWidth)),
    rasterHeight: Math.max(1, Math.round(rasterHeight)),
    browserZoom: normalizedZoom,
  };
}

function clampBrowserZoom(value: number): number {
  return Math.min(MAX_BROWSER_ZOOM, Math.max(MIN_BROWSER_ZOOM, value));
}
