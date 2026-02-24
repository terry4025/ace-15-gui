import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TaskStatusNormalized } from "../types";

function formatEta(seconds?: number): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}m ${sec}s`;
}

function formatHeartbeat(ts?: number): string {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return "—";
  try {
    return new Date(ts * 1000).toLocaleTimeString();
  } catch {
    return "—";
  }
}

export function TaskStatusPanel(props: {
  status: TaskStatusNormalized | null;
  busy: boolean;
  elapsedSec?: number;
  taskId?: string;
  onCancel?: () => void;
  canCancel?: boolean;
  onRetryClone?: () => void;
  retryCloneEnabled?: boolean;
  onCancelAndRetry?: () => void;
  cancelAndRetryEnabled?: boolean;
  onOpenLogs?: () => void;
  compact?: boolean;
  note?: string;
}) {
  const { t } = useTranslation();
  const task = props.status;
  const statusLabel = task?.statusLabel || (props.busy ? "running" : "queued");
  const isError = statusLabel === "failed" || statusLabel === "canceled";
  const taskId = props.taskId || task?.taskId || "";
  const progressPct = Math.round((task?.progress || 0) * 100);

  const statusText = useMemo(() => {
    if (statusLabel === "succeeded") return t("gen_succeeded");
    if (statusLabel === "failed") return t("gen_failed");
    if (statusLabel === "canceled") return t("gen_canceled");
    if (statusLabel === "queued") return t("gen_queued");
    return t("gen_in_progress");
  }, [statusLabel, t]);

  const retryableText = task?.retryable === undefined ? "—" : task.retryable ? t("task_retryable_yes") : t("task_retryable_no");

  const healthState = task?.healthState;
  const healthText = useMemo(() => {
    if (!healthState) return "—";
    if (healthState === "healthy") return t("task_health_healthy");
    if (healthState === "degraded") return t("task_health_degraded");
    if (healthState === "stalled") return t("task_health_stalled");
    return t("task_health_terminal");
  }, [healthState, t]);

  return (
    <section className={`taskStatusPanel${isError ? " taskStatusPanelError" : ""}${props.compact ? " taskStatusPanelCompact" : ""}`}>
      <div className="taskStatusHead">
        <div className="taskStatusTitle">{t("task_status_title")}</div>
        <span className={`taskStatusChip taskStatusChip_${statusLabel}`}>{statusText}</span>
      </div>

      <div className="taskStatusMeta">
        <span className="mono">{t("task_stage")}: {task?.stage || "—"}</span>
        {props.elapsedSec ? <span className="mono">{t("gen_elapsed")} {props.elapsedSec}s</span> : null}
        {task?.queuePosition ? <span className="mono">{t("task_queue_position")}: {task.queuePosition}</span> : null}
        {task?.queuePosition ? <span className="mono">{t("task_eta")}: {formatEta(task.etaSeconds)}</span> : null}
      </div>

      <div className="taskHealthRow">
        <span className={`taskHealthChip taskHealthChip_${healthState || "unknown"}`}>{t("task_health_state")}: {healthText}</span>
        <span className="mono">{t("task_stall_seconds")}: {task?.stallSeconds !== undefined ? `${Math.round(task.stallSeconds)}s` : "—"}</span>
        <span className="mono">{t("task_last_heartbeat")}: {formatHeartbeat(task?.lastHeartbeat)}</span>
      </div>

      <div className="progressTrack taskStatusProgress">
        <div className="progressFill" style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }} />
      </div>
      <div className="taskStatusProgressText mono">{task?.progressText || props.note || "—"}</div>
      {task?.recoverHint ? <div className="taskStatusRecoverHint">{task.recoverHint}</div> : null}

      {isError ? (
        <div className="taskErrorCard">
          <div><strong>{t("task_error_summary")}:</strong> {task?.errorSummary || task?.errorText || t("task_error_unknown")}</div>
          <div><strong>{t("task_error_code")}:</strong> <span className="mono">{task?.errorCode || "INTERNAL"}</span></div>
          <div><strong>{t("task_retryable")}:</strong> {retryableText}</div>
          {taskId ? <div><strong>Task ID:</strong> <span className="mono">{taskId}</span></div> : null}
          {props.note ? <div className="taskStatusNote">{props.note}</div> : null}
        </div>
      ) : null}

      <div className="taskStatusActions">
        <button className="btn btnDanger" onClick={props.onCancel} disabled={!props.canCancel}>
          {t("create_cancel")}
        </button>
        <button className="btn" onClick={props.onRetryClone} disabled={!props.retryCloneEnabled}>
          {t("task_retry_clone")}
        </button>
        <button className="btn" onClick={props.onCancelAndRetry} disabled={!props.cancelAndRetryEnabled}>
          {t("task_cancel_retry")}
        </button>
        <button className="btn" onClick={props.onOpenLogs}>
          {t("task_open_logs")}
        </button>
      </div>
      {!isError && taskId ? <div className="taskStatusTaskId mono">Task: {taskId}</div> : null}
    </section>
  );
}
