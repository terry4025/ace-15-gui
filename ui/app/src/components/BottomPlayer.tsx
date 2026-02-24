import React, { useRef, useEffect, useState, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music2 } from "lucide-react";
import type { LibraryTrack } from "../types";

type BottomPlayerProps = {
    track: LibraryTrack | null;
    isPlaying: boolean;
    onTogglePlay: () => void;
    apiBase: string;
};

function formatTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function hashColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 35%)`;
}

function extractTitle(track: LibraryTrack): string {
    const meta = track.meta || {};
    return String(
        meta.track_name || meta.prompt_final || meta.metas?.caption || meta.prompt || track.track_id
    ).slice(0, 80);
}

export default function BottomPlayer({ track, isPlaying, onTogglePlay, apiBase }: BottomPlayerProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const rafRef = useRef<number>(0);
    const progressBarRef = useRef<HTMLDivElement | null>(null);
    const timeDisplayRef = useRef<HTMLSpanElement | null>(null);

    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.8);
    const [muted, setMuted] = useState(false);
    // currentTime은 rAF로 DOM에 직접 쓰므로 state 불필요
    const currentTimeRef = useRef(0);
    const lastTickTimeRef = useRef<number>(0);

    const audioUrl = track?.audio_url ? apiBase + track.audio_url : null;
    const title = track ? extractTitle(track) : "No track selected";
    const coverBg = track ? hashColor(track.track_id) : "#333";

    // 트랙 변경 시 audio src 업데이트
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (audioUrl) {
            audio.src = audioUrl;
            audio.load();
            if (isPlaying) {
                audio.play().catch(() => { });
            }
        } else {
            audio.pause();
            audio.src = "";
        }
    }, [audioUrl]);

    // play/pause 토글
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !audioUrl) return;

        if (isPlaying) {
            audio.play().catch(() => { });
        } else {
            audio.pause();
        }
    }, [isPlaying]);

    // 볼륨
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = muted ? 0 : volume;
    }, [volume, muted]);

    // requestAnimationFrame 루프로 부드러운 프로그레스 업데이트
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        lastTickTimeRef.current = performance.now();

        const tick = (time: number) => {
            const delta = Math.max(0, time - lastTickTimeRef.current) / 1000;
            lastTickTimeRef.current = time;

            if (audio && audio.duration > 0) {
                if (!audio.paused) {
                    // audio.currentTime은 브라우저에 따라 간헐적으로(250ms 등) 업데이트되므로 직접 프레임 보간
                    if (Math.abs(currentTimeRef.current - audio.currentTime) > 0.3) {
                        currentTimeRef.current = audio.currentTime;
                    } else {
                        currentTimeRef.current += delta * audio.playbackRate;
                    }
                    if (currentTimeRef.current > audio.duration) {
                        currentTimeRef.current = audio.duration;
                    }
                } else {
                    currentTimeRef.current = audio.currentTime;
                }

                const pct = (currentTimeRef.current / audio.duration) * 100;
                if (progressBarRef.current) {
                    progressBarRef.current.style.width = `${pct}%`;
                }
                if (timeDisplayRef.current) {
                    const newText = `${formatTime(currentTimeRef.current)} / ${formatTime(audio.duration)}`;
                    // 불필요한 DOM 업데이트 방지
                    if (timeDisplayRef.current.textContent !== newText) {
                        timeDisplayRef.current.textContent = newText;
                    }
                }
            }
            rafRef.current = requestAnimationFrame(tick);
        };

        const onLoadedMetadata = () => {
            setDuration(audio.duration);
            currentTimeRef.current = 0;
            // 초기 위치 동기화
            if (progressBarRef.current) {
                progressBarRef.current.style.width = "0%";
            }
        };
        const onEnded = () => {
            if (progressBarRef.current) progressBarRef.current.style.width = "0%";
            onTogglePlay();
        };
        const onSeeked = () => {
            currentTimeRef.current = audio.currentTime;
            if (progressBarRef.current && audio.duration > 0) {
                progressBarRef.current.style.width =
                    `${(audio.currentTime / audio.duration) * 100}%`;
            }
        };

        rafRef.current = requestAnimationFrame(tick);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("seeked", onSeeked);

        return () => {
            cancelAnimationFrame(rafRef.current);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("seeked", onSeeked);
        };
    }, [onTogglePlay]);

    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !audio.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
    }, []);

    // 키보드 조작 기능 추가
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // input 창이나 textarea 등 텍스트 입력 중일 때는 무시
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target as HTMLElement).isContentEditable
            ) {
                return;
            }

            const audio = audioRef.current;
            if (!audioUrl || !audio) return;

            if (e.code === "Space") {
                e.preventDefault(); // 스페이스바 화면 스크롤 방지
                onTogglePlay();
            } else if (e.code === "ArrowLeft") {
                e.preventDefault();
                if (audio.duration) {
                    audio.currentTime = Math.max(0, audio.currentTime - 5);
                }
            } else if (e.code === "ArrowRight") {
                e.preventDefault();
                if (audio.duration) {
                    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [audioUrl, onTogglePlay]);

    const progressPercent = 0; // rAF가 직접 DOM을 업데이트

    return (
        <div className="bottom-player">
            <audio ref={audioRef} preload="auto" />

            {/* Progress bar */}
            <div
                className="player-progress-bar"
                onClick={handleProgressClick}
                style={{ cursor: audioUrl ? "pointer" : "default" }}
            >
                <div
                    ref={progressBarRef}
                    className="progress-fill"
                    style={{ width: "0%" }}
                >
                    {audioUrl && <div className="progress-handle"></div>}
                </div>
            </div>

            {/* Left: Track info */}
            <div className="player-left">
                <div
                    className="player-cover"
                    style={{
                        background: `linear-gradient(135deg, ${coverBg}, ${coverBg}aa)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Music2 size={16} color="rgba(255,255,255,0.4)" />
                </div>
                <div className="player-info">
                    <div className="player-title">{title}</div>
                    <div className="player-author">FUNO</div>
                </div>
            </div>

            {/* Center: Controls */}
            <div className="player-center">
                <button className="control-btn" disabled>
                    <SkipBack size={20} fill="currentColor" />
                </button>
                <button
                    className="play-pause-btn"
                    onClick={onTogglePlay}
                    disabled={!audioUrl}
                >
                    {isPlaying ? (
                        <Pause size={20} fill="currentColor" />
                    ) : (
                        <Play size={20} fill="currentColor" style={{ marginLeft: "2px" }} />
                    )}
                </button>
                <button className="control-btn" disabled>
                    <SkipForward size={20} fill="currentColor" />
                </button>
            </div>

            {/* Right: Time & Volume */}
            <div className="player-right">
                <span
                    ref={timeDisplayRef}
                    style={{ fontSize: "12px", fontVariantNumeric: "tabular-nums" }}
                >
                    0:00 / 0:00
                </span>
                <div className="volume-control">
                    <button
                        className="control-btn"
                        onClick={() => setMuted(!muted)}
                        style={{ padding: 0 }}
                    >
                        {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={muted ? 0 : volume}
                        onChange={(e) => {
                            setVolume(parseFloat(e.target.value));
                            setMuted(false);
                        }}
                        style={{
                            width: "70px",
                            height: "4px",
                            accentColor: "var(--accent-volume, #f5f256ea)",
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
