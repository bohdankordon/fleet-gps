export type PublicHealthPath = "/api/health" | "/api/health/ready";
export type HealthFetcher = (path: PublicHealthPath) => Promise<Response>;

export class HealthBackendUnavailableError extends Error {
  public constructor() { super("Health backend unavailable."); }
}
