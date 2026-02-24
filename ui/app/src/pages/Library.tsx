import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, RefreshCcw, Trash2, Paintbrush2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { AppConfigResponse, LibraryTrack } from "../types";
import { api } from "../lib/api";
import { Cover } from "../components/Cover";

function metaLine(meta: any): string {
  const bpm = meta?.metas?.bpm ?? meta?.bpm ?? meta?.metas?.["bpm"];
  const key = meta?.metas?.keyscale ?? meta?.keyscale;
  const ts = meta?.metas?.timesignature ?? meta?.timesignature;
  const dur = meta?.metas?.duration ?? meta?.duration;
  const parts = [
    bpm && bpm !== "N/A" ? `BPM ${bpm}` : "",
    key && key !== "N/A" ? String(key) : "",
    ts && ts !== "N/A" ? `TS ${ts}` : "",
    dur && dur !== "N/A" ? `${dur}s` : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

export function LibraryPage(props: { cfg: AppConfigResponse | null; search: string }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [durMin, setDurMin] = useState<number>(0);
  const [durMax, setDurMax] = useState<number>(0);
  const [bpmMin, setBpmMin] = useState<number>(0);
  const [bpmMax, setBpmMax] = useState<number>(0);
  const [onlyInstr, setOnlyInstr] = useState(false);
  const [onlyLyrics, setOnlyLyrics] = useState(false);

  async function load() {
    setBusy(true);
    setErr("");
    try {
      const list = await api.library();
      setTracks(list);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function parseNum(v: any): number {
    const n = typeof v === "number" ? v : parseFloat(String(v || ""));
    return Number.isFinite(n) ? n : 0;
  }

  function isInstrumental(meta: any): boolean {
    const lyr = meta?.lyrics_final ?? meta?.metas?.lyrics ?? meta?.lyrics ?? "";
    const s = String(lyr || "").trim().toLowerCase();
    if (!s) return false;
    return s.startsWith("[instrumental]") || s === "instrumental";
  }

  function hasLyrics(meta: any): boolean {
    const lyr = meta?.lyrics_final ?? meta?.metas?.lyrics ?? meta?.lyrics ?? "";
    const s = String(lyr || "").trim();
    if (!s) return false;
    return !isInstrumental(meta);
  }

  const filtered = useMemo(() => {
    const q = (props.search || "").trim().toLowerCase();
    const base = !q ? tracks : tracks.filter((t) => {
      const m = t.meta || {};
      const caption = m?.prompt_final || m?.metas?.caption || m?.metas?.prompt || "";
      const lyrics = m?.lyrics_final || m?.metas?.lyrics || "";
      return String(caption).toLowerCase().includes(q) || String(lyrics).toLowerCase().includes(q) || t.track_id.toLowerCase().includes(q);
    });

    const byFilters = base.filter((t) => {
      const m = t.meta || {};
      const bpm = parseNum(m?.metas?.bpm ?? m?.bpm);
      const dur = parseNum(m?.metas?.duration ?? m?.duration);
      if (durMin > 0 && dur > 0 && dur < durMin) return false;
      if (durMax > 0 && dur > 0 && dur > durMax) return false;
      if (bpmMin > 0 && bpm > 0 && bpm < bpmMin) return false;
      if (bpmMax > 0 && bpm > 0 && bpm > bpmMax) return false;
      if (onlyInstr && !isInstrumental(m)) return false;
      if (onlyLyrics && !hasLyrics(m)) return false;
      return true;
    });
    const next = base.slice();
    // apply sort after filters
    next.splice(0, next.length, ...byFilters);
    next.sort((a, b) => {
      const av = a.created_at || 0;
      const bv = b.created_at || 0;
      return sort === "newest" ? (bv - av) : (av - bv);
    });
    return next;
  }, [tracks, props.search, sort, durMin, durMax, bpmMin, bpmMax, onlyInstr, onlyLyrics]);

  async function del(trackId: string) {
    if (!confirm(`Delete ${trackId}?`)) return;
    setBusy(true);
    try {
      await api.deleteTrack(trackId);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function openFolder() {
    const out = props.cfg?.paths?.output_dir;
    if (!out) return;
    const invoke = (globalThis as any).__TAURI__?.core?.invoke;
    if (invoke) {
      invoke("open_path", { path: out }).catch(() => alert(out));
      return;
    }
    alert(out);
  }

  function clearFilters() {
    setDurMin(0);
    setDurMax(0);
    setBpmMin(0);
    setBpmMax(0);
    setOnlyInstr(false);
    setOnlyLyrics(false);
  }

  return (
    <div className="panel">
      <div className="panelHeader" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="panelTitle">{t("library_title")}</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
            {filtered.length} tracks
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="label" style={{ margin: 0 }}>{t("library_view")}</div>
            <select className="select" value={view} onChange={(e) => setView(e.target.value as any)}>
              <option value="grid">{t("library_view_grid")}</option>
              <option value="list">{t("library_view_list")}</option>
            </select>
          </div>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
          <button className="btn" onClick={load} disabled={busy}>
            <RefreshCcw size={16} />
            {t("library_refresh")}
          </button>
          <button className="btn" onClick={openFolder}>
            <FolderOpen size={16} />
            {t("library_open_folder")}
          </button>
        </div>
      </div>
      <div className="panelBody">
        {err ? <div style={{ color: "var(--danger)", marginBottom: 12 }}>{err}</div> : null}

        <div className="panel" style={{ background: "rgba(0,0,0,0.14)", marginBottom: 12 }}>
          <div className="panelBody" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div className="panelTitle" style={{ fontSize: 14 }}>{t("library_filter")}</div>
              <button className="btn" onClick={clearFilters}>{t("library_clear_filters")}</button>
            </div>
            <div className="row">
              <div className="field" style={{ marginBottom: 0 }}>
                <div className="label">{t("library_filter_duration")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input className="input" type="number" min={0} value={durMin} onChange={(e) => setDurMin(parseInt(e.target.value || "0", 10) || 0)} placeholder="min" />
                  <input className="input" type="number" min={0} value={durMax} onChange={(e) => setDurMax(parseInt(e.target.value || "0", 10) || 0)} placeholder="max" />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <div className="label">{t("library_filter_bpm")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input className="input" type="number" min={0} value={bpmMin} onChange={(e) => setBpmMin(parseInt(e.target.value || "0", 10) || 0)} placeholder="min" />
                  <input className="input" type="number" min={0} value={bpmMax} onChange={(e) => setBpmMax(parseInt(e.target.value || "0", 10) || 0)} placeholder="max" />
                </div>
              </div>
            </div>
            <div className="chips" style={{ marginBottom: 0 }}>
              <label className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={onlyInstr} onChange={(e) => setOnlyInstr(e.target.checked)} style={{ marginRight: 8 }} />
                {t("library_filter_instrumental")}
              </label>
              <label className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={onlyLyrics} onChange={(e) => setOnlyLyrics(e.target.checked)} style={{ marginRight: 8 }} />
                {t("library_filter_with_lyrics")}
              </label>
            </div>
          </div>
        </div>

        {view === "grid" ? (
          <div className="cards">
            {filtered.map((tr) => {
              const meta = tr.meta || {};
                const title =
                  meta?.prompt_final ||
                  meta?.metas?.caption ||
                  meta?.metas?.prompt ||
                  tr.track_id;
                const sub = metaLine(meta);
                const created = tr.created_at ? new Date(tr.created_at * 1000).toLocaleString() : "";
                const seed = String(tr.track_id || title || "");
                return (
                  <div className="card" key={tr.track_id}>
                    <div className="cardHero cardHeroRow">
                      <Cover seed={seed} title={String(title)} size={56} />
                      <div style={{ minWidth: 0 }}>
                        <div className="cardTitle" style={{ marginTop: 2 }}>{String(title).slice(0, 120) || tr.track_id}</div>
                        <div className="cardMeta">{sub || created}</div>
                      </div>
                    </div>
                    <div className="cardBody">
                      {tr.audio_url ? <audio controls preload="none" src={api.getBaseUrl() + tr.audio_url} style={{ width: "100%" }} /> : null}
                      <div className="cardActions">
                        <button className="btn" onClick={() => nav("/edit")}>
                          <Paintbrush2 size={16} />
                          Edit (v2)
                        </button>
                      <button className="btn btnDanger" onClick={() => del(tr.track_id)} disabled={busy}>
                        <Trash2 size={16} />
                        {t("library_delete")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="list">
            {filtered.map((tr) => {
              const meta = tr.meta || {};
              const title =
                meta?.prompt_final ||
                meta?.metas?.caption ||
                meta?.metas?.prompt ||
                tr.track_id;
              const sub = metaLine(meta);
              const created = tr.created_at ? new Date(tr.created_at * 1000).toLocaleString() : "";
              const bpm = meta?.metas?.bpm ?? meta?.bpm;
              const dur = meta?.metas?.duration ?? meta?.duration;
              const seed = String(tr.track_id || title || "");
              return (
                <div className="listRow" key={tr.track_id}>
                  <div className="listMain">
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <Cover seed={seed} title={String(title)} size={44} />
                      <div style={{ minWidth: 0 }}>
                        <div className="listTitle">{String(title).slice(0, 140) || tr.track_id}</div>
                        <div className="listMeta">
                          <span>{sub || created}</span>
                          {bpm ? <span className="mono">BPM {String(bpm)}</span> : null}
                          {dur ? <span className="mono">{String(dur)}s</span> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="listPlayer">
                    {tr.audio_url ? <audio controls preload="none" src={api.getBaseUrl() + tr.audio_url} /> : null}
                  </div>
                  <div className="listActions">
                    <button className="btn" onClick={() => nav("/edit")}>
                      <Paintbrush2 size={16} />
                      Edit (v2)
                    </button>
                    <button className="btn btnDanger" onClick={() => del(tr.track_id)} disabled={busy}>
                      <Trash2 size={16} />
                      {t("library_delete")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
