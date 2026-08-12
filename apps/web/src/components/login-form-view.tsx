import { FormEvent } from "react";
import { LOGIN_ACTION, LoginFormError } from "../lib/auth/login-form-core";

type LoginFormViewProps = Readonly<{
  busy: boolean;
  error: LoginFormError | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>;

export function LoginFormView({ busy, error, onSubmit }: LoginFormViewProps) {
  return <form className="auth-form" action={LOGIN_ACTION} method="post" noValidate onSubmit={onSubmit}>
    <label>Логин<input name="login" autoComplete="username" minLength={3} maxLength={64} /></label>
    <label>Пароль<input name="password" type="password" autoComplete="current-password" /></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? "Вход…" : "Войти"}</button>
  </form>;
}
