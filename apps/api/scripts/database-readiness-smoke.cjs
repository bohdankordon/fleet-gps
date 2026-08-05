function safeErrorType(error) { return error && error.name === "ApiConfigurationError" ? "configuration" : "unknown"; }
async function main() {
  let app; let liveness = false; let readiness = false; let databaseReady = false; let closed = false; const nativeFetch = global.fetch; let externalRequests = 0; const defaults = { EQUGPS_BASE_URL: "https://trace.example.test/api", EQUGPS_WEB_BASE_URL: "https://web.example.test", EQUGPS_EMAIL: "readiness-smoke@example.test", EQUGPS_PASSWORD: "readiness-smoke-password", EQUGPS_REQUEST_TIMEOUT_MS: "15000" }; const previous = new Map(Object.keys(defaults).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(defaults)) if (!process.env[key]) process.env[key] = value;
  global.fetch = async (input, init) => { const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url; if (!url.startsWith("http://127.0.0.1:")) externalRequests += 1; return nativeFetch(input, init); };
  try {
    const { NestFactory } = require("@nestjs/core");
    const { AppModule } = require("../dist/app.module");
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix("api"); await app.listen(0, "127.0.0.1");
    const port = app.getHttpServer().address().port;
    const live = await fetch(`http://127.0.0.1:${port}/api/health`); liveness = live.status === 200;
    const ready = await fetch(`http://127.0.0.1:${port}/api/health/ready`); const body = await ready.json(); readiness = ready.status === 200; databaseReady = Boolean(body && body.database === "ready");
    if (!liveness || !readiness || !databaseReady || externalRequests !== 0) { console.log("errorType: database"); process.exitCode = 1; }
  } catch (error) { console.log(`errorType: ${safeErrorType(error)}`); process.exitCode = 1; }
  finally { if (app) { try { await app.close(); closed = true; } catch { console.log("errorType: unknown"); process.exitCode = 1; } } global.fetch = nativeFetch; for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } console.log(`liveness: ${liveness}`); console.log(`readiness: ${readiness}`); console.log(`database ready: ${databaseReady}`); console.log(`application closed: ${closed}`); }
}
void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });
