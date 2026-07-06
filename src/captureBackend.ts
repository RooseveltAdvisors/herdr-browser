export type CaptureBackend = "screenshot" | "screencast";

export type ScreencastCaptureSize = {
  maxWidth: number;
  maxHeight: number;
};

export const DEFAULT_CAPTURE_BACKEND: CaptureBackend = "screenshot";
export const DEFAULT_CAPTURE_SCALE = 1;
export const MIN_CAPTURE_SCALE = 0.1;
export const MAX_CAPTURE_SCALE = 1;

export function parseCaptureBackend(value: unknown): CaptureBackend {
  return value === "screencast" || value === "screenshot"
    ? value
    : DEFAULT_CAPTURE_BACKEND;
}

export function configuredCaptureBackend(): CaptureBackend {
  return parseCaptureBackend(process.env.HERDR_BROWSER_CAPTURE_BACKEND);
}

export function validCaptureScale(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_CAPTURE_SCALE &&
    value <= MAX_CAPTURE_SCALE
  );
}

export function configuredCaptureScale(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.HERDR_BROWSER_CAPTURE_SCALE);
  return validCaptureScale(value) ? value : DEFAULT_CAPTURE_SCALE;
}

export function scaledCaptureSize(
  width: number,
  height: number,
  scale: number,
): { maxWidth: number; maxHeight: number } | null {
  if (!validCaptureScale(scale) || scale === 1) {
    return null;
  }
  return {
    maxWidth: Math.max(1, Math.floor(width * scale)),
    maxHeight: Math.max(1, Math.floor(height * scale)),
  };
}
