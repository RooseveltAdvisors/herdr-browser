import { expect, test } from "bun:test";

import {
  configuredScreencastEveryNthFrame,
  validScreencastEveryNthFrame,
} from "./screencastCadence";

test("screencast cadence accepts only benchmark variants", () => {
  expect(validScreencastEveryNthFrame(1)).toBe(true);
  expect(validScreencastEveryNthFrame(2)).toBe(true);
  expect(validScreencastEveryNthFrame(0)).toBe(false);
  expect(validScreencastEveryNthFrame(3)).toBe(false);
  expect(validScreencastEveryNthFrame(1.5)).toBe(false);
});

test("configured screencast cadence defaults safely", () => {
  expect(configuredScreencastEveryNthFrame({})).toBe(1);
  expect(configuredScreencastEveryNthFrame({
    HERDR_BROWSER_SCREENCAST_EVERY_NTH_FRAME: "2",
  })).toBe(2);
  expect(configuredScreencastEveryNthFrame({
    HERDR_BROWSER_SCREENCAST_EVERY_NTH_FRAME: "1.5",
  })).toBe(1);
  expect(configuredScreencastEveryNthFrame({
    HERDR_BROWSER_SCREENCAST_EVERY_NTH_FRAME: "invalid",
  })).toBe(1);
});
