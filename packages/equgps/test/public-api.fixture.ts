import {
  EquGpsUnauthorizedError,
  FetchHttpTransport,
  type EquGpsConfig,
  type OfficialEquGpsClient,
  SessionTokenProvider,
  createOfficialEquGpsClient,
  createWebRunsClient,
  createWebRouteClient,
  createWebSpeedEventsClient,
  createWebVehicleDetailsClient,
  type WebRouteClient,
  type WebSpeedEventsClient,
  type WebVehicleDetailsClient,
  type WebRunsClient,
} from "@taxi-gps/equgps";

const configFixture: EquGpsConfig | undefined = undefined;
const officialClientFixture: OfficialEquGpsClient | undefined = undefined;
const webClientFixture: WebRunsClient | undefined = undefined;
const providerConstructor: typeof SessionTokenProvider = SessionTokenProvider;
const errorConstructor: typeof EquGpsUnauthorizedError = EquGpsUnauthorizedError;
const transportConstructor: typeof FetchHttpTransport = FetchHttpTransport;
const officialFactory: typeof createOfficialEquGpsClient = createOfficialEquGpsClient;
const webRunsFactory: typeof createWebRunsClient = createWebRunsClient;
const detailsFactory: typeof createWebVehicleDetailsClient = createWebVehicleDetailsClient;
const speedFactory: typeof createWebSpeedEventsClient = createWebSpeedEventsClient;
const routeFactory: typeof createWebRouteClient = createWebRouteClient;
const detailsClient: WebVehicleDetailsClient | undefined = undefined;
const speedClient: WebSpeedEventsClient | undefined = undefined;
const routeClient: WebRouteClient | undefined = undefined;

void configFixture;
void officialClientFixture;
void webClientFixture;
void providerConstructor;
void errorConstructor;
void transportConstructor;
void officialFactory;
void webRunsFactory;
void detailsFactory; void speedFactory; void routeFactory; void detailsClient; void speedClient; void routeClient;
