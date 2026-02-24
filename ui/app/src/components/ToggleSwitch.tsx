import React from "react";

interface ToggleSwitchProps {
    isChecked: boolean;
    onChange: (checked: boolean) => void;
    label?: React.ReactNode;
}

export default function ToggleSwitch({ isChecked, onChange, label }: ToggleSwitchProps) {
    return (
        <div className="toggle-row">
            {label && <span>{label}</span>}
            <div
                className={`toggle-switch ${isChecked ? "active" : ""}`}
                onClick={() => onChange(!isChecked)}
            >
                <div className="toggle-knob"></div>
            </div>
        </div>
    );
}
