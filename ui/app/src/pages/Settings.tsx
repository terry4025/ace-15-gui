import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AppConfigResponse,
  SetSystemMicVolumeResponse,
  StudioConfig,
  SystemMicState,
} from "../types";
import { api } from "../lib/api";
import { PanelSection } from "../components/PanelSection";
import { FormField } from "../components/FormField";
import { StatusBadge } from "../components/StatusBadge";
import { getSystemMicState, isTauriRuntime, setSystemMicVolume } from "../lib/tauri";

function clampMicPercent(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function withMicDefaults(cfg: StudioConfig): StudioConfig {
  return {
    ...cfg,
    mic_sync_enabled: !!cfg.mic_sync_enabled,
    mic_input_volume_percent: clampMicPercent(cfg.mic_input_volume_percent),
  };
}

function formatMicRoleVolume(state: SystemMicState | null, role: "console" | "communications"): string {
  const item = state?.roles?.find((r) => String(r.role || "").toLowerCase() === role);
  if (!item) return "—";
  if (!item.supported) return "N/A";
  if (typeof item.volume_percent !== "number") return "—";
  const mute = item.muted === true ? " (mute)" : "";
  return `${item.volume_percent}%${mute}`;
}

function maxAppliedMicDelta(applied: SetSystemMicVolumeResponse | null, requestedPercent: number): number {
  const deltas = (applied?.roles || [])
    .map((r) => (typeof r.volume_percent === "number" ? Math.abs(r.volume_percent - requestedPercent) : null))
    .filter((v): v is number => typeof v === "number");
  if (!deltas.length) return 0;
  return Math.max(...deltas);
}

import { X } from "lucide-react";

export function SettingsPage(props: { cfg: AppConfigResponse | null; onConfig: (c: AppConfigResponse | null) => void; onClose?: () => void }) {
  const { t, i18n } = useTranslation();
  const [local, setLocal] = useState<StudioConfig | null>(props.cfg?.config ? withMicDefaults(props.cfg.config) : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [micWarn, setMicWarn] = useState("");
  const [micState, setMicState] = useState<SystemMicState | null>(null);
  const isWindows = typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent || "");
  const micDesktopSupported = isTauriRuntime() && isWindows;

  useEffect(() => {
    if (props.cfg?.config) setLocal(withMicDefaults(props.cfg.config));
  }, [props.cfg]);

  const runtime = props.cfg?.runtime;
  const availableDit = runtime?.available_dit_models || [];
  const availableLm = runtime?.available_lm_models || [];

  async function refreshMicState() {
    if (!micDesktopSupported) return;
    const state = await getSystemMicState();
    setMicState(state);
  }

  useEffect(() => {
    refreshMicState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micDesktopSupported]);

  async function applyMicVolumeNow(requestedPercent: number): Promise<{
    ok: boolean;
    warning?: string;
    errorCode?: string;
    maxDelta?: number;
  }> {
    const requested = clampMicPercent(requestedPercent);
    const applied = await setSystemMicVolume(requested);
    const hasRoleError = !!applied?.roles?.some((r) => !!r.error_code);
    const errorCode = applied?.error_code || (hasRoleError ? applied?.roles?.find((r) => !!r.error_code)?.error_code : "");
    const delta = maxAppliedMicDelta(applied, requested);
    const driftWarn = delta > 3;
    if (!applied || !applied.supported || !!errorCode) {
      const suffix = errorCode ? ` (${errorCode})` : "";
      return {
        ok: false,
        warning: `${t("settings_mic_apply_failed")}${suffix}`,
        errorCode: errorCode || undefined,
      };
    }
    if (driftWarn) {
      return {
        ok: false,
        warning: t("settings_mic_delta_warn", { delta }),
        maxDelta: delta,
      };
    }
    return { ok: true, maxDelta: delta };
  }

  async function applyMicOnly() {
    if (!local || !micDesktopSupported) return;
    setBusy(true);
    setMicWarn("");
    setMsg("");
    try {
      const out = await applyMicVolumeNow(clampMicPercent(local.mic_input_volume_percent));
      if (!out.ok && out.warning) {
        setMicWarn(out.warning);
      } else {
        setMsg(t("settings_mic_apply_ok"));
      }
      await refreshMicState();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!local) return;
    setBusy(true);
    setMsg("");
    setMicWarn("");
    try {
      const normalized = withMicDefaults(local);
      api.setApiKey(normalized.api_key || "");
      await api.updateAppConfig(normalized);
      const cfg = await api.getAppConfig();
      props.onConfig(cfg);
      if (cfg?.config?.language) i18n.changeLanguage(cfg.config.language);
      const appliedConfig = cfg?.config ? withMicDefaults(cfg.config) : normalized;

      if (micDesktopSupported && appliedConfig.mic_sync_enabled) {
        const out = await applyMicVolumeNow(clampMicPercent(appliedConfig.mic_input_volume_percent));
        if (!out.ok && out.warning) {
          setMicWarn(out.warning);
        }
        await refreshMicState();
      }

      setMsg(t("settings_saved"));
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const bindHint = useMemo(() => {
    if (!local) return "";
    return local.bind_mode === "lan"
      ? t("settings_bind_hint_lan")
      : t("settings_bind_hint_local");
  }, [local, t]);

  if (!local) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={props.onClose}>
        <div className="panel" onClick={e => e.stopPropagation()}>
          <div className="panelBody">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={props.onClose}>
      <div
        style={{ backgroundColor: "var(--bg1, #121212)", width: "100%", maxWidth: 860, maxHeight: "90vh", overflowY: "auto", borderRadius: 12, padding: 24, position: "relative", boxShadow: "0 10px 40px rgba(0,0,0,0.5)", border: "1px solid var(--border)" }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={props.onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.7 }}
          onMouseEnter={e => e.currentTarget.style.opacity = "1"}
          onMouseLeave={e => e.currentTarget.style.opacity = "0.7"}
        >
          <X size={24} />
        </button>
        <div className="grid2">
          <PanelSection title={t("settings_title")} subtitle={t("settings_sub")}>
            <FormField label={t("settings_lang")}>
              <select className="select" value={local.language} onChange={(e) => setLocal({ ...local, language: e.target.value as any })}>
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </select>
            </FormField>

            <FormField label={t("settings_output")}>
              <input className="input mono" value={local.output_dir} onChange={(e) => setLocal({ ...local, output_dir: e.target.value })} />
            </FormField>

            <div className="row">
              <FormField label={t("settings_bind")} hint={bindHint}>
                <select className="select" value={local.bind_mode} onChange={(e) => setLocal({ ...local, bind_mode: e.target.value as any })}>
                  <option value="local">{t("settings_bind_local")}</option>
                  <option value="lan">{t("settings_bind_lan")}</option>
                </select>
              </FormField>
              <FormField label={t("settings_api_key")}>
                <input
                  className="input mono"
                  value={local.api_key || ""}
                  onChange={(e) => setLocal({ ...local, api_key: e.target.value })}
                  placeholder="(optional)"
                />
              </FormField>
            </div>

            <div className="row">
              <FormField label={t("settings_dit_model")}>
                <select className="select" value={local.dit_model} onChange={(e) => setLocal({ ...local, dit_model: e.target.value })}>
                  {(availableDit.length ? availableDit : [local.dit_model]).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </FormField>
              <FormField label={t("settings_lm_model")}>
                <select className="select" value={local.lm_model} onChange={(e) => setLocal({ ...local, lm_model: e.target.value })}>
                  {(availableLm.length ? availableLm : [local.lm_model]).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </FormField>
            </div>

            <div className="row">
              <FormField label={t("settings_lm_backend")}>
                <select className="select" value={local.lm_backend} onChange={(e) => setLocal({ ...local, lm_backend: e.target.value as any })}>
                  <option value="pt">pt</option>
                  <option value="vllm">vllm</option>
                </select>
              </FormField>
              <FormField label={t("settings_download_source")}>
                <select className="select" value={local.download_source} onChange={(e) => setLocal({ ...local, download_source: e.target.value as any })}>
                  <option value="auto">auto</option>
                  <option value="huggingface">huggingface</option>
                  <option value="modelscope">modelscope</option>
                </select>
              </FormField>
            </div>

            {micDesktopSupported ? (
              <>
                <div className="row">
                  <FormField label={t("settings_mic_sync_enabled")} hint={t("settings_mic_sync_hint")}>
                    <label className="mono" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!local.mic_sync_enabled}
                        onChange={(e) => setLocal({ ...local, mic_sync_enabled: e.target.checked })}
                      />
                      <span>{local.mic_sync_enabled ? "ON" : "OFF"}</span>
                    </label>
                  </FormField>
                  <FormField
                    label={t("settings_mic_volume")}
                    hint={`${t("settings_mic_console")}: ${formatMicRoleVolume(micState, "console")} · ${t("settings_mic_communications")}: ${formatMicRoleVolume(micState, "communications")}`}
                  >
                    <div style={{ display: "grid", gap: 6 }}>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={clampMicPercent(local.mic_input_volume_percent)}
                        onChange={(e) => setLocal({ ...local, mic_input_volume_percent: clampMicPercent(e.target.value) })}
                      />
                      <div className="mono" style={{ color: "var(--faint)" }}>{clampMicPercent(local.mic_input_volume_percent)}%</div>
                    </div>
                  </FormField>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: -2 }}>
                  <button className="btn" onClick={refreshMicState} type="button">{t("settings_mic_refresh")}</button>
                  <button className="btn" onClick={applyMicOnly} type="button" disabled={busy}>{t("settings_mic_apply_now")}</button>
                  <StatusBadge tone={micState?.supported ? "neutral" : "warn"}>
                    {t("settings_mic_state")}: {micState?.supported ? "Windows CoreAudio" : "Unsupported"}
                  </StatusBadge>
                </div>
              </>
            ) : (
              <div className="mono" style={{ color: "var(--faint)", marginBottom: 4 }}>
                {t("settings_mic_desktop_only")}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btnPrimary" onClick={save} disabled={busy}>{t("settings_save")}</button>
              {msg ? (
                <StatusBadge tone={msg === t("settings_saved") ? "ok" : "error"}>{msg}</StatusBadge>
              ) : null}
              {micWarn ? <StatusBadge tone="warn">{micWarn}</StatusBadge> : null}
            </div>
          </PanelSection>

          <PanelSection title={t("settings_runtime")} subtitle={t("settings_runtime_sub")}>
            <div className="feed" style={{ gap: 8 }}>
              <div className="statusRail">
                <StatusBadge tone="neutral">GPU: {runtime?.gpu_name || "—"}</StatusBadge>
                <StatusBadge tone="neutral">Tier: {runtime?.gpu_tier || "—"}</StatusBadge>
                <StatusBadge tone="neutral">VRAM: {runtime?.gpu_memory_gb?.toFixed(1) ?? "—"} GB</StatusBadge>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                <div>Recommended LM: <span className="mono">{runtime?.recommended_lm_model || "—"}</span></div>
                <div style={{ marginTop: 10 }}>{t("settings_avail_dit")}:</div>
                <div className="mono" style={{ color: "var(--faint)" }}>{availableDit.join(", ") || "—"}</div>
                <div style={{ marginTop: 10 }}>{t("settings_avail_lm")}:</div>
                <div className="mono" style={{ color: "var(--faint)" }}>{availableLm.join(", ") || "—"}</div>
              </div>
            </div>
          </PanelSection>
        </div>
      </div>
    </div>
  );
}
