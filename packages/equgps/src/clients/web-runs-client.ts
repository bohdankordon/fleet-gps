import type { EquGpsConfig } from "../config/equgps-config";
import type { DailyRun, SessionToken, WebRunsClient } from "../contracts/client-contracts";
import type { HttpTransport } from "../contracts/http";
import { EquGpsResponseValidationError } from "../errors/equgps-errors";
import { buildWebRunsUrl } from "../internal/url-builder";
import { runsResponseSchema } from "../transport/schemas";

export function classifyRunsValidationFailure(body: unknown): "unexpected_response_shape" | "runs_not_array" | "runs_item_not_object" | "runs_invalid_id" | "runs_invalid_distance" {
  if (!Array.isArray(body)) return "runs_not_array";
  for (const item of body) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return "runs_item_not_object";
    const value = item as Readonly<Record<string, unknown>>;
    if (typeof value.id !== "number" || !Number.isInteger(value.id) || value.id <= 0) return "runs_invalid_id";
    if (typeof value.runDistance !== "number" || !Number.isFinite(value.runDistance) || value.runDistance < 0) return "runs_invalid_distance";
  }
  return "unexpected_response_shape";
}

export class DefaultWebRunsClient implements WebRunsClient {
  public constructor(private readonly config: EquGpsConfig, private readonly transport: HttpTransport) {}
  public async getRuns(token: SessionToken): Promise<readonly DailyRun[]> {
    const response = await this.transport.execute({ operation: "getRuns", method: "POST", url: buildWebRunsUrl(this.config.webBaseUrl, token), headers: { Accept: "application/json" }, timeoutMs: this.config.runsRequestTimeoutMs });
    const result = runsResponseSchema.safeParse(response.body);
    if (!result.success) throw new EquGpsResponseValidationError("getRuns", classifyRunsValidationFailure(response.body));
    return result.data.map((run) => ({ deviceId: run.id, distanceMeters: run.runDistance }));
  }
}
