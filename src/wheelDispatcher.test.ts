import { expect, test } from "bun:test";

import { WheelDispatcher, type WheelInput } from "./wheelDispatcher";

test("wheel dispatcher bounds backlog to one coalesced pending event", async () => {
  const clock = new FakeClock();
  const calls: WheelInput[] = [];
  let releaseFirst: (() => void) | null = null;
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const dispatcher = new WheelDispatcher(async (wheel) => {
    calls.push(wheel);
    if (calls.length === 1) {
      await first;
    }
  }, { clock });

  dispatcher.queue([wheel(0, 120)]);
  dispatcher.queue(Array.from({ length: 20 }, () => wheel(0, 120)));
  expect(calls).toEqual([wheel(0, 120)]);

  releaseFirst!();
  await tick();
  expect(clock.delays).toEqual([16]);

  clock.advance(16);
  await tick();
  expect(calls).toEqual([
    wheel(0, 120),
    wheel(0, 480),
  ]);
});

test("wheel dispatcher coalesces along the locked axis and keeps the latest pointer position", async () => {
  const calls: WheelInput[] = [];
  const dispatcher = new WheelDispatcher(async (wheel) => {
    calls.push(wheel);
  });

  dispatcher.queue([
    { x: 10, y: 20, deltaX: 0, deltaY: -120 },
    { x: 30, y: 40, deltaX: 0, deltaY: -120 },
  ]);
  await tick();

  expect(calls).toEqual([
    { x: 30, y: 40, deltaX: 0, deltaY: -240 },
  ]);
});

test("wheel dispatcher drops stray sideways notches during a vertical gesture", async () => {
  const clock = new FakeClock();
  const calls: WheelInput[] = [];
  const dispatcher = new WheelDispatcher(async (wheel) => {
    calls.push(wheel);
  }, { clock });

  dispatcher.queue([wheel(0, -120)]);
  await tick();
  clock.advance(16);
  dispatcher.queue([wheel(120, 0)]);
  await tick();
  clock.advance(16);
  await tick();

  expect(calls).toEqual([wheel(0, -120)]);
});

test("wheel dispatcher re-locks to the other axis after the gesture goes idle", async () => {
  const clock = new FakeClock();
  const calls: WheelInput[] = [];
  const dispatcher = new WheelDispatcher(async (wheel) => {
    calls.push(wheel);
  }, { clock });

  dispatcher.queue([wheel(0, -120)]);
  await tick();
  clock.advance(200);
  dispatcher.queue([wheel(120, 0)]);
  await tick();

  expect(calls).toEqual([
    wheel(0, -120),
    wheel(120, 0),
  ]);
});

test("wheel dispatcher drops a lone reversed notch during an active gesture", async () => {
  const clock = new FakeClock();
  const calls: WheelInput[] = [];
  const dispatcher = new WheelDispatcher(async (event) => {
    calls.push(event);
  }, { clock });

  dispatcher.queue([wheel(0, -120)]);
  await tick();
  clock.advance(16);
  dispatcher.queue([wheel(0, 120)]);
  await tick();
  clock.advance(16);
  await tick();

  expect(calls).toEqual([wheel(0, -120)]);
});

test("wheel dispatcher accepts a sustained reversal on its second notch", async () => {
  const clock = new FakeClock();
  const calls: WheelInput[] = [];
  const dispatcher = new WheelDispatcher(async (event) => {
    calls.push(event);
  }, { clock });

  dispatcher.queue([wheel(0, -120)]);
  await tick();
  clock.advance(16);
  dispatcher.queue([wheel(0, 120), wheel(0, 120)]);
  await tick();
  clock.advance(16);
  await tick();

  expect(calls).toEqual([wheel(0, -120), wheel(0, 120)]);
});

test("wheel dispatcher accepts a reversal immediately after an idle gap", async () => {
  const clock = new FakeClock();
  const calls: WheelInput[] = [];
  const dispatcher = new WheelDispatcher(async (event) => {
    calls.push(event);
  }, { clock });

  dispatcher.queue([wheel(0, -120)]);
  await tick();
  clock.advance(200);
  dispatcher.queue([wheel(0, 120)]);
  await tick();

  expect(calls).toEqual([wheel(0, -120), wheel(0, 120)]);
});

test("wheel dispatcher replaces saturated momentum on direction reversal", async () => {
  const clock = new FakeClock();
  const calls: WheelInput[] = [];
  let releaseFirst: (() => void) | null = null;
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const dispatcher = new WheelDispatcher(async (event) => {
    calls.push(event);
    if (calls.length === 1) {
      await first;
    }
  }, { clock });

  dispatcher.queue([wheel(0, 120)]);
  dispatcher.queue(Array.from({ length: 20 }, () => wheel(0, 120)));
  // A deliberate reversal delivers a burst; the first notch is gated as a
  // possible momentum straggler and the second confirms the new direction.
  dispatcher.queue([wheel(0, -120), wheel(0, -120)]);
  releaseFirst!();
  await tick();
  clock.advance(16);
  await tick();

  expect(calls).toEqual([
    wheel(0, 120),
    wheel(0, -120),
  ]);
});

test("wheel dispatcher runs post-dispatch work before sending pending input", async () => {
  const clock = new FakeClock();
  const order: string[] = [];
  let finishRender: (() => void) | null = null;
  const render = new Promise<void>((resolve) => {
    finishRender = resolve;
  });
  const dispatcher = new WheelDispatcher(async (event) => {
    order.push(`wheel:${event.deltaY}`);
  }, {
    clock,
    afterDispatch: async () => {
      order.push("render:start");
      await render;
      order.push("render:end");
    },
  });

  dispatcher.queue([wheel(0, 120)]);
  dispatcher.queue([wheel(0, 120)]);
  await tick();
  expect(order).toEqual(["wheel:120", "render:start"]);

  finishRender!();
  await tick();
  expect(order).toEqual([
    "wheel:120",
    "render:start",
    "render:end",
  ]);

  clock.advance(16);
  await tick();
  expect(order).toEqual([
    "wheel:120",
    "render:start",
    "render:end",
    "wheel:120",
    "render:start",
    "render:end",
  ]);
});

test("stopping the wheel dispatcher discards pending momentum", async () => {
  const clock = new FakeClock();
  const calls: WheelInput[] = [];
  const dispatcher = new WheelDispatcher(async (wheel) => {
    calls.push(wheel);
  }, { clock });

  dispatcher.queue([wheel(0, 120)]);
  await tick();
  dispatcher.queue([wheel(0, 120)]);
  dispatcher.stop();
  clock.advance(16);
  await tick();

  expect(calls).toEqual([wheel(0, 120)]);
});

test("stopping during dispatch suppresses post-dispatch work", async () => {
  let releaseDispatch: (() => void) | null = null;
  const dispatch = new Promise<void>((resolve) => {
    releaseDispatch = resolve;
  });
  let postDispatches = 0;
  const dispatcher = new WheelDispatcher(async () => {
    await dispatch;
  }, {
    afterDispatch: () => {
      postDispatches += 1;
    },
  });

  dispatcher.queue([wheel(0, 120)]);
  dispatcher.stop();
  releaseDispatch!();
  await tick();

  expect(postDispatches).toBe(0);
});

function wheel(deltaX: number, deltaY: number): WheelInput {
  return { x: 10, y: 20, deltaX, deltaY };
}

class FakeClock {
  private nowMs = 0;
  private timers: Array<{
    callback: () => void;
    dueAt: number;
    handle: ReturnType<typeof setTimeout>;
  }> = [];
  readonly delays: number[] = [];

  now = (): number => this.nowMs;

  setTimer = (callback: () => void, delayMs: number): ReturnType<typeof setTimeout> => {
    this.delays.push(delayMs);
    const handle = { callback } as unknown as ReturnType<typeof setTimeout>;
    this.timers.push({ callback, dueAt: this.nowMs + delayMs, handle });
    return handle;
  };

  clearTimer = (timer: ReturnType<typeof setTimeout>): void => {
    this.timers = this.timers.filter((candidate) => candidate.handle !== timer);
  };

  advance(ms: number): void {
    this.nowMs += ms;
    const due = this.timers.filter((timer) => timer.dueAt <= this.nowMs);
    this.timers = this.timers.filter((timer) => timer.dueAt > this.nowMs);
    for (const timer of due) {
      timer.callback();
    }
  }
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
