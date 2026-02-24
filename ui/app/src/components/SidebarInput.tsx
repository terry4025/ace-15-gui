import React, { useState, useEffect } from "react";
import { Music, Sparkles, X, Loader2 } from "lucide-react";
import TagPill from "./TagPill";
import ToggleSwitch from "./ToggleSwitch";
import GradientButton from "./GradientButton";
import { api } from "../lib/api";
import type { AppConfigResponse, ReleaseTaskPayload } from "../types";

type SidebarInputProps = {
    cfg: AppConfigResponse | null;
    onConfig: (c: AppConfigResponse | null) => void;
    onSubmit: (payload: ReleaseTaskPayload) => void;
    busy: boolean;
    progress: string;
};

// 분 단위 프리셋: [표시 라벨, 초 값]
const DURATION_PRESETS: [string, number][] = [
    ["30초", 30],
    ["1분", 60],
    ["1분 30초", 90],
    ["2분", 120],
    ["2분 30초", 150],
    ["3분", 180],
];

export default function SidebarInput({ cfg, onConfig, onSubmit, busy, progress }: SidebarInputProps) {
    const [lyrics, setLyrics] = useState("");
    const [style, setStyle] = useState("");
    const [title, setTitle] = useState("");
    const [instrumental, setInstrumental] = useState(false);
    const [vocalLang, setVocalLang] = useState("en");
    const [duration, setDuration] = useState(60); // 기본 1분
    const [batchSize, setBatchSize] = useState(1);
    const [connected, setConnected] = useState<boolean | null>(null); // null = 아직 모름

    const stylePresets = ["Pop", "Rock", "Electronic", "Hip Hop", "Jazz", "Classical", "R&B", "Metal"];

    // 백엔드 연결 상태 5초마다 체크
    useEffect(() => {
        let cancelled = false;
        async function check() {
            const ok = await api.health();
            if (!cancelled) setConnected(ok);
        }
        check();
        const id = setInterval(check, 5000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    function appendStyle(genre: string) {
        const current = style.trim();
        if (current.toLowerCase().includes(genre.toLowerCase())) return;
        setStyle(current ? `${current}, ${genre}` : genre);
    }

    function handleBatchInput(e: React.ChangeEvent<HTMLInputElement>) {
        const v = parseInt(e.target.value.replace(/\D/g, "") || "1");
        setBatchSize(Math.max(1, Math.min(8, isNaN(v) ? 1 : v)));
    }

    function handleSubmit() {
        if (busy) return;
        if (!style.trim() && !lyrics.trim()) return;

        const payload: ReleaseTaskPayload = {
            prompt: style.trim(),
            lyrics: instrumental ? "[Instrumental]" : lyrics.trim() || "[Instrumental]",
            vocal_language: vocalLang.trim() || "en",
            thinking: false,
            batch_size: Math.max(1, Math.min(8, batchSize)),
            seed: -1,
            use_random_seed: true,
            audio_duration: Math.max(10, Math.min(600, duration)),
            audio_format: "mp3",
            model: cfg?.config?.dit_model || "acestep-v15-turbo",
            inference_steps: 8,
            guidance_scale: 7.0,
            infer_method: "ode",
            lm_model_path: cfg?.config?.lm_model || "acestep-5Hz-lm-4B",
            lm_backend: cfg?.config?.lm_backend || "pt",
            lm_temperature: 0.85,
            lm_cfg_scale: 2.5,
            lm_top_p: 0.9,
            lm_repetition_penalty: 1.0,
            lm_negative_prompt: "NO USER INPUT",
            constrained_decoding: true,
        };

        if (title.trim()) {
            payload.track_name = title.trim();
        }

        onSubmit(payload);
    }

    // 연결 상태 색상
    const dotColor =
        connected === null ? "#888" :
            connected ? "#22c55e" : "#ef4444";
    const dotTitle =
        connected === null ? "연결 확인 중..." :
            connected ? "모델 서버 연결됨" : "모델 서버 연결 안됨";

    return (
        <div className="left-sidebar">
            <div className="sidebar-header">
                <Music size={16} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>v1.5</span>

                {/* 연결 상태 표시기 */}
                <div
                    title={dotTitle}
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: dotColor,
                        boxShadow: connected ? `0 0 6px ${dotColor}` : "none",
                        transition: "background 0.4s, box-shadow 0.4s",
                        flexShrink: 0,
                        marginLeft: 2,
                    }}
                />

                <div className="mode-toggle">
                    <div className="mode-btn">Simple</div>
                    <div className="mode-btn active">Custom</div>
                </div>
            </div>

            <div className="sidebar-content">
                {/* Lyrics Input */}
                <div className="input-group">
                    <div className="input-header">
                        <span>LYRICS</span>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <X size={14} className="action-icon" onClick={() => setLyrics("")} />
                        </div>
                    </div>
                    <textarea
                        className="textarea-field"
                        value={lyrics}
                        onChange={(e) => setLyrics(e.target.value)}
                        placeholder={"[Verse 1]\nWrite your lyrics here..."}
                        disabled={instrumental}
                        style={{ opacity: instrumental ? 0.5 : 1 }}
                    />
                </div>

                {/* Style Input */}
                <div className="input-group">
                    <div className="input-header">
                        <span>STYLE OF MUSIC</span>
                        <X size={14} className="action-icon" onClick={() => setStyle("")} />
                    </div>
                    <textarea
                        className="textarea-field"
                        style={{ minHeight: "80px" }}
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                        placeholder="Pop, Rock, Energetic..."
                    />
                    <div className="tags-container">
                        {stylePresets.map((genre) => (
                            <TagPill
                                key={genre}
                                label={genre}
                                onClick={() => appendStyle(genre)}
                            />
                        ))}
                    </div>
                </div>

                {/* Title Input */}
                <div className="input-group">
                    <div className="input-header">
                        <span>TITLE</span>
                    </div>
                    <input
                        type="text"
                        className="input-field"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="My Song"
                    />
                </div>

                {/* Duration — 분 단위 버튼 */}
                <div className="input-group">
                    <div className="input-header">
                        <span>DURATION</span>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            {(() => {
                                const m = Math.floor(duration / 60);
                                const s = duration % 60;
                                return m > 0
                                    ? s > 0 ? `${m}분 ${s}초` : `${m}분`
                                    : `${s}초`;
                            })()}
                        </span>
                    </div>
                    <div className="tags-container">
                        {DURATION_PRESETS.map(([label, sec]) => (
                            <TagPill
                                key={sec}
                                label={label}
                                onClick={() => setDuration(sec)}
                                style={
                                    duration === sec
                                        ? { background: "rgba(245,242,86,0.18)", borderColor: "#f5f256", color: "#f5f256" }
                                        : undefined
                                }
                            />
                        ))}
                    </div>
                </div>

                {/* Batch */}
                <div className="input-group">
                    <div className="input-header">
                        <span>BATCH</span>
                    </div>
                    <input
                        type="text"
                        inputMode="numeric"
                        className="input-field"
                        value={batchSize}
                        onChange={handleBatchInput}
                        placeholder="1"
                        style={{ MozAppearance: "textfield" } as React.CSSProperties}
                    />
                </div>

                {/* Instrumental Toggle */}
                <ToggleSwitch
                    isChecked={instrumental}
                    onChange={setInstrumental}
                    label={
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <Music size={14} />
                            <span>Instrumental</span>
                        </div>
                    }
                />

                {/* Vocal Language */}
                <div className="input-group">
                    <div className="input-header">
                        <span>VOCAL LANGUAGE</span>
                    </div>
                    <div className="tags-container">
                        {([
                            ["en", "EN"],
                            ["ko", "한국어"],
                            ["zh", "中文"],
                            ["ja", "日本語"],
                            ["de", "DE"],
                            ["fr", "FR"],
                            ["es", "ES"],
                        ] as [string, string][]).map(([code, label]) => (
                            <TagPill
                                key={code}
                                label={label}
                                onClick={() => setVocalLang(code)}
                                style={
                                    vocalLang === code
                                        ? { background: "rgba(245,242,86,0.18)", borderColor: "#f5f256", color: "#f5f256" }
                                        : undefined
                                }
                            />
                        ))}
                    </div>
                </div>

                {/* Progress */}
                {(busy || progress) && (
                    <div className="input-group" style={{ padding: "10px 0" }}>
                        {busy && (
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                color: "var(--accent-blue)",
                                fontSize: "12px",
                                marginBottom: "6px"
                            }}>
                                <Loader2 size={14} className="spin-animation" />
                                <span>Generating...</span>
                            </div>
                        )}
                        {progress && (
                            <div style={{
                                fontSize: "11px",
                                color: /failed|error|실패/i.test(progress) ? "var(--accent-red, #f44)" : "var(--text-muted)",
                                wordBreak: "break-word",
                                lineHeight: 1.4
                            }}>
                                {progress}
                            </div>
                        )}
                    </div>
                )}

                {/* Create Button */}
                <GradientButton
                    label={busy ? "Generating..." : `Create ${batchSize > 1 ? batchSize + " " : ""}Song${batchSize > 1 ? "s" : ""}`}
                    icon={busy ? <Loader2 size={16} className="spin-animation" /> : <Sparkles size={16} />}
                    onClick={handleSubmit}
                    disabled={busy || (!style.trim() && !lyrics.trim())}
                />
            </div>
        </div>
    );
}
