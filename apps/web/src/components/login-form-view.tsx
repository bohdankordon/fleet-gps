import type { FormInstance } from "antd";
import { Alert, Button, Form, Input } from "antd";
import { LOGIN_ACTION, LOGIN_PATTERN, type LoginFormError } from "../lib/auth/login-form-core";
import type { MessageKey } from "../i18n/messages";
import { useI18n } from "../i18n/client";

export type LoginFormValues = Readonly<{ login: string; password: string }>;

export function loginFormErrorKey(error: LoginFormError): MessageKey {
  switch (error) {
    case "LOGIN_REQUIRED":
      return "auth.login.loginRequired";
    case "LOGIN_INVALID":
      return "auth.login.loginInvalid";
    case "PASSWORD_REQUIRED":
      return "auth.login.passwordRequired";
    case "INVALID_CREDENTIALS":
      return "auth.login.invalidCredentials";
    case "RATE_LIMITED":
      return "auth.login.rateLimited";
    case "UNAVAILABLE":
      return "auth.login.unavailable";
  }
}

type LoginFormViewProps = Readonly<{
  form: FormInstance<LoginFormValues>;
  busy: boolean;
  locked: boolean;
  error: LoginFormError | null;
  summaryRef: React.RefObject<HTMLDivElement | null>;
  onFinish: (values: LoginFormValues) => void;
  onFinishFailed: () => void;
}>;

// Ant Design owns the form grammar (labels, validation, Alert, focus);
// this view carries no request logic. Credentials are never trimmed here.
export function LoginFormView({ form, busy, locked, error, summaryRef, onFinish, onFinishFailed }: LoginFormViewProps) {
  const { t } = useI18n();
  return (
    <>
      <div ref={summaryRef} tabIndex={-1} className="login-card__summary">
        {error ? <Alert type="error" showIcon role="alert" title={t(loginFormErrorKey(error))} /> : null}
      </div>
      <Form<LoginFormValues>
        form={form}
        layout="vertical"
        className="login-card__form"
        action={LOGIN_ACTION}
        method="post"
        initialValues={{ login: "", password: "" }}
        disabled={locked}
        aria-busy={busy}
        preserve
        onFinish={onFinish}
        onFinishFailed={onFinishFailed}
        requiredMark={false}
      >
        <Form.Item
          name="login"
          label={t("auth.login.loginLabel")}
          rules={[
            { required: true, message: t("auth.login.loginRequired") },
            { pattern: LOGIN_PATTERN, message: t("auth.login.loginInvalid") },
          ]}
        >
          <Input name="login" autoComplete="username" maxLength={64} />
        </Form.Item>
        <Form.Item
          name="password"
          label={t("auth.login.passwordLabel")}
          rules={[{ required: true, message: t("auth.login.passwordRequired") }]}
        >
          <Input.Password name="password" autoComplete="current-password" />
        </Form.Item>
        <Form.Item className="login-card__actions">
          <Button type="primary" htmlType="submit" block loading={busy} disabled={locked} aria-live="polite">
            {busy ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </Form.Item>
      </Form>
    </>
  );
}
