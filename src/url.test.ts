import { expect, test } from "bun:test";

import { isLocalhostHttpUrl } from "./url";

test("isLocalhostHttpUrl accepts local dev HTTP URLs", () => {
  expect(isLocalhostHttpUrl("http://localhost:5173")).toBe(true);
  expect(isLocalhostHttpUrl("http://localhost:5173?x=1")).toBe(true);
  expect(isLocalhostHttpUrl("http://localhost:5173#top")).toBe(true);
  expect(isLocalhostHttpUrl("https://127.0.0.1:3000/path?q=1")).toBe(true);
  expect(isLocalhostHttpUrl("http://[::1]:8080/")).toBe(true);
});

test("isLocalhostHttpUrl rejects non-localhost URLs", () => {
  expect(isLocalhostHttpUrl("https://example.com")).toBe(false);
  expect(isLocalhostHttpUrl("file:///tmp/index.html")).toBe(false);
  expect(isLocalhostHttpUrl("http://192.168.1.20:3000")).toBe(false);
});
