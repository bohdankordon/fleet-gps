"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Checkbox, Descriptions, Divider, Select, Typography } from "antd";
import type { AuthPermission } from "../lib/auth/auth-contract";
import { normalizePermissionSelection, parseAdminManagedUser, parseOneTimePasswordResult, PERMISSION_DEPENDENCIES, type AdminManagedUser } from "../lib/admin-users/admin-users-contract";
import { adminUserAuthoritySummary } from "../lib/admin-users/admin-users-directory-model";
import { useI18n } from "../i18n/client";
import { permissionLabel, roleLabel } from "../i18n/domain-labels";
import { adminUserErrorMessage } from "../i18n/errors";
import { formatDateTime } from "../i18n/formatting";
import { AdminNavigationTabs } from "./admin-navigation-tabs";
import { CREATE_CAPABILITY_GROUPS, toggleCreatePermission, type AdminUserCreateRole } from "./admin-user-create-form";
import { OneTimePassword } from "./one-time-password";
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

export type AdminAccessDialog = "demote" | "disable" | "reset" | "telegram";

export function isAccessDirty(user: AdminManagedUser, role: AdminUserCreateRole, permissions: readonly AuthPermission[]): boolean {
  if (role !== user.role) return true;
  const persisted = new Set(normalizePermissionSelection(user.permissions));
  const draft = new Set(normalizePermissionSelection(role === "USER" ? permissions : []));
  if (persisted.size !== draft.size) return true;
  for (const permission of draft) {
    if (!persisted.has(permission)) return true;
  }
  return false;
}

export function AdminAccessPendingChanges({ user, role, permissions }: Readonly<{ user: AdminManagedUser; role: AdminUserCreateRole; permissions: readonly AuthPermission[] }>) {
  const { locale, t } = useI18n();
  if (!isAccessDirty(user, role, permissions)) return null;
  const persisted = normalizePermissionSelection(user.permissions);
  const draft = normalizePermissionSelection(role === "USER" ? permissions : []);
  const added = draft.filter((permission) => !persisted.includes(permission));
  const removed = persisted.filter((permission) => !draft.includes(permission));
  const resulting = draft.length === 0 ? t("common.noAccess") : t("admin.users.permissionsCount", { count: draft.length });
  return <section aria-labelledby="access-pending-title" className="admin-user-detail-access__pending">
    <Typography.Title level={4} id="access-pending-title">{t("admin.user.access.pendingChanges")}</Typography.Title>
    <Descriptions bordered size="small" column={1}>
      {role !== user.role ? <Descriptions.Item label={t("admin.user.role")}>{`${roleLabel(user.role, locale)} → ${roleLabel(role, locale)}`}</Descriptions.Item> : null}
      {role === "ADMIN"
        ? <Descriptions.Item label={t("admin.user.access")}>{t("admin.users.fullAuthority")}</Descriptions.Item>
        : <Descriptions.Item label={t("admin.user.create.permissions")}><span className="admin-user-detail-access__pending-access"><span>{resulting}</span>{added.length > 0 ? <Typography.Text type="secondary">{`${t("admin.user.access.added")}: ${added.map((permission) => permissionLabel(permission, locale)).join(", ")}`}</Typography.Text> : null}{removed.length > 0 ? <Typography.Text type="secondary">{`${t("admin.user.access.removed")}: ${removed.map((permission) => permissionLabel(permission, locale)).join(", ")}`}</Typography.Text> : null}</span></Descriptions.Item>}
    </Descriptions>
  </section>;
}

export type AdminAccessManagementProps = Readonly<{
  user: AdminManagedUser;
  self: boolean;
  role: AdminUserCreateRole;
  permissions: readonly AuthPermission[];
  busy: boolean;
  saveTrigger: ReactNode;
  onRoleChange(role: AdminUserCreateRole): void;
  onPermissionsChange(permissions: readonly AuthPermission[]): void;
  onSubmit(event: FormEvent): void;
}>;

export function AdminAccessManagement({ user, self, role, permissions, busy, saveTrigger, onRoleChange, onPermissionsChange, onSubmit }: AdminAccessManagementProps) {
  const { locale, t } = useI18n();
  return <section aria-labelledby="access-management-title" className="admin-user-detail-access__block">
    <Typography.Title level={3} id="access-management-title">{t("admin.user.access")}</Typography.Title>
    <form className="admin-user-detail-access__form" onSubmit={onSubmit} noValidate>
      <label className="admin-user-detail-access__label" htmlFor="access-role">{t("admin.user.role")}</label>
      <Select id="access-role" value={role} disabled={self} onChange={(value: AdminUserCreateRole) => onRoleChange(value)} options={[{ value: "USER", label: roleLabel("USER", locale) }, { value: "ADMIN", label: roleLabel("ADMIN", locale) }]} />
      {self ? <Typography.Text type="secondary">{t("admin.user.access.selfLocked")}</Typography.Text> : null}
      {role === "USER" ? <div className="admin-user-detail-access__matrix">
        {CREATE_CAPABILITY_GROUPS.map((group, groupIndex) => {
          const labelId = `access-group-${groupIndex}`;
          return <div key={group.titleKey} className="admin-user-detail-access__matrix-row" role="group" aria-labelledby={labelId}>
            <div className="admin-user-detail-access__matrix-label" id={labelId}>{t(group.titleKey)}</div>
            <div className="admin-user-detail-access__matrix-controls">
              {group.permissions.map((permission, optionIndex) => {
                const requirements = PERMISSION_DEPENDENCIES[permission];
                const helperId = `access-requires-${groupIndex}-${optionIndex}`;
                return <div key={permission} className="admin-user-detail-access__option">
                  <Checkbox checked={permissions.includes(permission)} disabled={self} aria-describedby={requirements ? helperId : undefined} onChange={(event) => onPermissionsChange(toggleCreatePermission(permissions, permission, event.target.checked))}>{permissionLabel(permission, locale)}</Checkbox>
                  {requirements ? <Typography.Text type="secondary" id={helperId}>{`${t("admin.permission.requires")} ${requirements.map((key) => permissionLabel(key, locale)).join(", ")}`}</Typography.Text> : null}
                </div>;
              })}
            </div>
          </div>;
        })}
      </div> : <Typography.Paragraph type="secondary">{t("admin.user.adminFullAccessCompact")}</Typography.Paragraph>}
      <AdminAccessPendingChanges user={user} role={role} permissions={permissions} />
      {saveTrigger}
    </form>
  </section>;
}

export type AdminSecuritySectionProps = Readonly<{
  user: AdminManagedUser;
  statusAction: ReactNode;
  passwordAction: ReactNode;
  telegramAction: ReactNode;
}>;

export function AdminSecuritySection({ user, statusAction, passwordAction, telegramAction }: AdminSecuritySectionProps) {
  const { t } = useI18n();
  return <section aria-labelledby="detail-security-title" className="admin-user-detail-access__block">
    <Typography.Title level={3} id="detail-security-title">{t("admin.user.security.title")}</Typography.Title>
    <div className="admin-user-detail-access__security-rows">
      <div className="admin-user-detail-access__security-row">
        <div className="admin-user-detail-access__security-fact">
          <Typography.Text strong>{t("admin.user.security.accountStatus")}</Typography.Text>
          <span>{user.disabled ? t("admin.user.disabled") : t("admin.user.active")}</span>
          <Typography.Text type="secondary">{user.disabled ? t("admin.user.security.enableConsequence") : t("admin.user.security.disableConsequence")}</Typography.Text>
        </div>
        <div className="admin-user-detail-access__security-action">
          {statusAction}
        </div>
      </div>
      <div className="admin-user-detail-access__security-row">
        <div className="admin-user-detail-access__security-fact">
          <Typography.Text strong>{t("admin.user.security.password")}</Typography.Text>
          <Typography.Text type="secondary">{t("admin.user.security.resetConsequence")}</Typography.Text>
        </div>
        <div className="admin-user-detail-access__security-action">
          {passwordAction}
        </div>
      </div>
      <div className="admin-user-detail-access__security-row">
        <div className="admin-user-detail-access__security-fact">
          <Typography.Text strong>{t("admin.user.telegramStatus")}</Typography.Text>
          <span>{user.telegramStatus === "CONNECTED" ? t("admin.users.telegramConnected") : t("admin.users.telegramNotConnected")}</span>
          <Typography.Text type="secondary">{t("admin.user.security.telegramOwner")}</Typography.Text>
        </div>
        <div className="admin-user-detail-access__security-action">
          {telegramAction}
        </div>
      </div>
    </div>
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
  const dirty = isAccessDirty(user, role, permissions);
  function focusAccessSecurity(): void {
    window.requestAnimationFrame(() => {
      document.getElementById("access-security")?.focus({ preventScroll: true });
    });
  }
  const saveTrigger = demoting
    ? <AlertDialog open={confirm === "demote"} onOpenChange={closeConfirmation("demote")} trigger={<Button className="admin-user-detail-access__save" type="button" disabled={busy || self || !dirty}>{t("admin.user.saveAccess")}</Button>} title={t("admin.user.confirmDemote")} description={t("admin.user.demotePrompt")} cancelLabel={t("common.cancel")} confirmLabel={t("admin.user.confirmDemote")} loading={busy} onConfirm={() => void saveAccess()}>{dialogError("demote")}</AlertDialog>
    : <Button className="admin-user-detail-access__save" type="submit" disabled={busy || self || !dirty}>{t("admin.user.saveAccess")}</Button>;
  const disconnectable = user.telegramStatus === "CONNECTED" || user.telegramStatus === "BROKEN";
  const statusAction = user.disabled
    ? <Button disabled={busy} onClick={() => void lifecycle("enable")}>{t("admin.user.security.enableAccount")}</Button>
    : <AlertDialog open={confirm === "disable"} onOpenChange={closeConfirmation("disable")} trigger={<Button variant="destructive" disabled={busy}>{t("admin.user.security.disableAccount")}</Button>} title={t("admin.user.confirmDisable")} description={t("admin.user.disablePrompt")} cancelLabel={t("common.cancel")} confirmLabel={t("admin.user.confirmDisable")} destructive loading={busy} onConfirm={() => void lifecycle("disable")}>{dialogError("disable")}</AlertDialog>;
  const passwordAction = <AlertDialog open={confirm === "reset"} onOpenChange={closeConfirmation("reset")} trigger={<Button variant="secondary" disabled={busy}>{t("admin.user.resetPassword")}</Button>} title={t("admin.user.confirmReset")} description={t("admin.user.resetPrompt")} cancelLabel={t("common.cancel")} confirmLabel={t("admin.user.confirmReset")} loading={busy} onConfirm={() => void reset()}>{dialogError("reset")}</AlertDialog>;
  const telegramAction = disconnectable
    ? <AlertDialog open={confirm === "telegram"} onOpenChange={closeConfirmation("telegram")} trigger={<Button variant="destructive" disabled={busy}>{t("admin.user.disconnectTelegram")}</Button>} title={t("admin.user.confirmDisconnectTelegram")} description={t("admin.user.disconnectTelegramPrompt")} cancelLabel={t("common.cancel")} confirmLabel={t("admin.user.disconnectTelegram")} destructive loading={busy} onConfirm={() => void disconnectTelegram()}>{dialogError("telegram")}</AlertDialog>
    : null;

  return <div className="admin-user-detail-v2">
    <AdminUserIdentity user={user} self={self} />
    <AdminNavigationTabs />
    <AdminUserAccountOverview user={user} onManageAccess={focusAccessSecurity} />
    <Divider />
    <section id="access-security" tabIndex={-1} aria-labelledby="admin-user-access-title" className="admin-user-detail-v2__access">
      <Typography.Title level={2} id="admin-user-access-title">{t("admin.user.detail.accessSecurity")}</Typography.Title>
      <Typography.Paragraph type="secondary">{t("admin.user.detail.accessDescription")}</Typography.Paragraph>
      <div className="admin-user-detail-access">
        <AdminAccessManagement user={user} self={self} role={role} permissions={permissions} busy={busy} saveTrigger={saveTrigger} onRoleChange={(next) => { setRole(next); setConfirm(null); }} onPermissionsChange={setPermissions} onSubmit={save} />
        {!self && <><Divider /><AdminSecuritySection user={user} statusAction={statusAction} passwordAction={passwordAction} telegramAction={telegramAction} /></>}
      </div>
    {error && confirm === null && <p className="admin-error" role="alert">{error}</p>}
    </section>
  </div>;
}
