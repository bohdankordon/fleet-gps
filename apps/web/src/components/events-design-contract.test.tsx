import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const events = readFileSync("src/components/events-client.tsx", "utf8");
const initialError = readFileSync("src/components/initial-events-error.tsx", "utf8");
const styles = readFileSync("src/styles/events.css", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");

test("Events composes owned Fluent primitives without changing its request, cursor, or history contracts", () => {
  for (const primitive of ["PageHeader", "FormField", "NativeSelect", "Button", "Alert", "LoadingStatus", "EmptyState", "Card", "Badge", "LoadMore"]) assert.match(events, new RegExp(`\\b${primitive}\\b`));
  assert.match(events, /primaryController\.current\?\.abort\(\)/);
  assert.match(events, /moreController\.current\?\.abort\(\)/);
  assert.match(events, /window\.history\.pushState/);
  assert.match(events, /alertEventsHistoryPath\(next\)/);
  assert.match(events, /window\.addEventListener\("popstate"/);
  assert.match(events, /serializeAlertEventsRequestQuery\(\{ \.\.\.list\.filters, limit: ALERT_EVENTS_PAGE_SIZE, cursor: list\.data\.nextCursor/);
  assert.match(events, /succeedAlertEventsLoadMore/);
  assert.match(events, /cache: "no-store"/);
});

test("Events tables and mobile cards preserve accessible data parity and explicit vehicle links", () => {
  assert.match(events, /<caption className="sr-only">\{t\("events\.title"\)\}<\/caption>/);
  assert.equal((events.match(/scope="col"/g) ?? []).length, 7);
  assert.ok((events.match(/href=\{`\/vehicles\/\$\{event\.vehicle\.id\}`\}/g) ?? []).length >= 2);
  for (const field of ["events.table.opened", "events.table.resolved", "events.table.details"]) assert.ok((events.match(new RegExp(`t\\("${field}"\\)`, "g")) ?? []).length >= 2, field);
  assert.match(events, /className="events-mobile-card"/);
  assert.match(styles, /\.events-table-container \{ display: none; \}/);
  assert.match(styles, /\.events-mobile-list \{ display: grid/);
  assert.match(styles, /@media \(max-width: 767px\)/);
});

test("Events uses semantic badge, filter, metric, feedback, and pagination contracts without local visual literals", () => {
  assert.match(events, /status === "OPEN" \? "danger" : "neutral"/);
  for (const delivery of ["success", "danger", "warning", "neutral"]) assert.match(events, new RegExp(`"${delivery}"`));
  for (const tone of ["primary", "warning", "info"]) assert.match(events, new RegExp(`tone: "${tone}"`));
  assert.match(events, /aria-busy=\{list\.loading \|\| list\.moreLoading \|\| undefined\}/);
  assert.match(events, /loadingLabel=\{t\("events\.loadingMore"\)\}/);
  assert.match(initialError, /PageHeader/);
  assert.match(initialError, /ErrorState/);
  assert.match(styles, /background: var\(--color-brand-subtle\)/);
  assert.match(styles, /--table-header-height/);
  assert.match(styles, /--table-row-height-default/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
  assert.match(globals, /@import "\.\.\/styles\/events\.css"/);
});
