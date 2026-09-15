import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { INVALID_CREDENTIALS_MESSAGE } from "./auth.constants";
import { InvalidCredentialsError, LoginRateLimitedError } from "./auth.service";
import { PasswordPolicyError, PasswordPolicyReason } from "./password-policy";

const response = { setHeader: () => undefined };

const GENERIC_401_BODY = Object.freeze({
  statusCode: 401,
  error: "Unauthorized",
  message: INVALID_CREDENTIALS_MESSAGE,
});

function controllerThrowing(error: unknown): AuthController {
  return new AuthController({
    login: async () => {
      throw error;
    },
  } as never);
}

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

test("password-policy failures expose only stable safe 400 reasons", async () => {
  for (const reason of Object.values(PasswordPolicyReason)) {
    const controller = new AuthController({ changePassword: async () => { throw new PasswordPolicyError(reason); } } as never);
    await assert.rejects(controller.changePassword({ auth: { id: "user-id" } } as never, { currentPassword: "sentinel-current", newPassword: "sentinel-new" }, response), (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 400);
      assert.deepEqual(error.getResponse(), { statusCode: 400, error: "PASSWORD_POLICY", reason });
      const body = JSON.stringify(error.getResponse());
      assert.equal(body.includes("sentinel-current"), false);
      assert.equal(body.includes("sentinel-new"), false);
      return true;
    });
  }
});

test("unknown login, wrong password, and disabled account remain indistinguishable generic 401", async () => {
  const bodies: unknown[] = [];
  for (const reason of ["unknown-login", "wrong-password", "disabled-account"] as const) {
    const controller = controllerThrowing(new InvalidCredentialsError());
    await assert.rejects(
      controller.login({ login: "operator", password: "private" }, response),
      (error: unknown) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), 401);
        assert.deepEqual(error.getResponse(), GENERIC_401_BODY);
        bodies.push(error.getResponse());
        return true;
      },
    );
    void reason;
  }
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
});

test("InvalidCredentialsError maps to the exact existing generic 401 contract", async () => {
  const controller = controllerThrowing(new InvalidCredentialsError());
  await assert.rejects(controller.login({ login: "operator", password: "private" }, response), (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 401);
    assert.deepEqual(error.getResponse(), GENERIC_401_BODY);
    assert.equal(JSON.stringify(error.getResponse()).includes("operator"), false);
    assert.equal(JSON.stringify(error.getResponse()).includes("private"), false);
    return true;
  });
});

test("LoginRateLimitedError maps to the existing 429 plus LOGIN_RATE_LIMITED", async () => {
  const controller = controllerThrowing(new LoginRateLimitedError());
  await assert.rejects(controller.login({ login: "operator", password: "private" }, response), (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 429);
    assert.deepEqual(error.getResponse(), { statusCode: 429, error: "LOGIN_RATE_LIMITED" });
    assert.equal(JSON.stringify(error.getResponse()).includes("operator"), false);
    assert.equal(JSON.stringify(error.getResponse()).includes("private"), false);
    return true;
  });
});

test("an ordinary unexpected error is not converted to 401", async () => {
  const unexpected = new Error("unexpected login infrastructure failure");
  const controller = controllerThrowing(unexpected);
  await assert.rejects(controller.login({ login: "operator", password: "private" }, response), (error: unknown) => {
    assert.equal(error, unexpected);
    assert.ok(!(error instanceof HttpException) || (error as HttpException).getStatus() !== 401);
    return true;
  });
});

test("a representative database failure is not converted to 401", async () => {
  const databaseFailure = Object.assign(new Error("connect ECONNREFUSED sentinel-db-private"), { code: "P1001" });
  const controller = controllerThrowing(databaseFailure);
  await assert.rejects(controller.login({ login: "operator", password: "private" }, response), (error: unknown) => {
    assert.equal(error, databaseFailure);
    assert.ok(!(error instanceof HttpException) || (error as HttpException).getStatus() !== 401);
    return true;
  });
});

test("a representative session-storage failure is not converted to 401", async () => {
  const storageFailure = new Error("authSession create sentinel-session-private");
  const controller = controllerThrowing(storageFailure);
  await assert.rejects(controller.login({ login: "operator", password: "private" }, response), (error: unknown) => {
    assert.equal(error, storageFailure);
    if (error instanceof HttpException) {
      assert.notEqual(error.getStatus(), 401);
      assert.equal(JSON.stringify(error.getResponse()).includes("sentinel-session-private"), false);
    }
    return true;
  });
});

test("raw unexpected-error details never become an auth response body", async () => {
  for (const message of [
    "sentinel-unexpected-private-1",
    "sentinel-db-private-2",
  ] as const) {
    const unexpected = new Error(message);
    const controller = controllerThrowing(unexpected);
    await assert.rejects(controller.login({ login: "operator", password: "private" }, response), (error: unknown) => {
      assert.equal(error, unexpected);
      if (error instanceof HttpException) {
        assert.equal(JSON.stringify(error.getResponse()).includes(message), false);
      }
      return true;
    });
  }
});
