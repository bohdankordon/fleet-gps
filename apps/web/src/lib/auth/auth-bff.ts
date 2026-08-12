import "server-only";
import { parseWebConfig } from "../web-config";
import { forwardAuthToUpstream, type AuthPath } from "./auth-bff-core";

export async function forwardAuth(request: Request, path: AuthPath, bodyKeys: readonly string[] = []): Promise<Response> {
  const config = parseWebConfig(process.env);
  return forwardAuthToUpstream(request, path, config.apiInternalBaseUrl, bodyKeys);
}
