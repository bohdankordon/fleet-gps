import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import { OneTimePassword, copyOneTimePassword, isOneTimePassword } from "./one-time-password";

const password = "A".repeat(24);

test("one-time password accepts only the server response format", () => {
  assert.equal(isOneTimePassword(password), true);
  assert.equal(isOneTimePassword(""), false);
  assert.equal(isOneTimePassword("short"), false);
});

test("copy receives exactly the supplied valid password", async () => {
  let copied = "";
  assert.equal(await copyOneTimePassword(password, async (value) => { copied = value; }), "copied");
  assert.equal(copied, password);
});

test("clipboard rejection and invalid input cannot report successful copying", async () => {
  assert.equal(await copyOneTimePassword(password, async () => { throw new Error("clipboard denied"); }), "failed");
  let calls = 0;
  assert.equal(await copyOneTimePassword("", async () => { calls += 1; }), "invalid");
  assert.equal(calls, 0);
});

test("presentation renders a masked secret before explicit reveal", () => {
  const html = renderToStaticMarkup(<I18nProvider locale="en"><OneTimePassword password={password} title="Created" onDone={() => undefined} /></I18nProvider>);
  assert.match(html, /••••••••••••••••••••••••/);
  assert.equal(html.includes(password), false);
});

test("Strict Mode cannot clear the supplied password because the child owns no mutable secret", () => {
  const source = readFileSync("src/components/one-time-password.tsx", "utf8");
  assert.doesNotMatch(source, /useEffect|useState\(password\)|\[secret,\s*setSecret\]|setSecret\(/);
  assert.match(source, /visible \? password :/);
  assert.match(source, /copyOneTimePassword\(password,/);
  assert.match(source, /navigator\.clipboard\.writeText\(value\)/);
});

test("ordinary rerenders retain the current password prop until the parent handles Done", () => {
  const source = readFileSync("src/components/one-time-password.tsx", "utf8");
  assert.match(source, /\{visible \? password : "••••••••••••••••••••••••"\}/);
  assert.doesNotMatch(source, /useState\([^)]*password|setSecret\(/);
  assert.match(source, /onDone\(\)/);
});

test("create and reset keep the parent response state as the shared presentation source until Done", () => {
  const create = readFileSync("src/components/admin-user-create-form.tsx", "utf8");
  const reset = readFileSync("src/components/admin-user-detail.tsx", "utf8");
  assert.match(create, /setSecret\(result\.temporaryPassword\)/);
  assert.match(create, /<OneTimePassword password=\{secret\}/);
  assert.match(create, /onDone=\{\(\) => \{ setSecret\(null\); router\.push/);
  assert.match(reset, /setSecret\(result\.temporaryPassword\)/);
  assert.match(reset, /<OneTimePassword password=\{secret\}/);
  assert.match(reset, /onDone=\{\(\) => setSecret\(null\)\}/);
});

test("copy failure is accessible and no persistence or plaintext logging is introduced", () => {
  const source = readFileSync("src/components/one-time-password.tsx", "utf8");
  assert.match(source, /copyError && <p role="alert">\{t\("admin\.password\.copyError"\)\}<\/p>/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|console\.|execCommand/);
});
