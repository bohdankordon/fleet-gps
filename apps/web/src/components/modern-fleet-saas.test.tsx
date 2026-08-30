import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChevronDownIcon, ClockIcon, FleetIcon, GlobeIcon, HelpIcon, HistoryIcon, NoPositionIcon, OfflineIcon, OnlineIcon, RouteIcon, UserIcon, WarningIcon } from "./ui/icons";

test("source-owned icons share one decorative currentColor SVG contract", () => {
  const icons = [ChevronDownIcon, ClockIcon, FleetIcon, GlobeIcon, HelpIcon, HistoryIcon, NoPositionIcon, OfflineIcon, OnlineIcon, RouteIcon, UserIcon, WarningIcon];
  const html = renderToStaticMarkup(<>{icons.map((Icon) => <Icon key={Icon.name} />)}</>);
  assert.equal((html.match(/<svg/g) ?? []).length, icons.length);
  assert.equal((html.match(/viewBox="0 0 24 24"/g) ?? []).length, icons.length);
  assert.equal((html.match(/stroke="currentColor"/g) ?? []).length, icons.length);
  assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, icons.length);
  assert.doesNotMatch(html, /aria-label|role="img"/);
});

test("application shell owns locale and account controls without legacy horizontal navigation", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const topbar = readFileSync("src/components/topbar.tsx", "utf8");
  const sidebar = readFileSync("src/components/app-sidebar.tsx", "utf8");
  assert.doesNotMatch(layout, /LanguageSelector|language-selector-shell/);
  assert.match(topbar, /<LanguageSelector \/>/);
  assert.match(topbar, /DropdownMenu/);
  assert.match(topbar, /<DropdownMenuGroup><DropdownMenuLabel>\{user\.login\}<\/DropdownMenuLabel><\/DropdownMenuGroup>/);
  assert.match(topbar, /<DropdownMenuItem nativeButton render=\{<LogoutButton/);
  assert.match(sidebar, /SidebarProvider|Sidebar/);
});

test("dashboard and shared notices no longer use Unicode pseudo-icons", () => {
  const files = ["dashboard-client.tsx", "audit-viewer.tsx", "events-client.tsx", "fleet-activity-report-client.tsx", "fleet-map-client.tsx", "position-history-status-view.tsx", "vehicle-details-client.tsx", "vehicle-track-client.tsx", "vehicle-trips-client.tsx"];
  const source = files.map((file) => readFileSync(`src/components/${file}`, "utf8")).join("\n");
  assert.doesNotMatch(source, /[▦●○◷◴⚠]/);
  assert.doesNotMatch(readFileSync("src/components/dashboard-client.tsx", "utf8"), /["'>][!?…—]["'<]/);
  assert.match(source, /WarningIcon/);
});

test("shared CSS exposes the bounded token layer and no legacy language strip", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const tokens = readFileSync("src/styles/tokens.css", "utf8");
  assert.match(css, /@import "\.\.\/styles\/tokens\.css"/);
  for (const token of ["color-canvas", "color-surface", "color-surface-muted", "color-text-primary", "color-text-muted", "color-line", "color-line-strong", "color-accent", "color-accent-hover", "color-accent-soft", "color-success", "color-warning", "color-danger", "color-focus-ring", "radius-sm", "radius-md", "radius-lg", "shadow-surface", "control-height"]) assert.ok(tokens.includes(`--${token}:`), token);
  assert.doesNotMatch(css, /\.language-selector-shell/);
});

test("shadcn foundation uses Base UI while the legacy Radix dialog remains temporarily", () => {
  const packages = `${readFileSync("package.json", "utf8")}\n${readFileSync("../../package.json", "utf8")}`;
  assert.match(packages, /"@radix-ui\/react-dialog": "\^1\.1\.23"/);
  assert.match(packages, /"@base-ui\/react"/);
  assert.match(packages, /"shadcn"/);
  assert.match(readFileSync("src/components/ui/sidebar.tsx", "utf8"), /@base-ui\/react/);
});
