import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("CLI rejects password or any other value through argv without echoing it", () => { const secret = "do-not-print-this-password"; const result = spawnSync(process.execPath, ["dist/auth-user-create.js", "--password", secret], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgresql://unused" } }); assert.equal(result.status, 1); assert.match(result.stderr, /does not accept arguments/); assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false); });
test("CLI requires a secure interactive TTY hidden-input path", () => { const result = spawnSync(process.execPath, ["dist/auth-user-create.js"], { encoding: "utf8", input: "", env: { ...process.env, DATABASE_URL: "postgresql://unused" } }); assert.equal(result.status, 1); assert.match(result.stderr, /interactive TTY/); });
test("CLI output is restricted to non-secret created account fields", () => { const source = readFileSync("src/auth-user-create.ts", "utf8"); assert.match(source, /stdin\.setRawMode\(true\)/); assert.match(source, /Created \$\{created\.role\} account \$\{created\.login\}/); assert.doesNotMatch(source, /stdout\.write\([^\n]*(passwordHash|passwordSalt|material)/); assert.doesNotMatch(source, /console\.(log|error)/); });
