"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Descriptions, Divider, Typography } from "antd";
import type { AuthPermission } from "../lib/auth/auth-contract";
import { parseAdminManagedUser, parseOneTimePasswordResult, type AdminManagedUser } from "../lib/admin-users/admin-users-contract";
import { adminUserAuthoritySummary } from "../lib/admin-users/admin-users-directory-model";
import { useI18n } from "../i18n/client";
import { permissionLabel, roleLabel } from "../i18n/domain-labels";
import { adminUserErrorMessage } from "../i18n/errors";
import { formatDateTime } from "../i18n/formatting";
import { AdminNavigationTabs } from "./admin-navigation-tabs";
import { OneTimePassword } from "./one-time-password";
import { PermissionSelector } from "./permission-selector";
import { Alert, AlertDialog, Button } from "./ui";

class AdminUserRequestError extends Error {
  public constructor(public readonly body: unknown) { super("ADMIN_USER_REQUEST_FAILED"); }
}

export function AdminUserIdentity({ user, self }: Readonly<{ user: AdminManagedUser; self: boolean }>) {
  const { locale, t } = useI18n();
  const identityFacts = [roleLabel(user.role, locale), user.disabled ? t("admin.user.disabled") : t("admin.user.active"), ...(user.mustChangePassword ? [t("admin.user.passwordChangeRequired")] : []), ...(self ? [t("admin.user.yourAccount")] : [])];
  return <>
    <Link className="admin-user-detail-v2__back" href="/admin/users"><span aria-hidden="true">{"← "}</span>{t("admin.user.detail.backToUsers")}</Link>
    <header className="admin-user-detail-v2__identity">
      <Typography.Title level={1}>{user.login}</Typography.Title>
      <Typography.Text type="secondary">{identityFacts.join(" · ")}</Typography.Text>
    </header>
  </>;
}

export function AdminUserAccountOverview({ user, onManageAccess }: Readonly<{ user: AdminManagedUser; onManageAccess(): void }>) {
  const { locale, t } = useI18n();
  const authoritySummary = adminUserAuthoritySummary(user, locale);
  const authorityPermissions = user.role === "USER" && user.permissions.length > 0 ? user.permissions.map((permission) => permissionLabel(permission, locale)).join(", ") : null;
  const telegramConnected = user.telegramStatus === "CONNECTED";
  return <section className="admin-user-detail-v2__overview" aria-labelledby="admin-user-overview-title">
    <Typography.Title level={2} id="admin-user-overview-title">{t("admin.user.detail.accountOverview")}</Typography.Title>
      <Descriptions bordered column={{ xs: 1, sm: 1, md: 1, lg: 2, xl: 2, xxl: 2 }}>
      <Descriptions.Item label={t("admin.user.login")}>{user.login}</Descriptions.Item>
      <Descriptions.Item label={t("admin.user.role")}>{roleLabel(user.role, locale)}</Descriptions.Item>
      <Descriptions.Item label={t("admin.user.status")}>{user.disabled ? t("admin.user.disabled") : t("admin.user.active")}</Descriptions.Item>
      <Descriptions.Item label={t("admin.user.detail.passwordChange")}>{user.mustChangePassword ? t("admin.user.passwordChangeRequired") : t("admin.user.detail.passwordNotRequired")}</Descriptions.Item>
        <Descriptions.Item label={t("admin.users.authority")}><span className="admin-user-detail-v2__authority"><span>{authoritySummary}</span>{authorityPermissions ? <Typography.Text type="secondary">{authorityPermissions}</Typography.Text> : null}</span></Descriptions.Item>
        <Descriptions.Item label={t("admin.user.telegramStatus")}>{telegramConnected ? t("admin.users.telegramConnected") : t("admin.users.telegramNotConnected")}</Descriptions.Item>
      <Descriptions.Item label={t("admin.user.createdAt")}><time dateTime={user.createdAt}>{formatDateTime(locale, user.createdAt) ?? "—"}</time></Descriptions.Item>
      <Descriptions.Item label={t("admin.user.updatedAt")}><time dateTime={user.updatedAt}>{formatDateTime(locale, user.updatedAt) ?? "—"}</time></Descriptions.Item>
    </Descriptions>
    <Typography.Link className="admin-user-detail-v2__manage" href="#access-security" onClick={onManageAccess}>{t("admin.user.detail.manageAccess")} <span aria-hidden="true">→</span></Typography.Link>
  </section>;
}

export function AdminUserDetail({ initialUser, actorId }: Readonly<{ initialUser: AdminManagedUser; actorId: string }>) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const self = initialUser.id === actorId;
  const [user, setUser] = useState(initialUser);
  const [role, setRole] = useState(user.role);
  const [permissions, setPermissions] = useState<readonly AuthPermission[]>(user.permissions);
  const [confirm, setConfirm] = useState<"demote" | "disable" | "reset" | "telegram" | null>(null);
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

  async function disconnectTelegram(): Promise<void> {
    setBusy(true); setError(null);
    try {
      const value = await mutate(`/api/admin/users/${user.id}/telegram/disconnect`, "POST");
      if (typeof value !== "object" || value === null || (value as Record<string, unknown>).status !== "NOT_CONNECTED") throw new AdminUserRequestError(null);
      setUser((current) => ({ ...current, telegramStatus: "NOT_CONNECTED" })); setConfirm(null); router.refresh();
    } catch (cause) { setError(localizedError(cause)); }
    finally { setBusy(false); }
  }

  if (secret) return <OneTimePassword password={secret} title={t("admin.user.newTemporaryPassword")} onDone={() => setSecret(null)} />;
  const closeConfirmation = (kind: "demote" | "disable" | "reset" | "telegram") => (open: boolean) => { if (open) setConfirm(kind); else setConfirm(null); };
  const dialogError = (kind: "demote" | "disable" | "reset" | "telegram") => confirm === kind && error ? <Alert variant="danger" live="assertive" title={error} /> : null;
  const demoting = user.role === "ADMIN" && role === "USER";
  function focusAccessSecurity(): void {
    window.requestAnimationFrame(() => {
      document.getElementById("access-security")?.focus({ preventScroll: true });
    });
  }

  return <div className="admin-user-detail-v2">
    <AdminUserIdentity user={user} self={self} />
    <AdminNavigationTabs />
    <AdminUserAccountOverview user={user} onManageAccess={focusAccessSecurity} />
    <Divider />
    <section id="access-security" tabIndex={-1} aria-labelledby="admin-user-access-title" className="admin-user-detail-v2__access">
      <Typography.Title level={2} id="admin-user-access-title">{t("admin.user.detail.accessSecurity")}</Typography.Title>
      <Typography.Paragraph type="secondary">{t("admin.user.detail.accessDescription")}</Typography.Paragraph>
      {self && <Alert variant="info" title={t("admin.user.selfProtection")} />}
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
        {(user.telegramStatus === "CONNECTED" || user.telegramStatus === "BROKEN") && <AlertDialog open={confirm === "telegram"} onOpenChange={closeConfirmation("telegram")} trigger={<Button variant="destructive" disabled={busy}>{t("admin.user.disconnectTelegram")}</Button>} title={t("admin.user.confirmDisconnectTelegram")} description={t("admin.user.disconnectTelegramPrompt")} cancelLabel={t("common.cancel")} confirmLabel={t("admin.user.disconnectTelegram")} destructive loading={busy} onConfirm={() => void disconnectTelegram()}>{dialogError("telegram")}</AlertDialog>}
      </div>
    </section>}
    {error && confirm === null && <p className="admin-error" role="alert">{error}</p>}
    </section>
  </div>;
}
