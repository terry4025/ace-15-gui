import type { ReactNode } from "react";

type FormFieldProps = {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

export function FormField(props: FormFieldProps) {
  return (
    <div className={`field ${props.className || ""}`.trim()}>
      <div className="label">{props.label}</div>
      {props.children}
      {props.hint ? <div className="fieldHint">{props.hint}</div> : null}
    </div>
  );
}
