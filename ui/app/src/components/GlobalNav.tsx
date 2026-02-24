import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Compass, Library, Search, Layers, User } from "lucide-react";

export default function GlobalNav({ onOpenSettings }: { onOpenSettings?: () => void }) {
    return (
        <nav className="global-nav">
            <div className="nav-item">
                <div className="brand-icon">
                    <Layers size={22} color="white" />
                </div>
            </div>

            <NavLink
                to="/home"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
                <Home size={22} />
            </NavLink>

            <NavLink
                to="/compose"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
                <Compass size={22} />
            </NavLink>

            <NavLink
                to="/library"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
                <Library size={22} />
            </NavLink>

            <NavLink
                to="/search"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
                <Search size={22} />
            </NavLink>

            <div style={{ marginTop: "auto" }}></div>

            <div
                className="nav-item cursor-pointer"
                onClick={onOpenSettings}
                style={{ cursor: "pointer" }}
            >
                <div style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: "#ff3366", color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: "bold", fontSize: 13
                }}>
                    <User size={18} />
                </div>
            </div>
        </nav>
    );
}
