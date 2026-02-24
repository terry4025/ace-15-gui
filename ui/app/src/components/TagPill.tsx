import React from "react";

interface TagPillProps {
    label: string;
    onClick?: () => void;
    className?: string;
    style?: React.CSSProperties;
}

export default function TagPill({ label, onClick, className = "", style }: TagPillProps) {
    return (
        <div
            className={`tag-pill ${className}`}
            onClick={onClick}
            style={style}
        >
            {label}
        </div>
    );
}
