function safeErrorType(error) {
  if (error && error.name === "ApiConfigurationError") return "configuration";
  if (error && typeof error.name === "string" && (error.name.startsWith("Prisma") || error.name === "DailyRunsConfigurationError")) return "database";
  if (error && error.name === "HttpException") return "http";
  return "unknown";
}

async function main() {
  let app;
  let status = 0;
  let body;
  let externalRequests = 0;
  let closed = true;
  const nativeFetch = global.fetch;
  require("./load-root-env.cjs").loadRootEnv();
  global.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith("http://127.0.0.1:")) externalRequests += 1;
    return nativeFetch(input, init);
  };
  try {
    const { NestFactory } = require("@nestjs/core");
    const { AppModule } = require("../dist/app.module");
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    closed = false;
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const port = app.getHttpServer().address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/dashboard/vehicles`);
    status = response.status;
    body = await response.json();
    const summary = body && body.summary;
    const vehicles = Array.isArray(body && body.vehicles) ? body.vehicles : [];
    const safeItems = vehicles.every((vehicle) => !Object.prototype.hasOwnProperty.call(vehicle, "externalDeviceId") && !Object.prototype.hasOwnProperty.call(vehicle, "latitude") && !Object.prototype.hasOwnProperty.call(vehicle, "longitude"));
    if (status !== 200 || !/^\d{4}-\d{2}-\d{2}$/.test(String(body?.serviceDate)) || !body?.timezone || !summary || !safeItems || externalRequests !== 0) throw new Error("dashboard smoke assertion");
  } catch (error) {
    console.log(`errorType: ${safeErrorType(error)}`);
    process.exitCode = 1;
  } finally {
    if (app) {
      try { await app.close(); closed = true; }
      catch { closed = false; console.log("errorType: unknown"); process.exitCode = 1; }
    }
    global.fetch = nativeFetch;
    const summary = body && body.summary ? body.summary : {};
    const vehicles = Array.isArray(body && body.vehicles) ? body.vehicles : [];
    const withDistance = vehicles.filter((vehicle) => vehicle.dailyDistanceMeters !== null).length;
    console.log(`http status: ${status}`);
    console.log(`service date valid: ${/^\d{4}-\d{2}-\d{2}$/.test(String(body?.serviceDate ?? ""))}`);
    console.log(`timezone configured: ${Boolean(body?.timezone)}`);
    console.log(`total vehicles: ${summary.total ?? 0}`);
    console.log(`online count: ${summary.online ?? 0}`);
    console.log(`offline count: ${summary.offline ?? 0}`);
    console.log(`unknown count: ${summary.unknown ?? 0}`);
    console.log(`fresh positions: ${summary.freshPositions ?? 0}`);
    console.log(`stale positions: ${summary.stalePositions ?? 0}`);
    console.log(`without position: ${summary.withoutPosition ?? 0}`);
    console.log(`below minimum distance: ${summary.belowMinimumDistance ?? 0}`);
    console.log(`without daily stat: ${summary.withoutDailyStat ?? 0}`);
    console.log(`vehicle items: ${vehicles.length}`);
    console.log(`items with daily distance: ${withDistance}`);
    console.log(`items without daily distance: ${vehicles.length - withDistance}`);
    console.log(`external requests: ${externalRequests}`);
    console.log(`application closed: ${closed}`);
  }
}

void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });
