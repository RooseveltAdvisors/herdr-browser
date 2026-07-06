import { expect, test } from "bun:test";

import {
  configuredGraphicsTransport,
  DEFAULT_GRAPHICS_TRANSPORT,
} from "./graphicsTransport";

test("graphics transport defaults to the Herdr stream", () => {
  expect(configuredGraphicsTransport({})).toBe(DEFAULT_GRAPHICS_TRANSPORT);
  expect(configuredGraphicsTransport({ HERDR_BROWSER_TRANSPORT: "invalid" })).toBe(
    DEFAULT_GRAPHICS_TRANSPORT,
  );
});

test("graphics transport enables the direct Kitty diagnostic path", () => {
  expect(configuredGraphicsTransport({
    HERDR_BROWSER_TRANSPORT: "direct-kitty",
  })).toBe("direct-kitty");
});
