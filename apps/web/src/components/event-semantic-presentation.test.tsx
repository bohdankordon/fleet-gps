import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckCircleFilled, ClockCircleFilled, WarningFilled } from "@ant-design/icons";
import { eventSemanticPresentation } from "./event-semantic-presentation";

test("all four event states preserve the accepted Overview icon, inline color and status output", () => {
  const token = { colorSuccess: "success-token", colorError: "error-token", colorWarning: "warning-token" };
  for (const type of ["SPEEDING", "INACTIVITY"] as const) for (const status of ["OPEN", "RESOLVED"] as const) {
    const actual = eventSemanticPresentation({ type, status }, token);
    const acceptedMarker = status === "RESOLVED" ? <CheckCircleFilled aria-hidden style={{ color: token.colorSuccess }} /> : type === "SPEEDING" ? <WarningFilled aria-hidden style={{ color: token.colorError }} /> : <ClockCircleFilled aria-hidden style={{ color: token.colorWarning }} />;
    assert.equal(renderToStaticMarkup(actual.marker), renderToStaticMarkup(acceptedMarker));
    assert.equal(actual.accent, status === "RESOLVED" ? token.colorSuccess : type === "SPEEDING" ? token.colorError : token.colorWarning);
    assert.equal(actual.statusColor, status === "OPEN" ? "red" : "green");
  }
});

test("Overview, Events chronology and detail consume one semantic mapping and keep selection independent", () => {
  for (const file of ["vehicle-details-client.tsx", "events-client.tsx", "event-detail.tsx"]) {
    const source = readFileSync(`src/components/${file}`, "utf8");
    assert.match(source, /eventSemanticPresentation\(event, token\)/);
    assert.doesNotMatch(source, /event\.status === "RESOLVED" \? token\.colorSuccess/);
  }
  const source = readFileSync("src/components/events-client.tsx", "utf8");
  assert.match(source, /"--trip-record-accent": eventSemanticPresentation\(event, token\).accent/);
  assert.match(source, /vehicle-trips__record--selected/);
  assert.match(source, /"--trip-record-selected": token.colorPrimaryBg/);
  assert.match(source, /"--trip-record-selected-border": token.colorPrimaryBorder/);
});
