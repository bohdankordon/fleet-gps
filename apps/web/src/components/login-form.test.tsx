import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginFormView } from "./login-form-view";

function render(error: Parameters<typeof LoginFormView>[0]["error"] = null): string {
  return renderToStaticMarkup(<LoginFormView busy={false} error={error} onSubmit={() => undefined} />);
}

test("native login form has an explicit same-origin POST contract and never a credential query", () => {
  const html = render();
  assert.match(html, /<form[^>]*action="\/api\/auth\/login"[^>]*method="post"/);
  assert.doesNotMatch(html, /method="get"|action="[^"]*\?/i);
  assert.doesNotMatch(html, /[?&](?:login|password)=/i);
});

test("click and Enter use the same single form submission path", () => {
  const html = render();
  assert.equal((html.match(/<form\b/g) ?? []).length, 1);
  assert.match(html, /<input(?=[^>]*name="password")(?=[^>]*type="password")[^>]*\/>/);
  assert.match(html, /<button type="submit"[^>]*>Войти<\/button>/);
  assert.doesNotMatch(html, /formaction=|onkeydown=/i);
});

test("login inputs expose the approved autocomplete hints", () => {
  const html = render();
  assert.match(html, /<input(?=[^>]*name="login")(?=[^>]*autoComplete="username")[^>]*\/>/);
  assert.match(html, /<input(?=[^>]*name="password")(?=[^>]*type="password")(?=[^>]*autoComplete="current-password")[^>]*\/>/);
});

test("login form renders only safe inline errors", () => {
  for (const message of ["Введите логин", "Логин должен содержать 3–64 символа: латинские буквы, цифры, точку, дефис или подчёркивание", "Введите пароль", "Неверный логин или пароль", "Не удалось выполнить вход. Попробуйте ещё раз."] as const) {
    const html = render(message);
    assert.match(html, /role="alert"/);
    assert.ok(html.includes(message));
  }
});
