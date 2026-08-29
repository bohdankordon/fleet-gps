import { forwardTelegramWebhook } from "@/lib/telegram-linking/telegram-webhook-ingress";

export function POST(request: Request): Promise<Response> { return forwardTelegramWebhook(request); }
