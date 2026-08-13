import { positionHistoryPopulationResultSchema, type PositionHistoryPopulationRequest, type PositionHistoryPopulationResult } from "./position-history-population-contract";

export type PositionHistoryPopulationOutcome = Readonly<{
  kind: "SUCCESS";
  result: PositionHistoryPopulationResult;
}> | Readonly<{
  kind: "ALREADY_RUNNING" | "FAILED";
}>;

export async function executeAndRefreshPositionHistory(request: PositionHistoryPopulationRequest, fetcher: typeof fetch = fetch): Promise<PositionHistoryPopulationOutcome> {
  let outcome: PositionHistoryPopulationOutcome = { kind: "FAILED" };
  try {
    const response = await fetcher("/api/system/position-history/horizon-populate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    if (response.status === 409) outcome = { kind: "ALREADY_RUNNING" };
    else if (response.ok) {
      const parsed = positionHistoryPopulationResultSchema.safeParse(await response.json());
      if (parsed.success) outcome = { kind: "SUCCESS", result: parsed.data };
    }
  } catch {}
  try { await fetcher(`/api/system/position-history/horizon-status?${new URLSearchParams({ to: request.to })}`, { cache: "no-store" }); } catch {}
  return outcome;
}
