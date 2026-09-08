"use client";

import { Popover, theme } from "antd";
import type { ReactNode } from "react";

/** Shared accepted Vehicle-family shell; range models and editor content stay with each page. */
export function PeriodPopover({ open, onOpenChange, title, content, className, children, width = 620 }: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  content: ReactNode;
  className: string;
  children: ReactNode;
  width?: number;
}>) {
  const { token } = theme.useToken();
  return <Popover open={open} onOpenChange={onOpenChange} trigger="click" placement="bottomLeft" arrow={false} destroyOnHidden fresh title={title} content={content} classNames={{ root: className }} styles={{ container: { width, maxWidth: "calc(100vw - 48px)", padding: token.paddingLG, borderRadius: token.borderRadiusLG } }}>{children}</Popover>;
}
