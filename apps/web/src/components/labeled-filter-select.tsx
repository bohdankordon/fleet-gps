import { Select, theme } from "antd";
import type { CSSProperties } from "react";

export type LabeledFilterSelectOption = Readonly<{ value: string; label: string }>;

/**
 * Accepted Fleet labeled-select filter pattern, shared as-is.
 *
 * The field label renders inside the selected value (e.g. "Group: Taxi") and
 * the hidden sizer reserves exactly the longest rendered label/option width,
 * so the control stays compact without layout shift. Option popups keep plain
 * labels and standard Select keyboard behavior is unchanged.
 */
export function LabeledFilterSelect({ fieldLabel, ariaLabel, value, options, disabled, onChange }: Readonly<{ fieldLabel: string; ariaLabel: string; value: string; options: readonly LabeledFilterSelectOption[]; disabled?: boolean; onChange: (value: string) => void }>) {
  const { token } = theme.useToken();
  const sizingStyle = { "--fleet-toolbar-select-font-size": `${token.fontSizeLG}px`, "--fleet-toolbar-select-padding-start": `${token.controlPaddingHorizontal}px`, "--fleet-toolbar-select-padding-end": `${token.controlPaddingHorizontal + token.fontSize + token.paddingXS}px` } as CSSProperties;
  return <span className="fleet-toolbar__labeled-select" style={sizingStyle}>
    <span className="fleet-toolbar__select-sizer" aria-hidden="true">{options.map((option) => <span key={option.value}>{fieldLabel}: {option.label}</span>)}</span>
    <Select className="fleet-toolbar__select-control" size="large" aria-label={ariaLabel} popupMatchSelectWidth labelRender={({ label }) => <>{fieldLabel}: {label}</>} styles={{ input: { minHeight: 0, outline: "none", boxShadow: "none", transition: "none" } }} value={value} disabled={disabled} onChange={onChange} options={[...options]} />
  </span>;
}
