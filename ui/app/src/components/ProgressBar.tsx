import { useEffect, useMemo, useState } from "react";

export function ProgressBar(props: {
  active: boolean;
  value?: number; // 0..1
  label?: string;
  subLabel?: string;
}) {
  const [tick, setTick] = useState(0);

  // Indeterminate animation that still feels "alive" even when we don't have a true percent.
  useEffect(() => {
    if (!props.active) return;
    const id = setInterval(() => setTick((v) => (v + 1) % 10_000), 200);
    return () => clearInterval(id);
  }, [props.active]);

  const pct = useMemo(() => {
    const v = props.value;
    if (typeof v === "number" && Number.isFinite(v)) {
      return Math.max(0, Math.min(1, v));
    }
    return null;
  }, [props.value]);

  // Fake progress that eases toward ~92% and never completes on its own.
  const fake = useMemo(() => {
    if (pct != null) return pct;
    const t = (tick % 400) / 400; // 0..1
    const eased = 1 - Math.pow(1 - t, 3);
    return 0.12 + eased * 0.80;
  }, [pct, tick]);

  if (!props.active) return null;

  return (
    <div className="progressWrap">
      <div className="progressTop">
        {props.label ? <div className="progressLabel">{props.label}</div> : <div />}
        <div className="progressPct mono">{Math.round(fake * 100)}%</div>
      </div>
      <div className="progressTrack" aria-label="progress">
        <div className="progressFill" style={{ width: `${Math.round(fake * 100)}%` }}>
          <div className="progressShine" />
        </div>
      </div>
      {props.subLabel ? <div className="progressSub mono">{props.subLabel}</div> : null}
    </div>
  );
}

