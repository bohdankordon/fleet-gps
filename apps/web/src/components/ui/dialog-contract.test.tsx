import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync("src/components/ui/dialog.tsx", "utf8");
const styles = readFileSync("src/styles/components.css", "utf8");
const consumers = ["admin-user-detail.tsx", "position-history-population.tsx", "position-history-durable-runs.tsx", "position-history-retention.tsx"].map((file) => readFileSync(`src/components/${file}`, "utf8"));

test("Taxi GPS Dialog owns Radix behavior while exposing accessible title, description, trigger, and close contracts", () => {
  assert.match(dialog, /import \* as RadixDialog from "@radix-ui\/react-dialog"/);
  for (const contract of ["RadixDialog.Root", "RadixDialog.Trigger", "RadixDialog.Portal", "RadixDialog.Overlay", "RadixDialog.Content", "RadixDialog.Title", "RadixDialog.Description", "onOpenAutoFocus", "onEscapeKeyDown"]) assert.ok(dialog.includes(contract), contract);
  assert.match(dialog, /role=\{kind\}/);
  assert.match(dialog, /dismissible = true/);
  assert.match(dialog, /closeLabel/);
  assert.match(dialog, /initialFocusRef/);
});

test("Taxi GPS AlertDialog gives cancellation initial focus and composes a textual destructive confirmation", () => {
  assert.match(dialog, /kind="alertdialog"/);
  assert.match(dialog, /const cancelRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(dialog, /ref=\{cancelRef\} variant="secondary"/);
  assert.match(dialog, /variant=\{destructive \? "destructive" : "primary"\}/);
  assert.match(dialog, /loading=\{loading\}/);
});

test("dialog styling uses the owned Fluent surface, motion, responsive, and focus-compatible token contract", () => {
  for (const token of ["--color-surface-raised", "--shadow-overlay", "--radius-xl", "--duration-fast", "--duration-normal", "--ease-standard", "--space-5"]) assert.ok(styles.includes(token), token);
  assert.match(styles, /\.ui-dialog__overlay/);
  assert.match(styles, /\.ui-dialog \{/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("confirmation consumers use Taxi GPS primitives and retain no direct Radix or hand-built modal roles", () => {
  for (const source of consumers) {
    assert.match(source, /AlertDialog/);
    assert.doesNotMatch(source, /@radix-ui\/react-dialog/);
    assert.doesNotMatch(source, /role="(?:dialog|alertdialog)"/);
    assert.doesNotMatch(source, /aria-modal/);
  }
  assert.match(consumers[0], /variant="destructive"/);
  assert.match(consumers[0], /OneTimePassword/);
  assert.match(consumers[1], /pendingRequest\.current/);
  assert.match(consumers[2], /submitting\.current/);
  assert.match(consumers[3], /retention-execute/);
  assert.match(consumers[3], /<Alert variant="danger" live="assertive" title=\{error\} \/>/);
});
