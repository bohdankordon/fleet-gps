"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Checkbox, Input, Pagination, Segmented, Switch, Tag } from "antd";
import { AlertDialog } from "./ui/dialog";
import { useI18n } from "../i18n/client";
import type { MessageKey } from "../i18n/messages";
import type { TelegramConnectionView } from "../lib/account/account-telegram-connection";
import {
  buildPreferencesPatchBody,
  draftFromBaseline,
  filterVehiclesByName,
  isDraftDirty,
  paginateVehicles,
  parsePreferenceBaseline,
  resolvePreferencesConflict,
  validatePreferencesDraft,
  VEHICLE_PAGE_SIZE,
  type FieldResolution,
  type PreferenceBaseline,
  type PreferenceDraft,
  type PreferenceField,
  type VehicleScope,
} from "../lib/account/account-notification-preferences";

type ConflictState = Readonly<{
  latest: PreferenceBaseline;
  review: readonly FieldResolution[];
  loadError: boolean;
}>;

export function AccountNotificationsError({ title }: Readonly<{ title: string }>) {
  return <Alert type="error" showIcon title={title} />;
}

export function AccountNotificationsSuccess({ title }: Readonly<{ title: string }>) {
  return <Alert role="status" type="success" showIcon title={title} />;
}

export function AccountNotificationsWorkspace({ baseline: initialBaseline, connection, deliveryLimited }: Readonly<{
  baseline: PreferenceBaseline;
  connection: TelegramConnectionView;
  deliveryLimited: boolean;
}>) {
  const { t } = useI18n();
  const [baseline, setBaseline] = useState(initialBaseline);
  const [draft, setDraft] = useState<PreferenceDraft>(() => draftFromBaseline(initialBaseline));
  const [saving, setSaving] = useState(false);
  const [saveErrorKey, setSaveErrorKey] = useState<MessageKey | null>(null);
  const [vehiclesInvalid, setVehiclesInvalid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // Ephemeral selector UI state: search and pagination never dirty the draft.
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const savingRef = useRef(false);
  const generation = useRef(0);
  const leavingRef = useRef(false);
  const pendingHref = useRef<string | null>(null);
  const pendingAnchor = useRef<HTMLAnchorElement | null>(null);
  const vehiclesGroupRef = useRef<HTMLDivElement>(null);
  const conflictPanelRef = useRef<HTMLDivElement>(null);
  const dirty = isDraftDirty(baseline, draft);
  const canSelect = baseline.canSelectVehicles;
  useEffect(() => () => {
    generation.current += 1;
  }, []);

  // Reload/close protection: dirty drafts only, never after save/discard.
  useEffect(() => {
    if (!dirty || leavingRef.current) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // In-app link protection without touching shared navigation: while dirty,
  // same-document anchor navigation pauses for an explicit Stay/Leave choice.
  // Full reloads/closes are covered by beforeunload above.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent): void => {
      if (leavingRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target === "_blank" || target.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(target.href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash !== "") return;
      event.preventDefault();
      pendingHref.current = url.toString();
      pendingAnchor.current = target;
      setLeaveOpen(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  function touchDraft(next: PreferenceDraft): void {
    // Any edit retires transient feedback and any stale conflict review.
    setDraft(next);
    setSuccess(false);
    setSaveErrorKey(null);
    setConflict(null);
  }

  function focusVehiclesGroup(): void {
    vehiclesGroupRef.current?.focus();
  }

  async function handleSave(): Promise<void> {
    if (savingRef.current) return;
    const violations = validatePreferencesDraft(draft, canSelect);
    if (violations.length > 0) {
      setVehiclesInvalid(true);
      focusVehiclesGroup();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveErrorKey(null);
    setSuccess(false);
    const run = (generation.current += 1);
    try {
      const response = await fetch("/api/account/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPreferencesPatchBody(baseline, draft)),
      });
      if (generation.current !== run) return;
      if (response.ok) {
        const saved = parsePreferenceBaseline(await response.json().catch(() => null));
        if (!saved) {
          setSaveErrorKey("telegram.preferences.error.generic");
          return;
        }
        setBaseline(saved);
        setDraft(draftFromBaseline(saved));
        setConflict(null);
        setVehiclesInvalid(false);
        setSuccess(true);
        return;
      }
      if (response.status === 409) {
        await startConflictFlow();
        return;
      }
      setSaveErrorKey("telegram.preferences.error.generic");
    } catch {
      if (generation.current !== run) return;
      setSaveErrorKey("telegram.preferences.error.generic");
    } finally {
      if (generation.current === run) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  async function startConflictFlow(): Promise<void> {
    setConflictLoading(true);
    const run = generation.current;
    try {
      const response = await fetch("/api/account/notifications", { headers: { Accept: "application/json" } });
      if (generation.current !== run) return;
      const latest = response.ok ? parsePreferenceBaseline((await response.json().catch(() => null) as Record<string, unknown> | null)?.preferences) : null;
      if (!latest) {
        setConflict((current) => current ? { ...current, loadError: true } : { latest: baseline, review: [], loadError: true });
        return;
      }
      setConflict({
        latest,
        review: resolvePreferencesConflict(baseline.draft, draft, latest.draft),
        loadError: false,
      });
    } catch {
      if (generation.current !== run) return;
      setConflict((current) => current ? { ...current, loadError: true } : { latest: baseline, review: [], loadError: true });
    } finally {
      if (generation.current === run) setConflictLoading(false);
    }
  }

  // Applying the merged review never saves: latest becomes the baseline
  // (its revision is required for any further PATCH), the merged draft
  // stays dirty wherever it still differs, awaiting an explicit Save.
  function applyMergedDraft(): void {
    if (!conflict || conflict.loadError) return;
    const resolved: Record<string, boolean | string | readonly string[]> = {};
    for (const entry of conflict.review) resolved[entry.field] = entry.value;
    setBaseline(conflict.latest);
    setDraft({
      enabled: resolved.enabled as boolean,
      speedingEnabled: resolved.speedingEnabled as boolean,
      inactivityEnabled: resolved.inactivityEnabled as boolean,
      vehicleScope: resolved.vehicleScope as PreferenceDraft["vehicleScope"],
      selectedVehicleIds: [...(resolved.selectedVehicleIds as readonly string[])],
    });
    setConflict(null);
    setSuccess(false);
  }

  function handleDiscard(): void {
    setDraft(draftFromBaseline(baseline));
    setSuccess(false);
    setSaveErrorKey(null);
    setVehiclesInvalid(false);
    setConflict(null);
    setDiscardOpen(false);
  }

  function handleLeave(): void {
    leavingRef.current = true;
    setLeaveOpen(false);
    const href = pendingHref.current;
    pendingHref.current = null;
    if (href) window.location.assign(href);
  }

  function handleStay(): void {
    setLeaveOpen(false);
    pendingAnchor.current?.focus();
    pendingAnchor.current = null;
    pendingHref.current = null;
  }
  const hasConflict = conflict !== null && !conflict.loadError;
  useEffect(() => {
    if (hasConflict) conflictPanelRef.current?.focus();
  }, [hasConflict]);

  function prerequisite(): ReactNode {
    const status = connection.status;
    const color = status === "CONNECTED" ? "success" : status === "BROKEN" ? "warning" : status === "LINK_PENDING" ? "processing" : "default";
    const line = status === "CONNECTED"
      ? t("account.notifications.prereqConnected")
      : status === "BROKEN"
        ? t("account.overview.telegram.brokenHelp")
        : status === "LINK_PENDING"
          ? t("account.notifications.prereqPending")
          : t("account.overview.notifications.needsTelegram");
    return <>
      <div className="account-notifications__prereqrow">
        <span className="account-notifications__label">{t("telegram.title")}</span>
        <Tag color={color}>{t(`telegram.label.${status}`)}</Tag>
        <span className="account-notifications__spacer" aria-hidden="true" />
        <span className="account-notifications__action">
          <Button href="/account/telegram">{t("account.overview.telegram.action")}</Button>
        </span>
      </div>
      <p className="account-notifications__supporting">{line}</p>
    </>;
  }

  function vehicleName(id: string): string {
    return baseline.vehicles.find((vehicle) => vehicle.id === id)?.name
      ?? conflict?.latest.vehicles.find((vehicle) => vehicle.id === id)?.name
      ?? id;
  }

  function describeValue(field: PreferenceField, value: boolean | VehicleScope | readonly string[]): string {
    if (typeof value === "boolean") return value ? t("account.overview.notifications.on") : t("account.overview.notifications.off");
    if (typeof value === "string") return value === "ALL" ? t("telegram.preferences.allVehicles") : t("telegram.preferences.selectedVehicles");
    const names = (value as readonly string[]).map(vehicleName);
    return names.length > 0 ? names.join(", ") : t("account.overview.notifications.noEvents");
  }

  function fieldLabel(field: PreferenceField): string {
    if (field === "vehicleScope") return t("telegram.preferences.scope");
    if (field === "selectedVehicleIds") return t("telegram.preferences.selectedVehicles");
    if (field === "speedingEnabled") return t("telegram.preferences.speeding");
    if (field === "inactivityEnabled") return t("telegram.preferences.inactivity");
    return t("telegram.preferences.enabled");
  }

  const anyDisabledListed = baseline.vehicles.some((vehicle) => vehicle.disabled);
  const noEvents = !draft.speedingEnabled && !draft.inactivityEnabled;
  const filteredVehicles = useMemo(() => filterVehiclesByName(baseline.vehicles, query), [baseline.vehicles, query]);
  const paged = useMemo(() => paginateVehicles(filteredVehicles, page, VEHICLE_PAGE_SIZE), [filteredVehicles, page]);

  return <>
    <div className="account-notifications__prereq">{prerequisite()}</div>
    {deliveryLimited ? <Alert type="warning" showIcon title={t("account.notifications.deliveryLimited")} /> : null}
    <section aria-labelledby="notifications-master-heading" className="account-notifications__section">
      <div className="account-notifications__masterrow">
        <div className="account-notifications__fact">
          <h3 id="notifications-master-heading" className="account-notifications__label">{t("account.notifications.masterLabel")}</h3>
          <p className="account-notifications__supporting">{t("account.notifications.masterHelp")}</p>
        </div>
        <Switch
          checked={draft.enabled}
          disabled={saving}
          onChange={(checked) => touchDraft({ ...draft, enabled: checked })}
          aria-labelledby="notifications-master-heading"
        />
      </div>
    </section>
    <section aria-labelledby="notifications-events-heading" className="account-notifications__section">
      <h3 id="notifications-events-heading" className="account-notifications__label">{t("account.notifications.eventsTitle")}</h3>
      <p className="account-notifications__supporting">{t("account.notifications.eventsHelp")}</p>
      <div className="account-notifications__rows" role="group" aria-labelledby="notifications-events-heading">
        <div className="account-notifications__row">
          <span id="notifications-event-speeding" className="account-notifications__rowlabel">{t("telegram.preferences.speeding")}</span>
          <Checkbox
            aria-labelledby="notifications-event-speeding"
            checked={draft.speedingEnabled}
            disabled={saving}
            onChange={(event) => touchDraft({ ...draft, speedingEnabled: event.target.checked })}
          />
        </div>
        <div className="account-notifications__row">
          <span id="notifications-event-inactivity" className="account-notifications__rowlabel">{t("telegram.preferences.inactivity")}</span>
          <Checkbox
            aria-labelledby="notifications-event-inactivity"
            checked={draft.inactivityEnabled}
            disabled={saving}
            onChange={(event) => touchDraft({ ...draft, inactivityEnabled: event.target.checked })}
          />
        </div>
      </div>
      {noEvents ? <p className="account-notifications__supporting">{t("account.notifications.noEventsHelp")}</p> : null}
    </section>
    <section aria-labelledby="notifications-vehicles-heading" className="account-notifications__section">
      <h3 id="notifications-vehicles-heading" className="account-notifications__label">{t("account.notifications.vehiclesTitle")}</h3>
      <p className="account-notifications__supporting">{t("account.notifications.vehiclesHelp")}</p>
      {canSelect ? (
        <div ref={vehiclesGroupRef} tabIndex={-1} className="account-notifications__groupwrap">
          <Segmented
            value={draft.vehicleScope}
            disabled={saving}
            onChange={(value) => {
              touchDraft({ ...draft, vehicleScope: value as PreferenceDraft["vehicleScope"] });
              setPage(1);
            }}
            options={[
              { value: "ALL", label: t("telegram.preferences.allVehicles") },
              { value: "SELECTED", label: t("telegram.preferences.selectedVehicles") },
            ]}
            aria-label={t("account.notifications.vehiclesTitle")}
          />
          {draft.vehicleScope === "SELECTED" ? (
            <div className="account-notifications__selector">
              <label htmlFor="notifications-vehicle-search" className="account-notifications__label">{t("account.notifications.searchLabel")}</label>
              <Input
                id="notifications-vehicle-search"
                value={query}
                disabled={saving}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                allowClear
              />
              <p className="account-notifications__supporting">{t("telegram.preferences.selectedCount", { count: draft.selectedVehicleIds.length })}</p>
              {paged.items.length === 0 ? (
                <p className="account-notifications__supporting">{t("account.notifications.noVehiclesFound")}</p>
              ) : (
                <ul className="account-notifications__vehicles">
                  {paged.items.map((vehicle) => (
                    <li key={vehicle.id} className="account-notifications__vehicle">
                      <Checkbox
                        aria-labelledby={vehicle.disabled ? `vehicle-name-${vehicle.id} vehicle-state-${vehicle.id}` : `vehicle-name-${vehicle.id}`}
                        checked={draft.selectedVehicleIds.includes(vehicle.id)}
                        disabled={saving}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          touchDraft({
                            ...draft,
                            selectedVehicleIds: checked
                              ? [...draft.selectedVehicleIds, vehicle.id]
                              : draft.selectedVehicleIds.filter((id) => id !== vehicle.id),
                          });
                        }}
                      />
                      <span id={`vehicle-name-${vehicle.id}`} className="account-notifications__vehiclename">{vehicle.name}</span>
                      {vehicle.disabled ? <Tag id={`vehicle-state-${vehicle.id}`}>{t("telegram.preferences.vehicleDisabled")}</Tag> : null}
                    </li>
                  ))}
                </ul>
              )}
              {paged.totalPages > 1 ? (
                <Pagination
                  current={paged.page}
                  pageSize={VEHICLE_PAGE_SIZE}
                  total={filteredVehicles.length}
                  onChange={(next) => setPage(next)}
                  disabled={saving}
                  size="small"
                  showSizeChanger={false}
                />
              ) : null}
              {anyDisabledListed ? <p className="account-notifications__supporting">{t("account.notifications.disabledVehiclesNote")}</p> : null}
            </div>
          ) : null}
          {vehiclesInvalid ? <AccountNotificationsError title={t("telegram.preferences.error.selection")} /> : null}
        </div>
      ) : (
        <>
          <h3 id="notifications-vehicles-heading" className="account-notifications__label">{t("account.notifications.vehiclesTitle")}</h3>
          <p className="account-notifications__supporting">{t("telegram.preferences.noVehicleAccess")}</p>
          {baseline.draft.vehicleScope === "SELECTED" ? <p className="account-notifications__supporting">{t("account.notifications.persistedScopeNote", { scope: t("telegram.preferences.selectedVehicles") })}</p> : null}
        </>
      )}
    </section>
    {dirty ? (
      <div className="account-notifications__dirtybar" role="group" aria-label={t("account.notifications.unsavedChanges")}>
        <span className="account-notifications__label">{t("account.notifications.unsavedChanges")}</span>
        <span className="account-notifications__spacer" aria-hidden="true" />
        <Button disabled={saving} onClick={() => setDiscardOpen(true)}>{t("account.notifications.discardConfirm")}</Button>
        <Button type="primary" loading={saving} disabled={saving} onClick={() => { void handleSave(); }}>{t("telegram.preferences.save")}</Button>
      </div>
    ) : null}
    {conflict ? (
      <section aria-labelledby="notifications-conflict-heading" className="account-notifications__conflict">
        <div ref={conflictPanelRef} tabIndex={-1}>
          <h3 id="notifications-conflict-heading" className="account-notifications__label">{t("account.notifications.conflictTitle")}</h3>
          <p className="account-notifications__supporting">{t("account.notifications.conflictBody")}</p>
          {conflict.loadError ? (
            <>
              <AccountNotificationsError title={t("account.notifications.refreshFailed")} />
              <div className="account-notifications__actions">
                <Button onClick={() => { void startConflictFlow(); }} loading={conflictLoading} disabled={conflictLoading}>
                  {t("common.retry")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <ul className="account-notifications__conflictlist">
                {conflict.review.map((entry) => (
                  <li key={entry.field}>
                    <p className="account-notifications__supporting">{fieldLabel(entry.field)}: {describeValue(entry.field, entry.value)}</p>
                  </li>
                ))}
              </ul>
              <div className="account-notifications__actions">
                <Button type="primary" disabled={saving} onClick={applyMergedDraft}>
                  {t("account.notifications.applyMerged")}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>
    ) : null}
    {success ? <AccountNotificationsSuccess title={t("telegram.preferences.saved")} /> : null}
    {saveErrorKey ? <AccountNotificationsError title={t(saveErrorKey)} /> : null}
    <AlertDialog
      open={discardOpen}
      onOpenChange={setDiscardOpen}
      title={t("account.notifications.discardTitle")}
      description={t("account.notifications.discardBody")}
      cancelLabel={t("account.notifications.keepEditing")}
      confirmLabel={t("account.notifications.discardConfirm")}
      onConfirm={handleDiscard}
    />
    <AlertDialog
      open={leaveOpen}
      onOpenChange={(open) => {
        if (!open) handleStay();
        else setLeaveOpen(true);
      }}
      title={t("account.notifications.leaveTitle")}
      description={t("account.notifications.leaveBody")}
      cancelLabel={t("account.notifications.keepEditing")}
      confirmLabel={t("account.notifications.leaveConfirm")}
      onConfirm={handleLeave}
    />
  </>;
}
