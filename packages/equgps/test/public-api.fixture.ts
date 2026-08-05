import {
  EquGpsUnauthorizedError,
  type EquGpsConfig,
  type OfficialEquGpsClient,
  SessionTokenProvider,
  type WebEquGpsClient,
} from "@taxi-gps/equgps";

const configFixture: EquGpsConfig | undefined = undefined;
const officialClientFixture: OfficialEquGpsClient | undefined = undefined;
const webClientFixture: WebEquGpsClient | undefined = undefined;
const providerConstructor: typeof SessionTokenProvider = SessionTokenProvider;
const errorConstructor: typeof EquGpsUnauthorizedError = EquGpsUnauthorizedError;

void configFixture;
void officialClientFixture;
void webClientFixture;
void providerConstructor;
void errorConstructor;
