import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountSignOutSection } from "./account-sign-out-section";

test("shared sign-out keeps the accepted composition and danger action", () => {
  const html = renderToStaticMarkup(<ConfigProvider><AccountSignOutSection locale="en" action={<button type="button">Sign out fixture</button>} /></ConfigProvider>);
  assert.match(html, /account-signout/);
  assert.match(html, />Sign out</);
  assert.match(html, /End your current session on this device\./);
  assert.match(html, /Sign out fixture/);
  const source = readFileSync("src/components/account-sign-out-section.tsx", "utf8");
  assert.match(source, /<LogoutButton danger \/>/);
  assert.doesNotMatch(source, /danger="primary"|type="primary"/);
});

test("Overview and Security render the same sign-out surface", () => {
  for (const file of ["src/components/account-overview.tsx", "src/components/account-security.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /<AccountSignOutSection/);
    assert.doesNotMatch(source, /account-signout__fact|account-signout__action/);
  }
});
