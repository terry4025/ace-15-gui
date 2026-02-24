import type { ReactNode } from "react";

type StatusTone = "ok" | "warn" | "error" | "neutral";

type StatusBadgeProps = {
  tone?: StatusTone;
  children: ReactNode;
};

export function StatusBadge(props: StatusBadgeProps) {
  const tone = props.tone || "neutral";
  return <span className={`statusBadge statusBadge_${tone}`}>{props.children}</span>;
}
