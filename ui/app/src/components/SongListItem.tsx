import React from "react";
import { Play, Clock, Music2 } from "lucide-react";
import type { LibraryTrack } from "../types";

interface SongListItemProps {
    track: LibraryTrack;
    isActive: boolean;
    onClick: () => void;
    onPlay: () => void;
}

function formatDuration(meta: Record<string, any>): string {
    const dur = meta?.audio_duration || meta?.duration;
    if (typeof dur === "number" && Number.isFinite(dur)) {
        const m = Math.floor(dur / 60);
        const s = Math.floor(dur % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    }
    return "--:--";
}

function extractPrompt(track: LibraryTrack): string {
    const meta = track.meta || {};
    return String(
        meta.prompt_final || meta.metas?.caption || meta.prompt || track.track_id
    ).slice(0, 120);
}

function extractStyle(track: LibraryTrack): string {
    const meta = track.meta || {};
    const prompt = String(meta.prompt_final || meta.metas?.caption || meta.prompt || "");
    return prompt.slice(0, 80);
}

function formatDate(ts: number): string {
    if (!ts) return "";
    return new Date(ts * 1000).toLocaleDateString();
}

// 색상 계산 (track_id에서 해시)
function hashColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 40%)`;
}

export default function SongListItem({ track, isActive, onClick, onPlay }: SongListItemProps) {
    const prompt = extractPrompt(track);
    const duration = formatDuration(track.meta || {});
    const date = formatDate(track.created_at);
    const coverBg = hashColor(track.track_id);

    return (
        <div
            className={`song-row ${isActive ? "active" : ""}`}
            onClick={onClick}
            style={{ cursor: "pointer" }}
        >
            <div
                className="song-cover-small"
                style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `linear-gradient(135deg, ${coverBg}, ${coverBg}cc)`,
                }}
            >
                <button
                    className="play-btn-mini"
                    onClick={(e) => {
                        e.stopPropagation();
                        onPlay();
                    }}
                    style={{
                        all: "unset",
                        cursor: "pointer",
                        position: "absolute",
                        zIndex: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Play size={18} color="rgba(255,255,255,0.9)" fill="rgba(255,255,255,0.9)" />
                </button>
            </div>

            <div className="song-info">
                <div className="song-title-row">
                    <span className="song-title">{prompt}</span>
                </div>
                <div className="song-meta">
                    <Music2 size={11} style={{ opacity: 0.5 }} />
                    <span>{extractStyle(track)}</span>
                </div>
            </div>

            <div className="song-row-right">
                <div className="song-duration" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={12} style={{ opacity: 0.5 }} />
                    {duration}
                </div>
                {date && (
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                        {date}
                    </div>
                )}
            </div>
        </div>
    );
}
