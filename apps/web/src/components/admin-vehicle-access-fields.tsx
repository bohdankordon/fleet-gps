"use client";

import { useMemo, useState } from "react";
import { Alert, Checkbox, Empty, Input, Radio, Typography } from "antd";
import { CheckOutlined, SearchOutlined } from "@ant-design/icons";
import { useI18n } from "../i18n/client";
import type { VehicleAccessMode } from "../lib/admin-users/admin-users-contract";
import { effectiveVehicleIds, type VehicleAccessDraft } from "../lib/admin-users/vehicle-access-form-model";
import type { ManagedVehicle, VehicleGroupSummary } from "../lib/vehicle-groups/vehicle-groups-contract";
import { VEHICLE_GROUP_SWATCH_BACKGROUNDS } from "./vehicle-group-color-field";

export function groupVehiclesById(vehicles: readonly ManagedVehicle[]): Readonly<Record<string, readonly string[]>> {
  const grouped: Record<string, string[]> = {};
  for (const vehicle of vehicles) {
    if (vehicle.groupId === null) continue;
    (grouped[vehicle.groupId] ??= []).push(vehicle.id);
  }
  return Object.freeze(Object.fromEntries(Object.entries(grouped).map(([groupId, ids]) => [groupId, Object.freeze(ids)])));
}

export function AdminVehicleAccessNote() {
  const { t } = useI18n();
  return <section aria-labelledby="vehicle-access-title">
    <Typography.Title level={3} id="vehicle-access-title">{t("admin.vehicleAccess.title")}</Typography.Title>
    <Typography.Paragraph type="secondary">{t("admin.vehicleAccess.adminNote")}</Typography.Paragraph>
  </section>;
}

export type AdminVehicleAccessFieldsProps = Readonly<{
  draft: VehicleAccessDraft;
  groups: readonly VehicleGroupSummary[] | null;
  vehicles: readonly ManagedVehicle[] | null;
  busy: boolean;
  modeError: string | null;
  onModeChange(mode: VehicleAccessMode): void;
  onToggleGroup(groupId: string, checked: boolean): void;
  onToggleVehicle(vehicleId: string, checked: boolean): void;
}>;

export function AdminVehicleAccessFields({ draft, groups, vehicles, busy, modeError, onModeChange, onToggleGroup, onToggleVehicle }: AdminVehicleAccessFieldsProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const memberIds = useMemo(() => groupVehiclesById(vehicles ?? []), [vehicles]);
  const groupNameById = useMemo(() => new Map((groups ?? []).map((group) => [group.id, group.name])), [groups]);
  const viaGroup = useMemo(() => effectiveVehicleIds(draft.mode === "SELECTED" ? draft.groupIds : [], memberIds, []), [draft, memberIds]);
  const effective = useMemo(() => effectiveVehicleIds(draft.mode === "SELECTED" ? draft.groupIds : [], memberIds, draft.mode === "SELECTED" ? draft.vehicleIds : []), [draft, memberIds]);
  const directoryMissing = groups === null || vehicles === null;
  const filteredVehicles = useMemo(() => { const list = vehicles ?? []; const needle = query.trim().toLowerCase(); return needle ? list.filter((vehicle) => vehicle.name.toLowerCase().includes(needle)) : list; }, [vehicles, query]);
  return <section aria-labelledby="vehicle-access-title">
    <Typography.Title level={3} id="vehicle-access-title">{t("admin.vehicleAccess.title")}</Typography.Title>
    <Typography.Paragraph type="secondary">{t("admin.vehicleAccess.description")}</Typography.Paragraph>
    <Radio.Group value={draft.mode} disabled={busy} onChange={(event) => onModeChange(event.target.value)} aria-label={t("admin.vehicleAccess.title")}>
      <Radio value="ALL">{t("admin.vehicleAccess.all")}</Radio>
      <Radio value="SELECTED">{t("admin.vehicleAccess.selected")}</Radio>
    </Radio.Group>
    {draft.mode === "ALL" ? <Typography.Paragraph type="secondary">{t("admin.vehicleAccess.allDescription")}</Typography.Paragraph> : null}
    {draft.mode === "SELECTED" ? <Typography.Paragraph type="secondary">{t("admin.vehicleAccess.selectedDescription")}</Typography.Paragraph> : null}
    {modeError ? <p role="alert">{modeError}</p> : null}
    {draft.mode === "SELECTED" && directoryMissing ? <Alert type="error" showIcon message={t("admin.groups.loadError")} /> : null}
    {draft.mode === "SELECTED" && !directoryMissing ? <>
      <div role="group" aria-labelledby="vehicle-access-groups-label">
        <Typography.Text strong id="vehicle-access-groups-label">{t("admin.vehicleAccess.groups")}</Typography.Text>
        {(groups ?? []).length === 0 ? <Typography.Paragraph type="secondary">{t("admin.vehicleAccess.noGroups")}</Typography.Paragraph> : (groups ?? []).map((group) => <div key={group.id}><Checkbox checked={draft.groupIds.includes(group.id)} disabled={busy} onChange={(event) => onToggleGroup(group.id, event.target.checked)}><span className="vehicle-groups-directory__group-name"><span className="vehicle-group-directory-swatch" style={{ background: VEHICLE_GROUP_SWATCH_BACKGROUNDS[group.color] }} aria-hidden="true" />{group.name}</span></Checkbox><Typography.Text type="secondary"> · {t("admin.groups.vehicleCount", { count: group.vehicleCount })}</Typography.Text></div>)}
      </div>
      <div role="group" aria-labelledby="vehicle-access-vehicles-label">
        <Typography.Text strong id="vehicle-access-vehicles-label">{t("admin.vehicleAccess.vehicles")} · {draft.vehicleIds.length}</Typography.Text>
        <Typography.Paragraph type="secondary">{t("admin.vehicleAccess.grantHint")}</Typography.Paragraph>
        <Input allowClear prefix={<SearchOutlined />} value={query} disabled={busy} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.groups.searchPlaceholder")} aria-label={t("admin.groups.searchVehicles")} />
        {(vehicles ?? []).length === 0 ? <Typography.Paragraph type="secondary">{t("admin.vehicleAccess.noVehicles")}</Typography.Paragraph> : filteredVehicles.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("admin.groups.noSearchResults")} /> : <div className="vehicle-access-fields__vehicles">
          {filteredVehicles.map((vehicle) => <VehicleAccessRow key={vehicle.id} vehicle={vehicle} groupName={vehicle.groupId ? (groupNameById.get(vehicle.groupId) ?? t("admin.groups.ungroupedLabel")) : t("admin.groups.ungroupedLabel")} direct={draft.vehicleIds.includes(vehicle.id)} viaGroup={viaGroup.has(vehicle.id)} busy={busy} onToggle={(checked) => onToggleVehicle(vehicle.id, checked)} />)}
        </div>}
      </div>
    </> : null}
    {draft.mode === "SELECTED" && directoryMissing ? null : <VehicleAccessSummary draft={draft} effective={effective} />}
  </section>;
}

export type VehicleAccessRowProps = Readonly<{
  vehicle: ManagedVehicle;
  groupName: string;
  direct: boolean;
  viaGroup: boolean;
  busy: boolean;
  onToggle(checked: boolean): void;
}>;

export function VehicleAccessRow({ vehicle, groupName, direct, viaGroup, busy, onToggle }: VehicleAccessRowProps) {
  const { t } = useI18n();
  const status = direct && viaGroup ? t("admin.vehicleAccess.directPlusGroup") : !direct && viaGroup ? t("admin.vehicleAccess.alreadyViaGroup") : null;
  return <div className="vehicle-access-row">
    <Checkbox checked={direct} disabled={busy} onChange={(event) => onToggle(event.target.checked)}><span className="vehicle-access-row__name">{vehicle.name}</span></Checkbox>
    <div className="vehicle-access-row__meta">
      <Typography.Text type="secondary">{groupName}{vehicle.disabled ? ` · ${t("admin.groups.disabledLabel")}` : ""}</Typography.Text>
      {status ? <Typography.Text type="success"><CheckOutlined aria-hidden="true" /> {status}</Typography.Text> : null}
    </div>
  </div>;
}

export function VehicleAccessSummary({ draft, effective }: Readonly<{ draft: VehicleAccessDraft; effective: ReadonlySet<string> }>) {
  const { t } = useI18n();
  if (draft.mode === null) return null;
  if (draft.mode === "ALL") return <Typography.Paragraph><Typography.Text strong>{t("admin.vehicleAccess.summaryAll")}</Typography.Text></Typography.Paragraph>;
  return <Typography.Paragraph><Typography.Text strong>{t("admin.vehicleAccess.summarySelected", { groups: draft.groupIds.length, vehicles: draft.vehicleIds.length, effective: effective.size })}</Typography.Text></Typography.Paragraph>;
}
