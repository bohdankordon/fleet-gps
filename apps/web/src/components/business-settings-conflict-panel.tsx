"use client";

import { Alert, Button, Radio, Typography } from "antd";
import type { AdminSettings } from "@/lib/admin-settings/admin-settings-contract";
import { businessSettingsDraftFromPersisted, type BusinessSettingsDraft, type BusinessSettingsConflictChoice } from "@/lib/admin-settings/business-settings-draft";
import type { BusinessSettingsEditableField } from "@/lib/admin-settings/business-settings-sections";
import { businessSettingsFieldLabelKey } from "@/lib/admin-settings/business-settings-sections";
import { useI18n } from "../i18n/client";

function conflictDisplayValue(field: BusinessSettingsEditableField, draft: BusinessSettingsDraft, enabledLabel: string, disabledLabel: string): string {
  const value = draft[field];
  if (typeof value === "boolean") return value ? enabledLabel : disabledLabel;
  return String(value);
}

export function BusinessSettingsConflictPanel(props: Readonly<{
  latest: AdminSettings;
  draft: BusinessSettingsDraft;
  overlap: readonly BusinessSettingsEditableField[];
  choices: Readonly<Partial<Record<BusinessSettingsEditableField, BusinessSettingsConflictChoice>>>;
  applying: boolean;
  onChoice: (field: BusinessSettingsEditableField, choice: BusinessSettingsConflictChoice) => void;
  onApply: () => void;
}>): React.JSX.Element {
  const { latest, draft, overlap, choices, applying, onChoice, onApply } = props;
  const { t } = useI18n();
  const latestEditable = businessSettingsDraftFromPersisted(latest);
  const ready = overlap.every((field) => choices[field] !== undefined);
  return (
    <div className="business-settings__conflict">
      <Alert
        type="warning"
        showIcon
        title={t("admin.settings.conflictChanged")}
        description={t("admin.settings.conflictOverlap")}
      />
      <ul className="business-settings__conflict-list">
        {overlap.map((field) => {
          const label = t(businessSettingsFieldLabelKey(field) as "admin.settings.timezone");
          const latestText = conflictDisplayValue(field, latestEditable, t("admin.settings.enabled"), t("admin.settings.disabled"));
          const mineText = conflictDisplayValue(field, draft, t("admin.settings.enabled"), t("admin.settings.disabled"));
          return (
            <li key={field} className="business-settings__conflict-item">
              <Typography.Text strong>{label}</Typography.Text>
              <div className="business-settings__conflict-values">
                <Typography.Text type="secondary">{t("admin.settings.conflictLatest")}: {latestText}</Typography.Text>
                <Typography.Text type="secondary">{t("admin.settings.conflictMine")}: {mineText}</Typography.Text>
              </div>
              <Radio.Group
                value={choices[field]}
                disabled={applying}
                aria-label={label}
                onChange={(event) => onChoice(field, event.target.value as BusinessSettingsConflictChoice)}
              >
                <Radio value="latest">{t("admin.settings.conflictUseLatest")}</Radio>
                <Radio value="mine">{t("admin.settings.conflictKeepMine")}</Radio>
              </Radio.Group>
            </li>
          );
        })}
      </ul>
      <Button type="primary" disabled={!ready || applying} loading={applying} onClick={onApply}>
        {t("admin.settings.conflictApply")}
      </Button>
    </div>
  );
}
