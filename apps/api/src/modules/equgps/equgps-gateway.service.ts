import { Inject, Injectable } from "@nestjs/common";
import { executeReadOnlyWithSessionToken, type DailyRun, type EquGpsDevice, type EquGpsPosition, type ExternalSpeedReport, type HistoricalPositionsParams, type OfficialEquGpsClient, type SessionTokenProvider, type VehicleDayDetails, type VehicleDayParams, type VehicleRoute, type WebRouteClient, type WebRunsClient, type WebSpeedEventsClient, type WebVehicleDetailsClient } from "@taxi-gps/equgps";
import { OFFICIAL_EQU_GPS_CLIENT, SESSION_TOKEN_PROVIDER, WEB_ROUTE_CLIENT, WEB_RUNS_CLIENT, WEB_SPEED_EVENTS_CLIENT, WEB_VEHICLE_DETAILS_CLIENT } from "./equgps.tokens";

@Injectable()
export class EquGpsGatewayService {
  public constructor(
    @Inject(OFFICIAL_EQU_GPS_CLIENT) private readonly official: OfficialEquGpsClient,
    @Inject(WEB_RUNS_CLIENT) private readonly runs: WebRunsClient,
    @Inject(WEB_VEHICLE_DETAILS_CLIENT) private readonly details: WebVehicleDetailsClient,
    @Inject(WEB_SPEED_EVENTS_CLIENT) private readonly speedEvents: WebSpeedEventsClient,
    @Inject(WEB_ROUTE_CLIENT) private readonly route: WebRouteClient,
    @Inject(SESSION_TOKEN_PROVIDER) private readonly sessionTokens: SessionTokenProvider,
  ) {}

  public getDevices(): Promise<readonly EquGpsDevice[]> { return this.official.getDevices(); }
  public getLatestPositions(): Promise<readonly EquGpsPosition[]> { return this.official.getLatestPositions(); }
  public getHistoricalPositions(params: HistoricalPositionsParams): Promise<readonly EquGpsPosition[]> { return this.official.getHistoricalPositions(params); }
  public getRuns(): Promise<readonly DailyRun[]> { return executeReadOnlyWithSessionToken(this.sessionTokens, (token) => this.runs.getRuns(token)); }
  public getVehicleDayDetails(params: VehicleDayParams): Promise<VehicleDayDetails> { return executeReadOnlyWithSessionToken(this.sessionTokens, (token) => this.details.getVehicleDayDetails(token, params)); }
  public getExternalSpeedReport(params: VehicleDayParams): Promise<ExternalSpeedReport> { return executeReadOnlyWithSessionToken(this.sessionTokens, (token) => this.speedEvents.getExternalSpeedReport(token, params)); }
  public getVehicleRoute(params: VehicleDayParams): Promise<VehicleRoute> { return executeReadOnlyWithSessionToken(this.sessionTokens, (token) => this.route.getVehicleRoute(token, params)); }
}
