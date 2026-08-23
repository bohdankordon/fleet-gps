import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, FormField, Input, Label, LinkButton, LoadingStatus, NativeSelect, Spinner } from ".";

test("Button exposes semantic variants and preserves width content while loading", () => {
  for (const variant of ["primary", "secondary", "subtle", "destructive"] as const) {
    const html = renderToStaticMarkup(<Button variant={variant}>Save</Button>);
    assert.match(html, new RegExp(`ui-button--${variant}`));
  }
  for (const size of ["compact", "default", "comfortable"] as const) assert.match(renderToStaticMarkup(<Button size={size}>Save</Button>), new RegExp(`ui-button--${size}`));
  const html = renderToStaticMarkup(<Button loading iconBefore={<span>+</span>}>Save changes</Button>);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /ui-button__spinner/);
  assert.match(html, />Save changes</);
});

test("LinkButton retains anchor semantics", () => {
  const html = renderToStaticMarkup(<LinkButton href="/vehicles" variant="secondary">Vehicles</LinkButton>);
  assert.match(html, /^<a /);
  assert.match(html, /href="\/vehicles"/);
  assert.doesNotMatch(html, /<button/);
});

test("FormField associates labels, help, errors, and required invalid semantics", () => {
  const html = renderToStaticMarkup(<FormField id="vehicle-name" label="Vehicle name" required help="Use the fleet display name" error="A vehicle name is required"><Input /></FormField>);
  assert.match(html, /<label[^>]*for="vehicle-name"/);
  assert.match(html, /id="vehicle-name"/);
  assert.match(html, /required=""/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="vehicle-name-help vehicle-name-error"/);
  assert.match(html, /id="vehicle-name-help"/);
  assert.match(html, /id="vehicle-name-error"/);
  const disabled = renderToStaticMarkup(<FormField id="readonly-code" label="Code" disabled readOnly><Input /></FormField>);
  assert.match(disabled, /disabled=""/);
  assert.match(disabled, /readOnly=""/);
});

test("native controls retain native label relationships", () => {
  const select = renderToStaticMarkup(<><Label htmlFor="region">Region</Label><NativeSelect id="region"><option>North</option></NativeSelect></>);
  const checkbox = renderToStaticMarkup(<><Checkbox id="active" /><Label htmlFor="active">Active</Label></>);
  assert.match(select, /<label[^>]*for="region"/);
  assert.match(select, /<select[^>]*id="region"/);
  assert.match(checkbox, /<input[^>]*id="active"[^>]*type="checkbox"/);
  assert.match(checkbox, /<label[^>]*for="active"/);
});

test("feedback primitives preserve semantic text and deliberate live-region contracts", () => {
  const badge = renderToStaticMarkup(<Badge variant="warning">Needs review</Badge>);
  const info = renderToStaticMarkup(<Alert title="Sync complete">All devices are current.</Alert>);
  const urgent = renderToStaticMarkup(<Alert variant="danger" live="assertive" title="Connection lost">Retry the request.</Alert>);
  assert.match(badge, />Needs review</);
  assert.doesNotMatch(info, /role="alert"/);
  assert.match(urgent, /role="alert"/);
  assert.match(urgent, /aria-live="assertive"/);
  for (const variant of ["neutral", "info", "success", "warning", "danger"] as const) assert.match(renderToStaticMarkup(<Badge variant={variant}>Status</Badge>), new RegExp(`ui-badge--${variant}`));
  for (const variant of ["default", "subtle", "raised"] as const) assert.match(renderToStaticMarkup(<Card variant={variant}>Content</Card>), new RegExp(`ui-card--${variant}`));
  assert.match(renderToStaticMarkup(<Card as="article">Operational group</Card>), /^<article /);
});

test("state and loading primitives expose accessible status and recovery actions", () => {
  const empty = renderToStaticMarkup(<EmptyState title="No vehicles" action={<LinkButton href="/vehicles/new">Add vehicle</LinkButton>}>Adjust filters or add a vehicle.</EmptyState>);
  const error = renderToStaticMarkup(<ErrorState action={<Button>Retry</Button>}>The data could not be loaded.</ErrorState>);
  const spinner = renderToStaticMarkup(<Spinner label="Loading vehicles" />);
  const loading = renderToStaticMarkup(<LoadingStatus title="Loading vehicles">Contacting the fleet service.</LoadingStatus>);
  assert.match(empty, /<a[^>]*href="\/vehicles\/new"/);
  assert.match(error, /role="alert"/);
  assert.match(error, /<button/);
  assert.match(spinner, /role="status"/);
  assert.match(spinner, /aria-label="Loading vehicles"/);
  assert.match(loading, /aria-live="polite"/);
});

test("design tokens define the canonical visible focus contract", () => {
  const tokens = readFileSync("src/styles/tokens.css", "utf8");
  const base = readFileSync("src/styles/base.css", "utf8");
  for (const token of ["color-canvas", "color-surface-raised", "color-text-disabled", "color-border-strong", "color-action-primary-pressed", "color-focus-ring", "control-height-comfortable", "table-row-height-default", "font-size-page-title", "breakpoint-xl"]) assert.match(tokens, new RegExp(`--${token}:`));
  assert.match(base, /:focus-visible/);
  assert.match(base, /outline: 3px solid var\(--color-focus-ring\)/);
});
