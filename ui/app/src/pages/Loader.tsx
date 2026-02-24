import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { AppConfigResponse } from "../types";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { getUpdateLog, isUpdateLogFresh } from "../updateLog";
import { collectDiagnosticsBundle, openPath, readBackendUrl, restartBackend } from "../lib/tauri";

export function LoaderPage(props: { onConfig: (c: AppConfigResponse | null) => void }) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [status, setStatus] = useState<string>("…");
  const [err, setErr] = useState<string>("");
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [backendVersion, setBackendVersion] = useState<string>("");
  const uiVer = __STUDIO_UI_VERSION__;
  const buildTime = __STUDIO_BUILD_TIME__;

  function stageLabel(stage: string): string {
    switch ((stage || "").toLowerCase()) {
      case "not_started": return "Waiting for startup…";
      case "initializing": return "Initializing…";
      case "gpu_detect": return "Detecting GPU…";
      case "download_models": return "Checking models…";
      case "load_dit_primary": return "Loading DiT…";
      case "load_dit_secondary": return "Loading DiT (2)…";
      case "load_dit_third": return "Loading DiT (3)…";
      case "load_llm": return "Loading 5Hz LM…";
      case "ready": return "Ready";
      case "error": return "Error";
      default: return stage ? `Working… (${stage})` : "Working…";
    }
  }

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function setStep(label: string, done: boolean) {
    setSteps((prev) => {
      const next = prev.slice();
      const idx = next.findIndex((s) => s.label === label);
      if (idx >= 0) next[idx] = { label, done };
      else next.push({ label, done });
      return next;
    });
  }

  async function refreshBackendUrlFromTauri(): Promise<boolean> {
    // Tauri spawns the backend on a dynamic port if 8001 is occupied.
    // The UI must stay in sync; localStorage might have an old port from a prior run.
    try {
      const url = await readBackendUrl();
      if (url && typeof url === "string") {
        const cur = api.getBaseUrl();
        if (url !== cur) api.setBaseUrl(url);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  async function fallbackToDefaultPort(): Promise<boolean> {
    // If the stored base URL is stale (old port), prefer 8001 when it responds.
    const fallback = "http://127.0.0.1:8001";
    const current = api.getBaseUrl();
    if (current === fallback) return true;
    // Avoid noisy refused requests in dynamic-port runs when current base is already healthy.
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 900);
      const cur = await fetch(current.replace(/\/+$/, "") + "/health", { signal: ctrl.signal });
      clearTimeout(t);
      if (cur.ok) return true;
    } catch {
      // ignore and continue to fallback probe
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 900);
      const res = await fetch(fallback + "/health", { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        api.setBaseUrl(fallback);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  async function openLogsFolder(): Promise<void> {
    const cached = api.getCachedAppPaths();
    const configPath = String(cached?.config_path || "");
    const outputPath = String(cached?.output_dir || "");
    const configDir = configPath ? configPath.replace(/[\\/][^\\/]+$/, "") : "";
    const target = configDir || outputPath;
    if (!target) {
      setErr(t("task_log_path_missing"));
      return;
    }
    const ok = await openPath(target);
    if (!ok) setErr(t("task_log_open_failed"));
  }

  async function restartBackendFromUi(): Promise<void> {
    setErr("");
    setStatus("Restarting backend…");
    const url = await restartBackend();
    if (url) {
      api.setBaseUrl(url);
      setStatus(`Backend restarted (${url})`);
    } else {
      setErr("Failed to restart backend from launcher.");
      setStatus("Error");
      return;
    }
    await sleep(800);
    await boot();
  }

  async function collectDiagnosticsFromUi(): Promise<void> {
    setErr("");
    const bundle = await collectDiagnosticsBundle();
    if (!bundle) {
      setErr("Failed to collect diagnostics bundle.");
      return;
    }
    const opened = await openPath(bundle);
    if (!opened) setErr(t("task_log_open_failed"));
    const supportId = ((bundle.match(/bundle-\d+/i) || [])[0] || bundle.split(/[\\/]/).pop() || "bundle").trim();
    setStatus(`${t("loader_diag_saved")} ${bundle} (${t("loader_diag_support_id")}: ${supportId})`);
  }

  async function boot() {
    setErr("");
    setSteps([]);
    setStatus("Detecting environment…");
    setStep("Detect environment", false);
    // If running inside Tauri, ask Rust for the backend URL and persist it.
    if (!(await refreshBackendUrlFromTauri())) {
      await fallbackToDefaultPort();
    }
    setStep("Detect environment", true);

    // The backend can take a while on first run because it loads DiT + LM models.
    // Poll /health to show progress and gate entry safely.
    setStatus("Health check…");
    setStep("Backend reachable", false);
    const maxWaitMs = 6 * 60_000; // 6 minutes
    const start = Date.now();
    let ok = false;
    let hadHealthResponse = false;
    let hadInitProgress = false;
    let portResyncObserved = false;
    let lastStage = "";
    let llmRequired = false;
    let lastTauriRefresh = 0;
    while (Date.now() - start < maxWaitMs) {
      try {
        const h = await api.getHealth();
        ok = true;
        hadHealthResponse = true;
        lastStage = h.models_stage || "";
        if (lastStage && lastStage !== "ready") hadInitProgress = true;
        const sec = Math.floor((Date.now() - start) / 1000);
        const gpuMem = typeof h.gpu_memory_gb === "number" ? h.gpu_memory_gb : 0;
        // Docs-driven: LM is optional overall, but tier5+ defaults to init_lm_default=true.
        // If the server reports it has disabled LM lazy-load, don't wait for it.
        llmRequired = !h.llm_lazy_load_disabled && gpuMem >= 12;
        const stageTxt = stageLabel(lastStage);
        const gpuTxt = h.gpu_name ? ` · ${h.gpu_name}${gpuMem > 0 ? ` (${gpuMem.toFixed(1)} GB)` : ""}` : "";
        setStatus(`${stageTxt}${gpuTxt} (${sec}s)`);

        setStep("Backend reachable", true);
        setStep("Load DiT", !!h.models_initialized);
        setStep("Load 5Hz LM", llmRequired ? !!h.llm_initialized : true);

        if (h.init_error || h.models_stage === "error") {
          setErr(String(h.init_error || "Initialization failed"));
          setStatus("Error");
          return;
        }
        if (h.models_initialized && (!llmRequired || h.llm_initialized)) break;
      } catch {
        // If the backend changed ports (or the UI has a stale port), refresh from Tauri periodically.
        if (Date.now() - lastTauriRefresh > 2500) {
          const before = api.getBaseUrl();
          const refreshed = await refreshBackendUrlFromTauri();
          if (refreshed) {
            if (api.getBaseUrl() !== before) portResyncObserved = true;
            lastTauriRefresh = Date.now();
          }
        }
        // As a last resort, try the default port if it responds.
        await fallbackToDefaultPort();
        ok = await api.health();
        if (ok) setStep("Backend reachable", true);
      }
      const sec = Math.floor((Date.now() - start) / 1000);
      if (!ok) setStatus(`Health check… (${sec}s)`);
      await sleep(1500);
    }
    if (!ok) {
      let timeoutMsg = t("loader_err_health_timeout");
      if (!hadHealthResponse && portResyncObserved) timeoutMsg = t("loader_err_health_port_mismatch");
      else if (!hadHealthResponse) timeoutMsg = t("loader_err_health_offline");
      else if (hadInitProgress || lastStage) timeoutMsg = t("loader_err_health_init_delay");
      setErr(timeoutMsg);
      setStatus("Offline");
      return;
    }
    // If backend reachable but init not finished, surface a friendly message.
    if (lastStage && lastStage !== "ready") setStatus(stageLabel(lastStage));

    setStatus("Loading config…");
    setStep("Load config", false);
    try {
      const cfg = await api.getAppConfig();
      props.onConfig(cfg);
      if (cfg?.config?.api_key) api.setApiKey(cfg.config.api_key);
      setBackendVersion(String(cfg?.runtime?.backend_version || "") || "");
      setStatus("Ready");
      setStep("Load config", true);
      nav("/home");
    } catch (e: any) {
      setErr(e?.message || String(e));
      setStatus("Error");
    }
  }

  useEffect(() => {
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: "600px", width: "100%" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div className="panelTitle">{t("loader_title")}</div>
          <div style={{ color: "var(--text-muted)" }}>{t("loader_sub")}</div>
          <div className="loaderMetaRow">
            <span className="pill mono">Studio UI {uiVer}</span>
            <span className="pill mono">Build {buildTime.slice(0, 19).replace("T", " ")}</span>
            {backendVersion ? <span className="pill mono">Backend {backendVersion}</span> : null}
            {!isUpdateLogFresh(uiVer) ? <span className="pill" style={{ color: "var(--danger)" }}>Update log not updated for this build</span> : null}
          </div>
          <div className="mono" style={{ color: "var(--text-secondary)" }}>{status}</div>
          {steps.length ? (
            <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
              {steps.map((s) => (
                <div key={s.label} style={{ color: s.done ? "var(--text-muted)" : "var(--text-secondary)", fontSize: 12 }}>
                  {s.done ? "●" : "○"} {s.label}
                </div>
              ))}
            </div>
          ) : null}
          {err ? <div style={{ color: "var(--danger)" }}>{err}</div> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button className="tag-pill" onClick={boot}>{t("loader_retry")}</button>
            <button className="tag-pill" onClick={openLogsFolder}>{t("task_open_logs")}</button>
            <button className="tag-pill" onClick={restartBackendFromUi}>{t("loader_restart_backend")}</button>
            <button className="tag-pill" onClick={collectDiagnosticsFromUi}>{t("loader_collect_diag")}</button>
            <button className="tag-pill" onClick={() => setLogOpen(true)}>{t("loader_update_log")}</button>
          </div>
        </div>
      </div>

      <Modal
        open={logOpen}
        title={t("loader_update_log")}
        onClose={() => setLogOpen(false)}
        footer={
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="tag-pill"
              onClick={() => {
                const diag = [
                  `Studio UI: ${uiVer}`,
                  `Build: ${buildTime}`,
                  `Backend: ${backendVersion || "(unknown)"}`,
                  `API: ${api.getBaseUrl()}`,
                  `Status: ${status || "(unknown)"}`,
                  `Error: ${err || "(none)"}`,
                ].join("\n");
                navigator.clipboard?.writeText(diag).catch(() => void 0);
              }}
            >
              {t("loader_copy_diag")}
            </button>
            <button className="tag-pill" onClick={openLogsFolder}>{t("task_open_logs")}</button>
            <button className="tag-pill" onClick={restartBackendFromUi}>{t("loader_restart_backend")}</button>
            <button className="tag-pill" onClick={collectDiagnosticsFromUi}>{t("loader_collect_diag")}</button>
          </div>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.55 }}>
            {t("loader_update_intro")}
          </div>
          <div className="" style={{ background: "rgba(0,0,0,0.18)", borderRadius: "var(--radius-md)", padding: "12px" }}>
            <div className="" style={{ display: "grid", gap: 10 }}>
              {getUpdateLog(i18n.language).map((e, idx) => (
                <div key={`${e.version}-${e.date}-${idx}`} className="updateEntry">
                  <div className="updateEntryHead">
                    <div className="updateEntryTitle">{e.title}</div>
                    <div className="updateEntryMeta mono">{e.date} · v{e.version}</div>
                  </div>
                  <ul className="updateList">
                    {e.items.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
