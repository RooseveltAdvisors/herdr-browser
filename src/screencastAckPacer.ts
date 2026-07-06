type Ack = () => void;
type Timer = ReturnType<typeof setTimeout>;

type Clock = {
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => Timer;
  clearTimer: (timer: Timer) => void;
};

type ScreencastAckPolicy = {
  passiveFps: number;
  interactiveFps: number;
  interactionBoostMs: number;
};

// Lets the pacer hold the next ack when the downstream frame consumer is
// saturated, instead of releasing acks at the FPS ceiling regardless of
// whether Chrome's encode work will just be dropped.
export type ScreencastCapacityGate = {
  isSaturated: () => boolean;
  onDrain: (listener: () => void) => () => void;
};

const DEFAULT_POLICY: ScreencastAckPolicy = {
  passiveFps: 15,
  interactiveFps: 30,
  interactionBoostMs: 750,
};

const SYSTEM_CLOCK: Clock = {
  now: () => performance.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
};

export class ScreencastAckPacer {
  private readonly pending: Ack[] = [];
  private timer: Timer | null = null;
  private lastAckAt: number | null = null;
  private interactiveUntil = 0;
  private capacityGate: ScreencastCapacityGate | null = null;
  private unsubscribeDrain: (() => void) | null = null;

  constructor(
    private readonly policy: ScreencastAckPolicy = DEFAULT_POLICY,
    private readonly clock: Clock = SYSTEM_CLOCK,
  ) {}

  enqueue(ack: Ack): void {
    this.pending.push(ack);
    this.schedule();
  }

  boost(): void {
    this.interactiveUntil = Math.max(
      this.interactiveUntil,
      this.clock.now() + this.policy.interactionBoostMs,
    );
    this.cancelTimer();
    this.schedule();
  }

  // Ties ack release to downstream capacity for the view currently owning
  // this pacer. Pass null when no view is attached (or on teardown) so acks
  // are never held against a consumer that is gone.
  setCapacityGate(gate: ScreencastCapacityGate | null): void {
    this.capacityGate = gate;
    this.clearDrainWait();
    if (!this.timer) {
      this.schedule();
    }
  }

  flush(): void {
    this.cancelTimer();
    this.clearDrainWait();
    const pending = this.pending.splice(0);
    this.lastAckAt = null;
    this.interactiveUntil = 0;
    for (const acknowledge of pending) {
      acknowledge();
    }
  }

  private schedule(): void {
    if (this.timer || this.pending.length === 0) {
      return;
    }
    const now = this.clock.now();
    const intervalMs = 1_000 / (
      now < this.interactiveUntil
        ? this.policy.interactiveFps
        : this.policy.passiveFps
    );
    const delayMs = this.lastAckAt === null
      ? 0
      : Math.max(0, this.lastAckAt + intervalMs - now);
    if (delayMs === 0) {
      this.tryAcknowledgeNext();
      return;
    }
    this.timer = this.clock.setTimer(() => {
      this.timer = null;
      this.tryAcknowledgeNext();
    }, delayMs);
  }

  // The FPS ceiling is honored above; this only ever stretches the interval
  // further when the downstream consumer can't keep up.
  private tryAcknowledgeNext(): void {
    if (this.capacityGate?.isSaturated()) {
      this.waitForDrain();
      return;
    }
    this.acknowledgeNext();
  }

  private waitForDrain(): void {
    if (this.unsubscribeDrain || !this.capacityGate) {
      return;
    }
    const gate = this.capacityGate;
    this.unsubscribeDrain = gate.onDrain(() => {
      this.unsubscribeDrain = null;
      this.schedule();
    });
  }

  private acknowledgeNext(): void {
    const acknowledge = this.pending.shift();
    if (!acknowledge) {
      return;
    }
    this.lastAckAt = this.clock.now();
    acknowledge();
    this.schedule();
  }

  private cancelTimer(): void {
    if (!this.timer) {
      return;
    }
    this.clock.clearTimer(this.timer);
    this.timer = null;
  }

  private clearDrainWait(): void {
    if (!this.unsubscribeDrain) {
      return;
    }
    this.unsubscribeDrain();
    this.unsubscribeDrain = null;
  }
}
