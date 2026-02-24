import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wand2, Square, Paintbrush2 } from "lucide-react";

import type { AppConfigResponse, TaskStatusNormalized } from "../types";
import { api, EDIT_LAST_SUBMIT_KEY } from "../lib/api";
import { FAILURE_RECOVERY_V1, FAILURE_RECOVERY_V2 } from "../lib/flags";
import { openPath } from "../lib/tauri";
import { ProgressBar } from "../components/ProgressBar";
import { TaskStatusPanel } from "../components/TaskStatusPanel";

type EditTaskType = "cover" | "repaint" | "extract" | "lego" | "complete";
type ResultItem = { file?: string; metas?: any; prompt?: string; lyrics?: string; status?: number; track_type?: string };

const TRACK_NAMES = [
  "woodwinds",
  "brass",
  "fx",
  "synth",
  "strings",
  "percussion",
  "keyboard",
  "guitar",
  "bass",
  "drums",
  "backing_vocals",
  "vocals"
] as const;

type EditLastSubmitSnapshot = {
  taskType: EditTaskType;
  prompt: string;
  instruction: string;
  thinking: boolean;
  model: string;
  strength: number;
  startSec: number;
  endSec: number;
  targetDurationSec: number;
  trackName: string;
  completeClasses: string[];
  inferenceSteps: number;
  guidanceScale: number;
  savedAt: number;
};

type UiIssue = {
  code: string;
  message: string;
  field?: string | null;
};

function parseEditLastSubmitSnapshot(): EditLastSubmitSnapshot | null {
  try {
    const raw = localStorage.getItem(EDIT_LAST_SUBMIT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const payload = (parsed as any).payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as EditLastSubmitSnapshot;
  } catch {
    return null;
  }
}

function toParentPath(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.replace(/[\\/][^\\/]+$/, "");
}

export function EditV2Page(props: { cfg: AppConfigResponse | null }) {
  const { t } = useTranslation();

  const [taskType, setTaskType] = useState<EditTaskType>("cover");
  const [prompt, setPrompt] = useState("");
  const [instruction, setInstruction] = useState("");
  const [thinking, setThinking] = useState(false);
  const [model, setModel] = useState(props.cfg?.config?.dit_model || "acestep-v15-turbo");

  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [srcDurationSec, setSrcDurationSec] = useState<number>(-1);
  const [strength, setStrength] = useState(0.6);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(-1);
  const [targetDurationSec, setTargetDurationSec] = useState<number>(-1);
  const [trackName, setTrackName] = useState<string>("vocals");
  const [completeClasses, setCompleteClasses] = useState<string[]>(["vocals"]);
  const [inferenceSteps, setInferenceSteps] = useState<number>(48);
  const [guidanceScale, setGuidanceScale] = useState<number>(7.0);

  const [taskId, setTaskId] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [resultItems, setResultItems] = useState<ResultItem[]>([]);
  const [taskStatus, setTaskStatus] = useState<TaskStatusNormalized | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<EditLastSubmitSnapshot | null>(null);
  const [retryNotice, setRetryNotice] = useState("");
  const [pendingRetryClone, setPendingRetryClone] = useState(false);
  const [preflightBlocking, setPreflightBlocking] = useState<UiIssue[]>([]);
  const [preflightWarnings, setPreflightWarnings] = useState<UiIssue[]>([]);

  const availableDit = props.cfg?.runtime?.available_dit_models?.length
    ? props.cfg.runtime.available_dit_models
    : ["acestep-v15-turbo"];

  const modelIsTurbo = useMemo(() => /turbo/i.test(model), [model]);
  const canRetryClone = !!lastSnapshot && !busy;
  const showRecoveryPanel = FAILURE_RECOVERY_V1 || FAILURE_RECOVERY_V2;

  useEffect(() => {
    const snapshot = parseEditLastSubmitSnapshot();
    if (!snapshot) return;
    setLastSnapshot(snapshot);
    setTaskType(snapshot.taskType);
    setPrompt(snapshot.prompt || "");
    setInstruction(snapshot.instruction || "");
    setThinking(!!snapshot.thinking);
    setModel(snapshot.model || (props.cfg?.config?.dit_model || "acestep-v15-turbo"));
    setStrength(Number.isFinite(snapshot.strength) ? snapshot.strength : 0.6);
    setStartSec(Number.isFinite(snapshot.startSec) ? snapshot.startSec : 0);
    setEndSec(Number.isFinite(snapshot.endSec) ? snapshot.endSec : -1);
    setTargetDurationSec(Number.isFinite(snapshot.targetDurationSec) ? snapshot.targetDurationSec : -1);
    setTrackName(snapshot.trackName || "vocals");
    setCompleteClasses(Array.isArray(snapshot.completeClasses) ? snapshot.completeClasses : ["vocals"]);
    setInferenceSteps(Number.isFinite(snapshot.inferenceSteps) ? snapshot.inferenceSteps : 48);
    setGuidanceScale(Number.isFinite(snapshot.guidanceScale) ? snapshot.guidanceScale : 7);
  }, []);

  useEffect(() => {
    // Keep model selection aligned with config when it changes.
    const d = props.cfg?.config?.dit_model;
    if (d && !availableDit.includes(model)) setModel(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.cfg?.config?.dit_model]);

  useEffect(() => {
    // For advanced edit tasks, auto-switch away from turbo when a base-family model is available.
    // This matches the UX hint and prevents the "disabled features" dead-end.
    const needsBase = taskType === "extract" || taskType === "lego" || taskType === "complete";
    if (!needsBase) return;
    if (!/turbo/i.test(model)) return;
    const candidate = availableDit.find((m) => !/turbo/i.test(m));
    if (candidate && candidate !== model) setModel(candidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskType, model, availableDit]);

  useEffect(() => {
    // Good defaults per docs: turbo (8), base (32-64). Editing needs higher steps to preserve feel.
    // Only auto-adjust when user hasn't set a reasonable value yet.
    setInferenceSteps((prev) => {
      const max = modelIsTurbo ? 20 : 200;
      const clamped = Math.max(1, Math.min(max, Math.floor(Number.isFinite(prev) ? prev : 0)));
      const looksUserSet = clamped !== 0 && clamped !== 8 && clamped !== 48;
      if (looksUserSet) return clamped;
      return modelIsTurbo ? 8 : 48;
    });
  }, [modelIsTurbo]);

  useEffect(() => {
    // Read source audio duration so "Extend" can outpaint from the end of the original.
    // This is purely client-side; no server probing needed.
    if (!srcFile) {
      setSrcDurationSec(-1);
      return;
    }
    const url = URL.createObjectURL(srcFile);
    const audio = new Audio();
    audio.preload = "metadata";
    const done = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    };
    audio.onloadedmetadata = () => {
      const d = Number(audio.duration);
      if (Number.isFinite(d) && d > 0) setSrcDurationSec(d);
      done();
    };
    audio.onerror = () => {
      setSrcDurationSec(-1);
      done();
    };
    audio.src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcFile]);

  useEffect(() => {
    if (!busy || !startedAt) return;
    const id = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, [busy, startedAt]);

  useEffect(() => {
    if (busy) return;
    if (!pendingRetryClone) return;
    if (!lastSnapshot) {
      setPendingRetryClone(false);
      return;
    }
    setPendingRetryClone(false);
    void retryCloneSubmit();
  }, [busy, pendingRetryClone, lastSnapshot]);

  const canSubmit = useMemo(() => {
    // All edit tasks require a source audio except cover which can be run with src-only (style transfer uses ref).
    // We keep src_audio required to avoid confusing empty submissions.
    if (!srcFile) return false;
    if (taskType === "repaint" || taskType === "lego") return startSec >= 0 && (endSec === -1 || endSec > startSec);
    if (taskType === "cover" && !refFile) return false;
    if (taskType === "complete") {
      // Extend: require target duration and source duration so we can outpaint from the end.
      if (!Number.isFinite(srcDurationSec) || srcDurationSec <= 0) return false;
      if (!Number.isFinite(targetDurationSec) || targetDurationSec <= 0) return false;
      return targetDurationSec > srcDurationSec;
    }
    // Prompt is optional for some tasks; instruction or task defaults can still work.
    return true;
  }, [srcFile, refFile, taskType, startSec, endSec, srcDurationSec, targetDurationSec]);

  const needsBaseModel = useMemo(() => taskType === "extract" || taskType === "lego" || taskType === "complete", [taskType]);

  function autoInstruction(opts?: { taskType?: EditTaskType; trackName?: string; completeClasses?: string[] }): string {
    const task = opts?.taskType || taskType;
    const tnRaw = opts?.trackName ?? trackName;
    const classesRaw = opts?.completeClasses ?? completeClasses;
    // Mirrors backend templates (acestep/constants.py) without needing extra API fields.
    const tn = String(tnRaw || "").trim().toUpperCase();
    const cls = (classesRaw || []).map((c) => String(c).trim()).filter(Boolean).map((c) => c.toUpperCase());
    if (task === "extract") return tn ? `Extract the ${tn} track from the audio:` : "Extract the track from the audio:";
    if (task === "lego") return tn ? `Generate the ${tn} track based on the audio context:` : "Generate the track based on the audio context:";
    if (task === "complete") {
      const base = "Continue the source audio naturally, keeping the same groove, instrumentation, and mix:";
      return cls.length ? `${base} (preserve: ${cls.join(" | ")})` : base;
    }
    if (task === "cover") return "Generate audio semantic tokens based on the given conditions:";
    if (task === "repaint") return "Repaint the mask area based on the given conditions:";
    return "Fill the audio semantic mask based on the given conditions:";
  }

  function persistLastSnapshot(snapshot: EditLastSubmitSnapshot) {
    try {
      localStorage.setItem(EDIT_LAST_SUBMIT_KEY, JSON.stringify({ payload: snapshot, savedAt: Date.now() }));
      setLastSnapshot(snapshot);
    } catch {
      // ignore
    }
  }

  function buildSnapshot(overrides?: Partial<EditLastSubmitSnapshot>): EditLastSubmitSnapshot {
    return {
      taskType,
      prompt,
      instruction,
      thinking,
      model,
      strength,
      startSec,
      endSec,
      targetDurationSec,
      trackName,
      completeClasses,
      inferenceSteps,
      guidanceScale,
      savedAt: Date.now(),
      ...(overrides || {}),
    };
  }

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
      }
      const st = status?.status;
      if (st === 1) {
        setProgress(t("gen_succeeded"));
        // Prefer query_result payload over library scanning so multi-audio tasks (extract/lego/complete) show outputs.
        try {
          const arr = status?.result || [];
          if (Array.isArray(arr) && arr.length) {
            const items = arr
              .map((x: any) => (x && typeof x === "object" ? (x as ResultItem) : ({} as ResultItem)))
              .filter((x: any) => x && typeof x === "object");
            setResultItems(items);
          }
        } catch {
          // ignore
        }
        return;
      }
      if (st === 2 || st === 3) {
        const base = st === 3 ? t("gen_canceled") : t("gen_failed");
        const detail = status?.errorSummary || status?.errorText || status?.progressText || "";
        setProgress(detail ? `${base}: ${detail}` : base);
        return;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    setProgress(t("gen_timed_out"));
  }

  async function runPreflight(payload: Record<string, any>, sourceDuration: number, targetDuration: number): Promise<boolean> {
    setPreflightBlocking([]);
    setPreflightWarnings([]);
    try {
      const pre = await api.preflight({
        payload,
        client_files: {
          has_src_audio: !!srcFile,
          has_ref_audio: !!refFile,
        },
        client_audio: {
          source_duration_sec: Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : undefined,
          target_duration_sec: Number.isFinite(targetDuration) && targetDuration > 0 ? targetDuration : undefined,
        },
      });
      const blocking = Array.isArray(pre?.blocking_errors) ? (pre.blocking_errors as UiIssue[]) : [];
      const warnings = Array.isArray(pre?.warnings) ? (pre.warnings as UiIssue[]) : [];
      setPreflightBlocking(blocking);
      setPreflightWarnings(warnings);
      if (blocking.length > 0) {
        setProgress(String(blocking[0]?.message || t("preflight_blocked_title")));
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

  async function submitCore(snapshotOverride?: EditLastSubmitSnapshot) {
    if (!canSubmit && !snapshotOverride) return;
    const snapshot = snapshotOverride || buildSnapshot();
    const submitTaskType = snapshot.taskType;
    const submitPrompt = snapshot.prompt || "";
    const submitInstruction = snapshot.instruction || "";
    const submitThinking = !!snapshot.thinking;
    const submitModel = snapshot.model || model;
    const submitStrength = Number.isFinite(snapshot.strength) ? snapshot.strength : strength;
    const submitStart = Number.isFinite(snapshot.startSec) ? snapshot.startSec : startSec;
    const submitEnd = Number.isFinite(snapshot.endSec) ? snapshot.endSec : endSec;
    const submitTargetDuration = Number.isFinite(snapshot.targetDurationSec) ? snapshot.targetDurationSec : targetDurationSec;
    const submitTrackName = snapshot.trackName || trackName;
    const submitCompleteClasses = Array.isArray(snapshot.completeClasses) ? snapshot.completeClasses : completeClasses;
    const submitSteps = Number.isFinite(snapshot.inferenceSteps) ? snapshot.inferenceSteps : inferenceSteps;
    const submitGuidance = Number.isFinite(snapshot.guidanceScale) ? snapshot.guidanceScale : guidanceScale;

    const preflightPayload: Record<string, any> = {
      prompt: String(submitPrompt || "").trim(),
      task_type: submitTaskType,
      model: submitModel,
      thinking: !!submitThinking,
      instruction:
        submitInstruction.trim() ||
        autoInstruction({
          taskType: submitTaskType,
          trackName: submitTrackName,
          completeClasses: submitCompleteClasses,
        }),
      inference_steps: submitSteps,
      guidance_scale: submitGuidance,
      audio_cover_strength: submitStrength,
      repainting_start: submitStart,
      repainting_end: submitEnd,
      audio_duration: Number.isFinite(submitTargetDuration) && submitTargetDuration > 0 ? submitTargetDuration : undefined,
      track_name: submitTaskType === "extract" || submitTaskType === "lego" ? submitTrackName : undefined,
      complete_track_classes: submitTaskType === "complete" ? submitCompleteClasses : undefined,
    };

    if (FAILURE_RECOVERY_V2) {
      const ok = await runPreflight(preflightPayload, srcDurationSec, submitTargetDuration);
      if (!ok) return;
    } else {
      setPreflightBlocking([]);
      setPreflightWarnings([]);
    }

    setBusy(true);
    setStartedAt(Date.now());
    setElapsedSec(0);
    setTaskId("");
    setProgress("");
    setResultItems([]);
    setTaskStatus(null);
    setRetryNotice("");

    try {
      const fd = new FormData();
      const p = submitPrompt.trim();
      if (p) fd.append("prompt", p);

      fd.append("task_type", submitTaskType);
      fd.append("model", submitModel);
      fd.append("thinking", String(!!submitThinking));
      fd.append("use_cot_metas", String(!!submitThinking));
      fd.append("use_cot_caption", String(!!submitThinking));
      fd.append("use_cot_language", String(!!submitThinking));

      const instr =
        submitInstruction.trim() ||
        autoInstruction({
          taskType: submitTaskType,
          trackName: submitTrackName,
          completeClasses: submitCompleteClasses,
        });
      if (instr) fd.append("instruction", instr);
      if (submitTaskType === "extract" || submitTaskType === "lego") {
        fd.append("track_name", submitTrackName);
      }
      if (submitTaskType === "complete" && submitCompleteClasses.length) {
        fd.append("complete_track_classes", JSON.stringify(submitCompleteClasses));
      }

      // Quality knobs: critical for edit fidelity on base models.
      const submitModelIsTurbo = /turbo/i.test(submitModel);
      const maxSteps = submitModelIsTurbo ? 20 : 200;
      const steps = Math.max(1, Math.min(maxSteps, Math.floor(Number(submitSteps) || (submitModelIsTurbo ? 8 : 48))));
      fd.append("inference_steps", String(steps));
      const gs = Number(submitGuidance);
      if (Number.isFinite(gs)) fd.append("guidance_scale", String(gs));

      if (submitTaskType === "cover") {
        fd.append("audio_cover_strength", String(Math.max(0, Math.min(1, submitStrength))));
      }
      if (submitTargetDuration && Number.isFinite(submitTargetDuration) && submitTargetDuration > 0) {
        fd.append("audio_duration", String(submitTargetDuration));
      }

      if (submitTaskType === "repaint" || submitTaskType === "lego") {
        fd.append("repainting_start", String(Math.max(0, submitStart)));
        fd.append("repainting_end", String(submitEnd));
      }
      if (submitTaskType === "complete") {
        const srcD = Number(srcDurationSec);
        const tgt = Number(submitTargetDuration);
        if (!Number.isFinite(srcD) || srcD <= 0) throw new Error(t("edit_err_src_duration"));
        if (!Number.isFinite(tgt) || tgt <= 0) throw new Error(t("edit_err_target_duration"));
        if (tgt <= srcD) throw new Error(t("edit_err_extend_too_short"));
        fd.append("repainting_start", String(srcD));
        fd.append("repainting_end", String(tgt));
      }

      // Multipart field names per docs: reference_audio/ref_audio, src_audio/ctx_audio.
      if (submitTaskType === "cover" && refFile) fd.append("reference_audio", refFile, refFile.name);
      if (srcFile) fd.append("src_audio", srcFile, srcFile.name);

      persistLastSnapshot(snapshot);
      const res = await api.releaseTaskForm(fd);
      setTaskId(res.task_id);
      setProgress(`${t("gen_queued")} (#${res.queue_position || 0})`);
      await poll(res.task_id);
    } catch (e: any) {
      setProgress(e?.message || String(e));
    } finally {
      setBusy(false);
    }
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

  async function retryCloneSubmit() {
    const snapshot = lastSnapshot;
    if (!snapshot || busy) return;
    setTaskType(snapshot.taskType);
    setPrompt(snapshot.prompt || "");
    setInstruction(snapshot.instruction || "");
    setThinking(!!snapshot.thinking);
    setModel(snapshot.model || model);
    setStrength(Number.isFinite(snapshot.strength) ? snapshot.strength : strength);
    setStartSec(Number.isFinite(snapshot.startSec) ? snapshot.startSec : startSec);
    setEndSec(Number.isFinite(snapshot.endSec) ? snapshot.endSec : endSec);
    setTargetDurationSec(Number.isFinite(snapshot.targetDurationSec) ? snapshot.targetDurationSec : targetDurationSec);
    setTrackName(snapshot.trackName || trackName);
    setCompleteClasses(Array.isArray(snapshot.completeClasses) ? snapshot.completeClasses : completeClasses);
    setInferenceSteps(Number.isFinite(snapshot.inferenceSteps) ? snapshot.inferenceSteps : inferenceSteps);
    setGuidanceScale(Number.isFinite(snapshot.guidanceScale) ? snapshot.guidanceScale : guidanceScale);

    if (!srcFile || (snapshot.taskType === "cover" && !refFile)) {
      setRetryNotice(t("task_edit_reselect_audio"));
      setProgress(t("task_edit_reselect_audio"));
      return;
    }
    setRetryNotice("");
    await submitCore(snapshot);
  }

  async function cancelAndRetry() {
    if (!lastSnapshot) return;
    if (busy && taskId) {
      setPendingRetryClone(true);
      await cancel();
      return;
    }
    await retryCloneSubmit();
  }

  async function submit() {
    await submitCore();
  }

  const tip = useMemo(() => {
    if (taskType === "cover") return t("edit_tip_cover");
    if (taskType === "repaint") return t("edit_tip_repaint");
    if (taskType === "extract") return t("edit_tip_extract");
    if (taskType === "lego") return t("edit_tip_layer");
    return t("edit_tip_extend");
  }, [taskType, t]);

  return (
    <div className="grid2">
      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Paintbrush2 size={18} />
            {t("edit_title")}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>{t("edit_v2_live")}</div>
          <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>{tip}</div>
        </div>

        <div className="panelBody">
          <div className="row">
            <div className="field">
              <div className="label">{t("edit_task_type")}</div>
              <select className="select" value={taskType} onChange={(e) => setTaskType(e.target.value as any)} disabled={busy}>
                <option value="cover">{t("edit_task_cover")}</option>
                <option value="repaint">{t("edit_task_repaint")}</option>
                <option value="complete">{t("edit_task_extend")}</option>
                <option value="lego">{t("edit_task_layer")}</option>
                <option value="extract">{t("edit_task_extract")}</option>
              </select>
            </div>
            <div className="field">
              <div className="label">{t("create_model")}</div>
              <select className="select" value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
                {availableDit.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {needsBaseModel && modelIsTurbo ? (
            <div className="panel" style={{ background: "rgba(255,160,0,0.08)", border: "1px solid rgba(255,160,0,0.18)", marginBottom: 12 }}>
              <div className="panelBody" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
                <div style={{ fontWeight: 650, marginBottom: 6 }}>{t("edit_warn_base_needed_title")}</div>
                <div>{t("edit_warn_base_needed_body")}</div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {availableDit.filter((m) => !/turbo/i.test(m)).slice(0, 3).map((m) => (
                    <button key={m} className="btn" disabled={busy} onClick={() => setModel(m)}>{t("edit_switch_to")} {m}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="field">
            <div className="label">{t("create_prompt")}</div>
            <textarea
              className="textarea promptTextarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t(taskType === "extract" ? "edit_prompt_ph_extract" : taskType === "complete" ? "edit_prompt_ph_extend" : taskType === "lego" ? "edit_prompt_ph_layer" : "edit_prompt_ph")}
              disabled={busy}
            />
          </div>

          <div className="field">
            <div className="label">{t("edit_instruction")}</div>
            <input
              className="input"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t("edit_instruction_ph")}
              disabled={busy}
            />
            <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>
              {t("edit_instruction_auto_hint")} <span className="mono">{autoInstruction()}</span>
            </div>
          </div>

          <div className="chips" style={{ marginBottom: 12 }}>
            <label className="chip" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={thinking}
                onChange={(e) => setThinking(e.target.checked)}
                style={{ marginRight: 8 }}
                disabled={busy}
              />
              {t("create_thinking")}
            </label>
          </div>

          <div className="row">
            <div className="field">
              <div className="label">{t("edit_inference_steps")}</div>
              <input
                className="input"
                type="number"
                min={1}
                max={modelIsTurbo ? 20 : 200}
                value={inferenceSteps}
                onChange={(e) => setInferenceSteps(parseFloat(e.target.value || (modelIsTurbo ? "8" : "48")))}
                disabled={busy}
              />
              <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>{t(modelIsTurbo ? "edit_inference_steps_hint_turbo" : "edit_inference_steps_hint_base")}</div>
            </div>
            <div className="field">
              <div className="label">{t("edit_guidance_scale")}</div>
              <input
                className="input"
                type="number"
                min={0}
                step={0.1}
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(parseFloat(e.target.value || "7.0"))}
                disabled={busy}
              />
              <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>{t("edit_guidance_scale_hint")}</div>
            </div>
          </div>

          {taskType === "extract" || taskType === "lego" ? (
            <div className="field" style={{ marginBottom: 12 }}>
              <div className="label">{t("edit_track_name")}</div>
              <select className="select" value={trackName} onChange={(e) => setTrackName(e.target.value)} disabled={busy}>
                {TRACK_NAMES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>{t("edit_track_name_hint")}</div>
            </div>
          ) : null}

          {taskType === "complete" ? (
            <div className="field" style={{ marginBottom: 12 }}>
              <div className="label">{t("edit_complete_classes")}</div>
              <select
                className="select"
                multiple
                value={completeClasses}
                onChange={(e) => {
                  const sel = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setCompleteClasses(sel);
                }}
                disabled={busy}
                style={{ height: 140 }}
              >
                {TRACK_NAMES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>{t("edit_complete_classes_hint")}</div>
            </div>
          ) : null}

          <div className="row">
            <div className="field">
              <div className="label">{t("edit_src_audio")}</div>
              <input
                className="input"
                type="file"
                accept="audio/*"
                onChange={(e) => setSrcFile(e.target.files?.[0] || null)}
                disabled={busy}
              />
              {srcFile ? <div className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>{srcFile.name}</div> : null}
            </div>
            <div className="field">
              <div className="label">{t("edit_ref_audio")}</div>
              <input
                className="input"
                type="file"
                accept="audio/*"
                onChange={(e) => setRefFile(e.target.files?.[0] || null)}
                disabled={busy || taskType !== "cover"}
              />
              {refFile ? <div className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>{refFile.name}</div> : null}
            </div>
          </div>

          {taskType === "cover" ? (
            <div className="field">
              <div className="label">{t("edit_strength")} ({strength.toFixed(2)})</div>
              <input
                className="input"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={strength}
                onChange={(e) => setStrength(parseFloat(e.target.value || "0.6"))}
                disabled={busy}
              />
              <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>{t("edit_strength_hint")}</div>
            </div>
          ) : null}

          <div className="field">
            <div className="label">{t("edit_target_duration")}</div>
            <input
              className="input"
              type="number"
              min={-1}
              value={targetDurationSec}
              onChange={(e) => setTargetDurationSec(parseFloat(e.target.value || "-1"))}
              disabled={busy}
            />
            <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>{t("edit_target_duration_hint")}</div>
            {srcFile && srcDurationSec > 0 ? (
              <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>
                {t("edit_src_duration")} <span className="mono">{srcDurationSec.toFixed(2)}s</span>
              </div>
            ) : null}
          </div>

          {taskType === "repaint" || taskType === "lego" ? (
            <div className="row">
              <div className="field">
                <div className="label">{t("edit_repaint_start")}</div>
                <input className="input" type="number" min={0} value={startSec} onChange={(e) => setStartSec(parseFloat(e.target.value || "0"))} disabled={busy} />
              </div>
              <div className="field">
                <div className="label">{t("edit_repaint_end")}</div>
                <input className="input" type="number" value={endSec} onChange={(e) => setEndSec(parseFloat(e.target.value || "-1"))} disabled={busy} />
                <div style={{ color: "var(--faint)", fontSize: 12 }}>{t("edit_repaint_end_hint")}</div>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="btn btnPrimary" onClick={submit} disabled={busy || !canSubmit}>
              <Wand2 size={16} />
              {t("edit_submit")}
            </button>
            <button className="btn btnDanger" onClick={cancel} disabled={!taskId || !busy}>
              <Square size={16} />
              {t("create_cancel")}
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

          <ProgressBar
            active={busy}
            label={t("gen_in_progress")}
            subLabel={`${t("gen_elapsed")} ${elapsedSec}s${progress ? ` · ${progress}` : ""}`}
          />

          {showRecoveryPanel && (busy || !!taskStatus || !!taskId || !!progress) ? (
            <TaskStatusPanel
              status={taskStatus}
              busy={busy}
              elapsedSec={elapsedSec}
              taskId={taskId}
              onCancel={cancel}
              canCancel={!!taskId && busy}
              onRetryClone={retryCloneSubmit}
              retryCloneEnabled={canRetryClone}
              onCancelAndRetry={cancelAndRetry}
              cancelAndRetryEnabled={!!lastSnapshot}
              onOpenLogs={openLogsFromUi}
              note={retryNotice || undefined}
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
          <div className="panelTitle">{t("edit_result")}</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>{t("edit_result_sub")}</div>
        </div>
        <div className="panelBody">
          {resultItems.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {resultItems.map((it, idx) => {
                const url = it?.file ? api.getBaseUrl() + String(it.file) : "";
                const title = String(it?.metas?.caption || it?.prompt || it?.track_type || `${t("edit_result_item")} ${idx + 1}`).slice(0, 120);
                return (
                  <div key={`${it?.file || "x"}-${idx}`} className="resultCard">
                    <div className="resultTitle" style={{ marginBottom: 8 }}>{title}</div>
                    {url ? (
                      <audio controls preload="none" src={url} style={{ width: "100%" }} />
                    ) : (
                      <div className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>{t("edit_result_no_audio")}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
              {t("edit_result_empty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
