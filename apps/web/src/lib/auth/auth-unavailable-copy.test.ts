import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, unavailableCopy } from "./auth-unavailable-copy";

test("unavailable copy matches the approved EN text", () => {
  assert.deepEqual(unavailableCopy("en"), {
    title: "Fleet GPS is temporarily unavailable",
    body: "We can\u2019t verify access right now. Try again in a moment.",
    action: "Try again",
  });
});

test("unavailable copy matches the approved UK text", () => {
  const copy = unavailableCopy("uk");
  assert.equal(copy.title.includes("Fleet GPS"), true);
  assert.equal(copy.title.includes("Taxi GPS"), false);
  assert.deepEqual(copy, {
    title: "Fleet GPS \u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0439",
    body: "\u0417\u0430\u0440\u0430\u0437 \u043d\u0435 \u0432\u0434\u0430\u0454\u0442\u044c\u0441\u044f \u043f\u0435\u0440\u0435\u0432\u0456\u0440\u0438\u0442\u0438 \u0434\u043e\u0441\u0442\u0443\u043f. \u0421\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437 \u0437\u0430 \u043c\u0438\u0442\u044c.",
    action: "\u0421\u043f\u0440\u043e\u0431\u0443\u0432\u0430\u0442\u0438 \u0449\u0435 \u0440\u0430\u0437",
  });
});

test("unavailable copy matches the approved RU text", () => {
  const copy = unavailableCopy("ru");
  assert.equal(copy.title.includes("Fleet GPS"), true);
  assert.equal(copy.title.includes("Taxi GPS"), false);
  assert.deepEqual(copy, {
    title: "Fleet GPS \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d",
    body: "\u0421\u0435\u0439\u0447\u0430\u0441 \u043d\u0435 \u0443\u0434\u0430\u0451\u0442\u0441\u044f \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0447\u0443\u0442\u044c \u043f\u043e\u0437\u0436\u0435.",
    action: "\u041f\u043e\u043f\u0440\u043e\u0431\u043e\u0432\u0430\u0442\u044c \u0441\u043d\u043e\u0432\u0430",
  });
});

test("unavailable copy carries no credential or session language", () => {
  for (const locale of ["en", "uk", "ru"] as const) {
    const text = JSON.stringify(unavailableCopy(locale));
    assert.equal(/password|session|cookie|taxi_session/i.test(text), false);
  }
});

test("escapeHtml neutralizes request-derived URLs", () => {
  assert.equal(escapeHtml("/admin/settings"), "/admin/settings");
  assert.equal(
    escapeHtml("/admin/settings?next=<script>alert(1)</script>"),
    "/admin/settings?next=&lt;script&gt;alert(1)&lt;/script&gt;",
  );
  assert.equal(escapeHtml("a&b'c"), "a&amp;b&#39;c");
});
