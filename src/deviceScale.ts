export const DEFAULT_DEVICE_SCALE_FACTOR = 1;
export const MIN_DEVICE_SCALE_FACTOR = 0.25;
export const MAX_DEVICE_SCALE_FACTOR = 3;

export function configuredDeviceScaleFactor(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.HERDR_BROWSER_DEVICE_SCALE_FACTOR?.trim();
  if (!raw) {
    return DEFAULT_DEVICE_SCALE_FACTOR;
  }
  const value = Number(raw);
  if (!validDeviceScaleFactor(value)) {
    return DEFAULT_DEVICE_SCALE_FACTOR;
  }
  return value;
}

export function validDeviceScaleFactor(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_DEVICE_SCALE_FACTOR &&
    value <= MAX_DEVICE_SCALE_FACTOR
  );
}
