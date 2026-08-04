---
name: herdr-browser
description: Connect browser automation tools to a Chromium view rendered inside a Herdr browser pane.
---

# Herdr Browser

Use this skill when the user wants Browser Use, PinchTab, Playwright, Chrome
DevTools MCP, or another CDP client to control the browser visible in Herdr.

Do not install `herdr-browser` globally. Discover the installed or linked plugin
root by running:

```bash
herdr plugin list --plugin official.browser --json
```

Read `result.plugins[0].plugin_root` from the JSON response. Run the CLI with
Bun from any working directory:

```bash
bun run "<plugin_root>/src/cli.ts"
```

The installed plugin root is authoritative for a live proof. Do not substitute
this checkout unless the task explicitly links it into the intended Herdr
session.

List live browser views before connecting:

```bash
bun run "<plugin_root>/src/cli.ts" views
```

Select the intended view from its `view_id`, `pane_id`, URL, title, and tabs.
Never guess when more than one view is present. Connect with:

```bash
bun run "<plugin_root>/src/cli.ts" connect --view <view_id>
```

The response contains a view-scoped `cdp_http_url`, `browser_ws_url`, and the
currently active target. Use the browser-level endpoint so the automation tool
can create, inspect, select, and close multiple tabs in that view.

Standard CDP `Target.createTarget`, `Target.activateTarget`,
`Page.bringToFront`, and `Target.closeTarget` operations synchronize with the
Herdr tab strip and rendered target. A tool that changes only its own internal
selected-page state must also bring that page to front; local tool state is not
observable through CDP.

Tool bootstrap:

- Browser Use: set `BU_CDP_URL` to `cdp_http_url` or `BU_CDP_WS` to
  `browser_ws_url`.
- PinchTab: enable its external attach policy, then attach a bridge to
  `browser_ws_url` or `cdp_http_url`.
- Playwright: call `chromium.connectOverCDP(cdp_http_url)`.
- Playwright MCP: pass `--cdp-endpoint=<cdp_http_url>`.
- Chrome DevTools MCP: pass `--browser-url=<cdp_http_url>`.

For `chrome-devtools-axi`, keep the endpoint in a shell variable and point the
client at it without printing it:

```bash
connect=$(bun run "<plugin_root>/src/cli.ts" connect --view "$VIEW_ID")
export HERDR_BROWSER_CDP_HTTP_URL=$(printf '%s' "$connect" | jq -r '.cdp_http_url')
export CHROME_DEVTOOLS_AXI_BROWSER_URL="$HERDR_BROWSER_CDP_HTTP_URL"
chrome-devtools-axi snapshot
```

The endpoint must be loopback-only and view-scoped. Close the automation client
when finished; do not send `Browser.close` or stop the plugin daemon, because
Herdr Browser owns Chromium. Closing the visible pane is the lifecycle action
that ends the view.

For the repository's local fixture commands and persistence proof, follow the
README's [Hermetic E2E Proof](../../README.md#hermetic-e2e-proof). The script
exercises DOM inspection, CDP mouse click, key input, form submission,
screenshot capture, and synthetic cookie/localStorage seeding. `pane send-text`
and `pane send-keys` exercise pane-native keyboard forwarding; physical pointer
movement in the graphics surface remains manual-only.

Profiles are dedicated and session-isolated by default. Do not use a normal
Chrome profile or share an explicit `profileRoot` between sessions; the README's
[Profiles](../../README.md#profiles) section owns path, persistence, and
permission details.

Profiles, cookies, localStorage, CDP endpoints, and login state are sensitive:
never commit or print them, and never place them in logs, reports, the vault, or
chat.

Herdr Browser owns Chromium lifecycle. Closing a connected automation client
disconnects it from the gateway without terminating Chromium. Closing the Herdr
browser pane closes its view and gateway.
