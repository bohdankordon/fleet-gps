"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthPermission } from "@/lib/auth/auth-contract";
import { parseAdminManagedUser, parseOneTimePasswordResult, type AdminManagedUser } from "@/lib/admin-users/admin-users-contract";
import { useI18n } from "../i18n/client";
import { roleLabel } from "../i18n/domain-labels";
import { adminUserErrorMessage } from "../i18n/errors";
import { formatDateTime } from "../i18n/formatting";
import { OneTimePassword } from "./one-time-password";
import { PermissionSelector } from "./permission-selector";
import { Alert, AlertDialog, Button } from "./ui";

class AdminUserRequestError extends Error {
  public constructor(public readonly body: unknown) { super("ADMIN_USER_REQUEST_FAILED"); }
}

export function AdminUserDetail({ initialUser, actorId }: Readonly<{ initialUser: AdminManagedUser; actorId: string }>) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const self = initialUser.id === actorId;
  const [user, setUser] = useState(initialUser);
  const [role, setRole] = useState(user.role);
  const [permissions, setPermissions] = useState<readonly AuthPermission[]>(user.permissions);
  const [confirm, setConfirm] = useState<"demote" | "disable" | "reset" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function mutate(path: string, method: "POST" | "PATCH", payload?: object): Promise<unknown> {
    const response = await fetch(path, { method, headers: payload ? { "Content-Type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined });
    let body: unknown = null;
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new AdminUserRequestError(body);
    return body;
  }

  function localizedError(cause: unknown): string { return adminUserErrorMessage(cause instanceof AdminUserRequestError ? cause.body : null, t); }

  async function saveAccess(): Promise<void> {
    setBusy(true); setError(null);
    try {
      const updated = parseAdminManagedUser(await mutate(`/api/admin/users/${user.id}/access`, "PATCH", { role, permissions: role === "USER" ? permissions : [] }));
      if (!updated) throw new AdminUserRequestError(null);
      setUser(updated); setRole(updated.role); setPermissions(updated.permissions); setConfirm(null); router.refresh();
    } catch (cause) { setError(localizedError(cause)); }
    finally { setBusy(false); }
  }

  function save(event: FormEvent): void {
    event.preventDefault();
    if (user.role === "ADMIN" && role === "USER" && confirm !== "demote") { setConfirm("demote"); return; }
    void saveAccess();
  }

  async function lifecycle(action: "disable" | "enable"): Promise<void> {
    setBusy(true); setError(null);
    try {
      const updated = parseAdminManagedUser(await mutate(`/api/admin/users/${user.id}/${action}`, "POST"));
      if (!updated) throw new AdminUserRequestError(null);
      setUser(updated); setConfirm(null); router.refresh();
    } catch (cause) { setError(localizedError(cause)); }
    finally { setBusy(false); }
  }

  async function reset(): Promise<void> {
    setBusy(true); setError(null);
    try {
      const result = parseOneTimePasswordResult(await mutate(`/api/admin/users/${user.id}/reset-password`, "POST"));
      if (!result) throw new AdminUserRequestError(null);
      setUser(result.user); setSecret(result.temporaryPassword); setConfirm(null); router.refresh();
    } catch (cause) { setError(localizedError(cause)); }
    finally { setBusy(false); }
  }

  if (secret) return <OneTimePassword password={secret} title={t("admin.user.newTemporaryPassword")} onDone={() => setSecret(null)} />;
  const closeConfirmation = (kind: "demote" | "disable" | "reset") => (open: boolean) => { if (open) setConfirm(kind); else setConfirm(null); };
  const dialogError = (kind: "demote" | "disable" | "reset") => confirm === kind && error ? <Alert variant="danger" live="assertive" title={error} /> : null;
  const demoting = user.role === "ADMIN" && role === "USER";

  return <div className="admin-user-detail">
    <section className="details-section">
      <h2>{user.login} {self && <span className="badge badge-fresh">{t("admin.user.yourAccount")}</span>}</h2>
      <dl className="details-list">
        <div><dt>{t("admin.user.status")}</dt><dd>{user.disabled ? t("admin.user.disabled") : t("admin.user.active")}</dd></div>
        <div><dt>{t("admin.user.passwordChangeRequired")}</dt><dd>{user.mustChangePassword ? t("common.yes") : t("common.no")}</dd></div>
        <div><dt>{t("admin.user.createdAt")}</dt><dd>{formatDateTime(locale, user.createdAt) ?? "—"}</dd></div>
        <div><dt>{t("admin.user.updatedAt")}</dt><dd>{formatDateTime(locale, user.updatedAt) ?? "—"}</dd></div>
      </dl>
      {self && <p className="admin-note">{t("admin.user.selfProtection")}</p>}
    </section>
    <form className="admin-form" onSubmit={save}>
      <label>{t("admin.user.role")}<select value={role} disabled={self} onChange={(event) => { setRole(event.currentTarget.value as "USER" | "ADMIN"); setConfirm(null); }}><option value="USER">{roleLabel("USER", locale)}</option><option value="ADMIN">{roleLabel("ADMIN", locale)}</option></select></label>
      {role === "USER" ? <PermissionSelector value={permissions} onChange={setPermissions} disabled={self} /> : <p className="admin-note">{t("admin.user.adminFullAccessCompact")}</p>}
      {demoting ? <AlertDialog open={confirm === "demote"} onOpenChange={closeConfirmation("demote")} trigger={<Button type="button" disabled={busy || self}>{t("admin.user.saveAccess")}</Button>} title={t("admin.user.confirmDemote")} description={t("admin.user.demotePrompt")} cancelLabel={t("common.cancel")} confirmLabel={t("admin.user.confirmDemote")} loading={busy} onConfirm={() => void saveAccess()}>{dialogError("demote")}</AlertDialog> : <Button type="submit" disabled={busy || self}>{t("admin.user.saveAccess")}</Button>}
    </form>
    {!self && <section className="details-section">
      <h2>{t("admin.user.stateAndPassword")}</h2>
      <div className="admin-actions">
        {user.disabled ? <Button disabled={busy} onClick={() => void lifecycle("enable")}>{t("admin.user.enable")}</Button> : <AlertDialog open={confirm === "disable"} onOpenChange={closeConfirmation("disable")} trigger={<Button variant="destructive" disabled={busy}>{t("admin.user.disable")}</Button>} title={t("admin.user.confirmDisable")} description={t("admin.user.disablePrompt")} cancelLabel={t("common.cancel")} confirmLabel={t("admin.user.confirmDisable")} destructive loading={busy} onConfirm={() => void lifecycle("disable")}>{dialogError("disable")}</AlertDialog>}
        <AlertDialog open={confirm === "reset"} onOpenChange={closeConfirmation("reset")} trigger={<Button variant="secondary" disabled={busy}>{t("admin.user.resetPassword")}</Button>} title={t("admin.user.confirmReset")} description={t("admin.user.resetPrompt")} cancelLabel={t("common.cancel")} confirmLabel={t("admin.user.confirmReset")} loading={busy} onConfirm={() => void reset()}>{dialogError("reset")}</AlertDialog>
      </div>
    </section>}
    {error && confirm === null && <p className="admin-error" role="alert">{error}</p>}
  </div>;
}
