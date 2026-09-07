"use client";

import { Typography, theme } from "antd";

/** Page-level typography only; each workspace retains its own layout and actions. */
export function CompactPageHeading({ title, subtitle }: Readonly<{ title: string; subtitle: string }>) {
  const { token } = theme.useToken();
  return <>
    <Typography.Title className="compact-page-heading__title" level={1} style={{ margin: 0, fontSize: token.fontSizeHeading3, lineHeight: token.lineHeightHeading3, fontWeight: token.fontWeightStrong }}>{title}</Typography.Title>
    <Typography.Text className="compact-page-heading__subtitle" type="secondary" style={{ fontSize: token.fontSize }}>{subtitle}</Typography.Text>
  </>;
}
