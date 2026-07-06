export type GraphicsTransport = "herdr-stream" | "direct-kitty";

export const DEFAULT_GRAPHICS_TRANSPORT: GraphicsTransport = "herdr-stream";

export function configuredGraphicsTransport(
  env: NodeJS.ProcessEnv = process.env,
): GraphicsTransport {
  return env.HERDR_BROWSER_TRANSPORT === "direct-kitty"
    ? "direct-kitty"
    : DEFAULT_GRAPHICS_TRANSPORT;
}
