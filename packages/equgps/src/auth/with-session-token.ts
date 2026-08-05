import type { SessionToken } from "../contracts/client-contracts";
import { EquGpsForbiddenError, EquGpsUnauthorizedError } from "../errors/equgps-errors";
import { SessionTokenProvider } from "./session-token-provider";

export type ReadOnlyWebOperation<T> = (token: SessionToken) => Promise<T>;

export async function executeReadOnlyWithSessionToken<T>(
  tokenProvider: SessionTokenProvider,
  operation: ReadOnlyWebOperation<T>,
): Promise<T> {
  const token = await tokenProvider.getToken();
  try {
    return await operation(token);
  } catch (error: unknown) {
    if (!(error instanceof EquGpsUnauthorizedError) && !(error instanceof EquGpsForbiddenError)) throw error;
  }

  tokenProvider.invalidateToken(token);
  const refreshedToken = await tokenProvider.getToken();
  return operation(refreshedToken);
}
