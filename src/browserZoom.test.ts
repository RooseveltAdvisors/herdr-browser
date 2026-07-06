import { expect, test } from "bun:test";

import {
  nextBrowserZoom,
  validBrowserZoom,
  viewportGeometry,
} from "./browserZoom";

test("browser zoom accepts bounded numeric values", () => {
  expect(validBrowserZoom(0.5)).toBe(true);
  expect(validBrowserZoom(1.35)).toBe(true);
  expect(validBrowserZoom(2.5)).toBe(true);
  expect(validBrowserZoom("1.5")).toBe(false);
  expect(validBrowserZoom(3)).toBe(false);
});

test("zoom controls move arbitrary values to adjacent ten-percent steps", () => {
  expect(nextBrowserZoom(1.35, "in")).toBe(1.4);
  expect(nextBrowserZoom(1.35, "out")).toBe(1.3);
  expect(nextBrowserZoom(1.4, "in")).toBe(1.5);
  expect(nextBrowserZoom(1.4, "out")).toBe(1.3);
});

test("zoom controls stop at configured bounds", () => {
  expect(nextBrowserZoom(2.5, "in")).toBe(2.5);
  expect(nextBrowserZoom(0.5, "out")).toBe(0.5);
});

test("viewport geometry separates visual coordinates from physical raster size", () => {
  expect(viewportGeometry(1200, 900, 1.5)).toEqual({
    width: 800,
    height: 600,
    rasterWidth: 1200,
    rasterHeight: 900,
    browserZoom: 1.5,
  });
});
