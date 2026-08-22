import "server-only";
import { parseWebConfig } from "@/lib/web-config";
import { HealthBackendUnavailableError, type PublicHealthPath } from "./health-contract";

export async function fetchApiHealth(path: PublicHealthPath, fetcher: typeof fetch = fetch): Promise<Response> {
  const config = parseWebConfig(process.env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetcher(`${config.apiInternalBaseUrl}${path}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new HealthBackendUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
