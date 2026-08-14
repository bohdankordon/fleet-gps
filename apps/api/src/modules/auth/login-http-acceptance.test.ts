import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AuditEventRepository } from "../audit";
import { DatabaseService } from "../database/database.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginRateLimiter } from "./login-rate-limiter";
import { hashPassword } from "./password";

test("real HTTP login path enforces fixed canonical buckets and rejects oversize before database work", { timeout: 15_000 }, async () => {
  const material = await hashPassword("Stage 21 synthetic credential value");
  const users = new Map(["operator", "success.user"].map((normalizedLogin, index) => [normalizedLogin, {
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    login: normalizedLogin,
    normalizedLogin,
    role: "USER" as const,
    disabled: false,
    mustChangePassword: false,
    passwordHashVersion: material.version,
    passwordSalt: new Uint8Array(material.salt),
    passwordHash: new Uint8Array(material.hash),
    passwordChangedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: [],
  }]));
  let authLookups = 0;
  const sessions: unknown[] = [];
  const transaction = {
    $queryRaw: async () => [{ id: "verified" }],
    authSession: { create: async ({ data }: { data: unknown }) => { sessions.push(data); } },
  };
  const client = {
    authUser: { findUnique: async ({ where }: { where: { normalizedLogin: string } }) => { authLookups += 1; return users.get(where.normalizedLogin) ?? null; } },
    $transaction: async (work: (value: typeof transaction) => Promise<unknown>) => work(transaction),
  };
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      AuthService,
      LoginRateLimiter,
      { provide: DatabaseService, useValue: { getClient: () => client } },
      { provide: AuditEventRepository, useValue: { append: async () => ({ id: "unused" }) } },
    ],
  }).compile();
  const app: INestApplication = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const login = (name: string, password: string) => fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: name, password }) });
  const loginBody = (body: unknown) => fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await login("OPERATOR", "wrong synthetic credential")).status, 401);
    const blocked = await login("operator", "Stage 21 synthetic credential value");
    assert.equal(blocked.status, 429);
    const blockedBody = await blocked.json();
    assert.deepEqual(blockedBody, { statusCode: 429, error: "LOGIN_RATE_LIMITED" });

    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await login("missing.user", "wrong synthetic credential")).status, 401);
    const unknownBlocked = await login("missing.user", "wrong synthetic credential");
    assert.equal(unknownBlocked.status, 429);
    assert.deepEqual(await unknownBlocked.json(), blockedBody);

    let genericCredentialsBody: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await login("SUCCESS.USER", "wrong synthetic credential");
      assert.equal(response.status, 401);
      if (attempt === 0) genericCredentialsBody = await response.json();
    }
    const lookupsBeforeMalformed = authLookups;
    const malformedLogin = await loginBody({ login: "bad login", password: "wrong synthetic credential" });
    assert.equal(malformedLogin.status, 401);
    assert.deepEqual(await malformedLogin.json(), genericCredentialsBody);
    assert.equal((await loginBody({ login: "success.user", password: null })).status, 401);
    assert.equal(authLookups, lookupsBeforeMalformed);
    assert.equal((await login("success.user", "Stage 21 synthetic credential value")).status, 201);
    assert.equal(sessions.length, 1);

    const lookupsBeforeOversize = authLookups;
    const oversized = await login("success.user", "x".repeat(150_000));
    assert.equal(oversized.status, 413);
    assert.equal(authLookups, lookupsBeforeOversize);
  } finally {
    await app.close();
  }
});
