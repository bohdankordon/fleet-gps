import type { SafeDurableRun } from "./position-history-durable-run-contract";

export const DURABLE_RUN_UI_POLL_MS = 5_000;
type Scheduler = (callback: () => void, milliseconds: number) => ReturnType<typeof setInterval>;

export function startDurableRunPolling(options: Readonly<{
  anchor: string;
  initialActive: SafeDurableRun | null;
  loadActive(): Promise<SafeDurableRun | null>;
  loadRecent(): Promise<readonly SafeDurableRun[]>;
  onActive(value: SafeDurableRun | null): void;
  onRecent(value: readonly SafeDurableRun[]): void;
  refreshHorizon(anchor: string): void;
  onActiveError?(error: unknown): void;
  onRecentError?(error: unknown): void;
  isRecentUnavailable?: () => boolean;
  getActiveEpoch?: () => number;
  schedule?: Scheduler;
  cancel?: (timer: ReturnType<typeof setInterval>) => void;
}>): () => void {
  let known = options.initialActive;
  let stopped = false;
  let polling = false;
  const tick = async (): Promise<void> => {
    if (stopped || polling) return;
    polling = true;
    const tickEpoch = options.getActiveEpoch?.() ?? 0;
    try {
      const next = await options.loadActive();
      if (stopped) return;
      if ((options.getActiveEpoch?.() ?? tickEpoch) !== tickEpoch) return;
      options.onActive(next);
      if (known !== null || next !== null) options.refreshHorizon(options.anchor);
      const shouldRetryRecent = (known !== null && next === null) || (options.isRecentUnavailable?.() === true);
      if (shouldRetryRecent) {
        try {
          const recent = await options.loadRecent();
          if (stopped) return;
          if ((options.getActiveEpoch?.() ?? tickEpoch) !== tickEpoch) return;
          options.onRecent(recent);
        } catch (error) {
          if (stopped) return;
          if ((options.getActiveEpoch?.() ?? tickEpoch) !== tickEpoch) return;
          // Preserve last-known recent truth; surface stale/unavailable separately.
          options.onRecentError?.(error);
        }
      }
      known = next;
    } catch (error) {
      if (stopped) return;
      if ((options.getActiveEpoch?.() ?? tickEpoch) !== tickEpoch) return;
      // Preserve the last database truth on transient read failures.
      // Do NOT convert failure to successful none; surface unavailable separately.
      options.onActiveError?.(error);
    } finally { polling = false; }
  };
  const timer = (options.schedule ?? setInterval)(() => { void tick(); }, DURABLE_RUN_UI_POLL_MS);
  return () => { stopped = true; (options.cancel ?? clearInterval)(timer); };
}
// Truthful create-control visibility (repair pass): suppress creation while active state is unavailable.
export function shouldShowDurableCreateControls(active: SafeDurableRun | null, activeUnavailable: boolean, canPopulate: boolean): boolean { return canPopulate && active === null && !activeUnavailable; }
