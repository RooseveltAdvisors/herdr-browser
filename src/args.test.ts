import { expect, test } from "bun:test";

import { parseArgs } from "./args";

test("parseArgs returns help by default", () => {
  expect(parseArgs([])).toEqual({
    command: "help",
    positionals: [],
    output: undefined,
    view: undefined,
  });
});

test("parseArgs separates output from positionals", () => {
  expect(parseArgs(["screenshot", "http://localhost:5173", "--output", "page.png"])).toEqual({
    command: "screenshot",
    positionals: ["http://localhost:5173"],
    output: "page.png",
    view: undefined,
  });
});

test("parseArgs supports short output flag", () => {
  expect(parseArgs(["smoke", "-o", "page.png"])).toEqual({
    command: "smoke",
    positionals: [],
    output: "page.png",
    view: undefined,
  });
});

test("parseArgs separates a browser view from positionals", () => {
  expect(parseArgs(["connect", "--view", "view-1"])).toEqual({
    command: "connect",
    positionals: [],
    output: undefined,
    view: "view-1",
  });
});
