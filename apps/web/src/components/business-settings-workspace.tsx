"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Collapse, Modal, Select, Typography } from "antd";
import { parseAdminSettings, type AdminSettings } from "@/lib/admin-settings/admin-settings-contract";
import {
  BUSINESS_SETTINGS_SECTIONS,
  businessSettingsFieldLabelKey,
  type BusinessSettingsEditableField,
  type BusinessSettingsSectionId,
} from "@/lib/admin-settings/business-settings-sections";
import {
  applyBusinessSettingsResolution,
  businessSettingsChangedFields,
  businessSettingsDraftFromPersisted,
  changedBusinessSettingsPayload,
  computeBusinessSettingsConflict,
  isBusinessSettingsFieldInvalid,
  rebaseBusinessSettingsDraft,
  validateBusinessSettingsDraft,
  type BusinessSettingsConflictChoice,
  type BusinessSettingsDraft,
} from "@/lib/admin-settings/business-settings-draft";
import { numericAdminSettingsBounds } from "./admin-settings-form-model";
import { BusinessNumberField, BusinessRuleSwitch, BusinessTimezoneField, businessFieldId } from "./business-settings-fields";
import { BusinessSettingsConflictPanel } from "./business-settings-conflict-panel";
import { BUSINESS_SETTINGS_BLOCKED_NAVIGATION_EVENT, setBusinessSettingsDirty } from "./business-settings-leave-guard";
import { useI18n } from "../i18n/client";

type ConflictState = Readonly<{
  latest: AdminSettings;
  overlap: readonly BusinessSettingsEditableField[];
  choices: Readonly<Partial<Record<BusinessSettingsEditableField, BusinessSettingsConflictChoice>>>;
}>;

function fieldErrorMessage(t: (key: "admin.settings.timezone", params?: Record<string, string | number>) => string, field: BusinessSettingsEditableField): string {
  const label = t(businessSettingsFieldLabelKey(field) as "admin.settings.timezone");
  return t("admin.settings.invalidField" as "admin.settings.timezone", { field: label } as unknown as Record<string, string | number>);
}

export function BusinessSettingsWorkspace({ initial }: Readonly<{ initial: AdminSettings | null }>): React.JSX.Element {
  const router = useRouter();
  const { t } = useI18n();
  const translate = t as (key: "admin.settings.timezone", params?: Record<string, string | number>) => string;
  const [baseline, setBaseline] = useState<AdminSettings | null>(initial);
  const [draft, setDraft] = useState<BusinessSettingsDraft | null>(() => (initial ? businessSettingsDraftFromPersisted(initial) : null));
  const [activeSection, setActiveSection] = useState<BusinessSettingsSectionId>("day");
  const [invalidFields, setInvalidFields] = useState<readonly BusinessSettingsEditableField[]>([]);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [originalBaseline, setOriginalBaseline] = useState<AdminSettings | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [conflictLoadFailed, setConflictLoadFailed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const dirtyFields = useMemo(
    () => (baseline && draft ? businessSettingsChangedFields(draft, baseline) : []),
    [baseline, draft],
  );
  const dirty = dirtyFields.length > 0;

  useEffect(() => {
    setBusinessSettingsDirty(dirty);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    const onCaptureClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href === window.location.pathname) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === "_blank") return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    const onBlockedNavigation = (event: Event): void => {
      setPendingHref((event as CustomEvent<string>).detail);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onCaptureClick, true);
    window.addEventListener(BUSINESS_SETTINGS_BLOCKED_NAVIGATION_EVENT, onBlockedNavigation);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onCaptureClick, true);
      window.removeEventListener(BUSINESS_SETTINGS_BLOCKED_NAVIGATION_EVENT, onBlockedNavigation);
    };
  }, [dirty]);

  useEffect(() => {
    if (summaryVisible && invalidFields.length > 0) summaryRef.current?.focus();
  }, [summaryVisible, invalidFields]);

  if (!baseline || !draft) {
    return (
      <Alert
        className="business-settings__unavailable"
        type="error"
        showIcon
        title={t("admin.settings.unavailableTitle" as "admin.settings.timezone")}
        description={t("admin.settings.loadError" as "admin.settings.timezone")}
        action={<Button onClick={() => window.location.reload()}>{t("common.retry" as "admin.settings.timezone")}</Button>}
      />
    );
  }

  const tr = (key: string, params?: Record<string, string | number>): string =>
    translate(key as "admin.settings.timezone", params);

  function updateDraftField(field: BusinessSettingsEditableField, value: number | "" | string | boolean): void {
    if (saving) return;
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setSaveError(null);
    setAnnouncement(null);
    setInvalidFields((current) => (current.includes(field) ? current.filter((entry) => entry !== field) : current));
  }

  function handleBlurField(field: BusinessSettingsEditableField): void {
    if (saving || !draft) return;
    if (isBusinessSettingsFieldInvalid(draft, field)) {
      setInvalidFields((current) => (current.includes(field) ? current : [...current, field]));
      if (field === "speedingConfirmationUpdates") setAdvancedOpen(true);
    } else {
      setInvalidFields((current) => current.filter((entry) => entry !== field));
    }
  }

  function focusField(field: BusinessSettingsEditableField): void {
    window.setTimeout(() => {
      document.getElementById(businessFieldId(field))?.focus();
    }, 0);
  }

  function jumpToField(field: BusinessSettingsEditableField): void {
    const section = BUSINESS_SETTINGS_SECTIONS.find((entry) => (entry.fields as readonly string[]).includes(field));
    if (section) setActiveSection(section.id);
    if (field === "speedingConfirmationUpdates") setAdvancedOpen(true);
    focusField(field);
  }

  async function loadLatestAfterConflict(staleBaseline: AdminSettings, currentDraft: BusinessSettingsDraft): Promise<void> {
    setConflictLoading(true);
    setConflictLoadFailed(false);
    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store", headers: { Accept: "application/json" } });
      const body: unknown = await response.json().catch(() => null);
      const latest = response.ok ? parseAdminSettings(body) : null;
      if (!latest) throw new Error("unavailable");
      const analysis = computeBusinessSettingsConflict(staleBaseline, currentDraft, latest);
      if (analysis.overlap.length === 0) {
        const rebased = rebaseBusinessSettingsDraft(latest, currentDraft, staleBaseline);
        setBaseline(latest);
        setDraft(rebased);
        setOriginalBaseline(null);
        setConflict(null);
        setRefreshNotice(tr("admin.settings.refreshedPreserved", { revision: latest.revision }));
        router.refresh();
      } else {
        setOriginalBaseline(staleBaseline);
        setConflict({ latest, overlap: analysis.overlap, choices: {} });
      }
    } catch {
      setOriginalBaseline(staleBaseline);
      setConflictLoadFailed(true);
    } finally {
      setConflictLoading(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (saving || !baseline || !draft) return;
    const failures = validateBusinessSettingsDraft(draft);
    if (failures.length > 0) {
      setInvalidFields(failures);
      setSummaryVisible(true);
      const first = failures[0]!;
      const section = BUSINESS_SETTINGS_SECTIONS.find((entry) => (entry.fields as readonly string[]).includes(first));
      if (section) setActiveSection(section.id);
      if (first === "speedingConfirmationUpdates") setAdvancedOpen(true);
      return;
    }
    setInvalidFields([]);
    setSummaryVisible(false);
    setSaving(true);
    setSaveError(null);
    setAnnouncement(null);
    setRefreshNotice(null);
    try {
      const payload = changedBusinessSettingsPayload(draft, baseline);
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 409) {
        await loadLatestAfterConflict(baseline, draft);
        return;
      }
      if (!response.ok) throw new Error("save");
      const updated = parseAdminSettings(body);
      if (!updated) throw new Error("response");
      setBaseline(updated);
      setDraft(businessSettingsDraftFromPersisted(updated));
      setInvalidFields([]);
      setSummaryVisible(false);
      setConflict(null);
      setOriginalBaseline(null);
      setConflictLoadFailed(false);
      setAnnouncement(tr("admin.settings.savedRevision", { revision: updated.revision }));
      router.refresh();
    } catch {
      setSaveError(tr("admin.settings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function handleConfirmDiscard(): void {
    if (!baseline) return;
    setDraft(businessSettingsDraftFromPersisted(baseline));
    setInvalidFields([]);
    setSummaryVisible(false);
    setSaveError(null);
    setAnnouncement(null);
    setRefreshNotice(null);
    setConflict(null);
    setOriginalBaseline(null);
    setConflictLoadFailed(false);
    setDiscardOpen(false);
  }

  function handleConflictChoice(field: BusinessSettingsEditableField, choice: BusinessSettingsConflictChoice): void {
    setConflict((current) => (current ? { ...current, choices: { ...current.choices, [field]: choice } } : current));
  }

  function handleApplyResolution(): void {
    if (!conflict || !originalBaseline || !draft) return;
    const resolved = applyBusinessSettingsResolution(conflict.latest, draft, originalBaseline, conflict.choices);
    setBaseline(conflict.latest);
    setDraft(resolved);
    setOriginalBaseline(null);
    setConflict(null);
    setConflictLoadFailed(false);
    router.refresh();
  }

  const bounds = numericAdminSettingsBounds;
  const unit = (key: string): string => tr(key);
  const fieldError = (field: BusinessSettingsEditableField): string | null =>
    invalidFields.includes(field) ? fieldErrorMessage(translate, field) : null;

  const summaryGroups = BUSINESS_SETTINGS_SECTIONS.map((section) => ({
    section,
    fields: invalidFields.filter((field) => (section.fields as readonly string[]).includes(field)),
  })).filter((group) => group.fields.length > 0);

  const speedingDisabled = !draft.speedRuleEnabled;
  const inactivityDisabled = !draft.inactivityRuleEnabled;
  const advancedLabel = tr("admin.settings.advancedSummary", { value: draft.speedingConfirmationUpdates === "" ? "—" : draft.speedingConfirmationUpdates });

  return (
    <div className="business-settings">
      {announcement ? <div role="status" aria-live="polite" className="sr-only">{announcement}</div> : null}
      {announcement ? <Alert type="success" showIcon title={announcement} className="business-settings__notice" /> : null}
      {refreshNotice ? <Alert type="info" showIcon title={refreshNotice} className="business-settings__notice" closable onClose={() => setRefreshNotice(null)} /> : null}
      {saveError ? <Alert type="error" showIcon title={saveError} className="business-settings__notice" /> : null}
      {summaryVisible && invalidFields.length > 0 ? (
        <Alert
          type="error"
          showIcon
          className="business-settings__notice"
          title={tr("admin.settings.validationTitle")}
          description={
            <div ref={summaryRef} tabIndex={-1} aria-label={tr("admin.settings.validationTitle")}>
              {summaryGroups.map((group) => (
                <div key={group.section.id} className="business-settings__summary-group">
                  <Typography.Text strong>{tr(group.section.titleKey)}</Typography.Text>
                  <ul>
                    {group.fields.map((field) => (
                      <li key={field}>
                        <Button type="link" size="small" onClick={() => jumpToField(field)}>
                          {tr(businessSettingsFieldLabelKey(field))}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          }
        />
      ) : null}
      <div className="business-settings__selector">
        <label className="business-settings__selector-label" htmlFor="business-settings-section-select">
          <Typography.Text strong>{tr("admin.settings.sectionSelector")}</Typography.Text>
        </label>
        <Select
          id="business-settings-section-select"
          className="business-settings__selector-select"
          size="large"
          aria-label={tr("admin.settings.sectionSelector")}
          value={activeSection}
          disabled={saving}
          onChange={(value: BusinessSettingsSectionId) => setActiveSection(value)}
          options={BUSINESS_SETTINGS_SECTIONS.map((section) => ({ value: section.id, label: tr(section.titleKey) }))}
        />
      </div>
      <div className="business-settings__layout">
        <nav className="business-settings__rail" aria-label={tr("admin.settings.sectionSelector")}>
          {BUSINESS_SETTINGS_SECTIONS.map((section) => {
            const selected = section.id === activeSection;
            const sectionErrors = invalidFields.filter((field) => (section.fields as readonly string[]).includes(field));
            const sectionDirty = section.fields.some((field) => dirtyFields.includes(field as BusinessSettingsEditableField));
            return (
              <button
                key={section.id}
                type="button"
                className={selected ? "business-settings__rail-item business-settings__rail-item--selected" : "business-settings__rail-item"}
                aria-current={selected ? "page" : undefined}
                disabled={saving}
                onClick={() => setActiveSection(section.id)}
              >
                <span>{tr(section.titleKey)}</span>
                {sectionDirty && !selected ? <span className="business-settings__rail-flag">{tr("admin.settings.changed")}</span> : null}
                {sectionErrors.length > 0 ? <span className="business-settings__rail-error">{tr("admin.settings.hasError")}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="business-settings__editor">
          {activeSection === "day" ? (
            <section aria-labelledby="business-settings-day-title">
              <Typography.Title level={2} id="business-settings-day-title">{tr("admin.settings.section.day")}</Typography.Title>
              <div className="business-settings__field business-settings__field--full">
                <BusinessTimezoneField
                  value={draft.timezone}
                  disabled={saving}
                  error={fieldError("timezone")}
                  onChange={(value) => updateDraftField("timezone", value)}
                  onBlurField={handleBlurField}
                />
              </div>
              <div className="business-settings__row">
                <BusinessNumberField field="minimumDailyDistanceMeters" value={draft.minimumDailyDistanceMeters} min={bounds.minimumDailyDistanceMeters[0]} max={bounds.minimumDailyDistanceMeters[1]} unit={unit("admin.settings.unitMeters")} disabled={saving} error={fieldError("minimumDailyDistanceMeters")} onChange={updateDraftField} onBlurField={handleBlurField} />
                <BusinessNumberField field="positionFreshnessSeconds" value={draft.positionFreshnessSeconds} min={bounds.positionFreshnessSeconds[0]} max={bounds.positionFreshnessSeconds[1]} unit={unit("admin.settings.unitSeconds")} disabled={saving} error={fieldError("positionFreshnessSeconds")} onChange={updateDraftField} onBlurField={handleBlurField} />
              </div>
            </section>
          ) : null}
          {activeSection === "speeding" ? (
            <section aria-labelledby="business-settings-speeding-title">
              <Typography.Title level={2} id="business-settings-speeding-title">{tr("admin.settings.section.speeding")}</Typography.Title>
              <Typography.Paragraph type="secondary">{tr("admin.settings.speedGuidance")}</Typography.Paragraph>
              <BusinessRuleSwitch field="speedRuleEnabled" checked={draft.speedRuleEnabled} disabled={saving} onChange={updateDraftField} />
              <div className={speedingDisabled ? "business-settings__dependent business-settings__dependent--subdued" : "business-settings__dependent"}>
                {speedingDisabled ? <Typography.Paragraph type="secondary">{tr("admin.settings.inactiveContextSpeeding")}</Typography.Paragraph> : null}
                <div className="business-settings__row">
                  <BusinessNumberField field="citySpeedLimitKph" value={draft.citySpeedLimitKph} min={bounds.citySpeedLimitKph[0]} max={bounds.citySpeedLimitKph[1]} unit={unit("admin.settings.unitKph")} disabled={saving} error={fieldError("citySpeedLimitKph")} onChange={updateDraftField} onBlurField={handleBlurField} />
                  <BusinessNumberField field="outsideCitySpeedLimitKph" value={draft.outsideCitySpeedLimitKph} min={bounds.outsideCitySpeedLimitKph[0]} max={bounds.outsideCitySpeedLimitKph[1]} unit={unit("admin.settings.unitKph")} disabled={saving} error={fieldError("outsideCitySpeedLimitKph")} onChange={updateDraftField} onBlurField={handleBlurField} />
                </div>
                <div className="business-settings__field business-settings__field--full">
                  <BusinessNumberField field="speedToleranceKph" value={draft.speedToleranceKph} min={bounds.speedToleranceKph[0]} max={bounds.speedToleranceKph[1]} unit={unit("admin.settings.unitKph")} disabled={saving} error={fieldError("speedToleranceKph")} onChange={updateDraftField} onBlurField={handleBlurField} />
                </div>
                <Collapse
                  className="business-settings__advanced"
                  activeKey={advancedOpen ? ["advanced"] : []}
                  onChange={() => setAdvancedOpen((open) => !open)}
                  items={[{ key: "advanced", label: advancedLabel, children: (<BusinessNumberField field="speedingConfirmationUpdates" value={draft.speedingConfirmationUpdates} min={bounds.speedingConfirmationUpdates[0]} max={bounds.speedingConfirmationUpdates[1]} unit={unit("admin.settings.unitUpdates")} disabled={saving} error={fieldError("speedingConfirmationUpdates")} onChange={updateDraftField} onBlurField={handleBlurField} />) }]}
                />
              </div>
              <div className="business-settings__geofence">
                <Typography.Title level={3}>{tr("admin.settings.cityBoundary")}</Typography.Title>
                {baseline.cityGeofence.configured ? (
                  <Typography.Paragraph type="secondary">{tr("admin.settings.cityBoundaryConfigured", { rings: baseline.cityGeofence.ringCount, points: baseline.cityGeofence.pointCount })}</Typography.Paragraph>
                ) : (
                  <Alert type="warning" showIcon title={tr("admin.settings.cityBoundaryMissing")} description={tr("admin.settings.cityBoundaryMissingHelp")} />
                )}
              </div>
            </section>
          ) : null}
          {activeSection === "inactivity" ? (
            <section aria-labelledby="business-settings-inactivity-title">
              <Typography.Title level={2} id="business-settings-inactivity-title">{tr("admin.settings.section.inactivity")}</Typography.Title>
              <Typography.Paragraph type="secondary">{tr("admin.settings.inactivityGuidance")}</Typography.Paragraph>
              <BusinessRuleSwitch field="inactivityRuleEnabled" checked={draft.inactivityRuleEnabled} disabled={saving} onChange={updateDraftField} />
              <div className={inactivityDisabled ? "business-settings__dependent business-settings__dependent--subdued" : "business-settings__dependent"}>
                {inactivityDisabled ? <Typography.Paragraph type="secondary">{tr("admin.settings.inactiveContextInactivity")}</Typography.Paragraph> : null}
                <div className="business-settings__row">
                  <BusinessNumberField field="inactivityDistanceMeters" value={draft.inactivityDistanceMeters} min={bounds.inactivityDistanceMeters[0]} max={bounds.inactivityDistanceMeters[1]} unit={unit("admin.settings.unitMeters")} disabled={saving} error={fieldError("inactivityDistanceMeters")} onChange={updateDraftField} onBlurField={handleBlurField} />
                  <BusinessNumberField field="inactivityDurationMinutes" value={draft.inactivityDurationMinutes} min={bounds.inactivityDurationMinutes[0]} max={bounds.inactivityDurationMinutes[1]} unit={unit("admin.settings.unitMinutes")} disabled={saving} error={fieldError("inactivityDurationMinutes")} onChange={updateDraftField} onBlurField={handleBlurField} />
                </div>
              </div>
            </section>
          ) : null}
          {activeSection === "trips" ? (
            <section aria-labelledby="business-settings-trips-title">
              <Typography.Title level={2} id="business-settings-trips-title">{tr("admin.settings.section.trips")}</Typography.Title>
              <Typography.Paragraph type="secondary">{tr("admin.settings.tripsRecomputeNote")}</Typography.Paragraph>
              <div className="business-settings__row">
                <BusinessNumberField field="tripMovementSpeedKph" value={draft.tripMovementSpeedKph} min={bounds.tripMovementSpeedKph[0]} max={bounds.tripMovementSpeedKph[1]} unit={unit("admin.settings.unitKph")} disabled={saving} error={fieldError("tripMovementSpeedKph")} onChange={updateDraftField} onBlurField={handleBlurField} />
                <BusinessNumberField field="tripMovementConfirmationSeconds" value={draft.tripMovementConfirmationSeconds} min={bounds.tripMovementConfirmationSeconds[0]} max={bounds.tripMovementConfirmationSeconds[1]} unit={unit("admin.settings.unitSeconds")} disabled={saving} error={fieldError("tripMovementConfirmationSeconds")} onChange={updateDraftField} onBlurField={handleBlurField} />
              </div>
              <div className="business-settings__row">
                <BusinessNumberField field="tripStopConfirmationSeconds" value={draft.tripStopConfirmationSeconds} min={bounds.tripStopConfirmationSeconds[0]} max={bounds.tripStopConfirmationSeconds[1]} unit={unit("admin.settings.unitSeconds")} disabled={saving} error={fieldError("tripStopConfirmationSeconds")} onChange={updateDraftField} onBlurField={handleBlurField} />
                <BusinessNumberField field="tripDataGapSeconds" value={draft.tripDataGapSeconds} min={bounds.tripDataGapSeconds[0]} max={bounds.tripDataGapSeconds[1]} unit={unit("admin.settings.unitSeconds")} disabled={saving} error={fieldError("tripDataGapSeconds")} onChange={updateDraftField} onBlurField={handleBlurField} />
              </div>
            </section>
          ) : null}
        </div>
      </div>
      {conflictLoading ? (
        <Alert type="info" showIcon title={tr("admin.settings.conflictChanged")} className="business-settings__notice" />
      ) : null}
      {conflictLoadFailed && originalBaseline ? (
        <Alert
          type="error"
          showIcon
          className="business-settings__notice"
          title={tr("admin.settings.conflictReloadFailed")}
          action={<Button size="small" loading={conflictLoading} onClick={() => { if (originalBaseline && draft) void loadLatestAfterConflict(originalBaseline, draft); }}>{tr("admin.settings.conflictRetryLoad")}</Button>}
        />
      ) : null}
      {conflict && originalBaseline ? (
        <BusinessSettingsConflictPanel
          latest={conflict.latest}
          draft={draft}
          overlap={conflict.overlap}
          choices={conflict.choices}
          applying={saving}
          onChoice={handleConflictChoice}
          onApply={handleApplyResolution}
        />
      ) : null}
      {dirty ? (
        <div className="business-settings__dirtybar" role="region" aria-label={tr("admin.settings.unsaved")}>
          <Typography.Text strong>{tr("admin.settings.unsaved")}</Typography.Text>
          <div className="business-settings__dirtybar-actions">
            <Button disabled={saving} onClick={() => setDiscardOpen(true)}>{tr("admin.settings.discard")}</Button>
            <Button type="primary" disabled={saving} loading={saving} onClick={() => void handleSave()}>{saving ? tr("admin.settings.saving") : tr("admin.settings.saveChanges")}</Button>
          </div>
        </div>
      ) : null}
      <Modal
        open={discardOpen}
        title={tr("admin.settings.discardTitle")}
        okText={tr("admin.settings.discard")}
        cancelText={tr("admin.settings.keepEditing")}
        onOk={handleConfirmDiscard}
        onCancel={() => setDiscardOpen(false)}
      >
        <Typography.Paragraph>{tr("admin.settings.discardBody")}</Typography.Paragraph>
      </Modal>
      <Modal
        open={pendingHref !== null}
        title={tr("admin.settings.leaveTitle")}
        okText={tr("admin.settings.leaveWithoutSaving")}
        cancelText={tr("admin.settings.stay")}
        onOk={() => { const href = pendingHref; setPendingHref(null); if (href) router.push(href); }}
        onCancel={() => setPendingHref(null)}
      >
        <Typography.Paragraph>{tr("admin.settings.leaveBody")}</Typography.Paragraph>
      </Modal>
    </div>
  );
}

export function BusinessSettingsLoadingWorkspace(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="business-settings__loading" role="status" aria-live="polite">
      <Typography.Text type="secondary">{t("common.loading" as "admin.settings.timezone")}</Typography.Text>
    </div>
  );
}
