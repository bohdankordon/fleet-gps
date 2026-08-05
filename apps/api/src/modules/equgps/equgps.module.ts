import { Module } from "@nestjs/common";
import { FetchHttpTransport, SessionTokenProvider, createOfficialEquGpsClient, createWebRouteClient, createWebRunsClient, createWebSpeedEventsClient, createWebVehicleDetailsClient, type HttpTransport, type OfficialEquGpsClient, type WebRouteClient, type WebRunsClient, type WebSpeedEventsClient, type WebVehicleDetailsClient } from "@taxi-gps/equgps";
import type { ApiConfig } from "../../config/api-config";
import { ApiConfigModule } from "../../config/api-config.module";
import { API_CONFIG } from "../../config/api-config.tokens";
import { EquGpsGatewayService } from "./equgps-gateway.service";
import { EQU_GPS_TRANSPORT, OFFICIAL_EQU_GPS_CLIENT, SESSION_TOKEN_PROVIDER, WEB_ROUTE_CLIENT, WEB_RUNS_CLIENT, WEB_SPEED_EVENTS_CLIENT, WEB_VEHICLE_DETAILS_CLIENT } from "./equgps.tokens";

@Module({
  imports: [ApiConfigModule],
  providers: [
    { provide: EQU_GPS_TRANSPORT, useFactory: (): HttpTransport => new FetchHttpTransport() },
    { provide: OFFICIAL_EQU_GPS_CLIENT, useFactory: (config: ApiConfig, transport: HttpTransport): OfficialEquGpsClient => createOfficialEquGpsClient(config.equGps, transport), inject: [API_CONFIG, EQU_GPS_TRANSPORT] },
    { provide: WEB_RUNS_CLIENT, useFactory: (config: ApiConfig, transport: HttpTransport): WebRunsClient => createWebRunsClient(config.equGps, transport), inject: [API_CONFIG, EQU_GPS_TRANSPORT] },
    { provide: WEB_VEHICLE_DETAILS_CLIENT, useFactory: (config: ApiConfig, transport: HttpTransport): WebVehicleDetailsClient => createWebVehicleDetailsClient(config.equGps, transport), inject: [API_CONFIG, EQU_GPS_TRANSPORT] },
    { provide: WEB_SPEED_EVENTS_CLIENT, useFactory: (config: ApiConfig, transport: HttpTransport): WebSpeedEventsClient => createWebSpeedEventsClient(config.equGps, transport), inject: [API_CONFIG, EQU_GPS_TRANSPORT] },
    { provide: WEB_ROUTE_CLIENT, useFactory: (config: ApiConfig, transport: HttpTransport): WebRouteClient => createWebRouteClient(config.equGps, transport), inject: [API_CONFIG, EQU_GPS_TRANSPORT] },
    { provide: SESSION_TOKEN_PROVIDER, useFactory: (official: OfficialEquGpsClient) => new SessionTokenProvider(() => official.createSession()), inject: [OFFICIAL_EQU_GPS_CLIENT] },
    EquGpsGatewayService,
  ],
  exports: [EquGpsGatewayService],
})
export class EquGpsModule {}
