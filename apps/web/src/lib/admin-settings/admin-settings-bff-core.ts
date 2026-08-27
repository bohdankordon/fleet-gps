import { AUTH_COOKIE_NAME } from "../auth/auth-contract";
import { rejectCrossOriginWrite } from "../auth/same-origin";
import { boundedBodyStatus, readBoundedJson } from "../http/bounded-body";

export const adminSettingsWriteKeys = ["revision", "timezone", "minimumDailyDistanceMeters", "positionFreshnessSeconds", "speedRuleEnabled", "citySpeedLimitKph", "outsideCitySpeedLimitKph", "speedToleranceKph", "speedingConfirmationUpdates", "inactivityRuleEnabled", "inactivityDistanceMeters", "inactivityDurationMinutes", "cityGeofenceGeoJson"] as const;

export async function forwardAdminSettingsToUpstream(request: Request, apiInternalBaseUrl: string, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method === "PATCH") {
    const rejected = rejectCrossOriginWrite(request);
    if (rejected) return rejected;
  }
  let body: string | undefined;
  if (request.method === "PATCH") {
    try {
      const value = await readBoundedJson(request);
      if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).some((key) => !adminSettingsWriteKeys.includes(key as typeof adminSettingsWriteKeys[number]))) throw new Error();
      body = JSON.stringify(value);
    } catch (error) {
      const status = boundedBodyStatus(error);
      return Response.json({ statusCode: status, error: status === 413 ? "Payload Too Large" : "Bad Request" }, { status });
    }
  }
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
  const headers = new Headers({ Accept: "application/json" });
  if (token) headers.set("Cookie", token);
  if (body) headers.set("Content-Type", "application/json");
  try {
    const upstream = await fetcher(`${apiInternalBaseUrl}/api/admin/settings`, { method: request.method, headers, cache: "no-store", ...(body ? { body } : {}) });
    const responseHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
    return upstream.status >= 500 ? Response.json({ statusCode: upstream.status, error: "Internal Server Error" }, { status: upstream.status, headers: responseHeaders }) : new Response(await upstream.text(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
