import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import { activeDurableRunResponseSchema, recentDurableRunsSchema, type CreateDurableRunRequest, type SafeDurableRun } from "./position-history-durable-run-contract";

function endpoint(suffix = ""): string {
  return `${parseWebConfig(process.env).apiInternalBaseUrl}/api/system/position-history/population-runs${suffix}`;
}

export function createDurableRun(request: CreateDurableRunRequest): Promise<Response> {
  return authenticatedApiFetch(endpoint(), { method: "POST", cache: "no-store", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(request) });
}

export function fetchActiveDurableRunResponse(): Promise<Response> {
  return authenticatedApiFetch(endpoint("/active"), { cache: "no-store", headers: { Accept: "application/json" } });
}

export function fetchRecentDurableRunsResponse(): Promise<Response> {
  return authenticatedApiFetch(endpoint("/recent"), { cache: "no-store", headers: { Accept: "application/json" } });
}

export async function fetchActiveDurableRun(fetcher: typeof fetch = authenticatedApiFetch): Promise<SafeDurableRun | null> {
  const response = await fetcher(endpoint("/active"), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("durable active status unavailable");
  // Explicit envelope: SUCCESS + NO ACTIVE RUN is { active: null } (HTTP 200).
  // Any non-2xx, transport, or contract failure throws and must remain failure,
  // never successful none.
  return activeDurableRunResponseSchema.parse(await response.json()).active;
}

export async function fetchRecentDurableRuns(fetcher: typeof fetch = authenticatedApiFetch): Promise<readonly SafeDurableRun[]> {
  const response = await fetcher(endpoint("/recent"), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("durable recent status unavailable");
  return recentDurableRunsSchema.parse(await response.json());
}
