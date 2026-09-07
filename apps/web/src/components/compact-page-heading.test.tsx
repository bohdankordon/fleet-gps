import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigProvider } from "antd";
import { CompactPageHeading } from "./compact-page-heading";

test("compact page heading follows theme typography without taking over workspace layout", () => {
  const html = renderToStaticMarkup(<ConfigProvider theme={{ token: { fontSizeHeading3: 25, lineHeightHeading3: 1.3, fontSize: 15, fontWeightStrong: 650 } }}><CompactPageHeading title="Page" subtitle="Context" /></ConfigProvider>);
  assert.match(html, /^<h1 /);
  assert.match(html, /compact-page-heading__title/);
  assert.match(html, /font-size:25px;line-height:1.3;font-weight:650/);
  assert.match(html, /compact-page-heading__subtitle/);
  assert.match(html, /typography-secondary/);
  assert.match(html, /font-size:15px/);
  assert.doesNotMatch(html, /<header|<div/);
});

test("comparable Fleet, Map and Events headings share the standard; entity identity remains separate", () => {
  for (const file of ["dashboard-client.tsx", "fleet-map-client.tsx", "events-client.tsx", "initial-events-error.tsx", "initial-fleet-map-error.tsx"]) {
    const source = readFileSync(`src/components/${file}`, "utf8");
    assert.match(source, /<CompactPageHeading title=/, file);
    assert.doesNotMatch(source, /<(?:Typography\.)?Title level=\{1\}/, file);
  }
  const shell = readFileSync("src/components/vehicle-detail-shell.tsx", "utf8");
  assert.match(shell, /<Title level=\{1\}[^>]*>\{vehicleName\}<\/Title>/);
  assert.doesNotMatch(shell, /CompactPageHeading/);
});
