import { expect, test } from "bun:test";

import {
  configuredCaptureScale,
  scaledCaptureSize,
  validCaptureScale,
} from "./captureBackend";

test("capture scale defaults safely and accepts bounded values", () => {
  expect(configuredCaptureScale({})).toBe(1);
  expect(configuredCaptureScale({ HERDR_BROWSER_CAPTURE_SCALE: "0.5" })).toBe(0.5);
  expect(configuredCaptureScale({ HERDR_BROWSER_CAPTURE_SCALE: "0" })).toBe(1);
  expect(configuredCaptureScale({ HERDR_BROWSER_CAPTURE_SCALE: "2" })).toBe(1);
  expect(validCaptureScale(0.1)).toBe(true);
  expect(validCaptureScale(1)).toBe(true);
});

test("capture scale reduces raster bounds without changing viewport inputs", () => {
  expect(scaledCaptureSize(1068, 1188, 0.5)).toEqual({
    maxWidth: 534,
    maxHeight: 594,
  });
  expect(scaledCaptureSize(1068, 1188, 1)).toBeNull();
});
