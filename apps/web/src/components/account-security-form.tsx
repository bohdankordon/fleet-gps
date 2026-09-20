"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input } from "antd";
import { landingFor, parseAuthUser } from "../lib/auth/auth-contract";
import type { MessageKey } from "../i18n/messages";
import { useI18n } from "../i18n/client";
import {
  buildChangePasswordPayload,
  changePasswordErrorKey,
  validateSecurityForm,
  type SecurityFormField,
  type SecurityFormValues,
} from "../lib/account/account-security-form-model";

// Visible success before navigating away, so the user learns the password
// changed and other sessions ended instead of vanishing mid-submit.
const SUCCESS_NAVIGATION_DELAY_MS = 1500;

type FinishFailure = Readonly<{ errorFields: ReadonlyArray<Readonly<{ name: string | number | ReadonlyArray<string | number> }>> }>;

export function AccountSecurityForm({ mandatory }: Readonly<{ mandatory: boolean }>) {
  const router = useRouter();
  const { t } = useI18n();
  const [form] = Form.useForm<SecurityFormValues>();
  const [busy, setBusy] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [submitErrorKey, setSubmitErrorKey] = useState<MessageKey | null>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const aborter = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  // A late response must never overwrite newer edits; unmount aborts flight.
  useEffect(() => () => {
    generation.current += 1;
    aborter.current?.abort();
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function ruleFor(field: SecurityFormField) {
    return {
      async validator() {
        const stored = form.getFieldsValue(true);
        const values = {
          currentPassword: typeof stored.currentPassword === "string" ? stored.currentPassword : "",
          newPassword: typeof stored.newPassword === "string" ? stored.newPassword : "",
          confirmation: typeof stored.confirmation === "string" ? stored.confirmation : "",
        };
        const hit = validateSecurityForm(values).find((error) => error.field === field);
        if (hit) throw new Error(t(hit.messageKey));
      },
    };
  }

  function focusSummary() {
    summaryRef.current?.focus();
  }

  function handleFinishFailed(failure: FinishFailure) {
    const first = failure.errorFields[0]?.name;
    if (first !== undefined) form.scrollToField(first, { focus: true });
  }

  async function handleFinish(values: SecurityFormValues) {
    // Ref guard (not state): two rapid submits pass the same render's flag.
    if (busyRef.current || succeeded) return;
    busyRef.current = true;
    setBusy(true);
    setSubmitErrorKey(null);
    const run = (generation.current += 1);
    const controller = new AbortController();
    aborter.current = controller;
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildChangePasswordPayload(values)),
        signal: controller.signal,
      });
      if (generation.current !== run) return;
      if (!response.ok) {
        // 401 belongs to the current-password field, 400 to the new one;
        // anything else is a form-level summary, never a raw backend body.
        if (response.status === 401) {
          form.setFields([{ name: "currentPassword", errors: [t("auth.password.invalidCurrent")] }]);
          form.scrollToField("currentPassword", { focus: true });
        } else if (response.status === 400) {
          let reason: unknown;
          try { const body: unknown = await response.json(); reason = typeof body === "object" && body !== null && "reason" in body ? body.reason : undefined; }
          catch { reason = undefined; }
          form.setFields([{ name: "newPassword", errors: [t(changePasswordErrorKey(400, reason))] }]);
          form.scrollToField("newPassword", { focus: true });
        } else {
          setSubmitErrorKey("auth.password.unavailable");
          focusSummary();
        }
        return;
      }
      const user = parseAuthUser(await response.json());
      if (!user) {
        setSubmitErrorKey("auth.password.unavailable");
        focusSummary();
        return;
      }
      if (generation.current !== run) return;
      if (mandatory) {
        // Forced onboarding has already completed: entering the normal
        // application is the success feedback, so navigate immediately
        // instead of holding the contradictory restricted-state success Alert.
        router.replace(landingFor(user));
        router.refresh();
        return;
      }
      setSucceeded(true);
      timer.current = setTimeout(() => {
        if (generation.current === run) {
          // landingFor() encodes the mustChangePassword contract: a cleared
          // restriction lands on the normal app, otherwise back to onboarding.
          // refresh() drops the preserved restricted shell after rotation.
          router.replace(landingFor(user));
          router.refresh();
        }
      }, SUCCESS_NAVIGATION_DELAY_MS);
    } catch {
      if (controller.signal.aborted || generation.current !== run) return;
      setSubmitErrorKey("auth.password.unavailable");
      focusSummary();
    } finally {
      if (generation.current === run) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  const locked = busy || succeeded;

  return <>
    <div ref={summaryRef} tabIndex={-1} className="account-security__summary">
      {submitErrorKey ? <Alert type="error" showIcon title={t(submitErrorKey)} /> : null}
      {succeeded ? <Alert type="success" showIcon title={t("account.security.successTitle")} description={t("account.security.successText")} /> : null}
    </div>
    {succeeded ? null : (
      <Form<SecurityFormValues>
        form={form}
        layout="vertical"
        initialValues={{ currentPassword: "", newPassword: "", confirmation: "" }}
        disabled={locked}
        aria-busy={busy}
        onFinish={(values) => { void handleFinish(values); }}
        onFinishFailed={handleFinishFailed}
      >
        <Form.Item
          name="currentPassword"
          label={t(mandatory ? "auth.password.temporary" : "auth.password.current")}
          rules={[ruleFor("currentPassword")]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label={t("auth.password.new")}
          extra={t("auth.password.help")}
          rules={[ruleFor("newPassword")]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirmation" label={t("auth.password.confirm")} dependencies={["newPassword"]} rules={[ruleFor("confirmation")]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item className="account-security__actions">
          <Button type="primary" htmlType="submit" loading={busy} disabled={locked} aria-live="polite">
            {busy ? t("auth.password.submitting") : t(mandatory ? "auth.password.createTitle" : "auth.password.title")}
          </Button>
        </Form.Item>
      </Form>
    )}
  </>;
}
