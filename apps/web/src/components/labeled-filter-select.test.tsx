import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigProvider } from "antd";
import { LabeledFilterSelect } from "./labeled-filter-select";

const shared = readFileSync("src/components/labeled-filter-select.tsx", "utf8");

test("shared filter keeps the accepted Fleet labeled-select contract", () => {
  assert.match(shared, /export function LabeledFilterSelect/);
  assert.match(shared, /export type LabeledFilterSelectOption/);
  assert.ok(shared.includes('className="fleet-toolbar__labeled-select"'));
  assert.ok(shared.includes('className="fleet-toolbar__select-sizer"'));
  assert.ok(shared.includes('aria-hidden="true"'));
  assert.ok(shared.includes('labelRender={({ label }) => <>{fieldLabel}: {label}</>}'));
  assert.ok(shared.includes('popupMatchSelectWidth'));
  assert.ok(shared.includes('className="fleet-toolbar__select-control"'));
  assert.ok(shared.includes('size="large"'));
  assert.ok(shared.includes('aria-label={ariaLabel}'));
  assert.ok(shared.includes('options={[...options]}'));
  assert.ok(shared.includes('import { Select, theme } from "antd"'));
  assert.ok(shared.includes('{options.map((option) => <span key={option.value}>{fieldLabel}: {option.label}</span>)}'));
});

test("shared filter reserves the longest label and delegates keyboard to Select", () => {
  assert.doesNotMatch(shared, /onKeyDown|onKeyUp|tabIndex/);
  const html = renderToStaticMarkup(<ConfigProvider><LabeledFilterSelect fieldLabel="Group" ariaLabel="Group" value="taxi" options={[{ value: "ALL", label: "All groups" }, { value: "taxi", label: "Taxi" }, { value: "ungrouped", label: "Ungrouped" }]} onChange={() => {}} /></ConfigProvider>);
  assert.ok(html.includes("Group: Taxi"));
  assert.ok(html.includes("Group: All groups"));
  assert.ok(html.includes("Group: Ungrouped"));
  assert.match(html, /role="combobox"/);
});
