export type SessionToken = string & { readonly __sessionTokenBrand: unique symbol };

export type EquGpsDevice = {
  id: number;
  name: string | null;
  status: string | null;
  disabled: boolean | null;
  lastUpdate: string | null;
};

export type EquGpsPosition = {
  deviceId: number;
  fixTime: string | null;
  valid: boolean | null;
  outdated: boolean | null;
  speedKnots: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type HistoricalPositionsParams = {
  deviceId: number;
  from: string;
  to: string;
};

export type DailyRun = {
  deviceId: number;
  distanceMeters: number;
};

export type VehicleDayParams = {
  deviceId: number;
  date: string;
};

export type Location = { latitude: number; longitude: number };
export type VehicleTrip = { startedAt: string; endedAt: string; distanceMeters: number; maxSpeedKph: number | null; startLocation: Location | null; endLocation: Location | null; startAddress: string | null; endAddress: string | null; stopAfterSeconds: number | null };
export type VehicleDayDetails = {
  deviceId: number;
  date: string;
  distanceMeters: number | null;
  movementDurationSeconds: number | null;
  maxSpeedKph: number | null;
  trips: readonly VehicleTrip[];
};

export type ExternalSpeedEvent = {
  externalEventId: number;
  deviceId: number;
  speedKph: number;
  occurredAt: string | null;
  latitude: number;
  longitude: number;
  overPercent: number | null;
};
export type ExternalSpeedReport = { deviceId: number; date: string; configuredLimitKph: number | null; maxRecordedSpeedKph: number | null; events: readonly ExternalSpeedEvent[] };
export type RoutePoint = { occurredAt: string | null; latitude: number; longitude: number };

export type VehicleRoute = {
  deviceId: number;
  date: string;
  distanceMeters: number | null;
  movementDurationSeconds: number | null;
  trips: readonly VehicleTrip[];
  points: readonly RoutePoint[];
};

export interface OfficialEquGpsClient {
  createSession(): Promise<SessionToken>;
  getDevices(): Promise<readonly EquGpsDevice[]>;
  getLatestPositions(): Promise<readonly EquGpsPosition[]>;
  getHistoricalPositions(params: HistoricalPositionsParams): Promise<readonly EquGpsPosition[]>;
}

export interface WebRunsClient {
  getRuns(token: SessionToken): Promise<readonly DailyRun[]>;
}
export interface WebVehicleDetailsClient { getVehicleDayDetails(token: SessionToken, params: VehicleDayParams): Promise<VehicleDayDetails>; }
export interface WebSpeedEventsClient { getExternalSpeedReport(token: SessionToken, params: VehicleDayParams): Promise<ExternalSpeedReport>; }
export interface WebRouteClient { getVehicleRoute(token: SessionToken, params: VehicleDayParams): Promise<VehicleRoute>; }
