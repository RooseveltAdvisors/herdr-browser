export const DEFAULT_SCREENCAST_EVERY_NTH_FRAME = 1;

export function validScreencastEveryNthFrame(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2;
}

export function configuredScreencastEveryNthFrame(
  env: NodeJS.ProcessEnv = process.env,
): 1 | 2 {
  const value = Number(env.HERDR_BROWSER_SCREENCAST_EVERY_NTH_FRAME);
  return validScreencastEveryNthFrame(value)
    ? value
    : DEFAULT_SCREENCAST_EVERY_NTH_FRAME;
}
