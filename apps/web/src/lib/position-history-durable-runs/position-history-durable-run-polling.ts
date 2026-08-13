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
  schedule?: Scheduler;
  cancel?: (timer: ReturnType<typeof setInterval>) => void;
}>): () => void {
  let known = options.initialActive;
  let stopped = false;
  let polling = false;
  const tick = async (): Promise<void> => {
    if (stopped || polling) return;
    polling = true;
    try {
      const next = await options.loadActive();
      if (stopped) return;
      options.onActive(next);
      if (known !== null || next !== null) options.refreshHorizon(options.anchor);
      if (known !== null && next === null) {
        try { options.onRecent(await options.loadRecent()); } catch {}
      }
      known = next;
    } catch {
      // Preserve the last database truth on transient read failures.
    } finally { polling = false; }
  };
  const timer = (options.schedule ?? setInterval)(() => { void tick(); }, DURABLE_RUN_UI_POLL_MS);
  return () => { stopped = true; (options.cancel ?? clearInterval)(timer); };
}

