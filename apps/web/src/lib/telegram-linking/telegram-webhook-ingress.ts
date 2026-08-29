import { parseWebConfig } from "../web-config";
import { boundedBodyStatus, readBoundedText } from "../http/bounded-body";
import { verifyTelegramWebhookSecret } from "./webhook-secret";

/** Fixed, server-side Telegram ingress; it is intentionally not a general proxy. */
export async function forwardTelegramWebhook(request: Request, env: Readonly<Record<string, string | undefined>> = process.env, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400 });
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyTelegramWebhookSecret(secret, env)) return Response.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 });
  let body: string;
  try { body = await readBoundedText(request); }
  catch (error) { const status = boundedBodyStatus(error); return Response.json({ statusCode: status, error: status === 413 ? "Payload Too Large" : "Bad Request" }, { status }); }
  try {
    const upstream = await fetcher(`${parseWebConfig(env).apiInternalBaseUrl}/api/telegram/product/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret! }, body, cache: "no-store" });
    return Response.json({ ok: upstream.ok }, { status: upstream.status });
  } catch { return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 }); }
}
