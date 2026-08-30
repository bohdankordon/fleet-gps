import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkButton, PageHeader } from "./ui";

test("AppShell owns one stable main landmark and keyboard skip target", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  assert.match(shell, /className="app-shell__skip-link" href="#app-main"/);
  assert.match(shell, /<main id="app-main" className="app-shell__main" tabIndex=\{-1\}>/);
  assert.match(shell, /<SidebarProvider/);
  assert.match(shell, /<AppSidebar \/>/);
  assert.match(shell, /<Topbar \/>/);
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

test("shell navigation uses the Base UI sidebar, mobile trigger, and permission-aware source", () => {
  const sidebar = readFileSync("src/components/app-sidebar.tsx", "utf8");
  const topbar = readFileSync("src/components/topbar.tsx", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const shellCss = readFileSync("src/styles/shell.css", "utf8");
  assert.match(layout, /<AppShell skipLabel=\{t\("navigation\.skipToMain"\)\}/);
  assert.match(layout, /TooltipProvider/);
  assert.match(sidebar, /<Sidebar collapsible="icon">/);
  assert.match(sidebar, /navigationFor\(user, locale\)/);
  assert.match(sidebar, /adminNavigationFor\(user, locale\)/);
  assert.match(sidebar, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(sidebar, /if \(isMobile\) setOpenMobile\(false\)/);
  assert.match(sidebar, /tooltip=\{item\.label\}/);
  assert.match(topbar, /<SidebarTrigger className="size-11 md:size-7" aria-label=\{t\("navigation\.toggleSidebar"\)\}/);
  assert.match(topbar, /<LanguageSelector \/>/);
  assert.match(shellCss, /@media \(max-width: 639px\)/);
  assert.match(shellCss, /\.app-shell__main/);
  assert.match(shellCss, /\[data-sidebar="menu-button"\] \{ min-height: 44px;/);
  assert.doesNotMatch(shellCss, /app-nav/);
});

test("route content delegates its main landmark to AppShell rather than nesting main elements", () => {
  const routeFiles = ["src/app/page.tsx", "src/app/events/page.tsx", "src/app/map/page.tsx", "src/app/login/page.tsx", "src/app/admin/users/new/page.tsx"];
  for (const file of routeFiles) assert.doesNotMatch(readFileSync(file, "utf8"), /<main\b/, file);
});
