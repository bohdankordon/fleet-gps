import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tokens = readFileSync("src/styles/tokens.css", "utf8");

function token(name: string) {
  const match = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6})`));
  assert.ok(match, `missing hex token ${name}`);
  return match[1];
}

function contrast(foreground: string, background: string) {
  const toRgb = (hex: string) => {
    const expanded = hex.length === 4 ? `#${hex.slice(1).split("").map((part) => part + part).join("")}` : hex;
    return [1, 3, 5].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16) / 255);
  };
  const luminance = (hex: string) => toRgb(hex).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

test("the final semantic palette is explicitly owned and complete", () => {
  const expected = {
    "color-canvas": "#f5f7f9", "color-surface": "#ffffff", "color-surface-subtle": "#f0f3f6", "color-surface-raised": "#ffffff", "color-surface-hover": "#f8fafc", "color-surface-selected": "#e8f2f8",
    "color-text-primary": "#1b1b1b", "color-text-secondary": "#424242", "color-text-tertiary": "#616161", "color-text-disabled": "#626262", "color-text-inverse": "#ffffff", "color-text-link": "#0f5c91",
    "color-border-subtle": "#e0e0e0", "color-border-default": "#bdbdbd", "color-border-strong": "#707070", "color-border-interactive": "#0f5c91",
    "color-action-primary": "#0f5c91", "color-action-primary-hover": "#0b4c78", "color-action-primary-pressed": "#083b5d", "color-action-secondary": "#ffffff", "color-action-secondary-hover": "#f0f3f6", "color-action-secondary-pressed": "#e8f2f8", "color-action-subtle": "#e8f2f8", "color-action-subtle-hover": "#d9eaf5", "color-action-subtle-pressed": "#c7deed",
    "color-brand-subtle": "#edf6fb", "color-brand-subtle-hover": "#e1f0f8", "color-brand-border-subtle": "#4b8db6",
    "color-focus-ring": "#0b6ea8", "color-neutral-foreground": "#424242", "color-neutral-background": "#f0f3f6", "color-neutral-border": "#bdbdbd",
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(token(name), value, name);
  for (const status of ["success", "warning", "danger", "info"]) for (const part of ["foreground", "background", "border"]) assert.match(tokens, new RegExp(`--color-${status}-${part}:`));
});

test("semantic text, status, and focus pairs meet their contrast targets", () => {
  const pairs: Array<[string, string, number]> = [
    ["color-text-primary", "color-canvas", 4.5], ["color-text-secondary", "color-canvas", 4.5], ["color-text-primary", "color-surface", 4.5],
    ["color-text-inverse", "color-action-primary", 4.5], ["color-text-primary", "color-action-secondary", 4.5], ["color-text-inverse", "color-danger-foreground", 4.5],
    ["color-text-link", "color-canvas", 4.5], ["color-focus-ring", "color-canvas", 3], ["color-focus-ring", "color-surface", 3],
    ["color-success-foreground", "color-success-background", 4.5], ["color-warning-foreground", "color-warning-background", 4.5], ["color-danger-foreground", "color-danger-background", 4.5], ["color-info-foreground", "color-info-background", 4.5],
    ["color-text-primary", "color-surface-selected", 4.5], ["color-text-secondary", "color-surface-selected", 4.5], ["color-text-primary", "color-surface-hover", 4.5], ["color-text-secondary", "color-surface-hover", 4.5], ["color-text-secondary", "color-success-background", 4.5], ["color-text-secondary", "color-warning-background", 4.5], ["color-text-secondary", "color-danger-background", 4.5], ["color-text-secondary", "color-info-background", 4.5], ["color-text-secondary", "color-neutral-background", 4.5],
    ["color-action-primary", "color-surface-selected", 4.5], ["color-action-primary", "color-brand-subtle", 4.5], ["color-text-primary", "color-brand-subtle", 4.5], ["color-text-secondary", "color-brand-subtle", 4.5], ["color-brand-border-subtle", "color-surface", 3], ["color-neutral-foreground", "color-neutral-background", 4.5],
    ["color-text-tertiary", "color-surface", 4.5], ["color-text-disabled", "color-surface-subtle", 4.5],
  ];
  for (const [foreground, background, minimum] of pairs) {
    const ratio = contrast(token(foreground), token(background));
    assert.ok(ratio >= minimum, `${foreground} / ${background}: ${ratio.toFixed(2)}:1`);
  }
});

test("typography, density, table, motion, and elevation contracts remain tokenized", () => {
  for (const name of ["font-size-caption", "font-size-label", "font-size-body", "font-size-body-strong", "font-size-metadata", "font-size-section-title", "font-size-page-title", "table-header-height", "table-row-height-compact", "table-row-height-default", "table-cell-padding-inline", "table-cell-padding-block", "duration-fast", "duration-normal", "shadow-surface", "shadow-overlay"]) assert.match(tokens, new RegExp(`--${name}:`), name);
  assert.match(tokens, /--table-row-height-compact: 40px/);
  assert.match(tokens, /--table-row-height-default: 48px/);
});
