"use client";

import { CheckOutlined } from "@ant-design/icons";
import { useId } from "react";
import { useI18n } from "../i18n/client";
import { DEFAULT_VEHICLE_GROUP_COLOR, VEHICLE_GROUP_COLORS, type VehicleGroupColor } from "../lib/vehicle-groups/vehicle-groups-contract";

export const VEHICLE_GROUP_SWATCH_BACKGROUNDS: Readonly<Record<VehicleGroupColor, string>> = Object.freeze({
  BLUE: "#1677ff",
  CYAN: "#13c2c2",
  GREEN: "#52c41a",
  GOLD: "#faad14",
  ORANGE: "#fa8c16",
  PURPLE: "#722ed1",
  MAGENTA: "#eb2f96",
  GRAY: "#8c8c8c",
});

export function VehicleGroupColorField({ value = DEFAULT_VEHICLE_GROUP_COLOR, disabled = false, onChange, name }: Readonly<{ value?: VehicleGroupColor; disabled?: boolean; onChange(value: VehicleGroupColor): void; name?: string }>) {
  const { t } = useI18n();
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <div className="vehicle-group-color-field">
      <div className="vehicle-group-color-field__options" role="radiogroup" aria-label={t("admin.groups.color")}>
        {VEHICLE_GROUP_COLORS.map(function (color) {
          const selected = value === color;
          const label = t(("group.color." + color) as "group.color.BLUE");
          return (
            <label key={color} className={selected ? "vehicle-group-color-field__option vehicle-group-color-field__option--selected" : "vehicle-group-color-field__option"} title={label}>
              <input type="radio" className="vehicle-group-color-field__input" name={groupName} value={color} checked={selected} disabled={disabled} aria-label={label} onChange={function () { onChange(color); }} />
              <span className="vehicle-group-color-field__swatch" style={{ background: VEHICLE_GROUP_SWATCH_BACKGROUNDS[color] }} aria-hidden="true">
                {selected ? <CheckOutlined className="vehicle-group-color-field__check" aria-hidden="true" /> : null}
              </span>
              <span className="vehicle-group-color-field__sr-only">{label}</span>
            </label>
          );
        })}
      </div>
      <p className="vehicle-group-color-field__hint" aria-live="polite">{t("admin.groups.colorHint")}</p>
    </div>
  );
}
