import type { ReactNode } from "react";

export type PageHeaderProps = Readonly<{
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  secondaryNavigation?: ReactNode;
  className?: string;
}>;

export function PageHeader({ title, eyebrow, description, metadata, actions, secondaryNavigation, className }: PageHeaderProps) {
  return <header className={["ui-page-header", className].filter(Boolean).join(" ")}>
    <div className="ui-page-header__content">
      {eyebrow ? <p className="ui-page-header__eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {description ? <p className="ui-page-header__description">{description}</p> : null}
      {metadata ? <div className="ui-page-header__metadata">{metadata}</div> : null}
    </div>
    {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    {secondaryNavigation ? <div className="ui-page-header__secondary-navigation">{secondaryNavigation}</div> : null}
  </header>;
}
