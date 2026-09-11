"use client";

import { Form, Input, InputNumber, Switch, Typography } from "antd";
import { businessSettingsFieldLabelKey, type BusinessSettingsEditableField } from "@/lib/admin-settings/business-settings-sections";
import { useI18n } from "../i18n/client";

export function businessFieldId(field: BusinessSettingsEditableField): string {
  return `business-settings-${field}`;
}

export function BusinessNumberField(props: Readonly<{
  field: Exclude<BusinessSettingsEditableField, "speedRuleEnabled" | "inactivityRuleEnabled">;
  value: number | "";
  min: number;
  max: number;
  unit: string;
  disabled: boolean;
  error: string | null;
  onChange: (field: BusinessSettingsEditableField, value: number | "") => void;
  onBlurField: (field: BusinessSettingsEditableField) => void;
}>): React.JSX.Element {
  const { field, value, min, max, unit, disabled, error, onChange, onBlurField } = props;
  const { t } = useI18n();
  const id = businessFieldId(field);
  const label = t(businessSettingsFieldLabelKey(field) as "admin.settings.timezone");
  return (
    <Form.Item
      label={<span>{label} <Typography.Text type="secondary">({unit})</Typography.Text></span>}
      validateStatus={error ? "error" : undefined}
      help={error ?? undefined}
      htmlFor={id}
    >
      <InputNumber
        id={id}
        className="business-settings__number"
        value={value === "" ? null : value}
        min={min}
        max={max}
        step={1}
        precision={0}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(next) => onChange(field, next === null ? "" : Number(next))}
        onBlur={() => onBlurField(field)}
      />
      {error ? <span id={`${id}-error`} className="sr-only">{error}</span> : null}
    </Form.Item>
  );
}

export function BusinessTimezoneField(props: Readonly<{
  value: string;
  disabled: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onBlurField: (field: BusinessSettingsEditableField) => void;
}>): React.JSX.Element {
  const { value, disabled, error, onChange, onBlurField } = props;
  const { t } = useI18n();
  const id = businessFieldId("timezone");
  return (
    <Form.Item
      label={t("admin.settings.timezone")}
      validateStatus={error ? "error" : undefined}
      help={error ?? undefined}
      htmlFor={id}
      extra={t("admin.settings.timezoneHelp")}
    >
      <Input
        id={id}
        value={value}
        disabled={disabled}
        required
        autoComplete="off"
        placeholder="Europe/Kyiv"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onBlurField("timezone")}
      />
      {error ? <span id={`${id}-error`} className="sr-only">{error}</span> : null}
    </Form.Item>
  );
}

export function BusinessRuleSwitch(props: Readonly<{
  field: "speedRuleEnabled" | "inactivityRuleEnabled";
  checked: boolean;
  disabled: boolean;
  onChange: (field: BusinessSettingsEditableField, value: boolean) => void;
}>): React.JSX.Element {
  const { field, checked, disabled, onChange } = props;
  const { t } = useI18n();
  const id = businessFieldId(field);
  return (
    <div className="business-settings__switch">
      <span id={`${id}-label`} className="business-settings__switch-label">{t("admin.settings.ruleState")}</span>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-labelledby={`${id}-label ${id}-state`}
        onChange={(next) => onChange(field, next)}
      />
      <Typography.Text id={`${id}-state`} strong aria-live="polite">
        {checked ? t("admin.settings.enabled") : t("admin.settings.disabled")}
      </Typography.Text>
    </div>
  );
}
