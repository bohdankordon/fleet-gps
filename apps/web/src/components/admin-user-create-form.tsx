"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Descriptions, Divider, Input, Select, Typography } from "antd";
import type { AuthPermission } from "../lib/auth/auth-contract";
import { normalizePermissionSelection, parseOneTimePasswordResult, PERMISSION_DEPENDENCIES } from "../lib/admin-users/admin-users-contract";
import { buildVehicleAccessPayload, effectiveVehicleIds, EMPTY_VEHICLE_ACCESS_DRAFT, toggleAccessGroup, toggleAccessVehicle, type VehicleAccessDraft } from "../lib/admin-users/vehicle-access-form-model";
import type { AdminVehicleAccess } from "../lib/admin-users/admin-users-contract";
import type { ManagedVehicle, VehicleGroupSummary } from "../lib/vehicle-groups/vehicle-groups-contract";
import { AdminVehicleAccessFields, AdminVehicleAccessNote } from "./admin-vehicle-access-fields";
import { groupVehiclesById } from "./admin-vehicle-access-fields";
import { useI18n } from "../i18n/client";
import { permissionLabel, roleLabel } from "../i18n/domain-labels";
import { adminUserErrorMessage } from "../i18n/errors";
import { OneTimePassword } from "./one-time-password";

const CREATE_LOGIN_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;

export type AdminUserCreateRole = "USER" | "ADMIN";

export const CREATE_CAPABILITY_GROUPS = Object.freeze([
  Object.freeze({ titleKey: "admin.user.create.groupFleet", permissions: Object.freeze(["fleet.view", "map.view", "events.view"] as const) }),
  Object.freeze({ titleKey: "admin.user.create.groupVehicles", permissions: Object.freeze(["vehicles.view", "trips.view"] as const) }),
  Object.freeze({ titleKey: "admin.user.create.groupReports", permissions: Object.freeze(["reports.view"] as const) }),
  Object.freeze({ titleKey: "admin.user.create.groupHistory", permissions: Object.freeze(["historyAdmin.view", "historyAdmin.populate"] as const) }),
] as const);

export function toggleCreatePermission(current: readonly AuthPermission[], permission: AuthPermission, checked: boolean): readonly AuthPermission[] {
  const next = new Set(current);
  if (checked) {
    next.add(permission);
  } else {
    next.delete(permission);
    for (const [dependent, requirements] of Object.entries(PERMISSION_DEPENDENCIES) as [AuthPermission, readonly AuthPermission[]][]) {
      if (requirements.includes(permission)) next.delete(dependent);
    }
  }
  return normalizePermissionSelection([...next]);
}

export function buildCreateUserPayload(login: string, role: AdminUserCreateRole, permissions: readonly AuthPermission[], vehicleAccess: AdminVehicleAccess = { mode: "ALL", groupIds: [], vehicleIds: [] }): Readonly<{ login: string; role: AdminUserCreateRole; permissions: readonly AuthPermission[]; vehicleAccess: AdminVehicleAccess }> {
  return Object.freeze({ login, role, permissions: role === "USER" ? normalizePermissionSelection(permissions) : [], vehicleAccess: role === "USER" ? vehicleAccess : { mode: "ALL" as const, groupIds: [], vehicleIds: [] } });
}

export type AdminUserCreateFieldsProps = Readonly<{
  login: string;
  role: AdminUserCreateRole;
  permissions: readonly AuthPermission[];
  access: VehicleAccessDraft;
  groups: readonly VehicleGroupSummary[] | null;
  vehicles: readonly ManagedVehicle[] | null;
  accessError: string | null;
  busy: boolean;
  loginError: string | null;
  error: string | null;
  onLoginChange(login: string): void;
  onRoleChange(role: AdminUserCreateRole): void;
  onTogglePermission(permission: AuthPermission, checked: boolean): void;
  onAccessModeChange(mode: "ALL" | "SELECTED"): void;
  onToggleAccessGroup(groupId: string, checked: boolean): void;
  onToggleAccessVehicle(vehicleId: string, checked: boolean): void;
  onSubmit(): void;
}>;

export function AdminUserCreateFields({ login, role, permissions, access, groups, vehicles, accessError, busy, loginError, error, onLoginChange, onRoleChange, onTogglePermission, onAccessModeChange, onToggleAccessGroup, onToggleAccessVehicle, onSubmit }: AdminUserCreateFieldsProps) {
  const { locale, t } = useI18n();
  const memberIds = groupVehiclesById(vehicles ?? []);
  const summary = role === "ADMIN" ? t("admin.users.fullAuthority") : permissions.length === 0 ? t("common.noAccess") : t("admin.users.permissionsCount", { count: permissions.length });
  const selectedLabels = role === "USER" && permissions.length > 0 ? permissions.map((permission) => permissionLabel(permission, locale)).join(", ") : null;
  function submitForm(event: { preventDefault(): void }): void {
    event.preventDefault();
    onSubmit();
  }
  return <form className="admin-user-create-v2__form" onSubmit={submitForm} noValidate>
    <section aria-labelledby="create-account-title">
      <Typography.Title level={3} id="create-account-title">{t("admin.users.account")}</Typography.Title>
      <label className="admin-user-create-v2__label" htmlFor="create-login">{t("admin.user.login")}</label>
      <Input id="create-login" value={login} maxLength={64} autoComplete="off" aria-invalid={loginError ? true : undefined} status={loginError ? "error" : undefined} disabled={busy} onChange={(event) => onLoginChange(event.target.value)} />
      {loginError ? <p className="admin-user-create-v2__error" role="alert">{loginError}</p> : null}
    </section>
    <section aria-labelledby="create-authority-title">
      <Typography.Title level={3} id="create-authority-title">{t("admin.users.authority")}</Typography.Title>
      <label className="admin-user-create-v2__label" htmlFor="create-role">{t("admin.user.role")}</label>
      <Select id="create-role" value={role} disabled={busy} onChange={(value: AdminUserCreateRole) => onRoleChange(value)} options={[{ value: "USER", label: roleLabel("USER", locale) }, { value: "ADMIN", label: roleLabel("ADMIN", locale) }]} />
      {role === "ADMIN" ? <Typography.Paragraph type="secondary">{t("admin.users.fullAuthority")}</Typography.Paragraph> : null}
    </section>
    {role === "USER" ? <section aria-labelledby="create-access-title">
      <Typography.Title level={3} id="create-access-title">{t("admin.user.access")}</Typography.Title>
      <div className="admin-user-create-v2__matrix">
        {CREATE_CAPABILITY_GROUPS.map((group, groupIndex) => {
          const labelId = `create-group-${groupIndex}`;
          return <div key={group.titleKey} className="admin-user-create-v2__matrix-row" role="group" aria-labelledby={labelId}>
            <div className="admin-user-create-v2__matrix-label" id={labelId}>{t(group.titleKey)}</div>
            <div className="admin-user-create-v2__matrix-controls">
              {group.permissions.map((permission, optionIndex) => {
                const requirements = PERMISSION_DEPENDENCIES[permission];
                const helperId = `create-requires-${groupIndex}-${optionIndex}`;
                return <div key={permission} className="admin-user-create-v2__option">
              <Checkbox checked={permissions.includes(permission)} disabled={busy} aria-describedby={requirements ? helperId : undefined} onChange={(event) => onTogglePermission(permission, event.target.checked)}>{permissionLabel(permission, locale)}</Checkbox>
                  {requirements ? <Typography.Text type="secondary" id={helperId}>{`${t("admin.permission.requires")} ${requirements.map((key) => permissionLabel(key, locale)).join(", ")}`}</Typography.Text> : null}
                </div>;
              })}
            </div>
          </div>;
        })}
      </div>
    </section> : null}
    {role === "USER" ? <AdminVehicleAccessFields draft={access} groups={groups} vehicles={vehicles} busy={busy} modeError={accessError} onModeChange={onAccessModeChange} onToggleGroup={onToggleAccessGroup} onToggleVehicle={onToggleAccessVehicle} /> : <AdminVehicleAccessNote />}
    <section aria-labelledby="create-result-title">
      <Typography.Title level={3} id="create-result-title">{t("admin.user.create.resultingAccess")}</Typography.Title>
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label={t("admin.user.role")}>{roleLabel(role, locale)}</Descriptions.Item>
        {role === "ADMIN"
          ? <Descriptions.Item label={t("admin.user.access")}>{t("admin.users.fullAuthority")}</Descriptions.Item>
          : <Descriptions.Item label={t("admin.user.create.permissions")}><span className="admin-user-create-v2__result-access"><span>{summary}</span>{selectedLabels ? <Typography.Text type="secondary">{selectedLabels}</Typography.Text> : null}</span></Descriptions.Item>}
        <Descriptions.Item label={t("admin.vehicleAccess.title")}>{role === "ADMIN" ? t("admin.vehicleAccess.adminNote") : role === "USER" && (groups === null || vehicles === null) ? t("admin.groups.loadError") : access.mode === null ? t("admin.vehicleAccess.chooseRequired") : access.mode === "ALL" ? t("admin.vehicleAccess.summaryAll") : t("admin.vehicleAccess.summarySelected", { groups: access.groupIds.length, vehicles: access.vehicleIds.length, effective: effectiveVehicleIds(access.groupIds, memberIds, access.vehicleIds).size })}</Descriptions.Item>
      </Descriptions>
    </section>
    {error ? <Alert type="error" message={error} showIcon /> : null}
    <Divider />
    <Button className="admin-user-create-v2__submit" type="primary" htmlType="submit" loading={busy} disabled={busy}>{busy ? t("admin.users.createPending") : t("admin.users.create")}</Button>
  </form>;
}

export function AdminUserCreateSuccess({ login, secret, onDone }: Readonly<{ login: string; secret: string; onDone(): void }>) {
  const { t } = useI18n();
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.focus();
  }, []);
  return <section ref={sectionRef} tabIndex={-1} aria-label={t("admin.users.created")} className="admin-user-create-v2__success">
    <Typography.Paragraph><Typography.Text strong>{t("admin.user.login")}: </Typography.Text>{login}</Typography.Paragraph>
    <OneTimePassword password={secret} title={t("admin.users.created")} onDone={onDone} />
    <Typography.Paragraph type="secondary">{t("admin.user.create.mustChangeSignIn")}</Typography.Paragraph>
  </section>;
}

export function AdminUserCreateForm({ groups, vehicles }: Readonly<{ groups: readonly VehicleGroupSummary[] | null; vehicles: readonly ManagedVehicle[] | null }>) {
  const router = useRouter();
  const { t } = useI18n();
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<AdminUserCreateRole>("USER");
  const [permissions, setPermissions] = useState<readonly AuthPermission[]>([]);
  const [access, setAccess] = useState<VehicleAccessDraft>(EMPTY_VEHICLE_ACCESS_DRAFT);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [createdLogin, setCreatedLogin] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);

  async function submit(): Promise<void> {
    if (pendingRef.current) return;
    if (!login) {
      setLoginError(t("auth.login.loginRequired"));
      return;
    }
    if (!CREATE_LOGIN_PATTERN.test(login)) {
      setLoginError(t("auth.login.loginInvalid"));
      return;
    }
    if (role === "USER" && access.mode === null) {
      setAccessError(t("admin.vehicleAccess.chooseRequired"));
      return;
    }
    if (role === "USER" && (groups === null || vehicles === null)) {
      setError(t("admin.groups.loadError"));
      return;
    }
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    setLoginError(null);
    setAccessError(null);
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildCreateUserPayload(login, role, permissions, buildVehicleAccessPayload(access))) });
      const body: unknown = await response.json();
      const result = response.ok ? parseOneTimePasswordResult(body) : null;
      if (!result) {
        setError(adminUserErrorMessage(body, t, "create"));
        return;
      }
      setCreatedLogin(login);
      setSecret(result.temporaryPassword);
    } catch {
      setError(t("admin.user.createError"));
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  if (secret) return <AdminUserCreateSuccess login={createdLogin} secret={secret} onDone={() => { setSecret(null); router.push("/admin/users"); router.refresh(); }} />;
  const directoryUnavailable = role === "USER" && (groups === null || vehicles === null);
  return <AdminUserCreateFields login={login} role={role} permissions={permissions} access={access} groups={groups} vehicles={vehicles} accessError={accessError} busy={busy} loginError={loginError} error={directoryUnavailable ? t("admin.groups.loadError") : error} onLoginChange={(value) => { setLogin(value); setLoginError(null); }} onRoleChange={(value) => { setRole(value); setAccessError(null); }} onTogglePermission={(permission, checked) => setPermissions(toggleCreatePermission(permissions, permission, checked))} onAccessModeChange={(mode) => { setAccess((current) => Object.freeze({ ...current, mode })); setAccessError(null); }} onToggleAccessGroup={(groupId, checked) => setAccess(toggleAccessGroup(access, groupId, checked))} onToggleAccessVehicle={(vehicleId, checked) => setAccess(toggleAccessVehicle(access, vehicleId, checked))} onSubmit={() => void submit()} />;
}
