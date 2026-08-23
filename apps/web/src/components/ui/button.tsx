import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "subtle" | "destructive";
type ControlSize = "compact" | "default" | "comfortable";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & Readonly<{
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  iconBefore?: ReactNode;
  iconAfter?: ReactNode;
  fullWidth?: boolean;
}>;

export function Button({ variant = "primary", size = "default", loading = false, iconBefore, iconAfter, fullWidth = false, className, children, disabled, type = "button", ...props }: ButtonProps) {
  const classes = ["ui-button", `ui-button--${variant}`, `ui-button--${size}`, fullWidth ? "ui-button--full-width" : "", className].filter(Boolean).join(" ");
  return <button {...props} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading ? <span className="ui-button__spinner" aria-hidden="true" /> : null}
    {iconBefore ? <span className="ui-button__icon" aria-hidden="true">{iconBefore}</span> : null}
    <span className="ui-button__label">{children}</span>
    {iconAfter ? <span className="ui-button__icon" aria-hidden="true">{iconAfter}</span> : null}
  </button>;
}
