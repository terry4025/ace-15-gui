import type { ReactNode } from "react";

type PanelSectionProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function PanelSection(props: PanelSectionProps) {
  return (
    <section className={`panel ${props.className || ""}`.trim()}>
      <div className={`panelHeader panelSectionHeader ${props.headerClassName || ""}`.trim()}>
        <div>
          <div className="panelTitle">{props.title}</div>
          {props.subtitle ? <div className="panelSubtitle">{props.subtitle}</div> : null}
        </div>
        {props.action ? <div className="panelHeaderAction">{props.action}</div> : null}
      </div>
      <div className={`panelBody ${props.bodyClassName || ""}`.trim()}>{props.children}</div>
    </section>
  );
}
