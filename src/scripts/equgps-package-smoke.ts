import "dotenv/config";
import {
  EquGpsError,
  FetchHttpTransport,
  SessionTokenProvider,
  createOfficialEquGpsClient,
  createWebRunsClient,
  executeReadOnlyWithSessionToken,
  parseEquGpsConfig,
  type EquGpsSafeOperation,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from "@taxi-gps/equgps";

type Timing = { operation: EquGpsSafeOperation; durationMs: number };

class TimedTransport implements HttpTransport {
  public readonly timings: Timing[] = [];
  private readonly transport = new FetchHttpTransport();

  public async execute(request: HttpRequest): Promise<HttpResponse> {
    const startedAt = performance.now();
    try {
      return await this.transport.execute(request);
    } finally {
      this.timings.push({ operation: request.operation, durationMs: Math.round(performance.now() - startedAt) });
    }
  }
}

function formatTimings(timings: readonly Timing[]): string {
  return timings.map((timing) => `${timing.operation ?? "unknown"}=${timing.durationMs}ms`).join(", ");
}

async function run(): Promise<void> {
  const config = parseEquGpsConfig({
    officialBaseUrl: process.env.EQUGPS_BASE_URL ?? "",
    webBaseUrl: process.env.EQUGPS_WEB_BASE_URL ?? "",
    email: process.env.EQUGPS_EMAIL ?? "",
    password: process.env.EQUGPS_PASSWORD ?? "",
    requestTimeoutMs: Number(process.env.EQUGPS_REQUEST_TIMEOUT_MS),
  });
  const transport = new TimedTransport();
  const official = createOfficialEquGpsClient(config, transport);
  const webRuns = createWebRunsClient(config, transport);
  const tokenProvider = new SessionTokenProvider(() => official.createSession());
  let sessionSuccess = false;
  let devicesCount: number | undefined;
  let positionsCount: number | undefined;
  let runsCount: number | undefined;
  let safeError: { errorType: string; operation?: string; status?: number } | undefined;
  try {
    await tokenProvider.getToken();
    sessionSuccess = true;
    devicesCount = (await official.getDevices()).length;
    positionsCount = (await official.getLatestPositions()).length;
    runsCount = (await executeReadOnlyWithSessionToken(tokenProvider, (token) => webRuns.getRuns(token))).length;
  } catch (error: unknown) {
    if (error instanceof EquGpsError) {
      safeError = {
        errorType: error.name,
        ...(error.operation === undefined ? {} : { operation: error.operation }),
        ...(error.status === undefined ? {} : { status: error.status }),
      };
    } else {
      safeError = { errorType: "unknown" };
    }
    process.exitCode = 1;
  } finally {
    console.log(`session success: ${sessionSuccess}`);
    if (devicesCount !== undefined) console.log(`devices: ${devicesCount}`);
    if (positionsCount !== undefined) console.log(`positions: ${positionsCount}`);
    if (runsCount !== undefined) console.log(`runs: ${runsCount}`);
    console.log(`durations: ${formatTimings(transport.timings)}`);
    if (safeError !== undefined) {
      console.log(`errorType: ${safeError.errorType}`);
      if (safeError.operation !== undefined) console.log(`operation: ${safeError.operation}`);
      if (safeError.status !== undefined) console.log(`status: ${safeError.status}`);
    }
  }
}

void run().catch(() => { process.exitCode = 1; });
