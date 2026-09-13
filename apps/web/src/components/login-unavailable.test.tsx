import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginUnavailable } from "./login-unavailable";

const pageSource = readFileSync("src/app/login/page.tsx", "utf8");
const loginCss = readFileSync("src/styles/login.css", "utf8");

test("unavailable card renders localized copy with a safe retry action", () => {
  const html = renderToStaticMarkup(<LoginUnavailable locale="en" />);
  assert.match(html, /role="alert"/);
  assert.ok(html.includes("Fleet GPS is temporarily unavailable"));
  assert.ok(html.includes("Try again"));
  assert.match(html, /<a[^>]*href="\/login"[^>]*>/);
  assert.match(html, /ant-btn-primary/);
  assert.match(html, /ant-btn-block/);
  assert.doesNotMatch(html, /anticon|ant-btn-icon/);
  assert.doesNotMatch(html, /<form|<input|password/i);
  assert.doesNotMatch(html, /taxi_session/);
});

test("unavailable card covers UK and RU without credential fields", () => {
  const uk = renderToStaticMarkup(<LoginUnavailable locale="uk" />);
  assert.ok(uk.includes("Fleet GPS"));
  assert.match(uk, /href="\/login"/);
  assert.doesNotMatch(uk, /<input/i);
  const ru = renderToStaticMarkup(<LoginUnavailable locale="ru" />);
  assert.ok(ru.includes("Fleet GPS"));
  assert.match(ru, /href="\/login"/);
  assert.doesNotMatch(ru, /<input/i);
});

test("login page keeps the accepted card and routes unavailable away from the form", () => {
  assert.match(pageSource, /resolveAuthUser\(\)/);
  assert.match(pageSource, /landingFor\(resolution\.user\)/);
  assert.match(pageSource, /LoginUnavailable/);
  assert.doesNotMatch(pageSource, /getAuthUser/);
  assert.equal((pageSource.match(/<h1/g) ?? []).length, 1);
  assert.match(pageSource, /login-page/);
  assert.match(pageSource, /login-card/);
  assert.doesNotMatch(pageSource, /returnTo|callback|redirect\?/i);
});

test("unavailable retry target stays a same-origin login reload", () => {
  const viewSource = readFileSync("src/components/login-unavailable.tsx", "utf8");
  assert.match(viewSource, /href="\/login"/);
  assert.doesNotMatch(viewSource, /http|returnTo|callback/i);
  assert.match(viewSource, /<Button type="primary" block href="\/login">/);
  assert.doesNotMatch(viewSource, /icon|timer|countdown|setTimeout|setInterval/i);
  assert.match(loginCss, /\.login-card__summary \+ \.login-card__actions/);
  assert.match(loginCss, /\.login-card__actions \.ant-btn-primary/);
  assert.match(loginCss, /min-height: 44px/);
});
