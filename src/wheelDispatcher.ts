export type WheelInput = {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
};

type Timer = ReturnType<typeof setTimeout>;

type Clock = {
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => Timer;
  clearTimer: (timer: Timer) => void;
};

type WheelDispatcherOptions = {
  clock?: Clock;
  onError?: (error: unknown) => void;
  afterDispatch?: () => Promise<unknown> | unknown;
};

const DISPATCH_INTERVAL_MS = 16;
const MAX_PENDING_DELTA = 480;
// SGR mouse reporting carries no magnitude, so a terminal turns a trackpad
// swipe into fixed-size notches. A mostly-vertical swipe still trips the
// terminal's horizontal accumulator occasionally, and that stray notch arrives
// as a full-sized sideways scroll. Lock to the axis a gesture starts on and
// treat a pause as the end of the gesture.
const GESTURE_IDLE_MS = 150;

const SYSTEM_CLOCK: Clock = {
  now: () => performance.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
};

export class WheelDispatcher {
  private readonly clock: Clock;
  private readonly onError: (error: unknown) => void;
  private readonly afterDispatch: () => Promise<unknown> | unknown;
  private pending: WheelInput | null = null;
  private timer: Timer | null = null;
  private inFlight = false;
  private lastSentAt: number | null = null;
  private stopped = false;
  private axis: "x" | "y" | null = null;
  private lastQueuedAt: number | null = null;
  private lastSign = 0;
  private reversalStreak = 0;

  constructor(
    private readonly dispatch: (wheel: WheelInput) => Promise<unknown>,
    options: WheelDispatcherOptions = {},
  ) {
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.onError = options.onError ?? (() => {});
    this.afterDispatch = options.afterDispatch ?? (() => {});
  }

  queue(wheels: WheelInput[]): void {
    if (this.stopped || wheels.length === 0) {
      return;
    }
    const locked = this.gateReversals(this.lockToDominantAxis(wheels));
    if (locked.length === 0) {
      return;
    }
    let pending = this.pending ?? { ...locked[0], deltaX: 0, deltaY: 0 };
    for (const wheel of locked) {
      pending = {
        x: wheel.x,
        y: wheel.y,
        deltaX: this.mergeAxis(pending.deltaX, wheel.deltaX),
        deltaY: this.mergeAxis(pending.deltaY, wheel.deltaY),
      };
    }
    // Opposite notches that cancel out leave nothing to send; dispatching the
    // zero would still cost a CDP round trip and a capture-rate boost.
    if (pending.deltaX === 0 && pending.deltaY === 0) {
      this.pending = null;
      return;
    }
    this.pending = pending;
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    this.pending = null;
    if (this.timer) {
      this.clock.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    if (this.stopped || this.inFlight || this.timer || !this.pending) {
      return;
    }
    const delayMs = this.lastSentAt === null
      ? 0
      : Math.max(0, this.lastSentAt + DISPATCH_INTERVAL_MS - this.clock.now());
    if (delayMs === 0) {
      void this.flush();
      return;
    }
    this.timer = this.clock.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  private async flush(): Promise<void> {
    if (this.stopped || this.inFlight || !this.pending) {
      return;
    }
    const wheel = this.pending;
    this.pending = null;
    this.inFlight = true;
    this.lastSentAt = this.clock.now();
    try {
      await this.dispatch(wheel);
      if (!this.stopped) {
        await this.afterDispatch();
      }
    } catch (error) {
      this.onError(error);
    } finally {
      this.inFlight = false;
      this.schedule();
    }
  }

  private clamp(value: number): number {
    return Math.max(-MAX_PENDING_DELTA, Math.min(MAX_PENDING_DELTA, value));
  }

  private lockToDominantAxis(wheels: WheelInput[]): WheelInput[] {
    const now = this.clock.now();
    if (this.lastQueuedAt !== null && now - this.lastQueuedAt > GESTURE_IDLE_MS) {
      this.axis = null;
      this.lastSign = 0;
      this.reversalStreak = 0;
    }

    if (this.axis === null) {
      let totalX = 0;
      let totalY = 0;
      for (const wheel of wheels) {
        totalX += Math.abs(wheel.deltaX);
        totalY += Math.abs(wheel.deltaY);
      }
      if (totalX === 0 && totalY === 0) {
        return [];
      }
      this.axis = totalY >= totalX ? "y" : "x";
    }

    const axis = this.axis;
    const locked: WheelInput[] = [];
    for (const wheel of wheels) {
      const next = axis === "y"
        ? { ...wheel, deltaX: 0 }
        : { ...wheel, deltaY: 0 };
      if (next.deltaX !== 0 || next.deltaY !== 0) {
        locked.push(next);
      }
    }
    // Only a surviving event extends the gesture, so a run of purely off-axis
    // notches lets the lock expire and the next one re-locks the other way.
    if (locked.length > 0) {
      this.lastQueuedAt = now;
    }
    return locked;
  }

  // A trackpad flick keeps delivering momentum notches for ~2s after the
  // fingers lift. When the next gesture starts before that tail is done, the
  // two streams interleave and lone opposite-direction notches land inside
  // the new gesture, visibly bouncing the page at scroll boundaries. A lone
  // reversed notch inside an active gesture is therefore dropped; a real
  // reversal confirms itself on the next notch (~16ms later, imperceptible),
  // and a reversal after an idle gap is a new gesture, accepted immediately.
  private gateReversals(wheels: WheelInput[]): WheelInput[] {
    const axis = this.axis;
    if (axis === null) {
      return wheels;
    }
    const accepted: WheelInput[] = [];
    for (const wheel of wheels) {
      const sign = Math.sign(axis === "y" ? wheel.deltaY : wheel.deltaX);
      if (sign === 0) {
        continue;
      }
      if (this.lastSign !== 0 && sign !== this.lastSign) {
        this.reversalStreak += 1;
        if (this.reversalStreak < 2) {
          continue;
        }
      }
      this.lastSign = sign;
      this.reversalStreak = 0;
      accepted.push(wheel);
    }
    return accepted;
  }

  private mergeAxis(current: number, next: number): number {
    if (next === 0) {
      return current;
    }
    // A saturated backlog is stale momentum, so a deliberate flick the other
    // way replaces it instead of grinding through it. Below saturation the
    // deltas sum, which lets a stray opposite notch at a scroll boundary
    // cancel out rather than reverse the whole coalesced window.
    if (
      Math.abs(current) >= MAX_PENDING_DELTA &&
      Math.sign(current) !== Math.sign(next)
    ) {
      return this.clamp(next);
    }
    return this.clamp(current + next);
  }
}
