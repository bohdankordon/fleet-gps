import type { EquGpsConfig } from "./config/equgps-config";
import type { OfficialEquGpsClient, WebRunsClient } from "./contracts/client-contracts";
import type { HttpTransport } from "./contracts/http";
import { DefaultOfficialEquGpsClient } from "./clients/official-client";
import { DefaultWebRunsClient } from "./clients/web-runs-client";
import { FetchHttpTransport } from "./transport/fetch-http-transport";

export function createOfficialEquGpsClient(config: EquGpsConfig, transport: HttpTransport = new FetchHttpTransport()): OfficialEquGpsClient {
  return new DefaultOfficialEquGpsClient(config, transport);
}
export function createWebRunsClient(config: EquGpsConfig, transport: HttpTransport = new FetchHttpTransport()): WebRunsClient {
  return new DefaultWebRunsClient(config, transport);
}
