"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Divider, Empty, Flex, Grid, Input, Listy, Select, Space, Spin, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useI18n } from "../i18n/client";
import { roleLabel } from "../i18n/domain-labels";
import { formatDateTime } from "../i18n/formatting";
import type { AdminManagedUser } from "../lib/admin-users/admin-users-contract";
import { adminUserAuthoritySummary, EMPTY_ADMIN_USERS_QUERY, filterAdminUsers, hasAdminUsersQuery, parseAdminUsersQuery, serializeAdminUsersQuery, type AdminUsersQuery, type AdminUsersRoleFilter, type AdminUsersStateFilter } from "../lib/admin-users/admin-users-directory-model";

type Props = Readonly<{ users: readonly AdminManagedUser[] | null; actorId: string; initialQuery: AdminUsersQuery }>;

export function AdminUsersPageHeader({ loading = false }: Readonly<{ loading?: boolean }>) {
  const { t } = useI18n();
  return <header className="admin-users-page-header">
    <div className="admin-users-page-header__title"><Typography.Title level={1}>{t("admin.users.title")}</Typography.Title><Button className="admin-users-create" type="primary" href="/admin/users/new" icon={<PlusOutlined />} disabled={loading}>{t("admin.users.create")}</Button></div>
    <Typography.Text type="secondary">{t("admin.users.description")}</Typography.Text>
  </header>;
}

export function AdminUsersWorkspace({ users, actorId, initialQuery }: Props) {
  const { locale, t } = useI18n();
  const screens = Grid.useBreakpoint();
  const [query, setQuery] = useState(initialQuery);
  const updateQuery = useCallback((next: AdminUsersQuery) => {
    setQuery(next);
    const encoded = serializeAdminUsersQuery(next);
    window.history.replaceState(window.history.state, "", encoded ? `/admin/users?${encoded}` : "/admin/users");
  }, []);
  useEffect(() => {
    const restore = () => setQuery(parseAdminUsersQuery(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  if (!users) return <Alert className="admin-users-load-error" type="error" showIcon title={t("admin.users.errorTitle")} description={t("admin.users.errorText")} action={<Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>} />;

  const filtered = filterAdminUsers(users, query, locale);
  const hasFilters = hasAdminUsersQuery(query);
  return <>
    <AdminUsersControls key={query.q} query={query} onChange={updateQuery} />
    <section className="admin-users-directory" aria-labelledby="admin-users-directory-title">
      <div className="admin-users-directory__heading">
        <Typography.Title id="admin-users-directory-title" level={2}>{t("admin.users.directory")}</Typography.Title>
        <Space size="middle"><Typography.Text type="secondary" aria-live="polite">{t("admin.users.showing", { shown: filtered.length, total: users.length })}</Typography.Text><Button size="small" disabled={!hasFilters} onClick={() => updateQuery(EMPTY_ADMIN_USERS_QUERY)}>{t("admin.users.resetFilters")}</Button></Space>
      </div>
      <Divider className="admin-users-directory__divider" />
      {users.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("admin.users.empty")} /> : filtered.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Space orientation="vertical"><Typography.Text>{t("admin.users.noMatches")}</Typography.Text><Button onClick={() => updateQuery(EMPTY_ADMIN_USERS_QUERY)}>{t("admin.users.resetFilters")}</Button></Space>} /> : screens.lg ? <AdminUsersTable users={filtered} actorId={actorId} /> : <AdminUsersList users={filtered} actorId={actorId} />}
    </section>
  </>;
}

function AdminUsersControls({ query, onChange }: Readonly<{ query: AdminUsersQuery; onChange: (query: AdminUsersQuery) => void }>) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(query.q);
  useEffect(() => {
    if (draft === query.q) return;
    const timer = window.setTimeout(() => onChange({ ...query, q: draft }), 250);
    return () => window.clearTimeout(timer);
  }, [draft, onChange, query]);
  return <section className="admin-users-controls" aria-label={t("admin.users.filters") }>
    <label className="admin-users-control admin-users-control--search"><Typography.Text>{t("admin.users.search")}</Typography.Text><Input size="large" allowClear prefix={<SearchOutlined />} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("admin.users.searchPlaceholder")} /></label>
    <label className="admin-users-control"><Typography.Text>{t("admin.users.role")}</Typography.Text><Select size="large" aria-label={t("admin.users.role")} value={query.role} onChange={(role: AdminUsersRoleFilter) => onChange({ ...query, role })} options={[{ value: "ALL", label: t("common.all") }, { value: "ADMIN", label: t("role.ADMIN") }, { value: "USER", label: t("role.USER") }]} /></label>
    <label className="admin-users-control"><Typography.Text>{t("admin.users.state")}</Typography.Text><Select size="large" aria-label={t("admin.users.state")} value={query.state} onChange={(state: AdminUsersStateFilter) => onChange({ ...query, state })} options={[{ value: "ALL", label: t("common.all") }, { value: "ACTIVE", label: t("admin.user.active") }, { value: "DISABLED", label: t("admin.user.disabled") }, { value: "PASSWORD_CHANGE_REQUIRED", label: t("admin.user.passwordChangeRequired") }]} /></label>
  </section>;
}

function AdminUsersTable({ users, actorId }: Readonly<{ users: readonly AdminManagedUser[]; actorId: string }>) {
  const { locale, t } = useI18n();
  const columns: TableColumnsType<AdminManagedUser> = [
    { title: t("admin.users.account"), key: "account", width: 210, render: (_, user) => <AccountCell user={user} self={user.id === actorId} /> },
    { title: t("admin.users.authority"), key: "authority", width: 270, render: (_, user) => <AuthorityCell user={user} /> },
    { title: t("admin.users.state"), key: "state", width: 220, render: (_, user) => <StateCell user={user} /> },
    { title: t("admin.user.telegramStatus"), key: "telegram", width: 150, render: (_, user) => <TelegramCell user={user} /> },
    { title: t("admin.user.updatedAt"), dataIndex: "updatedAt", key: "updated", width: 160, render: (updatedAt: string) => <Typography.Text type="secondary"><time dateTime={updatedAt}>{formatDateTime(locale, updatedAt) ?? "—"}</time></Typography.Text> },
    { title: <span className="sr-only">{t("admin.users.open")}</span>, key: "open", align: "right", width: 100, render: (_, user) => <OpenUser user={user} /> },
  ];
  return <Table<AdminManagedUser> className="admin-users-table-v2" aria-label={t("admin.users.directory")} rowKey="id" tableLayout="fixed" columns={columns} dataSource={[...users]} pagination={false} />;
}

function AdminUsersList({ users, actorId }: Readonly<{ users: readonly AdminManagedUser[]; actorId: string }>) {
  const { locale, t } = useI18n();
  return <Listy className="admin-users-list" aria-label={t("admin.users.directory")} items={[...users]} rowKey="id" itemRender={(user) => <div className="admin-users-list__item">
    <div className="admin-users-list__account"><AccountCell user={user} self={user.id === actorId} /></div>
    <div className="admin-users-list__authority"><AuthorityCell user={user} /></div>
    <div className="admin-users-list__state"><StateCell user={user} /></div>
    <div className="admin-users-list__telegram"><Typography.Text type="secondary">{t("admin.user.telegramStatus")}: </Typography.Text><TelegramCell user={user} /></div>
    <div className="admin-users-list__updated"><Typography.Text type="secondary">{t("admin.user.updatedAt")}: <time dateTime={user.updatedAt}>{formatDateTime(locale, user.updatedAt) ?? "—"}</time></Typography.Text></div>
    <div className="admin-users-list__open"><OpenUser user={user} /></div>
  </div>} />;
}

function AccountCell({ user, self }: Readonly<{ user: AdminManagedUser; self: boolean }>) { const { t } = useI18n(); return <Flex vertical gap={0}><Typography.Text strong>{user.login}</Typography.Text>{self ? <Typography.Text type="secondary">{t("admin.users.self")}</Typography.Text> : null}</Flex>; }
function AuthorityCell({ user }: Readonly<{ user: AdminManagedUser }>) { const { locale } = useI18n(); return <Flex vertical gap={0}><Typography.Text strong>{roleLabel(user.role, locale)}</Typography.Text><Typography.Text type="secondary">{adminUserAuthoritySummary(user, locale)}</Typography.Text></Flex>; }
function StateCell({ user }: Readonly<{ user: AdminManagedUser }>) { const { t } = useI18n(); return <Flex vertical gap={0}><Typography.Text strong type={user.disabled ? "danger" : undefined}>{user.disabled ? t("admin.user.disabled") : t("admin.user.active")}</Typography.Text>{user.mustChangePassword ? <Typography.Text type="warning">{t("admin.user.passwordChangeRequired")}</Typography.Text> : null}</Flex>; }
function TelegramCell({ user }: Readonly<{ user: AdminManagedUser }>) { const { t } = useI18n(); return <Typography.Text type={user.telegramStatus === "CONNECTED" ? undefined : "secondary"}>{user.telegramStatus === "CONNECTED" ? t("admin.users.telegramConnected") : t("admin.users.telegramNotConnected")}</Typography.Text>; }
function OpenUser({ user }: Readonly<{ user: AdminManagedUser }>) { const { t } = useI18n(); return <Button type="link" size="small" href={`/admin/users/${user.id}`} aria-label={t("admin.users.openAccount", { login: user.login })}>{t("admin.users.open")} <RightOutlined aria-hidden /></Button>; }

export function AdminUsersLoadingWorkspace() { const { t } = useI18n(); return <div className="admin-users-loading" role="status" aria-live="polite"><Spin description={t("admin.users.loading")}><div /></Spin></div>; }
