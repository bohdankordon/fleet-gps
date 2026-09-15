import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateTemporaryPassword } from "./temporary-password";

test("temporary password is an exact 24-character base64url value with 144 bits of input entropy", () => {
  const password = generateTemporaryPassword(() => Uint8Array.from({ length: 18 }, (_, index) => index));
  assert.match(password, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(password.length, 24);
});

test("temporary passwords use independent cryptographic values and never Math.random", () => {
  assert.notEqual(generateTemporaryPassword(), generateTemporaryPassword());
  const source = readFileSync("src/modules/auth/temporary-password.ts", "utf8");
  assert.match(source, /randomBytes/);
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(source, /random\(18\)/);
  const adminSource = readFileSync("src/modules/auth/admin-users.service.ts", "utf8");
  assert.doesNotMatch(adminSource, /console\.|logger|temporaryPassword[^\n]*(log|print)/i);
  assert.doesNotMatch(adminSource, /password-policy|validateUserSelectedPassword|blocklist/i);
});
