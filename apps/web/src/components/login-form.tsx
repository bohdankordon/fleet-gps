"use client";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { landingFor } from "@/lib/auth/auth-contract";
import { LoginFormError, attemptLogin, validateLoginForm } from "@/lib/auth/login-form-core";
import { LoginFormView } from "./login-form-view";

export function LoginForm() {
  const router = useRouter();
  const pending = useRef(false);
  const [error, setError] = useState<LoginFormError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;

    const form = event.currentTarget;
    const loginInput = form.elements.namedItem("login") as HTMLInputElement | null;
    const passwordInput = form.elements.namedItem("password") as HTMLInputElement | null;
    const login = loginInput?.value ?? "";
    const password = passwordInput?.value ?? "";
    const validationError = validateLoginForm(login, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    pending.current = true;
    setBusy(true);
    setError(null);
    const result = await attemptLogin(login, password);
    if (result.kind === "success") {
      router.replace(landingFor(result.user));
      router.refresh();
    } else {
      if (passwordInput) passwordInput.value = "";
      setError(result.kind === "invalid-credentials" ? "INVALID_CREDENTIALS" : "UNAVAILABLE");
    }
    pending.current = false;
    setBusy(false);
  }

  return <LoginFormView busy={busy} error={error} onSubmit={(event) => { void submit(event); }} />;
}
