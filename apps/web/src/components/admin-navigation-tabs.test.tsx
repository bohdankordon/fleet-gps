import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Administration uses permission-aware real links and a compact mobile switcher", () => {
  const tabs = readFileSync("src/components/admin-navigation-tabs.tsx", "utf8");
  assert.match(tabs, /import Link from "next\/link"/);
  assert.match(tabs, /Grid, Menu, Select/);
  assert.match(tabs, /adminNavigationFor\(user, locale\)/);
  assert.match(tabs, /activeAdminNavigationPath\(items, pathname\)/);
  assert.match(tabs, /aria-current=\{item\.href === activeKey \? "page"/);
  assert.match(tabs, /selectedKeys=\{activeKey \? \[activeKey\] : \[\]\}/);
  assert.match(tabs, /navigation\.adminSwitcherLabel/);
  assert.match(tabs, /router\.push\(href\)/);
  assert.match(tabs, /navigation\.adminTabsLabel/);
  assert.doesNotMatch(tabs, /<Tabs|tabpanels?/i);
  assert.doesNotMatch(tabs, /[→←✓⚙🌐⋮]/u);
});

test("every supported Administration screen mounts the shared navigation after its page header", () => {
  const directFiles = [
    "src/app/admin/users/new/page.tsx",
    "src/app/admin/users/[userId]/page.tsx",
    "src/app/admin/settings/page.tsx",
  ];
  for (const file of directFiles) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /AdminNavigationTabs/, file);
    const headerEnd = Math.max(source.indexOf("</header>"), source.indexOf("<PageHeader"));
    assert.ok(headerEnd >= 0 && source.indexOf("<AdminNavigationTabs", headerEnd) > headerEnd, file);
  }
  const usersPage = readFileSync("src/app/admin/users/page.tsx", "utf8");
  assert.ok(usersPage.indexOf("<AdminNavigationTabs") > usersPage.indexOf("<AdminUsersPageHeader"));
  const auditPage = readFileSync("src/app/admin/audit/page.tsx", "utf8");
  const historyPage = readFileSync("src/app/admin/history/page.tsx", "utf8");
  const auditView = readFileSync("src/components/audit-viewer.tsx", "utf8");
  const historyView = readFileSync("src/components/position-history-status-view.tsx", "utf8");
  assert.match(auditPage, /<AuditViewer navigation=\{<AdminNavigationTabs \/>\}/);
  assert.match(historyPage, /<PositionHistoryStatusView[\s\S]*navigation=\{<AdminNavigationTabs \/>\}/);
  assert.ok(auditView.indexOf("{navigation}") > auditView.indexOf("</header>"));
  assert.ok(historyView.indexOf("{navigation}") > historyView.indexOf("</header>"));
});
