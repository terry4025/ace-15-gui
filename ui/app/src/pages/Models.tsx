import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { AppConfigResponse, ModelsResponseNormalized } from "../types";

export function ModelsPage(props: { cfg: AppConfigResponse | null }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [models, setModels] = useState<ModelsResponseNormalized | null>(null);

  async function load() {
    setBusy(true);
    setErr("");
    try {
      const m = await api.getModels();
      setModels(m);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fallbackDit = props.cfg?.runtime?.available_dit_models || [];
  const rows = useMemo(() => {
    const fromApi = models?.models || [];
    if (fromApi.length) return fromApi;
    return fallbackDit.map((m, i) => ({
      id: `local-${i}-${m}`,
      name: m,
      is_default: i === 0,
      raw: { source: "runtime_available_dit_models" },
    }));
  }, [models?.models, fallbackDit]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel">
        <div className="panelHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div className="panelTitle">{t("models_title")}</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              {t("models_sub")} {models ? `(${models.source})` : ""}
            </div>
          </div>
          <button className="btn" onClick={load} disabled={busy}>{t("library_refresh")}</button>
        </div>
        <div className="panelBody">
          {err ? <div style={{ color: "var(--danger)", marginBottom: 10 }}>{err}</div> : null}
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("models_col_id")}</th>
                  <th>{t("models_col_name")}</th>
                  <th>{t("models_col_default")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.name}</td>
                    <td>{r.is_default ? "yes" : ""}</td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--muted)" }}>{t("models_empty")}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panelHeader"><div className="panelTitle">{t("models_runtime_dit")}</div></div>
          <div className="panelBody mono" style={{ color: "var(--muted)" }}>
            {(props.cfg?.runtime?.available_dit_models || []).join(", ") || "—"}
          </div>
        </div>
        <div className="panel">
          <div className="panelHeader"><div className="panelTitle">{t("models_runtime_lm")}</div></div>
          <div className="panelBody mono" style={{ color: "var(--muted)" }}>
            {(props.cfg?.runtime?.available_lm_models || []).join(", ") || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
