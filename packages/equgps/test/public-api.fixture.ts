import {
  EquGpsUnauthorizedError,
  FetchHttpTransport,
  type EquGpsConfig,
  type OfficialEquGpsClient,
  SessionTokenProvider,
  createOfficialEquGpsClient,
  createWebRunsClient,
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

void configFixture;
void officialClientFixture;
void webClientFixture;
void providerConstructor;
void errorConstructor;
void transportConstructor;
void officialFactory;
void webRunsFactory;
