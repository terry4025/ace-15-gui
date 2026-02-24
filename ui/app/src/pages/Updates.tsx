import { useTranslation } from "react-i18next";
import { getUpdateLog } from "../updateLog";

export function UpdatesPage() {
  const { t, i18n } = useTranslation();
  const entries = getUpdateLog(i18n.language);

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">{t("loader_update_log")}</div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
          Studio UI {__STUDIO_UI_VERSION__} · Build {__STUDIO_BUILD_TIME__.slice(0, 19).replace("T", " ")}
        </div>
      </div>
      <div className="panelBody" style={{ display: "grid", gap: 10 }}>
        {entries.map((e, idx) => (
          <div key={`${e.version}-${e.date}-${idx}`} className="updateEntry">
            <div className="updateEntryHead">
              <div className="updateEntryTitle">{e.title}</div>
              <div className="updateEntryMeta mono">{e.date} · v{e.version}</div>
            </div>
            <ul className="updateList">
              {e.items.map((it) => <li key={it}>{it}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
