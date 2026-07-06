import { expect, test } from "bun:test";

import { SerialQueue } from "./serialQueue";

test("SerialQueue runs async tasks without interleaving", async () => {
  const queue = new SerialQueue();
  const events: string[] = [];

  await Promise.all([
    queue.run(async () => {
      events.push("press-1");
      await Promise.resolve();
      events.push("release-1");
    }),
    queue.run(async () => {
      events.push("press-2");
      await Promise.resolve();
      events.push("release-2");
    }),
  ]);

  expect(events).toEqual(["press-1", "release-1", "press-2", "release-2"]);
});

test("independent SerialQueue instances never block each other", async () => {
  // Mirrors the daemon's per-view queue split: input (mouse/wheel/key) gets
  // its own queue so it never waits behind a slow capture/status task
  // running on a different queue for the same view.
  const capture = new SerialQueue();
  const input = new SerialQueue();
  const events: string[] = [];
  let releaseCapture: () => void = () => {};
  const slowCapture = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });

  const captureTask = capture.run(async () => {
    events.push("capture-start");
    await slowCapture;
    events.push("capture-end");
  });
  const inputTask = input.run(async () => {
    events.push("input-start");
    events.push("input-end");
  });

  await inputTask;
  expect(events).toEqual(["capture-start", "input-start", "input-end"]);

  releaseCapture();
  await captureTask;
  expect(events).toEqual(["capture-start", "input-start", "input-end", "capture-end"]);
});

test("SerialQueue reports queued and running work as busy", async () => {
  const queue = new SerialQueue();
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const running = queue.run(async () => await blocked);
  expect(queue.busy).toBe(true);
  release();
  await running;
  expect(queue.busy).toBe(false);
});
