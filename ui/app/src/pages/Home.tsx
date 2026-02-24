import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Sparkles, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { AppConfigResponse, LibraryTrack } from "../types";
import { api } from "../lib/api";
import { getUpdateLog } from "../updateLog";
import { Cover } from "../components/Cover";
import { PanelSection } from "../components/PanelSection";
import { StatusBadge } from "../components/StatusBadge";

type LastApiError = { at: number; path: string; message: string } | null;

export function HomePage(props: { cfg: AppConfigResponse | null }) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [recent, setRecent] = useState<LibraryTrack[]>([]);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [lastApiError, setLastApiError] = useState<LastApiError>(api.getLastError());

  const latest = useMemo(() => {
    const list = getUpdateLog(i18n.language);
    return list.length ? list[0] : null;
  }, [i18n.language]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await api.library();
        if (!mounted) return;
        setRecent(list.slice(0, 8));
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onError = () => setLastApiError(api.getLastError());
    globalThis.addEventListener("ace_step_studio_api_error", onError as EventListener);
    return () => globalThis.removeEventListener("ace_step_studio_api_error", onError as EventListener);
  }, []);

  const gpuMem = props.cfg?.runtime?.gpu_memory_gb;
  const gpu = Number.isFinite(gpuMem) && (gpuMem as number) > 0
    ? `${(gpuMem as number).toFixed(1)} GB`
    : props.cfg
      ? t("home_gpu_unknown")
      : t("home_gpu_loading");
  const lm = props.cfg?.config?.lm_model || "acestep-5Hz-lm-4B";
  const dit = props.cfg?.config?.dit_model || "acestep-v15-turbo";

  const backendReady = !!props.cfg;
  const modelsReady = !!props.cfg?.runtime?.models_initialized;
  const authState = useMemo(() => {
    const bind = props.cfg?.config?.bind_mode || "local";
    const hasKey = !!String(props.cfg?.config?.api_key || "").trim();
    if (bind === "local" && !hasKey) return { tone: "neutral" as const, text: t("system_status_local") };
    if (hasKey) return { tone: "ok" as const, text: t("system_status_key_ready") };
    return { tone: "warn" as const, text: t("system_status_key_missing") };
  }, [props.cfg?.config?.api_key, props.cfg?.config?.bind_mode, t]);

  const hasRecentError = !!(lastApiError && Date.now() - Number(lastApiError.at || 0) < 24 * 60 * 60 * 1000);

  function goCompose() {
    const q = draftPrompt.trim();
    nav(q ? `/compose?prompt=${encodeURIComponent(q)}` : "/compose");
  }

  const presets = [
    "dreamy lo-fi chill instrumental, warm tape, soft drums",
    "uplifting pop chorus, bright synths, big drums",
    "dark cinematic score, pulsating bass, tension build",
    "energetic dnb, tight breaks, rolling sub bass",
    "acoustic folk, intimate vocal, gentle guitar",
    "house groove, punchy kick, disco bassline"
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="hero">
        <div className="heroInner">
          <div className="heroTag">
            <Sparkles size={14} />
            <span>{t("home_tag")}</span>
          </div>
          <h1 className="heroTitle">{t("home_title")}</h1>
          <div className="heroSub">{t("home_sub")}</div>
          <div className="heroMeta">
            <span className="pill">{t("home_gpu")}: {gpu}</span>
            <span className="pill">DiT: {dit}</span>
            <span className="pill">LM: {lm}</span>
          </div>
        </div>
      </section>

      <PanelSection
        title={t("system_check_title")}
        subtitle={t("system_check_sub")}
        action={<button className="btn" onClick={() => nav("/ops")}>{t("system_check_open_ops")}</button>}
      >
        <div className="statusRail">
          <StatusBadge tone={backendReady ? "ok" : "warn"}>{t("system_check_backend")}: {backendReady ? t("system_status_online") : t("system_status_starting")}</StatusBadge>
          <StatusBadge tone={modelsReady ? "ok" : "warn"}>{t("system_check_models")}: {modelsReady ? t("system_status_ready") : t("system_status_loading")}</StatusBadge>
          <StatusBadge tone={authState.tone}>{t("system_check_auth")}: {authState.text}</StatusBadge>
          <StatusBadge tone="neutral">API: {api.getBaseUrl()}</StatusBadge>
        </div>
        <div style={{ marginTop: 12, color: "var(--muted)", lineHeight: 1.6 }}>
          {t("system_check_desc")}
        </div>
        <div className="systemErrorBox">
          <div className="systemErrorHead">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={14} />
              <span>{t("system_check_recent_error")}</span>
            </div>
          </div>
          {hasRecentError && lastApiError ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div className="mono systemErrorText">{lastApiError.path} · {new Date(lastApiError.at).toLocaleString()}</div>
              <div className="systemErrorText">{String(lastApiError.message || "").slice(0, 280)}</div>
              <div>
                <button className="btn" onClick={() => nav("/ops")}>{t("system_check_open_ops")}</button>
              </div>
            </div>
          ) : (
            <div className="systemErrorText">{t("system_check_no_recent_error")}</div>
          )}
        </div>
      </PanelSection>

      <div className="grid2">
        <PanelSection title={t("home_compose_title")} subtitle={t("home_compose_sub")} className="composer">
          <div className="composerBox">
            <input
              className="input composerInput"
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              placeholder={t("create_prompt_ph")}
              onKeyDown={(e) => {
                if (e.key === "Enter") goCompose();
              }}
            />
            <div className="composerActions">
              <button className="btn btnPrimary" onClick={goCompose} disabled={!draftPrompt.trim()}>
                <Plus size={16} />
                {t("home_generate")}
              </button>
              <button className="btn" onClick={() => nav("/compose")}>
                {t("home_open_compose")}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="label">{t("home_preset")}</div>
            <div className="chips" style={{ marginTop: 8 }}>
              {presets.map((p) => (
                <button
                  key={p}
                  className="chip chipBtn"
                  onClick={() => setDraftPrompt(p)}
                  title={p}
                >
                  {p.split(",")[0]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => nav("/library")}>{t("home_library")}</button>
            <button className="btn" onClick={() => nav("/updates")}>{t("nav_updates")}</button>
          </div>
        </PanelSection>

        <PanelSection
          title={t("home_feed_title")}
          subtitle={t("home_feed_sub")}
          action={<button className="btn" onClick={() => nav("/library")}>{t("home_view_all")}</button>}
        >
          {!recent.length ? <div style={{ color: "var(--muted)" }}>{t("home_empty")}</div> : null}
          <div className="feed">
            {recent.map((tr) => {
              const meta = tr.meta || {};
              const title =
                meta?.prompt_final ||
                meta?.metas?.caption ||
                meta?.metas?.prompt ||
                tr.track_id;
              const sub = meta?.metas?.bpm ? `BPM ${meta.metas.bpm}` : "";
              const seed = String(tr.track_id || title || "");
              return (
                <div className="feedItem" key={tr.track_id}>
                  <div className="feedGrid">
                    <Cover seed={seed} title={String(title)} size={56} />
                    <div style={{ minWidth: 0 }}>
                      <div className="feedItemHead">
                        <div className="feedItemTitle">{String(title).slice(0, 120) || tr.track_id}</div>
                        <div className="feedItemMeta mono">{sub}</div>
                      </div>
                      {tr.audio_url ? (
                        <audio controls preload="none" src={api.getBaseUrl() + tr.audio_url} style={{ width: "100%", marginTop: 8 }} />
                      ) : null}
                      <div className="feedActions">
                        <button className="btn" onClick={() => nav("/edit")}>{t("nav_edit")}</button>
                        <button className="btn" onClick={() => nav("/compose")}>{t("nav_compose")}</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelSection>
      </div>

      {latest ? (
        <PanelSection
          title={t("nav_updates")}
          subtitle={t("home_updates_sub")}
          action={<button className="btn" onClick={() => nav("/updates")}>{t("home_open_updates")}</button>}
        >
          <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: "var(--text)" }}>{latest.title}</div>
            <div className="mono" style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>{latest.date} · v{latest.version}</div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
              {latest.items.slice(0, 5).map((it: string) => <li key={it}>{it}</li>)}
            </ul>
          </div>
        </PanelSection>
      ) : null}
    </div>
  );
}
