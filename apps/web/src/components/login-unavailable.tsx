import { Button } from "antd";
import type { AppLocale } from "../i18n/locales";
import { unavailableCopy } from "../lib/auth/auth-unavailable-copy";

export function LoginUnavailable({ locale }: Readonly<{ locale: AppLocale }>) {
  const copy = unavailableCopy(locale);
  return (
    <>
      <div role="alert" className="login-card__summary">
        <p className="login-card__unavailable-title">{copy.title}</p>
        <p className="login-card__unavailable-body">{copy.body}</p>
      </div>
      <p className="login-card__actions">
        <Button type="primary" block href="/login">
          {copy.action}
        </Button>
      </p>
    </>
  );
}
