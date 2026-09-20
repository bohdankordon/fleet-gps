import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () => readFileSync("src/components/app-navigation.tsx", "utf8");

test("restricted onboarding uses one shared rule for desktop and compact", () => {
  const navigation = source();
  const matches = navigation.match(/user\?\.mustChangePassword === true/g) ?? [];
  assert.equal(matches.length, 1);
  assert.match(navigation, /const restricted = user\?\.mustChangePassword === true/);
  assert.match(navigation, /const allNavigation = restricted \? \[\] : navigationFor/);
  assert.match(navigation, /const administration = restricted \? \[\] : adminNavigationFor/);
  assert.match(navigation, /const administrationParent = restricted \? undefined/);
});

test("desktop restricted mode hides product nav and keeps language, identity, and logout", () => {
  const navigation = source();
  const desktop = navigation.slice(navigation.indexOf("function DesktopNavigation"));
  assert.match(desktop, /<Brand staticMode=\{restricted\} \/>/);
  assert.match(desktop, /restricted \|\| navigation\.length/);
  assert.match(desktop, /<LanguageSelector \/>/);
  assert.match(desktop, /<AccountMenu login/);
  assert.match(desktop, /restricted=\{restricted\}/);
});

test("restricted desktop header pins utilities right without phantom navigation", () => {
  const navigation = source();
  const desktop = navigation.slice(navigation.indexOf("function DesktopNavigation"), navigation.indexOf("function CompactNavigation"));
  assert.match(desktop, /taxi-header--restricted/);
  assert.match(desktop, /restricted \? "taxi-header taxi-header--restricted" : "taxi-header"/);
  assert.doesNotMatch(desktop, /phantom|marginInline|margin-inline-start: \d+px|paddingInline: \d+px/);
  const css = readFileSync("src/styles/shell.css", "utf8");
  assert.match(css, /\.taxi-header--restricted \.taxi-header__tools \{[\s\S]*?margin-inline-start: auto;/);
  assert.doesNotMatch(css, /\.taxi-header--restricted[^}]*\d+px/);
  // Normal, compact, and login shells keep their own header classes.
  assert.match(navigation, /taxi-header--login/);
  assert.match(navigation, /taxi-header--compact/);
  const compact = navigation.slice(navigation.indexOf("function CompactNavigation"), navigation.indexOf("function Brand"));
  assert.doesNotMatch(compact, /taxi-header--restricted/);
});

test("compact restricted mode hides product and administration and keeps utility capabilities", () => {
  const navigation = source();
  const compact = navigation.slice(navigation.indexOf("function CompactNavigation"));
  assert.match(compact, /<Brand staticMode=\{restricted\} \/>/);
  assert.match(compact, /restricted \? null/);
  assert.match(compact, /<LanguageSelector \/>/);
  assert.match(compact, /restricted=\{restricted\}/);
  assert.match(compact, /administrationParent && administration\.length > 0/);
});

test("restricted brand is static text, never a link to the product", () => {
  const navigation = source();
  const brand = navigation.slice(navigation.indexOf("function Brand"));
  assert.match(brand, /if \(staticMode\)/);
  assert.match(brand, /taxi-header__brand--static/);
  assert.match(brand, /<Link className="taxi-header__brand" href="\//);
  const css = readFileSync("src/styles/shell.css", "utf8");
  assert.match(css, /\.taxi-header__brand--static/);
  assert.match(css, /cursor: default/);
});

test("restricted account menu contains logout only with no account destination or divider", () => {
  const navigation = source();
  const menu = navigation.slice(navigation.indexOf("function AccountMenu"));
  assert.match(menu, /restricted/);
  assert.match(menu, /key: "logout"/);
  assert.match(menu, /key: "account"/);
  assert.match(menu, /LogoutOutlined/);
  assert.match(menu, /UserOutlined/);
});

test("normal and login brand behavior remains navigational", () => {
  const navigation = source();
  assert.match(navigation, /pathname === "\/login"/);
  assert.match(navigation, /function Brand/);
});
