import type { ReactNode } from "react";
import { Card } from "antd";

type Props = Readonly<{
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}>;

/** Shared presentation for bounded, non-destructive auxiliary page states. */
export function AuxiliaryState({ title, description, action }: Props) {
  return <section className="auxiliary-state">
    <Card className="auxiliary-state__surface" variant="outlined" styles={{ body: { padding: 0 } }}>
      <div className="auxiliary-state__body">
        <h1 className="auxiliary-state__title">{title}</h1>
        <p className="auxiliary-state__description">{description}</p>
        {action ? <div className="auxiliary-state__action">{action}</div> : null}
      </div>
    </Card>
  </section>;
}
