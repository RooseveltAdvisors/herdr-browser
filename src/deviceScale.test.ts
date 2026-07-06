import { expect, test } from "bun:test";

import { configuredDeviceScaleFactor } from "./deviceScale";

test("configuredDeviceScaleFactor accepts valid numeric env values", () => {
  expect(configuredDeviceScaleFactor({
    HERDR_BROWSER_DEVICE_SCALE_FACTOR: "1.5",
  })).toBe(1.5);
});

test("configuredDeviceScaleFactor rejects malformed env values", () => {
  expect(configuredDeviceScaleFactor({
    HERDR_BROWSER_DEVICE_SCALE_FACTOR: "2x",
  })).toBe(1);
});

test("configuredDeviceScaleFactor rejects out of range env values", () => {
  expect(configuredDeviceScaleFactor({
    HERDR_BROWSER_DEVICE_SCALE_FACTOR: "4",
  })).toBe(1);
});
