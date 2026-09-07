"use client";

import { Button, ConfigProvider, theme } from "antd";
import type { ReactNode } from "react";

/** Exact FleetToolbar Reset contract; the accepted Fleet implementation stays untouched. */
export function FleetFilterResetButton({ disabled, onClick, children }: Readonly<{ disabled: boolean; onClick: () => void; children: ReactNode }>) {
  const { token } = theme.useToken();
  return <ConfigProvider theme={{ token: { colorPrimaryBorder: token.colorTextQuaternary }, components: { Button: { defaultHoverBg: token.colorFillQuaternary, defaultHoverBorderColor: token.colorTextTertiary, defaultHoverColor: token.colorText, defaultActiveBg: token.colorFillTertiary, defaultActiveBorderColor: token.colorTextSecondary, defaultActiveColor: token.colorText } } }}><Button className="fleet-filter-reset" style={{ lineHeight: token.lineHeight }} type="default" size="small" styles={{ root: { minHeight: 0 } }} disabled={disabled} onClick={onClick}>{children}</Button></ConfigProvider>;
}
