import { expect, test } from "bun:test";

import { hasChromeExited } from "./chrome";

test("signal-terminated Chrome is already exited", () => {
  expect(hasChromeExited({ exitCode: null, signalCode: "SIGTERM" })).toBe(true);
  expect(hasChromeExited({ exitCode: 0, signalCode: null })).toBe(true);
  expect(hasChromeExited({ exitCode: null, signalCode: null })).toBe(false);
});
