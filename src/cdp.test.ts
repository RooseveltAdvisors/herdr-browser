import { afterEach, expect, test } from "bun:test";

import { CdpClient } from "./cdp";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

test("intentional close notifies onClose listeners with no error", async () => {
  const server = fakeWebSocketServer();
  cleanups.push(() => server.stop(true));
  const client = await CdpClient.connect(`ws://127.0.0.1:${server.port}`);

  const events: Array<Error | null> = [];
  client.onClose((error) => events.push(error));

  client.close();
  client.close();
  await tick();

  expect(events).toEqual([null]);
});

test("unexpected server-side close notifies onClose with an error and rejects in-flight commands", async () => {
  const server = fakeWebSocketServer();
  const client = await CdpClient.connect(`ws://127.0.0.1:${server.port}`);
  cleanups.push(() => client.close());

  const events: Array<Error | null> = [];
  client.onClose((error) => events.push(error));
  const pending = client.send("Never.responds");

  server.stop(true);
  await expect(pending).rejects.toThrow("CDP WebSocket closed");
  await tick();

  expect(events).toHaveLength(1);
  expect(events[0]).toBeInstanceOf(Error);
});

test("onClose listeners can unsubscribe before an intentional close", async () => {
  const server = fakeWebSocketServer();
  cleanups.push(() => server.stop(true));
  const client = await CdpClient.connect(`ws://127.0.0.1:${server.port}`);

  const events: Array<Error | null> = [];
  const unsubscribe = client.onClose((error) => events.push(error));
  unsubscribe();

  client.close();
  await tick();

  expect(events).toEqual([]);
});

function fakeWebSocketServer() {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, srv) {
      if (request.headers.get("upgrade") === "websocket" && srv.upgrade(request)) {
        return;
      }
      return new Response("not found", { status: 404 });
    },
    websocket: {
      message() {
        // No responses are needed for these lifecycle tests.
      },
    },
  });
  return {
    port: server.port,
    stop: (force?: boolean) => server.stop(force),
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}
