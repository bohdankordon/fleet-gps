import { loadConfig, loadWebSessionProbeConfig } from "../config.js";
import { EqugpsClient } from "../equgps/equgps-client.js";
import { EqugpsError } from "../equgps/equgps-errors.js";
import { compareConfiguredWebToken, verifySessionTokenWithWebApi } from "../equgps/equgps-session-token.js";
import { EquGpsWebClient, type EqugpsWebError } from "../equgps-web/equgps-web-client.js";

type ProbeResult = {
  sessionStatus: number | "unavailable";
  sessionTokenReturned: boolean;
  matchesConfiguredWebToken: boolean | "not checked";
  webApiAcceptedSessionToken: boolean;
  variant: "A" | "B" | "C";
  runsStatus?: number;
  runsRows?: number;
};

function statusFromError(error: unknown): number | "unavailable" {
  return error instanceof EqugpsError && error.status !== undefined ? error.status : "unavailable";
}

async function run(): Promise<ProbeResult> {
  const officialClient = new EqugpsClient(loadConfig());
  const webConfig = loadWebSessionProbeConfig();
  let session;
  try {
    session = await officialClient.createSession();
  } catch (error: unknown) {
    return {
      sessionStatus: statusFromError(error),
      sessionTokenReturned: false,
      matchesConfiguredWebToken: "not checked",
      webApiAcceptedSessionToken: false,
      variant: "C",
    };
  }

  const matchesConfiguredWebToken = compareConfiguredWebToken(session.session.token, webConfig.configuredToken);
  const webClient = new EquGpsWebClient(webConfig);
  try {
    const runs = await verifySessionTokenWithWebApi(
      async () => ({ token: session.session.token }),
      (token) => webClient.getRunsWithToken(token),
    );
    return {
      sessionStatus: session.status,
      sessionTokenReturned: true,
      matchesConfiguredWebToken,
      webApiAcceptedSessionToken: true,
      variant: "A",
      runsStatus: runs.status,
      runsRows: runs.data.length,
    };
  } catch (error: unknown) {
    const webError = error as EqugpsWebError;
    return {
      sessionStatus: session.status,
      sessionTokenReturned: true,
      matchesConfiguredWebToken,
      webApiAcceptedSessionToken: false,
      variant: "B",
      ...(webError.status === undefined ? {} : { runsStatus: webError.status }),
    };
  }
}

const result = await run();
console.log(`POST /session HTTP status: ${result.sessionStatus}`);
console.log(`sessionTokenReturned: ${result.sessionTokenReturned}`);
console.log(`matchesConfiguredWebToken: ${result.matchesConfiguredWebToken}`);
if (result.runsStatus !== undefined) console.log(`POST /api/devices/runs HTTP status: ${result.runsStatus}`);
if (result.runsRows !== undefined) console.log(`runs rows: ${result.runsRows}`);
console.log(`webApiAcceptedSessionToken: ${result.webApiAcceptedSessionToken}`);
console.log(`Result: ${result.variant}`);
