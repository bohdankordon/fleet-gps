export type PositionHistoryRequestPacerClock = Readonly<{ now(): Date }>;
export type PositionHistoryRequestPacerSleeper = Readonly<{ sleep(durationMs: number): Promise<void> }>;
export const POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS = 2_000;

function nowMs(clock: PositionHistoryRequestPacerClock): number {
  const value = clock.now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("Invalid position-history request pacing clock.");
  return value.getTime();
}

/**
 * Enforces request-start spacing while its caller owns the shared history lock.
 * Cooling before lock release carries the spacing fence across API replicas.
 */
export class PositionHistoryAutomaticRequestPacer {
  private lastRequestStart: number | null = null;
  private starts = 0;

  public constructor(
    private readonly clock: PositionHistoryRequestPacerClock,
    private readonly sleeper: PositionHistoryRequestPacerSleeper,
    private readonly gapMs: number,
  ) {
    if (!Number.isSafeInteger(gapMs) || gapMs < 1) throw new Error("Invalid position-history request start gap.");
  }

  public readonly beforeRequestStart = async (): Promise<void> => {
    let now = nowMs(this.clock);
    if (this.lastRequestStart !== null) {
      const remaining = this.gapMs - (now - this.lastRequestStart);
      if (remaining > 0) {
        await this.sleeper.sleep(remaining);
        now = nowMs(this.clock);
      }
    }
    this.lastRequestStart = now;
    this.starts += 1;
  };

  public async coolBeforeLockRelease(): Promise<void> {
    if (this.lastRequestStart === null) return;
    const remaining = this.gapMs - (nowMs(this.clock) - this.lastRequestStart);
    if (remaining > 0) await this.sleeper.sleep(remaining);
  }

  public requestStarts(): number {
    return this.starts;
  }
}
