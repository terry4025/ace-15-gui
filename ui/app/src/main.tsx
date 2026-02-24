import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/600.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "./i18n";
import "./styles.css";
import { App } from "./app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="noise">
      <HashRouter>
        <App />
      </HashRouter>
    </div>
  </React.StrictMode>
);
