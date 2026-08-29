import { HealthBackendUnavailableError, type HealthFetcher, type PublicHealthPath } from "./health-contract";

type LivenessBody = Readonly<{ status: "ok"; service: "taxi-gps-api"; timestamp: string }>;
type ReadinessBody = Readonly<{ status: "ready" | "unavailable"; service: "taxi-gps-api"; database: "ready" | "unavailable"; timestamp: string }>;

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseLiveness(value: unknown): LivenessBody | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.status !== "ok" || body.service !== "taxi-gps-api" || !isTimestamp(body.timestamp)) return null;
  return { status: "ok", service: "taxi-gps-api", timestamp: body.timestamp };
}

function parseReadiness(value: unknown): ReadinessBody | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const status = body.status;
  if ((status !== "ready" && status !== "unavailable") || body.service !== "taxi-gps-api" || body.database !== status || !isTimestamp(body.timestamp)) return null;
  return { status, service: "taxi-gps-api", database: status, timestamp: body.timestamp };
}

function unavailableResponse(): Response {
  return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

export function createHealthRouteHandler(path: PublicHealthPath, fetchHealth: HealthFetcher) {
  return async (): Promise<Response> => {
    try {
      const upstream = await fetchHealth(path);
      let body: unknown;
      try { body = await upstream.json(); } catch { return unavailableResponse(); }

      if (path === "/api/health") {
        const liveness = parseLiveness(body);
        return upstream.status === 200 && liveness !== null
          ? Response.json(liveness, { status: 200, headers: { "Cache-Control": "no-store" } })
          : unavailableResponse();
      }

      const readiness = parseReadiness(body);
      return readiness !== null && ((upstream.status === 200 && readiness.status === "ready") || (upstream.status === 503 && readiness.status === "unavailable"))
        ? Response.json(readiness, { status: upstream.status, headers: { "Cache-Control": "no-store" } })
        : unavailableResponse();
    } catch (error) {
      if (error instanceof HealthBackendUnavailableError) return unavailableResponse();
      return unavailableResponse();
    }
  };
}
