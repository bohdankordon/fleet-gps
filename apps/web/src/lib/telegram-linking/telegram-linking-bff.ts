import "server-only";
import { parseWebConfig } from "../web-config";
import { forwardTelegramAccountToUpstream } from "./telegram-linking-bff-core";

export async function forwardTelegramAccount(request: Request, path: string, fetcher: typeof fetch = fetch): Promise<Response> {
  return forwardTelegramAccountToUpstream(request, path, parseWebConfig(process.env).apiInternalBaseUrl, fetcher);
}
