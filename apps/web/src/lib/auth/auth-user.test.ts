import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  AuthUnavailableError,
  requireResolutionUser,
  resolveAuthFromToken,
} from "./auth-resolution";
import { parseWebConfig } from "../web-config";

const safeUser = {
  id: "00000000-0000-4000-8000-000000000001",
  login: "operator",
  role: "ADMIN",
  permissions: [],
  mustChangePassword: false,
} as const;

const env = { API_INTERNAL_BASE_URL: "http://api.test" } as const;

function loadMe(
  respond: (url: string) => Promise<Response>,
  configEnv: Readonly<Record<string, string | undefined>> = env,
): (token: string) => Promise<Response> {
  return async (token: string) => {
    assert.ok(token);
    const { apiInternalBaseUrl } = parseWebConfig(configEnv);
    return respond(apiInternalBaseUrl + "/api/auth/me");
  };
}

const wrapperSource = readFileSync("src/lib/auth/auth-user.ts", "utf8");

test("absent session cookie resolves unauthenticated with zero auth fetch", async () => {
  let loads = 0;
  const resolution = await resolveAuthFromToken(undefined, async () => {
    loads += 1;
    return Response.json(safeUser);
  });
  assert.deepEqual(resolution, { kind: "unauthenticated" });
  assert.equal(loads, 0);
});

test("server wrapper hands the token and a config-scoped loader to the shared core", () => {
  const tokenHandoff = wrapperSource.indexOf("resolveAuthFromToken(token,");
  const configParse = wrapperSource.indexOf("parseWebConfig(apiEnv)");
  const loaderFetch = wrapperSource.indexOf("return fetcher(apiInternalBaseUrl");
  assert.ok(tokenHandoff > 0 && configParse > tokenHandoff && loaderFetch > tokenHandoff);
  assert.doesNotMatch(wrapperSource, /getAuthUser/);
});

test("valid cookie plus valid /me user resolves authenticated", async () => {
  let requestedUrl = "";
  const resolution = await resolveAuthFromToken(
    "session-token",
    loadMe(async (url) => {
      requestedUrl = url;
      return Response.json(safeUser);
    }),
  );
  assert.equal(resolution.kind, "authenticated");
  assert.deepEqual(resolution.kind === "authenticated" ? resolution.user : null, safeUser);
  assert.equal(requestedUrl, "http://api.test/api/auth/me");
});

test("stale cookie with /me 401 resolves unauthenticated without clearing the session", async () => {
  const resolution = await resolveAuthFromToken(
    "stale-token",
    loadMe(async () => Response.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 })),
  );
  assert.deepEqual(resolution, { kind: "unauthenticated" });
});

test("stable root-layout auth resolution tolerates repeated authenticated and unauthenticated transitions", async () => {
  const tokens = [undefined, "session-one", undefined, "session-two"] as const;
  const resolutions = await Promise.all(tokens.map((token) => resolveAuthFromToken(token, async () => Response.json(safeUser))));
  assert.deepEqual(resolutions.map((resolution) => resolution.kind), ["unauthenticated", "authenticated", "unauthenticated", "authenticated"]);
  assert.deepEqual(resolutions.filter((resolution) => resolution.kind === "authenticated").map((resolution) => resolution.user), [safeUser, safeUser]);
});

test("fetch rejection resolves unavailable", async () => {
  const resolution = await resolveAuthFromToken(
    "session-token",
    loadMe(async () => {
      throw new Error("private network details");
    }),
  );
  assert.deepEqual(resolution, { kind: "unavailable" });
  assert.equal(JSON.stringify(resolution).includes("private"), false);
});

test("configuration failure resolves unavailable", async () => {
  const resolution = await resolveAuthFromToken(
    "session-token",
    loadMe(async () => Response.json(safeUser), {}),
  );
  assert.deepEqual(resolution, { kind: "unavailable" });
});

test("malformed and structurally invalid 200 resolve unavailable", async () => {
  for (const respond of [
    async () => new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } }),
    async () => Response.json({ passwordHash: "must not surface" }),
  ]) {
    const resolution = await resolveAuthFromToken("session-token", loadMe(respond));
    assert.deepEqual(resolution, { kind: "unavailable" });
    assert.equal(JSON.stringify(resolution).includes("passwordHash"), false);
  }
});

test("unexpected /me statuses resolve unavailable", async () => {
  for (const status of [403, 500, 503]) {
    const resolution = await resolveAuthFromToken(
      "session-token",
      loadMe(async () => Response.json({ statusCode: status }, { status })),
    );
    assert.deepEqual(resolution, { kind: "unavailable" });
  }
});

test("requireResolutionUser returns the authenticated user", () => {
  const user = requireResolutionUser({ kind: "authenticated", user: safeUser }, () => {
    throw new Error("must not redirect");
  });
  assert.deepEqual(user, safeUser);
});

test("requireResolutionUser redirects unauthenticated instead of throwing unavailable", () => {
  assert.throws(
    () =>
      requireResolutionUser({ kind: "unauthenticated" }, () => {
        throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" });
      }),
    (error: unknown) => {
      assert.ok(!(error instanceof AuthUnavailableError));
      assert.equal((error as { digest?: unknown }).digest, "NEXT_REDIRECT");
      return true;
    },
  );
});

test("requireResolutionUser throws a clean AuthUnavailableError", () => {
  assert.throws(
    () =>
      requireResolutionUser({ kind: "unavailable" }, () => {
        throw new Error("must not redirect");
      }),
    (error: unknown) => {
      assert.ok(error instanceof AuthUnavailableError);
      assert.equal(String(error).includes("taxi_session"), false);
      return true;
    },
  );
});

test("server requireAuthUser keeps the redirect-or-throw contract", () => {
  assert.match(wrapperSource, /requireResolutionUser\(await resolveAuthUser\(deps\), \(\) => redirect\("\/login"\)\)/);
  assert.match(wrapperSource, /export \{ AuthUnavailableError/);
});
