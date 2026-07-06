export const DEFAULT_SCREENCAST_POLL_MS = 250;
const MIN_SCREENCAST_POLL_MS = 50;
const MAX_SCREENCAST_POLL_MS = 5_000;

export function validScreencastPollMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_SCREENCAST_POLL_MS &&
    value <= MAX_SCREENCAST_POLL_MS
  );
}

export function configuredScreencastPollMs(): number {
  const raw = Number.parseInt(process.env.HERDR_BROWSER_SCREENCAST_POLL_MS ?? "", 10);
  return validScreencastPollMs(raw)
    ? raw
    : DEFAULT_SCREENCAST_POLL_MS;
}
