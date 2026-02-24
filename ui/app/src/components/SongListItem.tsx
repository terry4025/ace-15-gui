import React from "react";
import { Play, Clock, Music2 } from "lucide-react";
import type { LibraryTrack } from "../types";
import { hashColor, formatDuration, extractPrompt, formatDate } from "../lib/trackUtils";

interface SongListItemProps {
    track: LibraryTrack;
    isActive: boolean;
    onClick: () => void;
    onPlay: () => void;
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
                    <span>{extractPrompt(track, 80)}</span>
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
