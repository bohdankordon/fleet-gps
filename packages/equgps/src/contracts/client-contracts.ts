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

export type VehicleDayDetails = {
  distanceMeters: number | null;
  movementSeconds: number | null;
  maximumSpeedKnots: number | null;
  tripCount: number;
};

export type ExternalSpeedEvent = {
  speedKmh: number;
  occurredAt: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type VehicleRoute = {
  points: readonly EquGpsPosition[];
};

export interface OfficialEquGpsClient {
  createSession(): Promise<SessionToken>;
  getDevices(): Promise<readonly EquGpsDevice[]>;
  getLatestPositions(): Promise<readonly EquGpsPosition[]>;
  getHistoricalPositions(params: HistoricalPositionsParams): Promise<readonly EquGpsPosition[]>;
}

export interface WebEquGpsClient {
  getRuns(token: SessionToken): Promise<readonly DailyRun[]>;
  getMode1(token: SessionToken, params: VehicleDayParams): Promise<VehicleDayDetails>;
  getMode2(token: SessionToken, params: VehicleDayParams): Promise<readonly ExternalSpeedEvent[]>;
  getRoute(token: SessionToken, params: VehicleDayParams): Promise<VehicleRoute>;
}
