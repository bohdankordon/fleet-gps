import { forwardTelegramAccount } from "@/lib/telegram-linking/telegram-linking-bff";
export const dynamic = "force-dynamic";
export function PATCH(request: Request): Promise<Response> { return forwardTelegramAccount(request, "/api/account/notifications/preferences"); }
