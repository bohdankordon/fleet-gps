import "server-only";
import { parseWebConfig } from "../web-config";
import { parsePositionHistoryStatus, PositionHistoryStatusContractError, type PositionHistoryStatusResponse } from "./position-history-status-contract";
import { PositionHistoryStatusBadRequestError, PositionHistoryStatusUnavailableError } from "./position-history-status-errors";

export async function fetchPositionHistoryStatus(to: string, fetcher: typeof fetch = fetch): Promise<PositionHistoryStatusResponse> {
  const config = parseWebConfig(process.env);
  const url = new URL(`${config.apiInternalBaseUrl}/api/system/position-history/horizon-status`);
  url.searchParams.set("to", to);
  let response: Response;
  try { response = await fetcher(url, { cache: "no-store", headers: { Accept: "application/json" } }); }
  catch { throw new PositionHistoryStatusUnavailableError(); }
  if (response.status === 400) throw new PositionHistoryStatusBadRequestError();
  if (!response.ok) throw new PositionHistoryStatusUnavailableError();
  try { return parsePositionHistoryStatus(await response.json()); }
  catch (error) { if (error instanceof PositionHistoryStatusContractError) throw error; throw new PositionHistoryStatusContractError(); }
}
