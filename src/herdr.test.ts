import { expect, test } from "bun:test";

import { normalizeConfig } from "./config";
import { browserPaneArgs } from "./herdr";

test("browser pane receives configured screencast cadence", () => {
  const args = browserPaneArgs(normalizeConfig({
    captureBackend: "screencast",
    screencastEveryNthFrame: 2,
    profileRoot: "/tmp/herdr-browser-profiles",
  }), "view-1");

  expect(args).toContain("HERDR_BROWSER_SCREENCAST_EVERY_NTH_FRAME=2");
  expect(args).toContain("HERDR_BROWSER_PROFILE_ROOT=/tmp/herdr-browser-profiles");
  expect(args).toContain("HERDR_BROWSER_VIEW_ID=view-1");
});
