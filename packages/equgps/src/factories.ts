import type { EquGpsConfig } from "./config/equgps-config";
import type { OfficialEquGpsClient, WebRouteClient, WebRunsClient, WebSpeedEventsClient, WebVehicleDetailsClient } from "./contracts/client-contracts";
import type { HttpTransport } from "./contracts/http";
import { DefaultOfficialEquGpsClient } from "./clients/official-client";
import { DefaultWebRunsClient } from "./clients/web-runs-client";
import { DefaultWebDetailsClient } from "./clients/web-details-client";
import { FetchHttpTransport } from "./transport/fetch-http-transport";

export function createOfficialEquGpsClient(config: EquGpsConfig, transport: HttpTransport = new FetchHttpTransport()): OfficialEquGpsClient {
  return new DefaultOfficialEquGpsClient(config, transport);
}
export function createWebRunsClient(config: EquGpsConfig, transport: HttpTransport = new FetchHttpTransport()): WebRunsClient {
  return new DefaultWebRunsClient(config, transport);
}
export function createWebVehicleDetailsClient(config: EquGpsConfig, transport: HttpTransport = new FetchHttpTransport()): WebVehicleDetailsClient { return new DefaultWebDetailsClient(config, transport); }
export function createWebSpeedEventsClient(config: EquGpsConfig, transport: HttpTransport = new FetchHttpTransport()): WebSpeedEventsClient { return new DefaultWebDetailsClient(config, transport); }
export function createWebRouteClient(config: EquGpsConfig, transport: HttpTransport = new FetchHttpTransport()): WebRouteClient { return new DefaultWebDetailsClient(config, transport); }
