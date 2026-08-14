import { FormEvent } from "react";
import { LOGIN_ACTION, LoginFormError } from "../lib/auth/login-form-core";
import { useI18n } from "../i18n/client";

type LoginFormViewProps = Readonly<{
  busy: boolean;
  error: LoginFormError | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>;

export function LoginFormView({ busy, error, onSubmit }: LoginFormViewProps) {
  const { t } = useI18n();
  const errorMessage = error === "LOGIN_REQUIRED" ? t("auth.login.loginRequired") : error === "LOGIN_INVALID" ? t("auth.login.loginInvalid") : error === "PASSWORD_REQUIRED" ? t("auth.login.passwordRequired") : error === "INVALID_CREDENTIALS" ? t("auth.login.invalidCredentials") : error === "RATE_LIMITED" ? t("auth.login.rateLimited") : error === "UNAVAILABLE" ? t("auth.login.unavailable") : null;
  return <form className="auth-form" action={LOGIN_ACTION} method="post" noValidate onSubmit={onSubmit}>
    <label>{t("auth.login.loginLabel")}<input name="login" autoComplete="username" minLength={3} maxLength={64} /></label>
    <label>{t("auth.login.passwordLabel")}<input name="password" type="password" autoComplete="current-password" /></label>
    {errorMessage && <p role="alert">{errorMessage}</p>}
    <button type="submit" disabled={busy}>{busy ? t("auth.login.submitting") : t("auth.login.submit")}</button>
  </form>;
}
