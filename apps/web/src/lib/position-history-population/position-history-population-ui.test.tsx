import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PositionHistoryStatusView } from "../../components/position-history-status-view";
import { positionHistoryStatusFixture } from "../position-history-status/position-history-status-fixture";

const exact = "2026-08-11T02:00:00.000Z";

test("view-only status remains visible without the protected execution block", () => {
  const html = renderToStaticMarkup(<PositionHistoryStatusView anchor={exact} data={positionHistoryStatusFixture()} error={null} canPopulate={false} />);
  assert.ok(html.includes("История GPS")); assert.ok(html.includes("Диапазоны заполнения")); assert.equal(html.includes("Дозаполнить историю"), false); assert.equal(html.includes("Максимум часовых окон"), false);
});

test("populate UI source has exact defaults, confirmation gate, pending guard, safe result and no expansive controls", () => {
  const source = readFileSync("src/components/position-history-population.tsx", "utf8");
  for (const expected of ["Дозаполнение истории", "useState<Budget>(24)", "useState(true)", "setConfirming(true)", "Подтвердите запуск", "Контрольная точка", "GPS-провайдером", "GPS-наблюдения и чекпоинты", "Отмена", "Запустить", "if (pendingRequest.current) return", "pendingRequest.current = true", "disabled={pending}", "Дозаполнение истории уже выполняется", "Часть работы могла быть сохранена", "Дозаполнение завершено", "Обработано окон", "Rate limits", "router.refresh()"] ) assert.ok(source.includes(expected), expected);
  assert.match(source, /\(\[6, 12, 24\] as const\)/); assert.match(source, /to: anchor, maxWindows, excludeProviderDisabled/);
  for (const forbidden of ["500, 1000", "unlimited", "Без лимита", "Pause", "Resume", "Приостановить", "Возобновить", "Удалить", "Очистить", "setInterval", "useEffect"]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("history page grants the block through effective populate authority including ADMIN", () => {
  const page = readFileSync("src/app/admin/history/page.tsx", "utf8"); const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(page, /hasPermission\(user, "historyAdmin\.populate"\)/); assert.match(proxy, /horizon-populate"\) return \["historyAdmin\.populate"\]/);
});
