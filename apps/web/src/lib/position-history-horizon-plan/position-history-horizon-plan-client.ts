import "server-only";
import { parseWebConfig } from "../web-config";
import { parsePositionHistoryHorizonPlan, PositionHistoryHorizonPlanContractError, type PositionHistoryHorizonPlanResponse } from "./position-history-horizon-plan-contract";
import { PositionHistoryHorizonPlanBadRequestError, PositionHistoryHorizonPlanUnavailableError } from "./position-history-horizon-plan-errors";
import { authenticatedApiFetch } from "@/lib/auth/auth-cookie";

export async function fetchPositionHistoryHorizonPlan(to: string, fetcher: typeof fetch = authenticatedApiFetch): Promise<PositionHistoryHorizonPlanResponse> {
  const config = parseWebConfig(process.env);
  const url = new URL(`${config.apiInternalBaseUrl}/api/system/position-history/horizon-plan`);
  url.searchParams.set("to", to);
  let response: Response;
  try { response = await fetcher(url, { cache: "no-store", headers: { Accept: "application/json" } }); }
  catch { throw new PositionHistoryHorizonPlanUnavailableError(); }
  if (response.status === 400) throw new PositionHistoryHorizonPlanBadRequestError();
  if (!response.ok) throw new PositionHistoryHorizonPlanUnavailableError();
  try { return parsePositionHistoryHorizonPlan(await response.json()); }
  catch (error) { if (error instanceof PositionHistoryHorizonPlanContractError) throw error; throw new PositionHistoryHorizonPlanContractError(); }
}
