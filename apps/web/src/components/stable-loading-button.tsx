"use client";

import type { ReactNode } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { Button } from "antd";
import type { ButtonProps } from "antd";

type Props = Readonly<{
  idleLabel: string;
  loadingLabel: string;
  loading: boolean;
  icon: ReactNode;
  onClick: NonNullable<ButtonProps["onClick"]>;
  size?: ButtonProps["size"];
  type?: ButtonProps["type"];
  showLabel?: boolean;
}>;

export function StableLoadingButton({ idleLabel, loadingLabel, loading, icon, onClick, size, type, showLabel = true }: Props) {
  const idleContent = showLabel ? idleLabel : null;
  const loadingContent = showLabel ? loadingLabel : null;

  return <span className="stable-loading-button">
    <Button className="stable-loading-button__sizer" aria-hidden="true" tabIndex={-1} size={size} type={type} icon={icon}>{idleContent}</Button>
    <Button className="stable-loading-button__sizer" aria-hidden="true" tabIndex={-1} size={size} type={type} icon={<LoadingOutlined />}>{loadingContent}</Button>
    <Button className="stable-loading-button__control" size={size} type={type} icon={icon} loading={loading} aria-busy={loading} aria-live="polite" aria-label={loading ? loadingLabel : idleLabel} onClick={onClick}>{loading ? loadingContent : idleContent}</Button>
  </span>;
}
