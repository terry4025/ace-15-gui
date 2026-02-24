import React from "react";
import { Play, X, Download, Copy, Music2 } from "lucide-react";
import TagPill from "./TagPill";
import type { LibraryTrack } from "../types";

type RightDetailsProps = {
    track: LibraryTrack | null;
    onClose: () => void;
    onPlay: (track: LibraryTrack) => void;
    apiBase: string;
};

function hashColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 35%)`;
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

function extractTags(track: LibraryTrack): string[] {
    const meta = track.meta || {};
    const prompt = String(meta.prompt_final || meta.metas?.caption || meta.prompt || "");
    // Split by commas to extract genre tags
    return prompt
        .split(/,\s*/)
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0 && t.length < 40)
        .slice(0, 8);
}

function extractLyrics(track: LibraryTrack): string {
    const meta = track.meta || {};
    const lyrics = meta.lyrics || meta.metas?.lyrics || "";
    return String(lyrics).trim();
}

export default function RightDetails({ track, onClose, onPlay, apiBase }: RightDetailsProps) {
    if (!track) {
        return (
            <div className="right-details">
                <div className="details-header">
                    Song Details
                </div>
                <div className="details-content" style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: 1,
                    color: "var(--text-muted)",
                    gap: "12px",
                    paddingTop: "60px",
                }}>
                    <Music2 size={36} style={{ opacity: 0.2 }} />
                    <div style={{ fontSize: "13px", textAlign: "center" }}>
                        Select a track to see details
                    </div>
                </div>
            </div>
        );
    }

    const meta = track.meta || {};
    const title = String(
        meta.track_name || meta.prompt_final || meta.metas?.caption || meta.prompt || track.track_id
    ).slice(0, 100);
    const duration = formatDuration(meta);
    const tags = extractTags(track);
    const lyrics = extractLyrics(track);
    const coverBg = hashColor(track.track_id);
    const date = track.created_at
        ? new Date(track.created_at * 1000).toLocaleDateString()
        : "";
    const audioUrl = track.audio_url ? apiBase + track.audio_url : null;

    return (
        <div className="right-details">
            <div className="details-header">
                Song Details
                <X size={20} className="action-icon" onClick={onClose} style={{ cursor: "pointer" }} />
            </div>

            <div className="details-content">
                <div className="large-cover-wrapper">
                    <div
                        className="large-cover-img"
                        style={{
                            background: `linear-gradient(135deg, ${coverBg}, ${coverBg}88)`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Music2 size={40} color="rgba(255,255,255,0.3)" />
                    </div>
                    <div
                        className="play-overlay"
                        onClick={() => onPlay(track)}
                        style={{ cursor: "pointer" }}
                    >
                        <Play size={14} fill="white" />
                    </div>
                    <div className="duration-badge">{duration}</div>
                </div>

                <div>
                    <div className="details-title-row">
                        <div className="details-title">{title}</div>
                    </div>

                    <div className="details-meta">
                        <div className="author-info">
                            {date && <span className="created-date">Created {date}</span>}
                        </div>
                    </div>
                </div>

                {/* Audio Player Removed to only use bottom player */}

                {/* Actions */}
                <div className="details-actions-row">
                    {audioUrl && (
                        <a
                            href={audioUrl}
                            download
                            className="action-btn-large"
                            style={{ textDecoration: "none", color: "inherit" }}
                        >
                            <Download size={18} />
                        </a>
                    )}
                    <button
                        className="action-btn-large"
                        onClick={() => {
                            navigator.clipboard.writeText(track.track_id);
                        }}
                        title="Copy Track ID"
                    >
                        <Copy size={18} />
                    </button>
                </div>

                {/* Tags */}
                {tags.length > 0 && (
                    <div className="section-container">
                        <div className="section-title">
                            STYLE & TAGS
                            <button
                                className="copy-btn"
                                onClick={() => navigator.clipboard.writeText(tags.join(", "))}
                            >
                                <Copy size={12} /> Copy
                            </button>
                        </div>
                        <div className="tags-container">
                            {tags.map((tag, i) => (
                                <TagPill key={`${tag}-${i}`} label={tag} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Lyrics */}
                {lyrics && (
                    <div className="section-container">
                        <div className="section-title">LYRICS</div>
                        <div style={{
                            fontSize: "13px",
                            lineHeight: "1.6",
                            color: "var(--text-secondary)",
                            whiteSpace: "pre-wrap",
                            maxHeight: "300px",
                            overflowY: "auto",
                        }}>
                            {lyrics}
                        </div>
                    </div>
                )}

                {/* Meta info */}
                <div className="section-container">
                    <div className="section-title">INFO</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.8 }}>
                        <div><strong>Track ID:</strong> {track.track_id}</div>
                        {meta.model && <div><strong>Model:</strong> {String(meta.model)}</div>}
                        {meta.audio_format && <div><strong>Format:</strong> {String(meta.audio_format)}</div>}
                        {meta.vocal_language && <div><strong>Language:</strong> {String(meta.vocal_language)}</div>}
                        {meta.seed != null && <div><strong>Seed:</strong> {String(meta.seed)}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
