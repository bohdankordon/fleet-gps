import { activeDurableRunResponseSchema, recentDurableRunsSchema, safeDurableRunSchema, type CreateDurableRunRequest, type SafeDurableRun } from "./position-history-durable-run-contract";

export type DurableCreateOutcome = { kind: "CREATED"; run: SafeDurableRun } | { kind: "ALREADY_RUNNING"; active: SafeDurableRun | null; activeUnavailable: boolean } | { kind: "FAILED"; active: SafeDurableRun | null; activeUnavailable: boolean };

export async function readActiveDurableRun(fetcher: typeof fetch = fetch): Promise<SafeDurableRun | null> {
  const response = await fetcher("/api/system/position-history/population-runs/active", { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error("active unavailable");
  // Explicit envelope: SUCCESS + NO ACTIVE RUN is { active: null } (HTTP 200).
  // Failure (non-2xx / transport / contract) throws and must not become none.
  return activeDurableRunResponseSchema.parse(await response.json()).active;
}

export async function readRecentDurableRuns(fetcher: typeof fetch = fetch): Promise<readonly SafeDurableRun[]> {
  const response = await fetcher("/api/system/position-history/population-runs/recent", { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error("recent unavailable");
  return recentDurableRunsSchema.parse(await response.json());
}

export async function submitDurableRun(request: CreateDurableRunRequest, fetcher: typeof fetch = fetch): Promise<DurableCreateOutcome> {
  let response: Response | null = null;
  try { response = await fetcher("/api/system/position-history/population-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); } catch {}
  if (response?.ok) {
    try { return { kind: "CREATED", run: safeDurableRunSchema.parse(await response.json()) }; } catch {}
  }
  let active: SafeDurableRun | null = null;
  let activeUnavailable = false;
  try { active = await readActiveDurableRun(fetcher); } catch { activeUnavailable = true; }
  return { kind: response?.status === 409 ? "ALREADY_RUNNING" : "FAILED", active, activeUnavailable };
}
