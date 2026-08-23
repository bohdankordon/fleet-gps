import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkButtonVariant = "primary" | "secondary" | "subtle" | "destructive";
type LinkButtonSize = "compact" | "default" | "comfortable";

export type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & Readonly<{
  variant?: LinkButtonVariant;
  size?: LinkButtonSize;
  iconBefore?: ReactNode;
  iconAfter?: ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
}>;

export function LinkButton({ variant = "primary", size = "default", iconBefore, iconAfter, fullWidth = false, disabled = false, className, children, href, ...props }: LinkButtonProps) {
  const classes = ["ui-button", "ui-link-button", `ui-button--${variant}`, `ui-button--${size}`, fullWidth ? "ui-button--full-width" : "", className].filter(Boolean).join(" ");
  return <a {...props} className={classes} href={disabled ? undefined : href} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : props.tabIndex}>
    {iconBefore ? <span className="ui-button__icon" aria-hidden="true">{iconBefore}</span> : null}
    <span className="ui-button__label">{children}</span>
    {iconAfter ? <span className="ui-button__icon" aria-hidden="true">{iconAfter}</span> : null}
  </a>;
}
