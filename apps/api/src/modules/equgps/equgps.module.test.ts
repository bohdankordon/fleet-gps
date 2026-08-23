import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { HttpRequest, HttpResponse, HttpTransport } from "@taxi-gps/equgps";
import { EquGpsGatewayService } from "./equgps-gateway.service";
import { EquGpsModule } from "./equgps.module";
import { EQU_GPS_TRANSPORT } from "./equgps.tokens";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), positionHistoryMaintenance: Object.freeze({ enabled: false, windowBudget: 5_000 }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });
class RecordingTransport implements HttpTransport {
  public readonly requests: HttpRequest[] = [];
  public async execute(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    if (request.operation === "createSession") return { status: 200, headers: { "content-type": "application/json" }, body: { token: "fake-session" } };
    if (request.operation === "getRuns") return { status: 200, headers: { "content-type": "application/json" }, body: [] };
    throw new Error("unexpected test operation");
  }
}
async function moduleWithFakeTransport() {
  const transport = new RecordingTransport();
  const testingModule = await Test.createTestingModule({ imports: [EquGpsModule] }).overrideProvider(API_CONFIG).useValue(config).overrideProvider(EQU_GPS_TRANSPORT).useValue(transport).compile();
  return { testingModule, transport };
}

test("EquGpsModule compiles lazily without HTTP and exports the gateway", async () => {
  const { testingModule, transport } = await moduleWithFakeTransport();
  try { assert.ok(testingModule.get(EquGpsGatewayService)); assert.deepEqual(Reflect.getMetadata("exports", EquGpsModule), [EquGpsGatewayService]); assert.equal(transport.requests.length, 0); }
  finally { await testingModule.close(); }
});
test("concurrent Nest gateway web calls share the singleton session provider", async () => {
  const { testingModule, transport } = await moduleWithFakeTransport();
  try { const gateway = testingModule.get(EquGpsGatewayService); await Promise.all([gateway.getRuns(), gateway.getRuns(), gateway.getRuns()]); assert.equal(transport.requests.filter((request) => request.operation === "createSession").length, 1); assert.equal(transport.requests.filter((request) => request.operation === "getRuns").length, 3); }
  finally { await testingModule.close(); }
});
