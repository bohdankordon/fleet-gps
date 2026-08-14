import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { InvalidCredentialsError, LoginRateLimitedError } from "./auth.service";

const response = { setHeader: () => undefined };

test("blocked login returns only the stable safe 429 contract", async () => {
  const controller = new AuthController({ login: async () => { throw new LoginRateLimitedError(); } } as never);
  await assert.rejects(controller.login({ login: "operator", password: "private" }, response), (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 429);
    assert.deepEqual(error.getResponse(), { statusCode: 429, error: "LOGIN_RATE_LIMITED" });
    assert.equal(JSON.stringify(error.getResponse()).includes("operator"), false);
    return true;
  });
});

test("ordinary credential failures retain the generic non-disclosing 401 contract", async () => {
  const controller = new AuthController({ login: async () => { throw new InvalidCredentialsError(); } } as never);
  await assert.rejects(controller.login({ login: "operator", password: "private" }, response), (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 401);
    const body = error.getResponse();
    assert.equal(JSON.stringify(body).includes("operator"), false);
    return true;
  });
});
