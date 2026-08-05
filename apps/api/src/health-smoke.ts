import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import type { AddressInfo } from "node:net";
import { AppModule } from "./app.module";

const safeEnvironment = {
  EQUGPS_BASE_URL: "https://trace.example.test/api",
  EQUGPS_WEB_BASE_URL: "https://web.example.test",
  EQUGPS_EMAIL: "health-smoke@example.test",
  EQUGPS_PASSWORD: "health-smoke-password",
  EQUGPS_REQUEST_TIMEOUT_MS: "15000",
  DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:1/invalid?schema=public",
};

async function runSmokeTest(): Promise<void> {
  const original = new Map<string, string | undefined>(Object.keys(safeEnvironment).map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  let externalRequests = 0;
  Object.assign(process.env, safeEnvironment);
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith("http://127.0.0.1:")) externalRequests += 1;
    return nativeFetch(input, init);
  };
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    assert.equal(typeof body, "object");
    assert.notEqual(body, null);
    const health = body as Record<string, unknown>;
    assert.equal(health.status, "ok");
    assert.equal(health.service, "taxi-gps-api");
    assert.equal(typeof health.timestamp, "string");
    assert.equal(Number.isNaN(Date.parse(health.timestamp as string)), false);
    assert.equal(externalRequests, 0);
  } finally {
    if (app !== undefined) await app.close();
    globalThis.fetch = nativeFetch;
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

void runSmokeTest();
