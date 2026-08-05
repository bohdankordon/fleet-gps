import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import type { AddressInfo } from "node:net";
import { AppModule } from "./app.module";

async function runSmokeTest(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
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
  } finally {
    await app.close();
  }
}

void runSmokeTest();
