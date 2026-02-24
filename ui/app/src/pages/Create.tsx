import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wand2, Square, Shuffle, Sparkles } from "lucide-react";
import { useLocation } from "react-router-dom";

import type { AppConfigResponse, LibraryTrack, ReleaseTaskPayload, SampleType, TaskStatusNormalized } from "../types";
import { api, CREATE_LAST_SUBMIT_KEY } from "../lib/api";
import { FAILURE_RECOVERY_V1, FAILURE_RECOVERY_V2 } from "../lib/flags";
import { openPath } from "../lib/tauri";
import { Cover } from "../components/Cover";
import { ProgressBar } from "../components/ProgressBar";
import { TaskStatusPanel } from "../components/TaskStatusPanel";

const CREATE_LAST_SETTINGS_KEY = "ace_step_studio_create_last_settings_v1";

type PersistedCreateSettings = {
  prompt: string;
  lyrics: string;
  instrumental: boolean;
  thinking: boolean;
  duration: number;
  batch: number;
  seed: number;
  useRandomSeed: boolean;
  vocalLang: string;
  audioFormat: "mp3" | "wav" | "flac";
  sampleMode: boolean;
  sampleQuery: string;
  sampleType: SampleType;
  useFormat: boolean;
  bpm: number | null;
  keyScale: string;
  timeSignature: string;
  inferenceSteps: number;
  guidanceScale: number;
  useAdg: boolean;
  cfgIntervalStart: number;
  cfgIntervalEnd: number;
  shift: number;
  inferMethod: "ode" | "sde";
  timesteps: string;
  model: string;
  lmModel: string;
  lmBackend: "pt" | "vllm";
  lmTemperature: number;
  lmCfgScale: number;
  lmTopK: number | null;
  lmTopP: number;
  lmRepetitionPenalty: number;
  lmNegativePrompt: string;
  constrainedDecoding: boolean;
  savedAt: number;
};

type UiIssue = {
  code: string;
  message: string;
  field?: string | null;
};

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function clampFloat(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function parsePersistedCreateSettings(): Partial<PersistedCreateSettings> | null {
  try {
    const raw = localStorage.getItem(CREATE_LAST_SETTINGS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Partial<PersistedCreateSettings>;
  } catch {
    return null;
  }
}

function parseCreateLastSubmit(): ReleaseTaskPayload | null {
  try {
    const raw = localStorage.getItem(CREATE_LAST_SUBMIT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const payload = (parsed as any)?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as ReleaseTaskPayload;
  } catch {
    return null;
  }
}

function toParentPath(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.replace(/[\\/][^\\/]+$/, "");
}

export function CreatePage(props: { cfg: AppConfigResponse | null; onConfig: (c: AppConfigResponse | null) => void }) {
  const { t } = useTranslation();
  const loc = useLocation();
  const restoringRef = useRef(true);

  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("[Instrumental]");
  const [instrumental, setInstrumental] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [duration, setDuration] = useState(20);
  const [batch, setBatch] = useState(1);
  const [seed, setSeed] = useState(-1);
  const [useRandomSeed, setUseRandomSeed] = useState(true);
  const [vocalLang, setVocalLang] = useState("en");
  const [audioFormat, setAudioFormat] = useState<"mp3" | "wav" | "flac">("mp3");

  const [sampleMode, setSampleMode] = useState(false);
  const [sampleQuery, setSampleQuery] = useState("");
  const [sampleType, setSampleType] = useState<SampleType>("simple_mode");
  const [useFormat, setUseFormat] = useState(false);

  const [bpm, setBpm] = useState<number | "">("");
  const [keyScale, setKeyScale] = useState("");
  const [timeSignature, setTimeSignature] = useState("");

  const [inferenceSteps, setInferenceSteps] = useState(8);
  const [guidanceScale, setGuidanceScale] = useState(7.0);
  const [useAdg, setUseAdg] = useState(false);
  const [cfgIntervalStart, setCfgIntervalStart] = useState(0.0);
  const [cfgIntervalEnd, setCfgIntervalEnd] = useState(1.0);
  const [shift, setShift] = useState(3.0);
  const [inferMethod, setInferMethod] = useState<"ode" | "sde">("ode");
  const [timesteps, setTimesteps] = useState("");

  const ditModel = props.cfg?.config?.dit_model || "acestep-v15-turbo";
  const [model, setModel] = useState(ditModel);

  const lmModelDefault = props.cfg?.config?.lm_model || "acestep-5Hz-lm-4B";
  const [lmModel, setLmModel] = useState(lmModelDefault);
  const lmBackendDefault = props.cfg?.config?.lm_backend || "pt";
  const [lmBackend, setLmBackend] = useState<"pt" | "vllm">(lmBackendDefault as any);

  const [lmTemperature, setLmTemperature] = useState(0.85);
  const [lmCfgScale, setLmCfgScale] = useState(2.5);
  const [lmTopK, setLmTopK] = useState<number | "">("");
  const [lmTopP, setLmTopP] = useState(0.9);
  const [lmRepetitionPenalty, setLmRepetitionPenalty] = useState(1.0);
  const [lmNegativePrompt, setLmNegativePrompt] = useState("NO USER INPUT");
  const [constrainedDecoding, setConstrainedDecoding] = useState(true);

  const [toolBusy, setToolBusy] = useState(false);
  const [taskId, setTaskId] = useState<string>("");
  const [progress, setProgress] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [resultTrack, setResultTrack] = useState<LibraryTrack | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatusNormalized | null>(null);
  const [lastSubmitPayload, setLastSubmitPayload] = useState<ReleaseTaskPayload | null>(null);
  const [pendingRetryClone, setPendingRetryClone] = useState(false);
  const [preflightBlocking, setPreflightBlocking] = useState<UiIssue[]>([]);
  const [preflightWarnings, setPreflightWarnings] = useState<UiIssue[]>([]);

  const availableDit = props.cfg?.runtime?.available_dit_models?.length
    ? props.cfg.runtime.available_dit_models
    : ["acestep-v15-turbo"];
  const availableLm = props.cfg?.runtime?.available_lm_models?.length
    ? props.cfg.runtime.available_lm_models
    : ["acestep-5Hz-lm-4B", "acestep-5Hz-lm-1.7B", "acestep-5Hz-lm-0.6B"];

  const canCancel = !!taskId && busy;
  const canRetryClone = !!lastSubmitPayload && !busy;
  const showRecoveryPanel = FAILURE_RECOVERY_V1 || FAILURE_RECOVERY_V2;

  useEffect(() => {
    const sp = new URLSearchParams(loc.search || "");
    const q = (sp.get("prompt") || "").trim();
    if (q) setPrompt(q);
  }, [loc.search]);

  useEffect(() => {
    setLastSubmitPayload(parseCreateLastSubmit());
  }, []);

  useEffect(() => {
    const saved = parsePersistedCreateSettings();
    const hasPromptInQuery = !!(new URLSearchParams(loc.search || "").get("prompt") || "").trim();
    if (!saved) {
      restoringRef.current = false;
      return;
    }

    if (typeof saved.prompt === "string" && !hasPromptInQuery) setPrompt(saved.prompt);
    if (typeof saved.lyrics === "string") setLyrics(saved.lyrics);
    if (typeof saved.instrumental === "boolean") setInstrumental(saved.instrumental);
    if (typeof saved.thinking === "boolean") setThinking(saved.thinking);
    if (typeof saved.duration === "number" && Number.isFinite(saved.duration)) {
      setDuration(clampInt(saved.duration, 10, 600));
    }
    if (typeof saved.batch === "number" && Number.isFinite(saved.batch)) {
      setBatch(clampInt(saved.batch, 1, 8));
    }
    if (typeof saved.seed === "number" && Number.isFinite(saved.seed)) {
      setSeed(Math.round(saved.seed));
    }
    if (typeof saved.useRandomSeed === "boolean") setUseRandomSeed(saved.useRandomSeed);
    if (typeof saved.vocalLang === "string") setVocalLang(saved.vocalLang);
    if (saved.audioFormat === "mp3" || saved.audioFormat === "wav" || saved.audioFormat === "flac") {
      setAudioFormat(saved.audioFormat);
    }
    if (typeof saved.sampleMode === "boolean") setSampleMode(saved.sampleMode);
    if (typeof saved.sampleQuery === "string") setSampleQuery(saved.sampleQuery);
    if (saved.sampleType === "simple_mode" || saved.sampleType === "custom_mode") {
      setSampleType(saved.sampleType);
    }
    if (typeof saved.useFormat === "boolean") setUseFormat(saved.useFormat);
    if (typeof saved.bpm === "number" && Number.isFinite(saved.bpm)) {
      setBpm(clampInt(saved.bpm, 30, 300));
    } else if (saved.bpm === null) {
      setBpm("");
    }
    if (typeof saved.keyScale === "string") setKeyScale(saved.keyScale);
    if (typeof saved.timeSignature === "string") setTimeSignature(saved.timeSignature);
    if (typeof saved.inferenceSteps === "number" && Number.isFinite(saved.inferenceSteps)) {
      const baseModel = typeof saved.model === "string" ? saved.model : model;
      setInferenceSteps(clampInt(saved.inferenceSteps, 1, /turbo/i.test(baseModel) ? 20 : 200));
    }
    if (typeof saved.guidanceScale === "number" && Number.isFinite(saved.guidanceScale)) {
      setGuidanceScale(saved.guidanceScale);
    }
    if (typeof saved.useAdg === "boolean") setUseAdg(saved.useAdg);
    if (typeof saved.cfgIntervalStart === "number" && Number.isFinite(saved.cfgIntervalStart)) {
      setCfgIntervalStart(clampFloat(saved.cfgIntervalStart, 0, 1));
    }
    if (typeof saved.cfgIntervalEnd === "number" && Number.isFinite(saved.cfgIntervalEnd)) {
      setCfgIntervalEnd(clampFloat(saved.cfgIntervalEnd, 0, 1));
    }
    if (typeof saved.shift === "number" && Number.isFinite(saved.shift)) {
      setShift(saved.shift);
    }
    if (saved.inferMethod === "ode" || saved.inferMethod === "sde") setInferMethod(saved.inferMethod);
    if (typeof saved.timesteps === "string") setTimesteps(saved.timesteps);
    if (typeof saved.model === "string") setModel(saved.model);
    if (typeof saved.lmModel === "string") setLmModel(saved.lmModel);
    if (saved.lmBackend === "pt" || saved.lmBackend === "vllm") setLmBackend(saved.lmBackend);
    if (typeof saved.lmTemperature === "number" && Number.isFinite(saved.lmTemperature)) {
      setLmTemperature(saved.lmTemperature);
    }
    if (typeof saved.lmCfgScale === "number" && Number.isFinite(saved.lmCfgScale)) {
      setLmCfgScale(saved.lmCfgScale);
    }
    if (typeof saved.lmTopK === "number" && Number.isFinite(saved.lmTopK)) {
      setLmTopK(Math.max(0, Math.round(saved.lmTopK)));
    } else if (saved.lmTopK === null) {
      setLmTopK("");
    }
    if (typeof saved.lmTopP === "number" && Number.isFinite(saved.lmTopP)) {
      setLmTopP(clampFloat(saved.lmTopP, 0, 1));
    }
    if (typeof saved.lmRepetitionPenalty === "number" && Number.isFinite(saved.lmRepetitionPenalty)) {
      setLmRepetitionPenalty(saved.lmRepetitionPenalty);
    }
    if (typeof saved.lmNegativePrompt === "string") setLmNegativePrompt(saved.lmNegativePrompt);
    if (typeof saved.constrainedDecoding === "boolean") setConstrainedDecoding(saved.constrainedDecoding);

    restoringRef.current = false;
  }, [loc.search]);

  useEffect(() => {
    if (busy) return;
    if (!pendingRetryClone) return;
    if (!lastSubmitPayload) {
      setPendingRetryClone(false);
      return;
    }
    setPendingRetryClone(false);
    void retryCloneSubmit();
  }, [busy, pendingRetryClone, lastSubmitPayload]);

  useEffect(() => {
    if (!busy || !startedAt) return;
    const id = setInterval(() => setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 500);
    return () => clearInterval(id);
  }, [busy, startedAt]);

  async function openLogsFromUi() {
    const cached = api.getCachedAppPaths();
    const configDir = toParentPath(cached?.config_path || "");
    const target = configDir || cached?.output_dir || "";
    if (target) {
      const ok = await openPath(target);
      if (ok) return;
    }
    setProgress(t("task_log_path_missing"));
  }

  function persistCreateLastSubmit(payload: ReleaseTaskPayload) {
    try {
      localStorage.setItem(CREATE_LAST_SUBMIT_KEY, JSON.stringify({ payload, savedAt: Date.now() }));
      setLastSubmitPayload(payload);
    } catch {
      // ignore
    }
  }

  async function poll(id: string) {
    const clampPollMs = (v: number) => Math.max(1500, Math.min(10000, Math.round(v || 1500)));
    const started = Date.now();
    let pollMs = 1500;
    let stableForMs = 0;
    let lastStage = "";
    let lastProgress = -1;
    let lastProgressText = "";
    while (Date.now() - started < 15 * 60_000) {
      const status = await api.queryResultNormalized(id);
      if (status) {
        setTaskStatus(status);
        if (status.progressText) setProgress(status.progressText);
        const stage = String(status.stage || "");
        const prog = Number.isFinite(status.progress) ? Number(status.progress) : 0;
        const ptxt = String(status.progressText || "");
        const changed = stage !== lastStage || Math.abs(prog - lastProgress) > 1e-6 || ptxt !== lastProgressText;
        if (changed) {
          stableForMs = 0;
          lastStage = stage;
          lastProgress = prog;
          lastProgressText = ptxt;
          pollMs = 1500;
        } else {
          stableForMs += pollMs;
        }
        const serverPollMs =
          typeof status.nextPollMs === "number" && Number.isFinite(status.nextPollMs)
            ? clampPollMs(status.nextPollMs)
            : null;
        if (serverPollMs != null) {
          pollMs = serverPollMs;
        } else if (status.healthState === "stalled") pollMs = 7000;
        else if (stableForMs >= 60_000) pollMs = 5000;
        else if (stableForMs >= 20_000) pollMs = 3000;
        else pollMs = 1500;
        if (typeof document !== "undefined" && document.hidden) {
          pollMs = clampPollMs(Math.max(pollMs, 5000));
        }
        if (status.status === 1) {
          setProgress(t("gen_succeeded"));
          try {
            const lib = await api.library();
            const found = lib.find((tr: any) => tr?.track_id === id) || null;
            setResultTrack(found as any);
          } catch {
            // ignore
          }
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

  async function runPreflight(body: ReleaseTaskPayload): Promise<boolean> {
    setPreflightBlocking([]);
    setPreflightWarnings([]);
    try {
      const pre = await api.preflight({
        payload: body,
        client_files: {},
        client_audio: {},
      });
      const blocking = Array.isArray(pre?.blocking_errors) ? (pre.blocking_errors as UiIssue[]) : [];
      const warnings = Array.isArray(pre?.warnings) ? (pre.warnings as UiIssue[]) : [];
      setPreflightBlocking(blocking);
      setPreflightWarnings(warnings);
      if (blocking.length > 0) {
        const msg = String(blocking[0]?.message || t("preflight_blocked_title"));
        setProgress(msg);
        return false;
      }
      if (warnings.length > 0) {
        setProgress(String(warnings[0]?.message || t("preflight_warning_title")));
      }
      return true;
    } catch (e: any) {
      setProgress(e?.message || String(e));
      return false;
    }
  }

  async function applyFormat() {
    setToolBusy(true);
    try {
      const formatted = await api.formatInput({
        prompt: prompt.trim(),
        lyrics: instrumental ? "[Instrumental]" : lyrics.trim(),
        temperature: lmTemperature,
        param_obj: {
          duration: duration,
          bpm: typeof bpm === "number" ? bpm : undefined,
          key: keyScale || undefined,
          time_signature: timeSignature || undefined,
          language: vocalLang || undefined,
        },
      });
      if (formatted.caption) setPrompt(String(formatted.caption));
      if (formatted.lyrics) setLyrics(String(formatted.lyrics));
      if (formatted.duration && Number.isFinite(formatted.duration)) setDuration(Number(formatted.duration));
      if (formatted.bpm && Number.isFinite(formatted.bpm)) setBpm(Number(formatted.bpm));
      const ks = formatted.key_scale || formatted.keyscale;
      const ts = formatted.time_signature || formatted.timesignature;
      if (ks) setKeyScale(String(ks));
      if (ts) setTimeSignature(String(ts));
      if (formatted.vocal_language) setVocalLang(String(formatted.vocal_language));
      setUseFormat(true);
    } catch (e: any) {
      setProgress(e?.message || String(e));
    } finally {
      setToolBusy(false);
    }
  }

  async function applyRandomSample() {
    setToolBusy(true);
    try {
      const sample = await api.createRandomSample(sampleType);
      const samplePrompt = String(sample.caption || sample.prompt || "").trim();
      const sampleLyrics = String(sample.lyrics || "").trim();
      if (samplePrompt) setPrompt(samplePrompt);
      if (sampleLyrics) {
        setLyrics(sampleLyrics);
        setInstrumental(!sampleLyrics || sampleLyrics.toLowerCase().startsWith("[instrumental]"));
      }
      const ks = sample.key_scale || sample.keyscale;
      const ts = sample.time_signature || sample.timesignature;
      if (sample.duration && Number.isFinite(sample.duration)) setDuration(Number(sample.duration));
      if (sample.bpm && Number.isFinite(sample.bpm)) setBpm(Number(sample.bpm));
      if (ks) setKeyScale(String(ks));
      if (ts) setTimeSignature(String(ts));
      if (sample.vocal_language) setVocalLang(String(sample.vocal_language));
      setSampleMode(true);
      if (!sampleQuery.trim()) setSampleQuery(samplePrompt);
    } catch (e: any) {
      setProgress(e?.message || String(e));
    } finally {
      setToolBusy(false);
    }
  }

  async function runSubmit(body: ReleaseTaskPayload, opts?: { keepSnapshot?: boolean }) {
    if (FAILURE_RECOVERY_V2) {
      const ok = await runPreflight(body);
      if (!ok) return;
    } else {
      setPreflightBlocking([]);
      setPreflightWarnings([]);
    }

    setBusy(true);
    setStartedAt(Date.now());
    setElapsedSec(0);
    setProgress("");
    setTaskId("");
    setResultTrack(null);
    setTaskStatus(null);

    try {
      if (!opts?.keepSnapshot) persistCreateLastSubmit(body);
      const res = await api.releaseTask(body);
      setTaskId(res.task_id);
      setProgress(`${t("gen_queued")} (#${res.queue_position || 0})`);
      await poll(res.task_id);
    } catch (e: any) {
      setProgress(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const cotEnabled = !!thinking;
    const body: ReleaseTaskPayload = {
      prompt: prompt.trim(),
      lyrics: instrumental ? "[Instrumental]" : lyrics.trim(),
      vocal_language: vocalLang.trim() || "en",
      thinking,
      batch_size: Math.max(1, Math.min(8, batch | 0)),
      seed: useRandomSeed ? -1 : seed,
      use_random_seed: useRandomSeed,
      audio_duration: Math.max(10, Math.min(600, duration | 0)),
      audio_format: audioFormat,

      // format / sample pipeline
      sample_mode: sampleMode,
      sample_query: sampleQuery.trim(),
      use_format: useFormat,

      // DiT / model controls
      model,
      inference_steps: Math.max(1, Math.min(/turbo/i.test(model) ? 20 : 200, inferenceSteps | 0)),
      guidance_scale: Number.isFinite(guidanceScale) ? guidanceScale : 7.0,
      use_adg: useAdg,
      cfg_interval_start: cfgIntervalStart,
      cfg_interval_end: cfgIntervalEnd,
      shift,
      infer_method: inferMethod,
      timesteps: timesteps.trim() || undefined,

      // metadata
      bpm: typeof bpm === "number" ? bpm : undefined,
      key_scale: keyScale.trim() || undefined,
      time_signature: timeSignature.trim() || undefined,

      // LM controls
      lm_model_path: lmModel,
      lm_backend: lmBackend,
      lm_temperature: lmTemperature,
      lm_cfg_scale: lmCfgScale,
      lm_top_k: typeof lmTopK === "number" ? lmTopK : undefined,
      lm_top_p: lmTopP,
      lm_repetition_penalty: lmRepetitionPenalty,
      lm_negative_prompt: lmNegativePrompt,
      constrained_decoding: constrainedDecoding,
      use_cot_metas: cotEnabled,
      use_cot_caption: cotEnabled,
      use_cot_language: cotEnabled,
    };
    await runSubmit(body);
  }

  async function retryCloneSubmit() {
    if (!lastSubmitPayload || busy) return;
    await runSubmit(lastSubmitPayload, { keepSnapshot: true });
  }

  async function cancelAndRetry() {
    if (!lastSubmitPayload) return;
    if (busy && taskId) {
      setPendingRetryClone(true);
      await cancel();
      return;
    }
    await retryCloneSubmit();
  }

  async function cancel() {
    if (!taskId) return;
    setProgress(t("gen_cancel_requested"));
    try {
      const res = await api.cancelTask(taskId);
      if (res?.status === "canceled") setProgress(t("gen_canceled"));
    } catch (e: any) {
      setProgress(e?.message || String(e));
    }
  }

  const hint = useMemo(() => {
    const tier = props.cfg?.runtime?.gpu_tier || "";
    const rec = props.cfg?.runtime?.recommended_lm_model || "";
    return tier || rec ? `${tier ? `GPU ${tier}` : ""}${tier && rec ? " · " : ""}${rec ? `LM rec ${rec}` : ""}` : "";
  }, [props.cfg]);

  const thinkingHint = useMemo(() => {
    return thinking
      ? "Thinking ON: 5Hz LM plans structure/metadata and may improve quality (slower, more VRAM)."
      : "Thinking OFF: DiT generates directly (faster, less VRAM).";
  }, [thinking]);

  const persistedSettings = useMemo<PersistedCreateSettings>(() => ({
    prompt,
    lyrics,
    instrumental,
    thinking,
    duration,
    batch,
    seed,
    useRandomSeed,
    vocalLang,
    audioFormat,
    sampleMode,
    sampleQuery,
    sampleType,
    useFormat,
    bpm: typeof bpm === "number" ? bpm : null,
    keyScale,
    timeSignature,
    inferenceSteps,
    guidanceScale,
    useAdg,
    cfgIntervalStart,
    cfgIntervalEnd,
    shift,
    inferMethod,
    timesteps,
    model,
    lmModel,
    lmBackend,
    lmTemperature,
    lmCfgScale,
    lmTopK: typeof lmTopK === "number" ? lmTopK : null,
    lmTopP,
    lmRepetitionPenalty,
    lmNegativePrompt,
    constrainedDecoding,
    savedAt: Date.now(),
  }), [
    prompt, lyrics, instrumental, thinking, duration, batch, seed, useRandomSeed, vocalLang, audioFormat,
    sampleMode, sampleQuery, sampleType, useFormat, bpm, keyScale, timeSignature, inferenceSteps,
    guidanceScale, useAdg, cfgIntervalStart, cfgIntervalEnd, shift, inferMethod, timesteps, model,
    lmModel, lmBackend, lmTemperature, lmCfgScale, lmTopK, lmTopP, lmRepetitionPenalty, lmNegativePrompt,
    constrainedDecoding,
  ]);

  useEffect(() => {
    if (restoringRef.current) return;
    try {
      localStorage.setItem(CREATE_LAST_SETTINGS_KEY, JSON.stringify(persistedSettings));
    } catch {
      // ignore
    }
  }, [persistedSettings]);

  return (
    <div className="grid2">
      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">{t("create_title")}</div>
          {hint ? <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>{hint}</div> : null}
          <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>{thinkingHint}</div>
        </div>
        <div className="panelBody">
          <div className="field">
            <div className="label">{t("create_prompt")}</div>
            <textarea className="textarea promptTextarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("create_prompt_ph")} />
          </div>

          <div className="field">
            <div className="label">{t("create_lyrics")}</div>
            <textarea
              className="textarea"
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={t("create_lyrics_ph")}
              disabled={instrumental}
            />
          </div>

          <div className="chips" style={{ marginBottom: 12 }}>
            <label className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} style={{ marginRight: 8 }} />
              {t("create_instrumental")}
            </label>
            <label className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={thinking} onChange={(e) => setThinking(e.target.checked)} style={{ marginRight: 8 }} />
              {t("create_thinking")}
            </label>
            <label className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={sampleMode} onChange={(e) => setSampleMode(e.target.checked)} style={{ marginRight: 8 }} />
              {t("create_sample_mode")}
            </label>
            <label className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={useFormat} onChange={(e) => setUseFormat(e.target.checked)} style={{ marginRight: 8 }} />
              {t("create_use_format")}
            </label>
          </div>

          <div className="row">
            <div className="field">
              <div className="label">{t("create_duration")}</div>
              <input className="input" type="number" min={10} max={600} value={duration} onChange={(e) => setDuration(parseInt(e.target.value || "0", 10))} />
            </div>
            <div className="field">
              <div className="label">{t("create_batch")}</div>
              <input className="input" type="number" min={1} max={8} value={batch} onChange={(e) => setBatch(parseInt(e.target.value || "1", 10))} />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <div className="label">{t("create_seed")}</div>
              <input className="input" type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value || "-1", 10))} disabled={useRandomSeed} />
            </div>
            <div className="field">
              <div className="label">Vocal language</div>
              <input className="input" value={vocalLang} onChange={(e) => setVocalLang(e.target.value)} placeholder="en" />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <div className="label">{t("create_bpm")}</div>
              <input className="input" type="number" min={30} max={300} value={bpm} onChange={(e) => setBpm(e.target.value === "" ? "" : parseInt(e.target.value, 10))} />
            </div>
            <div className="field">
              <div className="label">{t("create_time_signature")}</div>
              <input className="input" value={timeSignature} onChange={(e) => setTimeSignature(e.target.value)} placeholder="4" />
            </div>
          </div>

          <div className="field">
            <div className="label">{t("create_key_scale")}</div>
            <input className="input" value={keyScale} onChange={(e) => setKeyScale(e.target.value)} placeholder="C Major" />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn btnPrimary" onClick={submit} disabled={busy || (!prompt.trim() && !sampleMode)}>
              <Wand2 size={16} />
              {t("create_submit")}
            </button>
            <button className="btn btnDanger" onClick={cancel} disabled={!canCancel}>
              <Square size={16} />
              {t("create_cancel")}
            </button>
            <button className="btn" onClick={applyFormat} disabled={busy || toolBusy || !prompt.trim()}>
              <Sparkles size={16} />
              {t("create_apply_format")}
            </button>
            <button className="btn" onClick={applyRandomSample} disabled={busy || toolBusy}>
              <Shuffle size={16} />
              {t("create_random_sample")}
            </button>
          </div>

          {FAILURE_RECOVERY_V2 && (preflightBlocking.length > 0 || preflightWarnings.length > 0) ? (
            <div className={`preflightPanel ${preflightBlocking.length > 0 ? "preflightPanelError" : "preflightPanelWarn"}`}>
              {preflightBlocking.length > 0 ? <div className="label">{t("preflight_blocked_title")}</div> : null}
              {preflightWarnings.length > 0 ? <div className="label">{t("preflight_warning_title")}</div> : null}
              {preflightBlocking.map((x, idx) => (
                <div key={`b-${idx}-${x.code}`} className="preflightIssueCard">
                  <strong>{x.code}</strong>: {x.message}{x.field ? ` (${x.field})` : ""}
                </div>
              ))}
              {preflightWarnings.map((x, idx) => (
                <div key={`w-${idx}-${x.code}`} className="preflightWarningCard">
                  <strong>{x.code}</strong>: {x.message}{x.field ? ` (${x.field})` : ""}
                </div>
              ))}
            </div>
          ) : null}

          <ProgressBar active={busy} label={t("gen_in_progress")} subLabel={`${t("gen_elapsed")} ${elapsedSec}s${progress ? ` · ${progress}` : ""}`} />

          {showRecoveryPanel && (busy || !!taskStatus || !!taskId || !!progress) ? (
            <TaskStatusPanel
              status={taskStatus}
              busy={busy}
              elapsedSec={elapsedSec}
              taskId={taskId}
              onCancel={cancel}
              canCancel={canCancel}
              onRetryClone={retryCloneSubmit}
              retryCloneEnabled={canRetryClone}
              onCancelAndRetry={cancelAndRetry}
              cancelAndRetryEnabled={!!lastSubmitPayload}
              onOpenLogs={openLogsFromUi}
            />
          ) : progress ? (
            <div style={{ marginTop: 12, color: /failed|error|실패/i.test(progress) ? "var(--danger)" : "var(--muted)" }}>
              <div className="mono">{progress}</div>
              {taskId ? <div className="mono" style={{ marginTop: 6, color: "var(--faint)" }}>Task: {taskId}</div> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">{t("create_tools_title")}</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>{t("create_tools_sub")}</div>
        </div>
        <div className="panelBody">
          {resultTrack ? (
            <div className="resultCard">
              <div className="resultCardTop">
                <Cover seed={resultTrack.track_id} title={String((resultTrack.meta as any)?.prompt_final || resultTrack.track_id)} size={64} />
                <div style={{ minWidth: 0 }}>
                  <div className="resultTitle">
                    {String((resultTrack.meta as any)?.prompt_final || (resultTrack.meta as any)?.metas?.caption || resultTrack.track_id).slice(0, 120)}
                  </div>
                  <div className="mono" style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>
                    {new Date((resultTrack.created_at || 0) * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
              {resultTrack.audio_url ? <audio controls preload="none" src={api.getBaseUrl() + resultTrack.audio_url} style={{ width: "100%", marginTop: 10 }} /> : null}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <button className="btn" onClick={() => (window.location.hash = "#/edit")}>Edit (v2)</button>
                <button className="btn" onClick={() => window.location.hash = "#/library"}>Open in Library</button>
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>{t("create_tools_empty")}</div>
          )}

          <div style={{ height: 14 }} />

          <details className="details" open>
            <summary className="detailsSummary">{t("create_advanced")}</summary>
            <div className="detailsBody">
              <div className="field">
                <div className="label">{t("create_model")}</div>
                <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
                  {availableDit.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="row">
                <div className="field">
                  <div className="label">{t("create_lm_model")}</div>
                  <select className="select" value={lmModel} onChange={(e) => setLmModel(e.target.value)}>
                    {availableLm.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field">
                  <div className="label">{t("create_lm_backend")}</div>
                  <select className="select" value={lmBackend} onChange={(e) => setLmBackend(e.target.value as any)}>
                    <option value="pt">pt</option>
                    <option value="vllm">vllm</option>
                  </select>
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <div className="label">{t("create_audio_format")}</div>
                  <select className="select" value={audioFormat} onChange={(e) => setAudioFormat(e.target.value as any)}>
                    <option value="mp3">mp3</option>
                    <option value="wav">wav</option>
                    <option value="flac">flac</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">{t("create_use_random_seed")}</div>
                  <select className="select" value={useRandomSeed ? "yes" : "no"} onChange={(e) => setUseRandomSeed(e.target.value === "yes")}>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <div className="label">{t("create_sample_query")}</div>
                <input className="input" value={sampleQuery} onChange={(e) => setSampleQuery(e.target.value)} placeholder="Description for sample mode" />
              </div>

              <div className="field">
                <div className="label">{t("create_sample_type")}</div>
                <select className="select" value={sampleType} onChange={(e) => setSampleType(e.target.value as SampleType)}>
                  <option value="simple_mode">simple_mode</option>
                  <option value="custom_mode">custom_mode</option>
                </select>
              </div>

              <div className="row">
                <div className="field">
                  <div className="label">{t("create_inference_steps")}</div>
                  <input className="input" type="number" min={1} max={/turbo/i.test(model) ? 20 : 200} value={inferenceSteps} onChange={(e) => setInferenceSteps(parseInt(e.target.value || "8", 10))} />
                </div>
                <div className="field">
                  <div className="label">{t("create_guidance_scale")}</div>
                  <input className="input" type="number" step={0.1} value={guidanceScale} onChange={(e) => setGuidanceScale(parseFloat(e.target.value || "7"))} />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <div className="label">{t("create_infer_method")}</div>
                  <select className="select" value={inferMethod} onChange={(e) => setInferMethod(e.target.value as any)}>
                    <option value="ode">ode</option>
                    <option value="sde">sde</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">{t("create_shift")}</div>
                  <input className="input" type="number" step={0.1} value={shift} onChange={(e) => setShift(parseFloat(e.target.value || "3"))} />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <div className="label">{t("create_cfg_start")}</div>
                  <input className="input" type="number" min={0} max={1} step={0.01} value={cfgIntervalStart} onChange={(e) => setCfgIntervalStart(parseFloat(e.target.value || "0"))} />
                </div>
                <div className="field">
                  <div className="label">{t("create_cfg_end")}</div>
                  <input className="input" type="number" min={0} max={1} step={0.01} value={cfgIntervalEnd} onChange={(e) => setCfgIntervalEnd(parseFloat(e.target.value || "1"))} />
                </div>
              </div>

              <div className="field">
                <div className="label">{t("create_timesteps")}</div>
                <input className="input mono" value={timesteps} onChange={(e) => setTimesteps(e.target.value)} placeholder="0.97,0.76,0.615,..." />
              </div>

              <div className="chips" style={{ marginBottom: 12 }}>
                <label className="chip" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={useAdg} onChange={(e) => setUseAdg(e.target.checked)} style={{ marginRight: 8 }} />
                  {t("create_use_adg")}
                </label>
                <label className="chip" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={constrainedDecoding} onChange={(e) => setConstrainedDecoding(e.target.checked)} style={{ marginRight: 8 }} />
                  {t("create_constrained")}
                </label>
              </div>

              <div className="row">
                <div className="field">
                  <div className="label">{t("create_lm_temp")}</div>
                  <input className="input" type="number" step={0.01} value={lmTemperature} onChange={(e) => setLmTemperature(parseFloat(e.target.value || "0.85"))} />
                </div>
                <div className="field">
                  <div className="label">{t("create_lm_cfg")}</div>
                  <input className="input" type="number" step={0.1} value={lmCfgScale} onChange={(e) => setLmCfgScale(parseFloat(e.target.value || "2.5"))} />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <div className="label">{t("create_lm_top_k")}</div>
                  <input className="input" type="number" value={lmTopK} onChange={(e) => setLmTopK(e.target.value === "" ? "" : parseInt(e.target.value, 10))} />
                </div>
                <div className="field">
                  <div className="label">{t("create_lm_top_p")}</div>
                  <input className="input" type="number" min={0} max={1} step={0.01} value={lmTopP} onChange={(e) => setLmTopP(parseFloat(e.target.value || "0.9"))} />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <div className="label">{t("create_lm_rep_penalty")}</div>
                  <input className="input" type="number" step={0.01} value={lmRepetitionPenalty} onChange={(e) => setLmRepetitionPenalty(parseFloat(e.target.value || "1"))} />
                </div>
                <div className="field">
                  <div className="label">{t("create_lm_negative")}</div>
                  <input className="input" value={lmNegativePrompt} onChange={(e) => setLmNegativePrompt(e.target.value)} />
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
