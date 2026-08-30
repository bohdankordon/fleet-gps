import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./app-shell";
import { LinkButton, PageHeader } from "./ui";

test("AppShell owns one stable main landmark and keyboard skip target", () => {
  const html = renderToStaticMarkup(<AppShell skipLabel="Skip to main content" navigation={<header>Navigation</header>}><p>Page content</p></AppShell>);
  assert.match(html, /<a[^>]*class="taxi-shell__skip-link"[^>]*href="#app-main"/);
  assert.match(html, /<main[^>]*id="app-main"[^>]*tabindex="-1"/i);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.ok(html.includes("Skip to main content"));
});

test("PageHeader still supports legacy route content during the incremental migration", () => {
  const html = renderToStaticMarkup(<PageHeader eyebrow="Administration" title="Create user" description="Add a user to the fleet." metadata={<span>Required fields marked</span>} actions={<LinkButton href="/admin/users">Back</LinkButton>} secondaryNavigation={<nav aria-label="Section">Users</nav>} />);
  assert.match(html, /<header[^>]*ui-page-header/);
  assert.match(html, /<h1>Create user<\/h1>/);
  assert.match(html, /ui-page-header__metadata/);
  assert.match(html, /ui-page-header__actions/);
});

test("the shell establishes official Ant Design App Router, locale, horizontal menu, and mobile Drawer integration", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const provider = readFileSync("src/components/ant-design-provider.tsx", "utf8");
  const navigation = readFileSync("src/components/app-navigation.tsx", "utf8");
  const shellCss = readFileSync("src/styles/shell.css", "utf8");
  assert.match(layout, /@ant-design\/nextjs-registry/);
  assert.match(layout, /<AntdRegistry>/);
  assert.match(provider, /<ConfigProvider locale=\{ANT_DESIGN_LOCALES\[locale\]\}>/);
  for (const name of ["enUS", "ruRU", "ukUA"]) assert.match(provider, new RegExp(`\\b${name}\\b`));
  assert.match(navigation, /mode="horizontal"/);
  assert.match(navigation, /theme="dark"/);
  assert.match(navigation, /<Drawer/);
  assert.match(navigation, /adminNavigationFor\(user, locale\)/);
  assert.match(navigation, /items\.push\(\{ key: "administration"/);
  assert.match(navigation, /afterNavigation/);
  assert.doesNotMatch(navigation, /Sider|Layout\.Sider/);
  assert.doesNotMatch(shellCss, /\.ant-/);
});

test("route content delegates its main landmark to AppShell rather than nesting main elements", () => {
  const routeFiles = ["src/app/page.tsx", "src/app/events/page.tsx", "src/app/map/page.tsx", "src/app/login/page.tsx", "src/app/admin/users/new/page.tsx"];
  for (const file of routeFiles) assert.doesNotMatch(readFileSync(file, "utf8"), /<main\b/, file);
});
