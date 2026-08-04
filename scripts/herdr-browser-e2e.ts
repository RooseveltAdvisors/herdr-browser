#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type CdpMessage = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

type CdpTarget = {
  id: string;
  type: string;
  url: string;
  active?: boolean;
  webSocketDebuggerUrl?: string;
};

class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: CdpMessage) => void;
    reject: (error: Error) => void;
  }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id === undefined) {
        return;
      }
      const request = this.pending.get(message.id);
      if (!request) {
        return;
      }
      this.pending.delete(message.id);
      request.resolve(message);
    });
    socket.addEventListener("close", () => {
      const error = new Error("CDP connection closed");
      for (const request of this.pending.values()) {
        request.reject(error);
      }
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<CdpConnection> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveOpen, reject) => {
      socket.addEventListener("open", () => resolveOpen(), { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP WebSocket failed to open")), { once: true });
    });
    return new CdpConnection(socket);
  }

  async send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const message = await new Promise<CdpMessage>((resolveMessage, reject) => {
      this.pending.set(id, { resolve: resolveMessage, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    if (message.error) {
      throw new Error(`${method}: ${message.error.message ?? "CDP error"}`);
    }
    return message.result ?? {};
  }

  close(): void {
    this.socket.close();
  }
}

function cdpHttpUrl(): string {
  const value = process.env.HERDR_BROWSER_CDP_HTTP_URL?.trim();
  if (!value) {
    throw new Error("HERDR_BROWSER_CDP_HTTP_URL is required");
  }
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("CDP URL must be an HTTP loopback URL");
  }
  return value.replace(/\/$/, "");
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CDP HTTP ${response.status}: ${url.replace(/:\\d+/, ":<port>")}`);
  }
  return await response.json() as T;
}

async function evaluate(
  cdp: CdpConnection,
  sessionId: string,
  expression: string,
): Promise<unknown> {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  const exception = result.exceptionDetails as { text?: string } | undefined;
  if (exception) {
    throw new Error(`DOM evaluation failed: ${exception.text ?? "exception"}`);
  }
  return (result.result as { value?: unknown } | undefined)?.value;
}

async function waitFor(cdp: CdpConnection, sessionId: string, expression: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    if (await evaluate(cdp, sessionId, expression)) {
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error(`timed out waiting for fixture condition: ${expression}`);
}

async function click(cdp: CdpConnection, sessionId: string, selector: string): Promise<void> {
  const rect = await evaluate(cdp, sessionId, `(() => {
    const rect = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!rect || typeof rect !== "object") {
    throw new Error(`missing clickable fixture control: ${selector}`);
  }
  const point = rect as { x: number; y: number };
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }, sessionId);
}

async function typeInto(cdp: CdpConnection, sessionId: string, selector: string, text: string): Promise<void> {
  await evaluate(cdp, sessionId, `document.querySelector(${JSON.stringify(selector)})?.focus()`);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    modifiers: 2,
    windowsVirtualKeyCode: 65,
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 }, sessionId);
  await cdp.send("Input.insertText", { text }, sessionId);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "exercise";
  const http = cdpHttpUrl();
  const expectedOrigin = process.env.HERDR_BROWSER_E2E_ORIGIN?.trim() || "http://127.0.0.1:43127";
  const screenshotPath = resolve(process.env.HERDR_BROWSER_E2E_SCREENSHOT ?? ".herdr-browser/e2e.png");
  const targets = await json<CdpTarget[]>(`${http}/json/list`);
  const target = targets.find((candidate) => candidate.type === "page" && candidate.active) ?? targets.find((candidate) => candidate.type === "page");
  assert(target?.id, "view has no active page target");
  assert(target.url.startsWith(expectedOrigin), "active page is not the local fixture origin");
  const version = await json<{ webSocketDebuggerUrl?: string }>(`${http}/json/version`);
  assert(version.webSocketDebuggerUrl?.startsWith("ws://127.0.0.1:") || version.webSocketDebuggerUrl?.startsWith("ws://localhost:"), "CDP browser endpoint is not loopback");

  const cdp = await CdpConnection.connect(version.webSocketDebuggerUrl);
  try {
    await cdp.send("Target.activateTarget", { targetId: target.id });
    const attached = await cdp.send("Target.attachToTarget", { targetId: target.id, flatten: true });
    const sessionId = attached.sessionId as string | undefined;
    assert(sessionId, "CDP target attach returned no session");
    await cdp.send("Page.bringToFront", {}, sessionId);

    if (mode === "check-persistence") {
      await cdp.send("Page.navigate", { url: expectedOrigin }, sessionId);
      await waitFor(cdp, sessionId, `location.origin === ${JSON.stringify(expectedOrigin)}`);
      const persisted = await evaluate(cdp, sessionId, `({
        cookie: document.cookie.includes("herdr_e2e="),
        storage: localStorage.getItem("herdr_e2e") === "synthetic-persistence",
      })`);
      assert((persisted as { cookie?: boolean; storage?: boolean }).cookie, "synthetic test cookie did not persist");
      assert((persisted as { cookie?: boolean; storage?: boolean }).storage, "origin localStorage did not persist");
      console.log(JSON.stringify({ ok: true, mode, active_page: true, persistence: "cookie+localStorage" }));
      return;
    }

    await cdp.send("Page.navigate", { url: `${expectedOrigin}/e2e` }, sessionId);
    await waitFor(cdp, sessionId, `location.pathname === "/e2e" && document.querySelector("#agent-button") !== null`);
    const inspected = await evaluate(cdp, sessionId, `({
      title: document.title,
      heading: document.querySelector("h1")?.textContent,
      form: document.querySelector("#e2e-form") !== null,
    })`) as { title?: string; heading?: string; form?: boolean };
    assert(inspected.title === "Herdr Browser E2E Fixture", "fixture title/DOM inspection failed");
    assert(inspected.heading === "Herdr Browser E2E Fixture" && inspected.form, "fixture DOM inspection failed");
    await click(cdp, sessionId, "#agent-button");
    await waitFor(cdp, sessionId, `document.querySelector("#clicked")?.textContent === "clicked"`);
    await typeInto(cdp, sessionId, "#message-input", "synthetic-agent-input");
    await click(cdp, sessionId, "#submit-button");
    await waitFor(cdp, sessionId, `document.querySelector("#result")?.textContent === "submitted:synthetic-agent-input"`);
    await evaluate(cdp, sessionId, `document.cookie = "herdr_e2e=synthetic-cookie; Max-Age=86400; Path=/"; localStorage.setItem("herdr_e2e", "synthetic-persistence")`);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
    await mkdir(dirname(screenshotPath), { recursive: true });
    await Bun.write(screenshotPath, Buffer.from(screenshot.data as string, "base64"));
    const finalUrl = await evaluate(cdp, sessionId, "location.href");
    assert(finalUrl === `${expectedOrigin}/e2e`, "automation changed the active rendered target");
    console.log(JSON.stringify({
      ok: true,
      mode,
      render: "local fixture active in view",
      dom: "title+heading+form inspected",
      interaction: "CDP mouse click + key input + submit",
      persistence_seeded: true,
      screenshot: `saved:${dirname(screenshotPath)}/<fixture>.png`,
      active_page: true,
    }));
  } finally {
    cdp.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
