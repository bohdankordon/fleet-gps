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

test("the shell establishes the light Fleet GPS Ant Design header and responsive navigation contract", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const provider = readFileSync("src/components/ant-design-provider.tsx", "utf8");
  const navigation = readFileSync("src/components/app-navigation.tsx", "utf8");
  const shellCss = readFileSync("src/styles/shell.css", "utf8");
  assert.match(layout, /@ant-design\/nextjs-registry/);
  assert.match(layout, /<AntdRegistry>/);
  assert.match(provider, /<ConfigProvider locale=\{ANT_DESIGN_LOCALES\[locale\]\}>/);
  for (const name of ["enUS", "ruRU", "ukUA"]) assert.match(provider, new RegExp(`\\b${name}\\b`));
  assert.match(navigation, /<span>Fleet GPS<\/span>/);
  assert.doesNotMatch(navigation, />Taxi GPS</);
  assert.match(navigation, /EnvironmentFilled/);
  assert.doesNotMatch(navigation, /CarOutlined/);
  assert.match(navigation, /<Link className="taxi-header__brand" href="\/">.*<EnvironmentFilled.*aria-hidden.*<span>Fleet GPS<\/span>.*<\/Link>/);
  assert.match(navigation, /<Drawer[\s\S]*title=\{<Brand \/>\}/);
  assert.match(navigation, /taxi-header--compact[\s\S]*<Brand \/>/);
  assert.match(navigation, /<nav className="taxi-header__nav"/);
  assert.match(navigation, /navigation\.map\(\(item\) =>/);
  assert.match(navigation, /className=\{`taxi-header__nav-link/);
  assert.match(navigation, /isActiveAppNavigationPath\(item\.href, pathname\)/);
  assert.doesNotMatch(navigation, /mode="horizontal"|DesktopAdministration|overflowedIndicator|EllipsisOutlined/);
  for (const icon of ["TeamOutlined", "SettingOutlined", "AuditOutlined", "HistoryOutlined"]) assert.match(navigation, new RegExp(`\\b${icon}\\b`));
  assert.match(navigation, /<Drawer/);
  assert.match(navigation, /MenuOutlined/);
  assert.match(navigation, /adminNavigationFor\(user, locale\)/);
  assert.match(navigation, /const close = \(\) => setOpen\(false\)/);
  assert.match(navigation, /onClick=\{close\}/);
  assert.match(navigation, /<Avatar size=\{24\}>/);
  assert.match(navigation, /UserOutlined/);
  assert.match(navigation, /LogoutOutlined/);
  assert.match(navigation, /key: "logout", danger: true/);
  assert.doesNotMatch(navigation, /Sider|Layout\.Sider/);
  assert.doesNotMatch(shellCss, /\.ant-/);
  assert.match(shellCss, /\.taxi-header__inner[\s\S]*display: flex;[\s\S]*align-items: center;/);
  assert.match(shellCss, /padding-inline: 28px/);
  assert.match(shellCss, /\.taxi-header__brand[\s\S]*margin-inline-start:[\s\S]*margin-inline-end:[\s\S]*padding-inline-start:[\s\S]*padding-inline-end:/);
});

test("locale and shell controls use Ant Design icons instead of typed icon-like Unicode", () => {
  const navigation = readFileSync("src/components/app-navigation.tsx", "utf8");
  const selector = readFileSync("src/components/language-selector.tsx", "utf8");
  assert.match(selector, /GlobalOutlined/);
  assert.match(selector, /DownOutlined/);
  assert.match(selector, /<Dropdown/);
  assert.match(selector, /selectedKeys: \[selectedKey\]/);
  assert.match(selector, /preferenceMode === "automatic" \? t\("language\.automatic"\) : NATIVE_LOCALE_NAMES\[locale\]/);
  for (const source of [navigation, selector]) assert.doesNotMatch(source, /[→←✓⚙🌐⋮]/u);
});

test("route content delegates its main landmark to AppShell rather than nesting main elements", () => {
  const routeFiles = ["src/app/page.tsx", "src/app/events/page.tsx", "src/app/map/page.tsx", "src/app/login/page.tsx", "src/app/admin/users/new/page.tsx"];
  for (const file of routeFiles) assert.doesNotMatch(readFileSync(file, "utf8"), /<main\b/, file);
});
