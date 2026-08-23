import type { HTMLAttributes, ReactNode } from "react";

type SemanticVariant = "neutral" | "info" | "success" | "warning" | "danger";

export function Badge({ variant = "neutral", className, children, ...props }: HTMLAttributes<HTMLSpanElement> & Readonly<{ variant?: SemanticVariant }>) {
  return <span {...props} className={["ui-badge", `ui-badge--${variant}`, className].filter(Boolean).join(" ")}>{children}</span>;
}

type AlertVariant = Exclude<SemanticVariant, "neutral">;
export function Alert({ variant = "info", title, children, action, live, className, ...props }: HTMLAttributes<HTMLDivElement> & Readonly<{ variant?: AlertVariant; title?: ReactNode; action?: ReactNode; live?: "polite" | "assertive" }>) {
  const role = live === "assertive" ? "alert" : live === "polite" ? "status" : undefined;
  return <div {...props} className={["ui-alert", `ui-alert--${variant}`, className].filter(Boolean).join(" ")} role={role} aria-live={live}>
    <div className="ui-alert__content">{title ? <div className="ui-alert__title">{title}</div> : null}{children ? <div className="ui-alert__body">{children}</div> : null}</div>
    {action ? <div className="ui-alert__action">{action}</div> : null}
  </div>;
}

export function Card({ variant = "default", className, children, ...props }: HTMLAttributes<HTMLElement> & Readonly<{ variant?: "default" | "subtle" | "raised" }>) {
  return <section {...props} className={["ui-card", `ui-card--${variant}`, className].filter(Boolean).join(" ")}>{children}</section>;
}

export function Spinner({ label = "Loading", className }: Readonly<{ label?: string; className?: string }>) { return <span className={["ui-spinner", className].filter(Boolean).join(" ")} role="status" aria-label={label} />; }

export function LoadingStatus({ title = "Loading", children, className }: Readonly<{ title?: string; children?: ReactNode; className?: string }>) { return <div className={["ui-loading-status", className].filter(Boolean).join(" ")} role="status" aria-live="polite"><Spinner label={title} /><div><div className="ui-loading-status__title">{title}</div>{children ? <div>{children}</div> : null}</div></div>; }

type StateProps = HTMLAttributes<HTMLElement> & Readonly<{ title: ReactNode; children?: ReactNode; action?: ReactNode }>;
export function EmptyState({ title, children, action, className, ...props }: StateProps) { return <section {...props} className={["ui-state", "ui-empty-state", className].filter(Boolean).join(" ")}><h2>{title}</h2>{children ? <p>{children}</p> : null}{action ? <div className="ui-state__action">{action}</div> : null}</section>; }

export function ErrorState({ title = "Something went wrong", children, action, className, ...props }: Omit<StateProps, "title"> & Readonly<{ title?: ReactNode }>) { return <section {...props} className={["ui-state", "ui-error-state", className].filter(Boolean).join(" ")} role="alert"><h2>{title}</h2>{children ? <p>{children}</p> : null}{action ? <div className="ui-state__action">{action}</div> : null}</section>; }
