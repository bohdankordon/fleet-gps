import type { EquGpsConfig } from "../config/equgps-config";
import type { DailyRun, SessionToken, WebRunsClient } from "../contracts/client-contracts";
import type { HttpTransport } from "../contracts/http";
import { EquGpsResponseValidationError } from "../errors/equgps-errors";
import { buildWebRunsUrl } from "../internal/url-builder";
import { runsResponseSchema } from "../transport/schemas";

export class DefaultWebRunsClient implements WebRunsClient {
  public constructor(private readonly config: EquGpsConfig, private readonly transport: HttpTransport) {}
  public async getRuns(token: SessionToken): Promise<readonly DailyRun[]> {
    const response = await this.transport.execute({ operation: "getRuns", method: "POST", url: buildWebRunsUrl(this.config.webBaseUrl, token), headers: { Accept: "application/json" }, timeoutMs: this.config.requestTimeoutMs });
    const result = runsResponseSchema.safeParse(response.body);
    if (!result.success) throw new EquGpsResponseValidationError("getRuns");
    return result.data.map((run) => ({ deviceId: run.id, distanceMeters: run.runDistance }));
  }
}
