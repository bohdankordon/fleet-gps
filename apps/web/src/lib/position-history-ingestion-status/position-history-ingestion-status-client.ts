import "server-only";
import { parseWebConfig } from "../web-config";
import { authenticatedApiFetch } from "@/lib/auth/auth-cookie";
import { parsePositionHistoryIngestionStatus, PositionHistoryIngestionStatusContractError, type PositionHistoryIngestionStatusResponse } from "./position-history-ingestion-status-contract";
import { PositionHistoryIngestionStatusForbiddenError, PositionHistoryIngestionStatusUnauthorizedError, PositionHistoryIngestionStatusUnavailableError } from "./position-history-ingestion-status-errors";

export async function fetchPositionHistoryIngestionStatus(fetcher: typeof fetch = authenticatedApiFetch): Promise<PositionHistoryIngestionStatusResponse> {
  const config = parseWebConfig(process.env);
  const url = new URL(`${config.apiInternalBaseUrl}/api/system/position-history/ingestion-status`);
  let response: Response;
  try {
    response = await fetcher(url, { cache: "no-store", headers: { Accept: "application/json" } });
  } catch {
    throw new PositionHistoryIngestionStatusUnavailableError();
  }
  if (response.status === 401) throw new PositionHistoryIngestionStatusUnauthorizedError();
  if (response.status === 403) throw new PositionHistoryIngestionStatusForbiddenError();
  if (!response.ok) throw new PositionHistoryIngestionStatusUnavailableError();
  try {
    return parsePositionHistoryIngestionStatus(await response.json());
  } catch (error) {
    if (error instanceof PositionHistoryIngestionStatusContractError) throw error;
    throw new PositionHistoryIngestionStatusContractError();
  }
}
