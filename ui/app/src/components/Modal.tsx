import { ReactNode, useEffect } from "react";

export function Modal(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!props.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div className="modalBackdrop" onMouseDown={props.onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{props.title}</div>
          <button className="btn" onClick={props.onClose}>Close</button>
        </div>
        <div className="modalBody">{props.children}</div>
        {props.footer ? <div className="modalFooter">{props.footer}</div> : null}
      </div>
    </div>
  );
}

