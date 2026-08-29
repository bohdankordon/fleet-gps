import { forwardTelegramAccount } from "@/lib/telegram-linking/telegram-linking-bff";
export function POST(request: Request): Promise<Response> { return forwardTelegramAccount(request, "/api/account/notifications/telegram/disconnect"); }
