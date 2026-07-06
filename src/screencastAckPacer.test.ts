import { expect, test } from "bun:test";

import {
  ScreencastAckPacer,
  type ScreencastCapacityGate,
} from "./screencastAckPacer";

const POLICY = {
  passiveFps: 10,
  interactiveFps: 20,
  interactionBoostMs: 200,
};

test("paces acknowledgements at the passive frame rate", () => {
  const clock = new FakeClock();
  const pacer = new ScreencastAckPacer(POLICY, clock);
  const acknowledgedAt: number[] = [];

  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  pacer.enqueue(() => acknowledgedAt.push(clock.now()));

  expect(acknowledgedAt).toEqual([0]);
  clock.advance(99);
  expect(acknowledgedAt).toEqual([0]);
  clock.advance(1);
  expect(acknowledgedAt).toEqual([0, 100]);
  clock.advance(100);
  expect(acknowledgedAt).toEqual([0, 100, 200]);
});

test("temporarily boosts acknowledgement cadence after interaction", () => {
  const clock = new FakeClock();
  const pacer = new ScreencastAckPacer(POLICY, clock);
  const acknowledgedAt: number[] = [];

  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  pacer.boost();

  clock.advance(49);
  expect(acknowledgedAt).toEqual([0]);
  clock.advance(1);
  expect(acknowledgedAt).toEqual([0, 50]);
});

test("flush acknowledges queued frames and cancels pacing", () => {
  const clock = new FakeClock();
  const pacer = new ScreencastAckPacer(POLICY, clock);
  const acknowledgedAt: number[] = [];

  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  clock.advance(25);
  pacer.flush();

  expect(acknowledgedAt).toEqual([0, 25, 25]);
  clock.advance(500);
  expect(acknowledgedAt).toEqual([0, 25, 25]);
});

test("holds the ack while the capacity gate is saturated, then releases it immediately on drain", () => {
  const clock = new FakeClock();
  const pacer = new ScreencastAckPacer(POLICY, clock);
  const gate = new FakeCapacityGate(true);
  pacer.setCapacityGate(gate);
  const acknowledgedAt: number[] = [];

  pacer.enqueue(() => acknowledgedAt.push(clock.now()));

  // Would normally ack right away (nothing queued before it), but the
  // downstream consumer is saturated.
  clock.advance(500);
  expect(acknowledgedAt).toEqual([]);

  gate.drain();
  // Released as soon as capacity frees up, without waiting for a timer tick.
  expect(acknowledgedAt).toEqual([500]);
});

test("capacity gating only stretches the ack interval, never shortens the fps ceiling", () => {
  const clock = new FakeClock();
  const pacer = new ScreencastAckPacer(POLICY, clock);
  const gate = new FakeCapacityGate(true);
  pacer.setCapacityGate(gate);
  const acknowledgedAt: number[] = [];

  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  pacer.enqueue(() => acknowledgedAt.push(clock.now()));

  clock.advance(40);
  gate.drain();
  expect(acknowledgedAt).toEqual([40]);

  // Second ack still has to wait out the passive fps interval from the
  // first real ack, even though the gate is no longer saturated.
  clock.advance(99);
  expect(acknowledgedAt).toEqual([40]);
  clock.advance(1);
  expect(acknowledgedAt).toEqual([40, 140]);
});

test("detaching the capacity gate releases a held ack instead of deadlocking", () => {
  const clock = new FakeClock();
  const pacer = new ScreencastAckPacer(POLICY, clock);
  const gate = new FakeCapacityGate(true);
  pacer.setCapacityGate(gate);
  const acknowledgedAt: number[] = [];

  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  clock.advance(500);
  expect(acknowledgedAt).toEqual([]);
  expect(gate.listenerCount).toBe(1);

  // Stream torn down (e.g. socket error) while still saturated: clearing
  // the gate must release the ack rather than wait on a drain that will
  // never come, and must not leak the drain subscription.
  pacer.setCapacityGate(null);
  expect(acknowledgedAt).toEqual([500]);
  expect(gate.listenerCount).toBe(0);
});

test("flush releases a held ack immediately and unsubscribes from the capacity gate", () => {
  const clock = new FakeClock();
  const pacer = new ScreencastAckPacer(POLICY, clock);
  const gate = new FakeCapacityGate(true);
  pacer.setCapacityGate(gate);
  const acknowledgedAt: number[] = [];

  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  clock.advance(25);
  expect(acknowledgedAt).toEqual([]);

  pacer.flush();

  expect(acknowledgedAt).toEqual([25, 25]);
  expect(gate.listenerCount).toBe(0);
});

test("an unsaturated capacity gate does not alter normal pacing", () => {
  const clock = new FakeClock();
  const pacer = new ScreencastAckPacer(POLICY, clock);
  const gate = new FakeCapacityGate(false);
  pacer.setCapacityGate(gate);
  const acknowledgedAt: number[] = [];

  pacer.enqueue(() => acknowledgedAt.push(clock.now()));
  pacer.enqueue(() => acknowledgedAt.push(clock.now()));

  expect(acknowledgedAt).toEqual([0]);
  clock.advance(100);
  expect(acknowledgedAt).toEqual([0, 100]);
});

class FakeCapacityGate implements ScreencastCapacityGate {
  private saturated: boolean;
  private readonly listeners = new Set<() => void>();

  constructor(saturated: boolean) {
    this.saturated = saturated;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  isSaturated = (): boolean => this.saturated;

  onDrain = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  drain(): void {
    this.saturated = false;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

class FakeClock {
  private current = 0;
  private nextTimer = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  now = (): number => this.current;

  setTimer = (callback: () => void, delayMs: number): ReturnType<typeof setTimeout> => {
    const timer = this.nextTimer++;
    this.timers.set(timer, {
      at: this.current + delayMs,
      callback,
    });
    return timer as unknown as ReturnType<typeof setTimeout>;
  };

  clearTimer = (timer: ReturnType<typeof setTimeout>): void => {
    this.timers.delete(timer as unknown as number);
  };

  advance(ms: number): void {
    const target = this.current + ms;
    while (true) {
      const next = [...this.timers]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!next) {
        break;
      }
      const [id, timer] = next;
      this.timers.delete(id);
      this.current = timer.at;
      timer.callback();
    }
    this.current = target;
  }
}
