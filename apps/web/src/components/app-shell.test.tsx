import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./app-shell";
import { LinkButton, PageHeader } from "./ui";

test("AppShell owns one stable main landmark and keyboard skip target", () => {
  const html = renderToStaticMarkup(<AppShell skipLabel="Skip to main content" navigation={<header>Navigation</header>}><p>Page content</p></AppShell>);
  assert.match(html, /<a[^>]*class="app-shell__skip-link"[^>]*href="#app-main"/);
  assert.match(html, /<main[^>]*id="app-main"[^>]*tabindex="-1"/i);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.ok(html.includes("Skip to main content"));
});

test("PageHeader composes operational heading, metadata, actions, and secondary navigation", () => {
  const html = renderToStaticMarkup(<PageHeader eyebrow="Administration" title="Create user" description="Add a user to the fleet." metadata={<span>Required fields marked</span>} actions={<LinkButton href="/admin/users">Back</LinkButton>} secondaryNavigation={<nav aria-label="Section">Users</nav>} />);
  assert.match(html, /<header[^>]*ui-page-header/);
  assert.match(html, /<h1>Create user<\/h1>/);
  assert.match(html, /ui-page-header__metadata/);
  assert.match(html, /ui-page-header__actions/);
  assert.match(html, /ui-page-header__secondary-navigation/);
  assert.match(html, /<a[^>]*href="\/admin\/users"/);
});

test("shell navigation keeps semantic links, labelled landmarks, and permission-aware source", () => {
  const navigation = readFileSync("src/components/app-navigation.tsx", "utf8");
  const admin = readFileSync("src/components/admin-subnavigation.tsx", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const shellCss = readFileSync("src/styles/shell.css", "utf8");
  assert.match(layout, /<AppShell skipLabel=\{t\("navigation\.skipToMain"\)\}/);
  assert.match(navigation, /<nav className="app-nav" aria-label=\{t\("navigation\.primaryLabel"\)\}/);
  assert.match(navigation, /navigationFor\(user, locale\)\.map\(\(item\) => <Link/);
  assert.match(navigation, /aria-current=\{isActiveAppNavigationPath/);
  assert.match(navigation, /app-nav__list" tabIndex=\{0\}/);
  assert.match(navigation, /Taxi GPS/);
  assert.match(admin, /<nav className="admin-subnav" aria-label=\{t\("navigation\.adminLabel"\)\}/);
  assert.match(shellCss, /overflow-x: auto/);
  assert.match(shellCss, /app-nav__list \{ display: flex; gap: var\(--space-1\); width: 100%; min-width: 0;/);
  assert.match(shellCss, /@media \(max-width: 639px\)/);
  assert.match(shellCss, /app-nav a\[aria-current="page"\]/);
  assert.match(shellCss, /app-nav a\[aria-current="page"\][^\n]*color-brand-subtle/);
  assert.match(shellCss, /\.app-brand svg[^\n]*color-brand-subtle/);
});

test("route content delegates its main landmark to AppShell rather than nesting main elements", () => {
  const routeFiles = ["src/app/page.tsx", "src/app/events/page.tsx", "src/app/map/page.tsx", "src/app/login/page.tsx", "src/app/admin/users/new/page.tsx"];
  for (const file of routeFiles) assert.doesNotMatch(readFileSync(file, "utf8"), /<main\b/, file);
});
