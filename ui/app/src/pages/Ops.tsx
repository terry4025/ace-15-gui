import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppConfigResponse, StatsResponse, TaskStatusNormalized } from "../types";
import { api } from "../lib/api";

export function OpsPage(props: { cfg: AppConfigResponse | null }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [recentFailed, setRecentFailed] = useState<TaskStatusNormalized[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setBusy(true);
    setErr("");
    try {
      const [s, recent] = await Promise.all([
        api.getStats(),
        api.getRecentTasks(50, "failed,canceled"),
      ]);
      setStats(s);
      setRecentFailed((recent || []).slice(0, 20));
    } catch (e: any) {
      setErr(e?.message || String(e));
      setRecentFailed(api.getTaskHistory(50).filter((x) => x.statusLabel === "failed" || x.statusLabel === "canceled"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = useMemo(() => {
    const jobs = stats?.jobs || {};
    return [
      { label: t("ops_queue_size"), value: Number(stats?.queue_size ?? 0) },
      { label: t("ops_queue_max"), value: Number(stats?.queue_maxsize ?? 0) },
      { label: t("ops_avg_job"), value: Number(stats?.avg_job_seconds ?? 0).toFixed(1) + "s" },
      { label: t("ops_jobs_total"), value: Number(jobs.total_jobs ?? jobs.total ?? 0) },
      { label: t("ops_jobs_running"), value: Number(jobs.running_jobs ?? jobs.running ?? 0) },
      { label: t("ops_jobs_success"), value: Number(jobs.succeeded_jobs ?? jobs.succeeded ?? 0) },
      { label: t("ops_jobs_failed"), value: Number(jobs.failed_jobs ?? jobs.failed ?? 0) },
      { label: t("ops_jobs_canceled"), value: Number(jobs.canceled_jobs ?? jobs.canceled ?? 0) },
      { label: t("ops_preflight_calls"), value: Number(stats?.preflight_calls_total ?? 0) },
      { label: t("ops_query_calls"), value: Number(stats?.query_result_calls_total ?? 0) },
      { label: t("ops_cancel_calls"), value: Number(stats?.cancel_calls_total ?? 0) },
      { label: t("ops_format_input_calls"), value: Number(stats?.format_input_calls_total ?? 0) },
      { label: t("ops_format_input_fail"), value: Number(stats?.format_input_fail_total ?? 0) },
      { label: t("ops_format_input_known_fail"), value: Number(stats?.format_input_known_fail_total ?? 0) },
    ];
  }, [stats, t]);

  const errorDistribution = useMemo(() => {
    const bucket: Record<string, number> = {};
    for (const task of recentFailed) {
      const code = task.errorCode || (task.statusLabel === "canceled" ? "CANCELED" : "INTERNAL");
      bucket[code] = (bucket[code] || 0) + 1;
    }
    return Object.entries(bucket).sort((a, b) => b[1] - a[1]);
  }, [recentFailed]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel">
        <div className="panelHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div className="panelTitle">{t("ops_title")}</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>{t("ops_sub")}</div>
          </div>
          <button className="btn" onClick={load} disabled={busy}>{t("library_refresh")}</button>
        </div>
        <div className="panelBody">
          {err ? <div style={{ color: "var(--danger)", marginBottom: 12 }}>{err}</div> : null}
          <div className="statGrid">
            {cards.map((c) => (
              <div className="statCard" key={c.label}>
                <div className="statLabel">{c.label}</div>
                <div className="statValue mono">{c.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">{t("ops_recent_failed_server")}</div>
          </div>
          <div className="panelBody">
            {!recentFailed.length ? (
              <div style={{ color: "var(--muted)" }}>{t("ops_recent_failed_empty")}</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {recentFailed.map((item) => (
                  <div key={item.taskId} className="taskRow">
                    <div className="mono taskRowHead">{item.taskId}</div>
                    <div className="taskRowMeta">
                      <span className="mono">{t("task_stage")}: {item.stage || "—"}</span>
                      <span className="mono">{t("task_error_code")}: {item.errorCode || "INTERNAL"}</span>
                      <span>{item.errorSummary || item.errorText || item.progressText || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">{t("ops_error_dist")}</div>
          </div>
          <div className="panelBody">
            {!errorDistribution.length ? (
              <div style={{ color: "var(--muted)" }}>{t("ops_error_dist_empty")}</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {errorDistribution.map(([code, count]) => (
                  <div key={code} className="taskDistRow">
                    <span className="mono">{code}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">{t("ops_runtime")}</div>
          </div>
          <div className="panelBody" style={{ color: "var(--muted)", lineHeight: 1.65 }}>
            <div>Backend: <span className="mono">{props.cfg?.runtime?.backend_version || "—"}</span></div>
            <div>GPU: <span className="mono">{props.cfg?.runtime?.gpu_name || "—"}</span></div>
            <div>GPU Tier: <span className="mono">{props.cfg?.runtime?.gpu_tier || "—"}</span></div>
            <div>GPU Memory: <span className="mono">{props.cfg?.runtime?.gpu_memory_gb?.toFixed(1) ?? "—"} GB</span></div>
            <div>Recommended LM: <span className="mono">{props.cfg?.runtime?.recommended_lm_model || "—"}</span></div>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">{t("ops_paths")}</div>
          </div>
          <div className="panelBody" style={{ color: "var(--muted)", lineHeight: 1.65 }}>
            <div>Config: <span className="mono">{props.cfg?.paths?.config_path || "—"}</span></div>
            <div>Output: <span className="mono">{props.cfg?.paths?.output_dir || "—"}</span></div>
            <div>Checkpoint: <span className="mono">{props.cfg?.paths?.checkpoint_dir || "—"}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
