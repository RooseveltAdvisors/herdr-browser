#!/usr/bin/env bun

import { closeView, createView, status } from "../daemonClient";
import { loadConfig } from "../config";
import { openBrowserPane } from "../herdr";
import { isLocalhostHttpUrl } from "../url";

type OpenLocalhostDependencies = {
  loadConfig: typeof loadConfig;
  createView: typeof createView;
  status: typeof status;
  openBrowserPane: typeof openBrowserPane;
  closeView: typeof closeView;
};

const dependencies: OpenLocalhostDependencies = {
  loadConfig,
  createView,
  status,
  openBrowserPane,
  closeView,
};

export async function runOpenLocalhost(
  url: string,
  deps: OpenLocalhostDependencies = dependencies,
): Promise<Record<string, unknown>> {
  if (!isLocalhostHttpUrl(url)) {
    throw new Error(`refusing non-localhost URL: ${url}`);
  }

  const config = await deps.loadConfig();
  const { viewId } = await deps.createView(url);
  const response = await deps.status();
  const pane = deps.openBrowserPane(config, viewId);
  if (pane.attempted && !pane.ok) {
    await deps.closeView(viewId);
    throw new Error(`opened browser page but failed to open Herdr pane: ${pane.stderr ?? pane.reason ?? "unknown error"}`);
  }
  return {
    ...response,
    mode: "daemon",
    pane,
  };
}

if (import.meta.main) {
  const url = process.env.HERDR_PLUGIN_CLICKED_URL;
  if (!url) {
    console.error("HERDR_PLUGIN_CLICKED_URL is required");
    process.exit(1);
  }
  runOpenLocalhost(url).then((response) => {
    console.log(JSON.stringify(response, null, 2));
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
