import React, { useEffect } from "react";
import { RefreshCw, Music, Loader2, Inbox } from "lucide-react";
import SongListItem from "./SongListItem";
import type { AppConfigResponse, LibraryTrack } from "../types";

type MainFeedProps = {
    cfg: AppConfigResponse | null;
    tracks: LibraryTrack[];
    selectedTrack: LibraryTrack | null;
    onSelectTrack: (track: LibraryTrack) => void;
    onPlayTrack: (track: LibraryTrack) => void;
    onRefresh: () => void;
    busy: boolean;
    progress: string;
};

export default function MainFeed({
    cfg,
    tracks,
    selectedTrack,
    onSelectTrack,
    onPlayTrack,
    onRefresh,
    busy,
    progress,
}: MainFeedProps) {
    // 최신 곡부터 보여주기
    const sorted = [...tracks].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    return (
        <div className="feed-container" style={{ width: "100%" }}>
            <div className="feed-header" style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px 8px",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Music size={16} />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Library
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        ({tracks.length} tracks)
                    </span>
                </div>
                <button
                    onClick={onRefresh}
                    style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "12px",
                        color: "var(--text-muted)",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                    <RefreshCw size={13} />
                    Refresh
                </button>
            </div>

            {/* Generation in progress banner */}
            {busy && (
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 20px",
                    margin: "0 12px 8px",
                    background: "rgba(99, 102, 241, 0.08)",
                    borderRadius: "8px",
                    border: "1px solid rgba(99, 102, 241, 0.15)",
                }}>
                    <Loader2 size={16} className="spin-animation" style={{ color: "var(--accent-blue)" }} />
                    <div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-blue)" }}>
                            Generating music...
                        </div>
                        {progress && (
                            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                                {progress}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="feed-list" style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "0 12px" }}>
                {sorted.length === 0 && !busy ? (
                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "60px 20px",
                        color: "var(--text-muted)",
                        gap: "12px",
                    }}>
                        <Inbox size={40} style={{ opacity: 0.3 }} />
                        <div style={{ fontSize: "14px", fontWeight: 500 }}>No tracks yet</div>
                        <div style={{ fontSize: "12px", opacity: 0.7, textAlign: "center" }}>
                            Use the sidebar to create your first song
                        </div>
                    </div>
                ) : (
                    sorted.map((track) => (
                        <SongListItem
                            key={track.track_id}
                            track={track}
                            isActive={selectedTrack?.track_id === track.track_id}
                            onClick={() => onSelectTrack(track)}
                            onPlay={() => onPlayTrack(track)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
