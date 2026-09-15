"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Divider, Empty, Grid, Input, Listy, Modal, Pagination, Space, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useI18n } from "../i18n/client";
import { vehicleGroupErrorMessage } from "../i18n/errors";
import { ungroupedVehicles, validateGroupName, type ManagedVehicle, type VehicleGroupSummary } from "../lib/vehicle-groups/vehicle-groups-contract";

export function VehicleGroupsPageHeader() {
  const { t } = useI18n();
  return <header className="vehicle-groups-page__header">
    <Typography.Title level={1}>{t("admin.groups.title")}</Typography.Title>
    <Typography.Text type="secondary">{t("admin.groups.description")}</Typography.Text>
  </header>;
}

export function VehicleGroupsLoadingWorkspace() {
  const { t } = useI18n();
  return <p aria-live="polite">{t("admin.groups.loading")}</p>;
}

type Props = Readonly<{ groups: readonly VehicleGroupSummary[] | null; vehicles: readonly ManagedVehicle[] | null }>; 

export function VehicleGroupsWorkspace({ groups, vehicles }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ungrouped = useMemo(() => ungroupedVehicles(vehicles ?? []), [vehicles]);
  if (groups === null || vehicles === null) return <Alert type="error" showIcon title={t("admin.groups.loadError")} action={<Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>} />;
  async function create(): Promise<void> {
    const violation = validateGroupName(name);
    if (violation) { setNameError(t("admin.groups.nameRequired")); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/vehicle-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      if (!response.ok) { setError(vehicleGroupErrorMessage(await response.json().catch(() => null), t)); return; }
      setCreateOpen(false); setName(""); setNameError(null); router.refresh();
    } catch { setError(vehicleGroupErrorMessage(null, t)); }
    finally { setBusy(false); }
  }
  const columns: TableColumnsType<VehicleGroupSummary> = [
    { title: t("admin.groups.directory"), key: "name", render: (_, group) => <Link href={`/admin/vehicle-groups/${encodeURIComponent(group.id)}`} aria-label={t("admin.groups.openGroup", { name: group.name })}>{group.name}</Link> },
    { title: t("admin.groups.vehicles"), key: "vehicles", width: 160, render: (_, group) => t("admin.groups.vehicleCount", { count: group.vehicleCount }) },
    { key: "open", align: "right", width: 120, render: (_, group) => <Link href={`/admin/vehicle-groups/${encodeURIComponent(group.id)}`}>{t("admin.groups.open")}</Link> },
  ];
  return <>
    <div className="vehicle-groups-page__actions"><Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); setName(""); setNameError(null); setError(null); }}>{t("admin.groups.create")}</Button></div>
    <VehicleGroupsDirectory groups={groups} />
    <UngroupedCard vehicles={ungrouped} />
    <Modal open={createOpen} title={t("admin.groups.createTitle")} okText={t("admin.groups.create")} cancelText={t("common.cancel")} confirmLoading={busy} onOk={() => void create()} onCancel={() => { if (!busy) setCreateOpen(false); }} destroyOnHidden>
      <label className="vehicle-groups-modal__label" htmlFor="create-group-name">{t("admin.groups.name")}</label>
      <Input id="create-group-name" value={name} maxLength={128} autoComplete="off" placeholder={t("admin.groups.namePlaceholder")} status={nameError ? "error" : undefined} disabled={busy} onChange={(event) => { setName(event.target.value); if (nameError) setNameError(null); }} onPressEnter={() => void create()} />
      {nameError ? <p className="vehicle-groups-modal__error" role="alert">{nameError}</p> : null}
      {error ? <Alert type="error" showIcon message={error} /> : null}
    </Modal>
  </>;
}

export function VehicleGroupsDirectory({ groups }: Readonly<{ groups: readonly VehicleGroupSummary[] }>) {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const columns: TableColumnsType<VehicleGroupSummary> = [
    { title: t("admin.groups.directory"), key: "name", render: (_, group) => <Link href={`/admin/vehicle-groups/${encodeURIComponent(group.id)}`} aria-label={t("admin.groups.openGroup", { name: group.name })}>{group.name}</Link> },
    { title: t("admin.groups.vehicles"), key: "vehicles", width: 160, render: (_, group) => t("admin.groups.vehicleCount", { count: group.vehicleCount }) },
    { key: "open", align: "right", width: 120, render: (_, group) => <Link href={`/admin/vehicle-groups/${encodeURIComponent(group.id)}`}>{t("admin.groups.open")}</Link> },
  ];
  return <section className="vehicle-groups-directory" aria-labelledby="vehicle-groups-directory-title">
    <Typography.Title id="vehicle-groups-directory-title" level={2}>{t("admin.groups.directory")}</Typography.Title>
    <Divider />
    {groups.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("admin.groups.empty")} /> : screens.lg ? <Table<VehicleGroupSummary> rowKey="id" dataSource={[...groups]} columns={columns} pagination={false} /> : <Listy className="vehicle-groups-list" aria-label={t("admin.groups.directory")} items={[...groups]} rowKey="id" itemRender={(group) => <div className="vehicle-groups-list__item"><div className="vehicle-groups-list__main"><Link href={`/admin/vehicle-groups/${encodeURIComponent(group.id)}`} aria-label={t("admin.groups.openGroup", { name: group.name })}>{group.name}</Link><Typography.Text type="secondary">{t("admin.groups.vehicleCount", { count: group.vehicleCount })}</Typography.Text></div><Link href={`/admin/vehicle-groups/${encodeURIComponent(group.id)}`}>{t("admin.groups.open")}</Link></div>} />}
  </section>;
}

export function UngroupedCard({ vehicles }: Readonly<{ vehicles: readonly ManagedVehicle[] }>) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return needle ? vehicles.filter((vehicle) => vehicle.name.toLowerCase().includes(needle)) : vehicles; }, [vehicles, query]);
  const pageSize = 10;
  const items = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);
  return <Card className="vehicle-groups-ungrouped" title={t("admin.groups.ungroupedTitle")} extra={<Typography.Text type="secondary" aria-live="polite">{t("admin.groups.vehicleCount", { count: vehicles.length })}</Typography.Text>}>
    <Typography.Paragraph type="secondary">{t("admin.groups.ungroupedText")}</Typography.Paragraph>
    {vehicles.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("admin.groups.ungroupedEmpty")} /> : <>
      <Input allowClear prefix={<SearchOutlined />} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t("admin.groups.searchPlaceholder")} aria-label={t("admin.groups.searchVehicles")} />
      {filtered.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("admin.groups.noSearchResults")} /> : <><Listy items={items} rowKey="id" itemRender={(vehicle) => <div className="vehicle-groups-ungrouped__item"><Space>{vehicle.name}{vehicle.disabled ? <Typography.Text type="secondary">· {t("admin.groups.disabledLabel")}</Typography.Text> : null}</Space></div>} />{filtered.length > pageSize ? <Pagination current={page} pageSize={pageSize} total={filtered.length} onChange={setPage} size="small" /> : null}</>}
    </>}
  </Card>;
}
