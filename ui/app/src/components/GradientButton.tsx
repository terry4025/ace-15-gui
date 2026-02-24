import React from "react";

interface GradientButtonProps {
    label: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
}

export default function GradientButton({ label, icon, onClick, className = "", disabled = false }: GradientButtonProps) {
    return (
        <button
            className={`create-btn ${className}`}
            onClick={onClick}
            disabled={disabled}
            style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }}
        >
            {icon}
            {label}
        </button>
    );
}
