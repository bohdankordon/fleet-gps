"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Form } from "antd";
import { landingFor } from "@/lib/auth/auth-contract";
import { attemptLogin, type LoginFormError } from "@/lib/auth/login-form-core";
import { LoginFormView, type LoginFormValues } from "./login-form-view";

export function LoginForm() {
  const router = useRouter();
  const [form] = Form.useForm<LoginFormValues>();
  const [error, setError] = useState<LoginFormError | null>(null);
  const [busy, setBusy] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const aborter = useRef<AbortController | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  // A late response must never overwrite newer edits; unmount aborts flight.
  useEffect(() => () => {
    generation.current += 1;
    aborter.current?.abort();
  }, []);

  function focusSummary() {
    summaryRef.current?.focus();
  }

  function focusPassword() {
    // Focus after the Alert is announced so keyboard users land in the field.
    requestAnimationFrame(() => {
      const password = document.querySelector<HTMLInputElement>(
        '.login-card__form input[name="password"]',
      );
      password?.focus();
    });
  }

  function handleFinishFailed() {
    const names = ["login", "password"] as const;
    for (const name of names) {
      if (form.getFieldError(name).length > 0) {
        form.scrollToField(name, { focus: true });
        return;
      }
    }
  }

  async function handleFinish(values: LoginFormValues) {
    // Ref guard (not state): two rapid submits pass the same render's flag.
    if (busyRef.current || succeeded) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const run = (generation.current += 1);
    const controller = new AbortController();
    aborter.current = controller;
    // Credentials pass exactly as entered: never trimmed or transformed.
    const login = values.login;
    const password = values.password;
    try {
      const result = await attemptLogin(login, password, fetch, controller.signal);
      if (generation.current !== run) return;
      if (result.kind === "success") {
        // Keep the form locked until navigation takes over.
        setSucceeded(true);
        router.replace(landingFor(result.user));
        router.refresh();
        return;
      }
      if (result.kind === "invalid-credentials" || result.kind === "rate-limited") {
        // Preserve login for retry, clear only the password.
        form.setFieldValue("password", "");
      }
      setError(
        result.kind === "invalid-credentials"
          ? "INVALID_CREDENTIALS"
          : result.kind === "rate-limited"
            ? "RATE_LIMITED"
            : "UNAVAILABLE",
      );
      if (result.kind === "invalid-credentials") focusPassword();
      else focusSummary();
    } catch {
      if (controller.signal.aborted || generation.current !== run) return;
      // Network-shaped failures stay generic and keep retry values.
      setError("UNAVAILABLE");
      focusSummary();
    } finally {
      if (generation.current === run && !controller.signal.aborted) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  const locked = busy || succeeded;

  return (
    <LoginFormView
      form={form}
      busy={busy}
      locked={locked}
      error={error}
      summaryRef={summaryRef}
      onFinish={(values) => {
        void handleFinish(values);
      }}
      onFinishFailed={handleFinishFailed}
    />
  );
}
