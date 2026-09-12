import assert from "node:assert/strict";
import test from "node:test";
import { accountNavigationFor, activeAccountNavigationPath } from "./account-navigation";

test("Account has one stable route-per-job navigation model in every locale", () => {
  assert.deepEqual(accountNavigationFor("en").map((item) => item.href), ["/account", "/account/change-password", "/account/telegram", "/account/notifications"]);
  assert.deepEqual(accountNavigationFor("uk").map((item) => item.label), ["Огляд", "Безпека", "Telegram", "Сповіщення"]);
  assert.deepEqual(accountNavigationFor("ru").map((item) => item.label), ["Обзор", "Безопасность", "Telegram", "Уведомления"]);
});

test("Account active destination does not let Overview swallow child routes", () => {
  assert.equal(activeAccountNavigationPath("/account"), "/account");
  assert.equal(activeAccountNavigationPath("/account/change-password"), "/account/change-password");
  assert.equal(activeAccountNavigationPath("/account/telegram/linking"), "/account/telegram");
  assert.equal(activeAccountNavigationPath("/account/notifications"), "/account/notifications");
  assert.equal(activeAccountNavigationPath("/account/no-access"), undefined);
});
