import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "./lib/api";
import type { AppConfigResponse, LibraryTrack, ReleaseTaskPayload, TaskStatusNormalized } from "./types";

import { LoaderPage } from "./pages/Loader";
import { LibraryPage } from "./pages/Library";
import { SettingsPage } from "./pages/Settings";
import { EditV2Page } from "./pages/EditV2";
import { UpdatesPage } from "./pages/Updates";
import { OpsPage } from "./pages/Ops";
import { ModelsPage } from "./pages/Models";

import GlobalNav from "./components/GlobalNav";
import SidebarInput from "./components/SidebarInput";
import MainFeed from "./components/MainFeed";
import RightDetails from "./components/RightDetails";
import BottomPlayer from "./components/BottomPlayer";

export function App() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();

  const [cfg, setCfg] = useState<AppConfigResponse | null>(null);
  const [search, setSearch] = useState("");
  const [apiBase, setApiBase] = useState(api.getBaseUrl());

  // === 공유 상태 ===
  const [libraryTracks, setLibraryTracks] = useState<LibraryTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<LibraryTrack | null>(null);
  const [playingTrack, setPlayingTrack] = useState<LibraryTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 생성 상태
  const [taskId, setTaskId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [taskStatus, setTaskStatus] = useState<TaskStatusNormalized | null>(null);

  // 설정 팝업 상태
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // --- 라이브러리 새로고침 ---
  const refreshLibrary = useCallback(async () => {
    try {
      const lib = await api.library();
      setLibraryTracks(lib || []);
    } catch {
      // ignore
    }
  }, []);

  // --- 생성 후 폴링 ---
  async function poll(id: string) {
    const started = Date.now();
    let pollMs = 1500;
    while (Date.now() - started < 15 * 60_000) {
      const status = await api.queryResultNormalized(id);
      if (status) {
        setTaskStatus(status);
        if (status.progressText) setProgress(status.progressText);
        if (status.status === 1) {
          setProgress(t("gen_succeeded"));
          await refreshLibrary();
          // 방금 만든 곡 선택
          try {
            const lib = await api.library();
            setLibraryTracks(lib || []);
            const found = lib.find((tr: any) => tr?.track_id === id) || null;
            if (found) {
              setSelectedTrack(found as any);
              setPlayingTrack(found as any);
            }
          } catch { /* ignore */ }
          return;
        }
        if (status.status === 2 || status.status === 3) {
          const base = status.status === 3 ? t("gen_canceled") : t("gen_failed");
          const detail = status.errorSummary || status.errorText || status.progressText;
          setProgress(detail ? `${base}: ${detail}` : base);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    setProgress(t("gen_timed_out"));
  }

  // --- 곡 생성 (SidebarInput에서 호출) ---
  const handleCreate = useCallback(async (payload: ReleaseTaskPayload) => {
    setBusy(true);
    setProgress("");
    setTaskId("");
    setTaskStatus(null);
    try {
      const res = await api.releaseTask(payload);
      setTaskId(res.task_id);
      setProgress(`${t("gen_queued")} (#${res.queue_position || 0})`);
      await poll(res.task_id);
    } catch (e: any) {
      setProgress(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [t]);

  // --- 곡 선택 ---
  const handleSelectTrack = useCallback((track: LibraryTrack) => {
    setSelectedTrack(track);
  }, []);

  // --- 재생 ---
  const handlePlayTrack = useCallback((track: LibraryTrack) => {
    setPlayingTrack(track);
    setIsPlaying(true);
  }, []);

  // --- Tauri/API base URL 싱크 ---
  useEffect(() => {
    (async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const healthAt = async (baseUrl: string, timeoutMs: number) => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), timeoutMs);
          const res = await fetch(baseUrl.replace(/\/+$/, "") + "/health", { signal: ctrl.signal });
          clearTimeout(t);
          return res.ok;
        } catch {
          return false;
        }
      };

      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        try {
          const tauri = (globalThis as any).__TAURI__;
          const invoke = tauri?.core?.invoke ?? tauri?.invoke ?? tauri?.tauri?.invoke;
          if (invoke) {
            const url = (await invoke("backend_url")) as string;
            if (url && typeof url === "string") {
              api.setBaseUrl(url);
              setApiBase(api.getBaseUrl());
              return;
            }
          }
        } catch {
          // ignore
        }

        const cur = api.getBaseUrl();
        const fallback = "http://127.0.0.1:8001";
        if (cur !== fallback) {
          const okFallback = await healthAt(fallback, 800);
          if (okFallback) {
            api.setBaseUrl(fallback);
            setApiBase(api.getBaseUrl());
            return;
          }
        }
        await sleep(250);
      }
    })();
  }, []);

  useEffect(() => {
    const onBase = (e: any) => setApiBase(String(e?.detail || api.getBaseUrl()));
    globalThis.addEventListener("ace_step_studio_api_base_changed", onBase as any);
    return () => globalThis.removeEventListener("ace_step_studio_api_base_changed", onBase as any);
  }, []);

  useEffect(() => {
    if (cfg?.config?.language) i18n.changeLanguage(cfg.config.language);
  }, [cfg, i18n]);

  // config가 설정되면 라이브러리 불러오기
  useEffect(() => {
    if (cfg) {
      refreshLibrary();
    }
  }, [cfg, refreshLibrary]);

  // Background config fetcher
  useEffect(() => {
    let cancelled = false;
    if (cfg) return;
    (async () => {
      const start = Date.now();
      const maxWaitMs = 6 * 60_000;
      while (!cancelled && Date.now() - start < maxWaitMs) {
        const ok = await api.health();
        if (!ok) {
          await sleep(1500);
          continue;
        }
        try {
          const c = await api.getAppConfig();
          if (cancelled) return;
          setCfg(c);
          if (c?.config?.api_key) api.setApiKey(c.config.api_key);
          return;
        } catch {
          await sleep(1500);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cfg]);

  return (
    <>
      <div className="app-container">
        <GlobalNav onOpenSettings={() => setIsSettingsOpen(true)} />
        <SidebarInput
          cfg={cfg}
          onConfig={setCfg}
          onSubmit={handleCreate}
          busy={busy}
          progress={progress}
        />

        {/* Main Feed Content Area */}
        <div className="main-feed">
          <Routes>
            <Route path="/" element={<LoaderPage onConfig={setCfg} />} />
            <Route path="/home" element={
              <MainFeed
                cfg={cfg}
                tracks={libraryTracks}
                selectedTrack={selectedTrack}
                onSelectTrack={handleSelectTrack}
                onPlayTrack={handlePlayTrack}
                onRefresh={refreshLibrary}
                busy={busy}
                progress={progress}
              />
            } />
            <Route path="/compose" element={
              <MainFeed
                cfg={cfg}
                tracks={libraryTracks}
                selectedTrack={selectedTrack}
                onSelectTrack={handleSelectTrack}
                onPlayTrack={handlePlayTrack}
                onRefresh={refreshLibrary}
                busy={busy}
                progress={progress}
              />
            } />
            <Route path="/create" element={
              <MainFeed
                cfg={cfg}
                tracks={libraryTracks}
                selectedTrack={selectedTrack}
                onSelectTrack={handleSelectTrack}
                onPlayTrack={handlePlayTrack}
                onRefresh={refreshLibrary}
                busy={busy}
                progress={progress}
              />
            } />
            <Route path="/library" element={<LibraryPage cfg={cfg} search={search} />} />
            <Route path="/edit" element={<EditV2Page cfg={cfg} />} />
            <Route path="/ops" element={<OpsPage cfg={cfg} />} />
            <Route path="/models" element={<ModelsPage cfg={cfg} />} />
            <Route path="/updates" element={<UpdatesPage />} />
            <Route path="*" element={
              <MainFeed
                cfg={cfg}
                tracks={libraryTracks}
                selectedTrack={selectedTrack}
                onSelectTrack={handleSelectTrack}
                onPlayTrack={handlePlayTrack}
                onRefresh={refreshLibrary}
                busy={busy}
                progress={progress}
              />
            } />
          </Routes>
        </div>

        <RightDetails
          track={selectedTrack}
          onClose={() => setSelectedTrack(null)}
          onPlay={handlePlayTrack}
          apiBase={api.getBaseUrl()}
        />
      </div>

      <BottomPlayer
        track={playingTrack}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        apiBase={api.getBaseUrl()}
      />

      {isSettingsOpen && (
        <SettingsPage
          cfg={cfg}
          onConfig={setCfg}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </>
  );
}
