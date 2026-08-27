import { forwardRuntimeSettings } from "@/lib/runtime-settings/runtime-settings-bff";
export function GET(request: Request): Promise<Response> { return forwardRuntimeSettings(request); }
