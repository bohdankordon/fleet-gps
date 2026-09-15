"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Modal, Space, Transfer, Typography } from "antd";
import { useI18n } from "../i18n/client";
import { vehicleGroupErrorMessage } from "../i18n/errors";
import { validateGroupName, type ManagedVehicle, type VehicleGroupDetail } from "../lib/vehicle-groups/vehicle-groups-contract";

export type GroupDetailNavigation = Readonly<{ refresh(): void; push(href: string): void }>;

type Props = Readonly<{ group: VehicleGroupDetail; vehicles: readonly ManagedVehicle[]; groups: readonly import("../lib/vehicle-groups/vehicle-groups-contract").VehicleGroupSummary[]; navigation?: GroupDetailNavigation }>;

export function VehicleGroupDetailWorkspace({ group, vehicles, groups, navigation }: Props) {
  const { t } = useI18n();
  // Testability seam: production always omits `navigation`, so hook order is stable.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const router = navigation ?? useRouter();
  const groupNames = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.groupId])), [vehicles]);
  const groupNameById = useMemo(() => new Map(groups.map((entry) => [entry.id, entry.name])), [groups]);
  const [rename, setRename] = useState(group.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [targetKeys, setTargetKeys] = useState<readonly string[]>(group.vehicles.map((vehicle) => vehicle.id));
  const [confirmMove, setConfirmMove] = useState<readonly string[] | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<"rename" | "members" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const memberIds = useMemo(() => new Set(group.vehicles.map((vehicle) => vehicle.id)), [group]);
  const movedIn = useMemo(() => targetKeys.filter((id) => !memberIds.has(id) && groupNames.get(id) && groupNames.get(id) !== group.id), [targetKeys, memberIds, groupNames, group.id]);
  const dirtyMembers = useMemo(() => targetKeys.length !== memberIds.size || targetKeys.some((id) => !memberIds.has(id)), [targetKeys, memberIds]);
  const vehicleById = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);
  const dataSource = useMemo(() => vehicles.map((vehicle) => ({ key: vehicle.id, title: vehicle.name, description: vehicle.groupId && vehicle.groupId !== group.id ? vehicle.groupId : undefined })), [vehicles, group.id]);
  async function request(path: string, method: "PATCH" | "PUT" | "DELETE", payload?: object): Promise<{ ok: boolean; body: unknown }> {
    const response = await fetch(path, { method, headers: payload ? { "Content-Type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined });
    return { ok: response.ok, body: await response.json().catch(() => null) };
  }
  async function saveRename(): Promise<void> {
    if (validateGroupName(rename)) { setRenameError(t("admin.groups.nameRequired")); return; }
    if (rename.trim() === group.name) return;
    setBusy("rename"); setError(null);
    try {
      const { ok, body } = await request(`/api/admin/vehicle-groups/${encodeURIComponent(group.id)}`, "PATCH", { name: rename.trim() });
      if (!ok) { if ((body as { error?: string })?.error === "NOT_FOUND") setGone(true); setError(vehicleGroupErrorMessage(body, t)); return; }
      setRenameError(null); router.refresh();
    } catch { setError(vehicleGroupErrorMessage(null, t)); }
    finally { setBusy(null); }
  }
  async function saveMembers(ids: readonly string[]): Promise<void> {
    setBusy("members"); setError(null); setConfirmMove(null);
    try {
      const { ok, body } = await request(`/api/admin/vehicle-groups/${encodeURIComponent(group.id)}/vehicles`, "PUT", { vehicleIds: [...ids] });
      if (!ok) { if ((body as { error?: string })?.error === "NOT_FOUND") setGone(true); setError(vehicleGroupErrorMessage(body, t)); return; }
      router.refresh();
    } catch { setError(vehicleGroupErrorMessage(null, t)); }
    finally { setBusy(null); }
  }
  async function remove(): Promise<void> {
    setBusy("delete"); setError(null);
    try {
      const response = await fetch(`/api/admin/vehicle-groups/${encodeURIComponent(group.id)}`, { method: "DELETE" });
      if (response.status === 404) { setGone(true); return; }
      if (!response.ok) { setError(vehicleGroupErrorMessage(await response.json().catch(() => null), t)); return; }
      router.push("/admin/vehicle-groups"); router.refresh();
    } catch { setError(vehicleGroupErrorMessage(null, t)); }
    finally { setBusy(null); }
  }
  if (gone) return <Alert type="warning" showIcon title={t("admin.groups.notFound")} description={t("admin.groups.notFoundText")} action={<Link href="/admin/vehicle-groups">{t("admin.groups.backToGroups")}</Link>} />;
  return <>
    <Link className="vehicle-groups-detail__back" href="/admin/vehicle-groups"><span aria-hidden="true">{"← "}</span>{t("admin.groups.backToGroups")}</Link>
    <header className="vehicle-groups-detail__identity">
      <Typography.Title level={1}>{group.name}</Typography.Title>
      <Typography.Text type="secondary">{t("admin.groups.vehicleCount", { count: group.vehicleCount })}</Typography.Text>
    </header>
    {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} /> : null}
    <Card className="vehicle-groups-detail__card" title={t("admin.groups.rename")}>
      <Space.Compact block>
        <Input value={rename} maxLength={128} disabled={busy !== null} status={renameError ? "error" : undefined} aria-label={t("admin.groups.name")} onChange={(event) => { setRename(event.target.value); if (renameError) setRenameError(null); }} onPressEnter={() => void saveRename()} />
        <Button type="primary" loading={busy === "rename"} disabled={busy !== null || rename.trim() === group.name} onClick={() => void saveRename()}>{t("admin.groups.save")}</Button>
      </Space.Compact>
      {renameError ? <p role="alert">{renameError}</p> : null}
    </Card>
    <Card className="vehicle-groups-detail__card" title={t("admin.groups.membership")} extra={<Button type="primary" loading={busy === "members"} disabled={busy !== null || !dirtyMembers} onClick={() => { if (movedIn.length > 0) setConfirmMove(movedIn); else void saveMembers(targetKeys); }}>{t("admin.groups.save")}</Button>}>
      <Typography.Paragraph type="secondary">{t("admin.groups.membershipHint")}</Typography.Paragraph>
      {group.vehicles.length === 0 && targetKeys.length === 0 ? <Typography.Paragraph type="secondary">{t("admin.groups.emptyGroup")}</Typography.Paragraph> : null}
      <Transfer dataSource={dataSource} targetKeys={[...targetKeys]} onChange={(next) => setTargetKeys(Object.freeze(next.map((key) => String(key))))} showSearch filterOption={(input, item) => (item.title ?? "").toLowerCase().includes(input.trim().toLowerCase())} titles={[t("admin.groups.availableVehicles"), group.name]} styles={{ section: { width: "100%", minHeight: 320 } }} render={(item) => <span>{item.title}{vehicleById.get(String(item.key))?.disabled ? <Typography.Text type="secondary"> · {t("admin.groups.disabledLabel")}</Typography.Text> : null}{typeof item.description === "string" ? <Typography.Text type="secondary"> · {t("admin.groups.currentGroup", { name: groupNameById.get(item.description) ?? t("admin.groups.ungroupedLabel") })}</Typography.Text> : null}</span>} />
    </Card>
    <Card className="vehicle-groups-detail__card vehicle-groups-detail__danger" title={t("admin.groups.delete")}>
      <Button danger loading={busy === "delete"} disabled={busy !== null} onClick={() => setDeleteOpen(true)}>{t("admin.groups.delete")}</Button>
    </Card>
    <Modal open={confirmMove !== null} title={t("admin.groups.moveTitle")} okText={t("admin.groups.moveConfirm")} cancelText={t("common.cancel")} confirmLoading={busy === "members"} onOk={() => { if (confirmMove) void saveMembers(targetKeys); }} onCancel={() => setConfirmMove(null)} destroyOnHidden>
      <Typography.Paragraph>{t("admin.groups.moveText")}</Typography.Paragraph>
      <Typography.Paragraph type="secondary">{(confirmMove ?? []).map((id) => vehicleName(id, vehicles)).join(", ")}</Typography.Paragraph>
    </Modal>
    <Modal open={deleteOpen} title={t("admin.groups.deleteTitle", { name: group.name })} okText={t("admin.groups.deleteConfirm")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")} confirmLoading={busy === "delete"} onOk={() => { setDeleteOpen(false); void remove(); }} onCancel={() => { if (busy === null) setDeleteOpen(false); }} destroyOnHidden>
      <Typography.Paragraph>{t("admin.groups.deleteText")}</Typography.Paragraph>
    </Modal>
  </>;
}

function vehicleName(id: string, vehicles: readonly ManagedVehicle[]): string {
  return vehicles.find((vehicle) => vehicle.id === id)?.name ?? id;
}
