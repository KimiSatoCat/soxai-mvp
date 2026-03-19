import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";


// ── Phase 1 基盤: 正規化・期間スライスユーティリティ ──
import { buildNormalizedDaily } from "./utils/normalize.js";
import { sliceByLastNDays } from "./utils/dateSlice.js";
import {
  buildDailySleepCards,
  computeWeeklyOverview,
  buildSleepFindings,
} from "./utils/sleepAnalysis.js";
import { analyzeSleepCore } from "./utils/sleepCoreAnalysis.js";


import { buildLongTermMetrics } from "./utils/longTermMetrics.js";
import {
  buildHealthScoreFindings,
  buildHeartRateFindings,
  buildStressFindings,
  buildSpo2Findings,
  buildTempFindings,
} from "./utils/buildHealthLongTermFindings.js";
import {
  buildActivityScoreFindings,
  buildStepsFindings,
  buildActivityCaloriesFindings,
  buildReeCaloriesFindings,
  buildQolFindings,
} from "./utils/buildActivityLongTermFindings.js";


import RowDataPanel from "./components/RowDataPanel";
import UltraLongTermPanel from "./components/UltraLongTermPanel.jsx";
import CharacterPet from "./components/CharacterPet.jsx";
import { computeGrowthState, getLatestWeather } from "./utils/characterGrowth.js";

const PROXY = "http://localhost:3001";

const RANGE_PRESETS = [
  { key: "1m", label: "1ヶ月分", days: 30 },
  { key: "3m", label: "3ヶ月分", days: 90 },
  { key: "6m", label: "6ヶ月分", days: 180 },
  { key: "9m", label: "9ヶ月分", days: 270 },
  { key: "1y", label: "1年分", days: 365 },
  { key: "2y", label: "2年分", days: 730 },
  { key: "3y", label: "3年分", days: 1095 },
  { key: "4y", label: "4年分", days: 1460 },
  { key: "5y", label: "5年分", days: 1825 },
  { key: "10y", label: "10年分", days: 3650 },
  { key: "20y", label: "20年分", days: 7300 },
  { key: "30y", label: "30年分", days: 10950 },
];
const ANALYSIS_DAYS = {
  SHORT: 7,
  LONG: 30,
  ULTRA: 90,
};
const MIN_DAYS = {
  SHORT: 2,
  LONG: 14,
  ULTRA: 56,
};

/* ── UI primitives ───────────────────────────────────────── */

const C = {
  success: { bg: "#dcfce7", fg: "#166534", bd: "#86efac" },
  failure: { bg: "#fee2e2", fg: "#991b1b", bd: "#fca5a5" },
  warning: { bg: "#fef9c3", fg: "#854d0e", bd: "#fde047" },
  info:    { bg: "#dbeafe", fg: "#1e40af", bd: "#93c5fd" },
  pending: { bg: "#f1f5f9", fg: "#64748b", bd: "#cbd5e1" },
};

const THEME = {
  light: {
    bg:        "#f8fafc",
    cardBg:    "#ffffff",
    subBg:     "#f8fafc",
    text:      "#1e293b",
    textSub:   "#64748b",
    textMuted: "#94a3b8",
    border:    "#e2e8f0",
  },
  dark: {
    bg:        "#0f172a",
    cardBg:    "#1e293b",
    subBg:     "#1e293b",
    text:      "#f1f5f9",
    textSub:   "#94a3b8",
    textMuted: "#64748b",
    border:    "#334155",
  },
};

function Badge({ status }) {
  const c = C[status] || C.pending;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 6,
      fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg,
      border: `1px solid ${c.bd}`, letterSpacing: 0.3,
    }}>
      {(status || "pending").toUpperCase()}
    </span>
  );
}

function Card({ title, accent = "#334155", children }) {
  return (
    <div style={{
      background: "var(--theme-card-bg, #fff)", borderRadius: 10, padding: "18px 22px",
      marginBottom: 14, borderLeft: `4px solid ${accent}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      transition: "background 0.3s",
    }}>
      {title && <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "var(--theme-text, #1e293b)" }}>{title}</h3>}
      {children}
    </div>
  );
}

function Row({ label, value, status }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "5px 0", borderBottom: `1px solid var(--theme-border, #f1f5f9)`, gap: 8,
    }}>
      <span style={{ fontSize: 12, color: "var(--theme-text-sub, #64748b)", fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--theme-text, #1e293b)", display: "flex", alignItems: "center", gap: 6, textAlign: "right", wordBreak: "break-all" }}>
        {status && <Badge status={status} />}
        {value != null && value !== "" ? String(value) : ""}
      </span>
    </div>
  );
}

/* ── data utilities ──────────────────────────────────────── */
function safeNum(v) {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return n;
  }
  return null;
}

function extractRecords(data) {
  try {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
      for (const k of Object.keys(data)) {
        if (Array.isArray(data[k])) return data[k];
      }
    }
  } catch (_e) {}
  return [];
}

function minimalNormalize(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { rows: [], issues: ["No array data for normalization"] };
  }
  const issues = [];
  const rows = records.map((rec, idx) => {
    if (typeof rec !== "object" || rec === null) {
      issues.push(`Record ${idx}: not an object`);
      return { _idx: idx, _issue: "not_object" };
    }
    const out = { _idx: idx };
    for (const [k, v] of Object.entries(rec)) {
      if (v === null || v === undefined) {
        out[k] = null;
      } else if (typeof v === "number") {
        out[k] = v;
      } else if (typeof v === "string") {
        const n = Number(v);
        out[k] = (!isNaN(n) && v.trim() !== "") ? n : v;
      } else {
        out[k] = v;
      }
    }
    return out;
  });
  return { rows, issues };
}

/* ── error code label map ────────────────────────────────── */

const ERROR_LABELS = {
  CONFIG_MISSING: "設定不足（環境変数未設定）",
  ENDPOINT_NOT_CONFIGURED: "エンドポイント未設定",
  AUTH_FAILED: "認証失敗",
  NETWORK_ERROR: "ネットワークエラー",
  HTTP_ERROR: "HTTPエラー（非2xx）",
  EMPTY_RESPONSE: "空レスポンス",
  NON_JSON_RESPONSE: "非JSONレスポンス",
  JSON_PARSE_ERROR: "JSONパース失敗",
  UNEXPECTED_STRUCTURE: "想定外構造（JSONは取得済み）",
};

/* ── pipeline labels ─────────────────────────────────────── */

const PIPE_LABELS = {
  proxy:       "プロキシ疎通",
  login:       "ログイン認証",
  idToken:     "idToken 取得",
  localId:     "localId 取得",
  fetchInfo:   "DailyInfoData 取得",
  fetchDetail: "DailyDetailData 取得",
  parseInfo:   "DailyInfoData 解析",
  parseDetail: "DailyDetailData 解析",
  normalize:   "最小正規化",
  display:     "最小表示",
};

/* ── classify fetch result ───────────────────────────────── */

function classifyResult(r) {
  if (!r) return "pending";
  // 取得成功判定: success === true ならデータ取得自体は成功
  if (r.success) {
    if (r.structure) return "success";          // 構造解析も完了
    if (r.data) return "success";               // データあり（構造解析なしでも取得は成功）
    if (r.errorCode === "UNEXPECTED_STRUCTURE") return "warning";
    return "success";                           // success: true なら最低でも success
  }
  // 取得失敗だが致命的でないケース
  if (r.errorCode === "EMPTY_RESPONSE") return "warning";
  if (r.errorCode === "NON_JSON_RESPONSE") return "warning";
  if (r.errorCode === "JSON_PARSE_ERROR") return "warning";
  return "failure";
}



/* ================================================================
   MAIN APP
   ================================================================ */

export default function App() {

   const [tab, setTab] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authRes, setAuthRes] = useState(null);
  const [tokens, setTokens] = useState({ idToken: null, localId: null });

  const [fetchRes, setFetchRes] = useState(null);
  const [normInfo, setNormInfo] = useState(null);
  const [normDetail, setNormDetail] = useState(null);
  const [dailyNorm, setDailyNorm] = useState(null);

  const [longRangePreset, setLongRangePreset] = useState("1m");
const [ultraRangePreset, setUltraRangePreset] = useState("3m");

const [rowDataPreset, setRowDataPreset] = useState("1m");
const [rowDataStartDate, setRowDataStartDate] = useState("");
const [rowDataEndDate, setRowDataEndDate] = useState("");
const [rowDataConfirmed, setRowDataConfirmed] = useState(false);

  const [pipe, setPipe] = useState({
    proxy: "pending", login: "pending", idToken: "pending", localId: "pending",
    fetchInfo: "pending", fetchDetail: "pending",
    parseInfo: "pending", parseDetail: "pending",
    normalize: "pending", display: "pending",
  });

  const [busy, setBusy] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const theme = isDarkMode ? THEME.dark : THEME.light;

  useEffect(() => {
    fetch(`${PROXY}/api/health`).then(r => r.json())
      .then(d => setPipe(p => ({ ...p, proxy: d.status === "ok" ? "success" : "warning" })))
      .catch(() => setPipe(p => ({ ...p, proxy: "failure" })));
  }, []);

  const doFetchWithTokens = useCallback(async (idTokenArg, localIdArg) => {
    const useIdToken = idTokenArg || tokens.idToken;
    const useLocalId = localIdArg || tokens.localId;

    if (!useIdToken || !useLocalId) return;

    setBusy(true);
    setFetchRes(null);
    setNormInfo(null);
    setNormDetail(null);
    setDailyNorm(null);

    try {
      const r = await fetch(`${PROXY}/api/fetch-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: useIdToken,
          localId: useLocalId,
          dataType: "both",
        }),
      });

      const d = await r.json();
      setFetchRes(d);

      const ri = d.results?.dailyInfo;
      const rd = d.results?.dailyDetail;
      const infoStatus = classifyResult(ri);
      const detailStatus = classifyResult(rd);

      // fetchInfo/fetchDetail = API取得の成否
      // parseInfo/parseDetail = 構造解析の成否（取得成功が前提）
      const infoFetchStatus = !ri ? "pending"
        : ri.success ? "success"
        : (ri.errorCode === "EMPTY_RESPONSE" || ri.errorCode === "NON_JSON_RESPONSE" || ri.errorCode === "JSON_PARSE_ERROR") ? "warning"
        : "failure";
      const detailFetchStatus = !rd ? "pending"
        : rd.success ? "success"
        : (rd.errorCode === "EMPTY_RESPONSE" || rd.errorCode === "NON_JSON_RESPONSE" || rd.errorCode === "JSON_PARSE_ERROR") ? "warning"
        : "failure";
      const infoParseStatus = !ri ? "pending"
        : ri.structure ? "success"
        : ri.success && ri.data ? "warning"   // データはあるが構造解析なし
        : ri.success ? "warning"
        : "failure";
      const detailParseStatus = !rd ? "pending"
        : rd.structure ? "success"
        : rd.success && rd.data ? "warning"
        : rd.success ? "warning"
        : "failure";

      setPipe(p => ({
        ...p,
        fetchInfo: infoFetchStatus,
        fetchDetail: detailFetchStatus,
        parseInfo: infoParseStatus,
        parseDetail: detailParseStatus,
      }));

      let anyNorm = false;
      let newNormInfo = null;
      let newNormDetail = null;

      if (ri?.success && ri.data) {
        const recs = extractRecords(ri.data);
        if (recs.length > 0) {
          newNormInfo = minimalNormalize(recs);
          anyNorm = true;
        }
      }

      if (rd?.success && rd.data) {
        const recs = extractRecords(rd.data);
        if (recs.length > 0) {
          newNormDetail = minimalNormalize(recs);
          anyNorm = true;
        }
      }

      setNormInfo(newNormInfo);
      setNormDetail(newNormDetail);

      // ── normalize ステータス: minimalNormalize の成否 ──
      setPipe(p => ({
        ...p,
        normalize: anyNorm ? "success" : (ri?.success || rd?.success ? "warning" : "failure"),
      }));

      // ── display ステータス: buildNormalizedDaily の成否（独立判定） ──
      let dailyNormBuilt = false;
      if (anyNorm) {
        const infoRowsForNorm = newNormInfo?.rows || [];
        const detailRowsForNorm = newNormDetail?.rows || [];
        try {
          const result = buildNormalizedDaily(infoRowsForNorm, detailRowsForNorm);

console.log("infoRowsForNorm length =", infoRowsForNorm.length);
console.log("detailRowsForNorm length =", detailRowsForNorm.length);
console.log("normalizedDaily length =", result?.normalizedDaily?.length);
console.log("normalizedDaily first date =", result?.stats?.dateFrom);
console.log("normalizedDaily last date =", result?.stats?.dateTo);

if (result?.normalizedDaily?.length > 0) {
  setDailyNorm(result);
  dailyNormBuilt = true;
}
        } catch (e) {
          console.error("[buildNormalizedDaily] 正規化失敗:", e);
        }
      }

      setPipe(p => ({
        ...p,
        display: dailyNormBuilt ? "success" : anyNorm ? "warning" : "pending",
      }));

      if (dailyNormBuilt) {
        setTab("home");
      }
      
    } catch (err) {
      console.error("[doFetchWithTokens] エラー:", err);
      setFetchRes({
        success: false,
        errorCode: "NETWORK_ERROR",
        errorDetail: err.message,
      });
      setPipe(p => ({
        ...p,
        fetchInfo: p.fetchInfo === "pending" ? "failure" : p.fetchInfo,
        fetchDetail: p.fetchDetail === "pending" ? "failure" : p.fetchDetail,
        normalize: p.normalize === "pending" ? "failure" : p.normalize,
        display: p.display === "pending" ? "failure" : p.display,
      }));
    }

    setBusy(false);
  }, [tokens.idToken, tokens.localId]);

  const doFetch = useCallback(() => {
    return doFetchWithTokens();
  }, [doFetchWithTokens]);

  const doLogin = useCallback(async () => {
    setBusy(true);
    setAuthRes(null);
    setFetchRes(null);
    setNormInfo(null);
    setNormDetail(null);
    setDailyNorm(null);

    setPipe(p => ({
      ...p,
      login: "pending",
      idToken: "pending",
      localId: "pending",
      fetchInfo: "pending",
      fetchDetail: "pending",
      parseInfo: "pending",
      parseDetail: "pending",
      normalize: "pending",
      display: "pending",
    }));

    try {
      const r = await fetch(`${PROXY}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();

      setAuthRes(d);

      if (d.success && d.idToken && d.localId) {
        setTokens({ idToken: d.idToken, localId: d.localId });
        setPipe(p => ({
          ...p,
          login: "success",
          idToken: "success",
          localId: "success",
        }));

        await doFetchWithTokens(d.idToken, d.localId);
        return;
      }

      setPipe(p => ({
        ...p,
        login: d.success ? "warning" : "failure",
        idToken: d.idToken ? "success" : "failure",
        localId: d.localId ? "success" : "failure",
      }));
    } catch (err) {
      setAuthRes({
        success: false,
        errorCode: "NETWORK_ERROR",
        errorDetail: err.message,
      });
      setPipe(p => ({
        ...p,
        login: "failure",
        idToken: "failure",
        localId: "failure",
      }));
    }

    setBusy(false);
  }, [email, password, doFetchWithTokens]);

  const structInfo = fetchRes?.results?.dailyInfo?.structure || null;
  const structDetail = fetchRes?.results?.dailyDetail?.structure || null;

    const TABS = [
  { id: "login", label: "ログイン / 設定" },
  { id: "diag", label: "データ診断" },
  { id: "home", label: "ホーム" },
  { id: "short", label: "短期分析" },
  { id: "long", label: "長期分析" },
  { id: "ultra", label: "超長期分析" },
  { id: "raw", label: "ROW DATA" },
];

  return (
    <div style={{
      minHeight: "100vh",
      background: theme.bg,
      fontFamily: "'Noto Sans JP','Helvetica Neue',Arial,sans-serif",
      "--theme-bg": theme.bg,
      "--theme-card-bg": theme.cardBg,
      "--theme-sub-bg": theme.subBg,
      "--theme-text": theme.text,
      "--theme-text-sub": theme.textSub,
      "--theme-text-muted": theme.textMuted,
      "--theme-border": theme.border,
      transition: "background 0.3s",
    }}>

      <header style={{
        background: "linear-gradient(135deg,#0f172a,#1e3a5f)", color: "#fff",
        padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>SOXAI Health Intelligence</h1>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: "#94a3b8" }}>MVP Stage 6 revised — Connection &amp; Diagnostics</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>Proxy:</span>
          <Badge status={pipe.proxy} />
          <button
            onClick={() => setIsDarkMode(v => !v)}
            style={{
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600,
              color: "#e2e8f0", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {isDarkMode ? "☀️ ライト" : "🌙 ダーク"}
          </button>
        </div>
      </header>

      <nav style={{ display: "flex", background: theme.cardBg, borderBottom: `1px solid ${theme.border}`, padding: "0 12px", transition: "background 0.3s" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
            fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? "#2563eb" : "#64748b",
            borderBottom: tab === t.id ? "2px solid #2563eb" : "2px solid transparent",
          }}>{t.label}</button>
        ))}
      </nav>

      <main style={{ maxWidth: 920, margin: "0 auto", padding: "18px 14px" }}>

        {tab === "login" && (
          <>
            <Card title="ログイン情報" accent="#2563eb">
              <div style={{ display: "grid", gap: 10, maxWidth: 400 }}>
                <label style={lbl}>メールアドレス</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="user@example.com" />
                <label style={lbl}>パスワード</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inp} />
                    <button onClick={doLogin} disabled={busy || !email || !password} style={{ ...btn, opacity: (busy || !email || !password) ? 0.5 : 1 }}>
                  {busy ? "処理中…" : "ログイン"}
                </button>
              </div>
            </Card>
            {authRes && (
              <Card title="認証結果" accent={authRes.success ? "#16a34a" : "#dc2626"}>
                <Row label="結果" value={authRes.success ? "認証成功" : "認証失敗"} status={authRes.success ? "success" : "failure"} />
                {authRes.errorCode && <Row label="エラーコード" value={`${authRes.errorCode} — ${ERROR_LABELS[authRes.errorCode] || ""}`} />}
                {authRes.firebaseError && <Row label="Firebase エラー" value={authRes.firebaseError} />}
                {authRes.errorDetail && <Row label="詳細" value={authRes.errorDetail} />}
                {authRes.idToken && <Row label="idToken" value={`取得済 (${authRes.idToken.slice(0, 16)}…)`} status="success" />}
                {authRes.localId && <Row label="localId" value={authRes.localId} status="success" />}
                {authRes.warning && <Row label="警告" value={authRes.warning} status="warning" />}
              </Card>
            )}
            {tokens.idToken && (
              <Card title="データ同期" accent="#7c3aed">
                {dailyNorm ? (
                  <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 6px" }}>
                    取得済み: {dailyNorm.stats.totalDays}日分（{dailyNorm.stats.dateFrom} 〜 {dailyNorm.stats.dateTo}）
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 6px" }}>
                    {busy ? "データ取得中…" : "データ未取得、または取得に失敗しました。"}
                  </p>
                )}
                <button onClick={doFetch} disabled={busy} style={{ ...btn, background: "#7c3aed", opacity: busy ? 0.5 : 1 }}>
                  {busy ? "同期中…" : "🔄 再同期（サーバから全履歴を再取得）"}
                </button>
              </Card>
            )}
          </>
        )}

        {tab === "diag" && (
          <>
            <Card title="パイプライン状態一覧" accent="#f59e0b">
              {Object.entries(pipe).map(([k, v]) => (
                <Row key={k} label={PIPE_LABELS[k] || k} value="" status={v} />
              ))}
            </Card>
            <EndpointDiagCard label="DailyInfoData" result={fetchRes?.results?.dailyInfo} structure={structInfo} norm={normInfo} accent="#2563eb" />
            <EndpointDiagCard label="DailyDetailData" result={fetchRes?.results?.dailyDetail} structure={structDetail} norm={normDetail} accent="#7c3aed" />
            {!fetchRes && !authRes && (
              <Card accent="#94a3b8">
                <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", margin: 0 }}>
                  ログインタブからログインし、データ取得を実行してください。
                </p>
              </Card>
            )}
          </>
        )}

        

          {tab === "home" && (
  <HomeScreen
    normInfo={normInfo}
    normDetail={normDetail}
    dailyRows={dailyNorm?.normalizedDaily || []}
    fetchRes={fetchRes}
    onGoShort={() => setTab("short")}
    onGoLong={() => setTab("long")}
    onGoUltra={() => setTab("ultra")}
    isDarkMode={isDarkMode}
  />
)}

        {tab === "short" && (
  <ShortTermPanel dailyNorm={dailyNorm} />
)}

         {tab === "long" && (
  <LongTermPanel
    normInfo={normInfo}
    normDetail={normDetail}
    slicedRows={dailyNorm?.normalizedDaily
      ? sliceByLastNDays(dailyNorm.normalizedDaily, ANALYSIS_DAYS.LONG)
      : null}
  />
)}

    {tab === "ultra" && (
  <UltraLongTermPanel
    allRows={dailyNorm?.normalizedDaily || []}
    defaultDays={90}
  />
)}

{tab === "raw" && (
  <RowDataPanel
    infoRows={normInfo?.rows || []}
    detailRows={normDetail?.rows || []}
    normalizedRows={dailyNorm?.normalizedDaily || []}
  />
)}
      </main>
    </div>
  );
}



/* ================================================================
   Endpoint Diagnostic Card
   ================================================================ */

function EndpointDiagCard({ label, result, structure, norm, accent }) {
  if (!result) return null;

  const hasStructure = !!structure;
  const isNonJson = result.errorCode === "NON_JSON_RESPONSE" || result.errorCode === "JSON_PARSE_ERROR";
  const isEmpty = result.errorCode === "EMPTY_RESPONSE";
  const isConfig = result.errorCode === "CONFIG_MISSING" || result.errorCode === "ENDPOINT_NOT_CONFIGURED";

  return (
    <Card title={`${label} — 診断結果`} accent={accent}>
      <Row label="取得結果" value="" status={result.success ? "success" : (isNonJson || isEmpty ? "warning" : "failure")} />
      {result.errorCode && (
        <Row label="エラーコード" value={`${result.errorCode} — ${ERROR_LABELS[result.errorCode] || ""}`} status={isConfig ? "failure" : (isNonJson || isEmpty ? "warning" : undefined)} />
      )}
      {result.httpStatus != null && <Row label="HTTP ステータス" value={result.httpStatus} />}
      {result.contentType && <Row label="Content-Type" value={result.contentType} />}
      {result.bodyLength != null && <Row label="ボディサイズ" value={`${result.bodyLength} bytes`} />}
      {result.bodyPreview && !hasStructure && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 11, color: accent, cursor: "pointer" }}>レスポンスプレビュー</summary>
          <pre style={preStyle}>{result.bodyPreview.slice(0, 800)}</pre>
        </details>
      )}
      {hasStructure && (
        <>
          <div style={{ marginTop: 10, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#475569", margin: "0 0 4px" }}>構造分析:</p>
            <Row label="トップレベル型" value={structure.topLevelType} />
            <Row label="配列" value={structure.isArray ? "はい" : "いいえ"} />
            <Row label="レコード数" value={structure.recordCount} status={structure.recordCount > 0 ? "success" : "warning"} />
            {structure.nestedArrayKey && <Row label="ネスト配列キー" value={structure.nestedArrayKey} />}
          </div>
          {structure.fields && structure.fields.length > 0 && (
            <Section title="フィールド一覧">
              <div style={monoBox}>
                {structure.fields.map(f => (
                  <div key={f} style={{ padding: "1px 0" }}>
                    <span style={{ color: accent }}>{f}</span>
                    <span style={{ color: "#94a3b8" }}> : {structure.fieldTypes?.[f] || "?"}</span>
                    {structure.sampleRecord && (
                      <span style={{ color: "#64748b" }}> = {JSON.stringify(structure.sampleRecord[f])?.slice(0, 80)}</span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}
          <Section title="純正スコア候補フィールド" note="※候補のみ。SOXAI純正値であるかは未確認。">
            {structure.nativeScoreCandidates.length === 0
              ? <p style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", margin: 0 }}>候補なし</p>
              : structure.nativeScoreCandidates.map((c, i) => (
                <Row key={i} label={c.field} value={c.sampleValue != null ? String(c.sampleValue) : "—"} status="info" />
              ))
            }
          </Section>
          <Section title="時刻フィールド候補">
            {structure.timeFieldCandidates.length === 0
              ? <p style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", margin: 0 }}>候補なし</p>
              : structure.timeFieldCandidates.map((c, i) => (
                <Row key={i} label={`${c.field} (${c.guessedFormat})`} value={c.sampleValue != null ? String(c.sampleValue) : "—"} status="info" />
              ))
            }
          </Section>
        </>
      )}
      {norm && (
        <Section title="正規化結果（最小）">
          <Row label="レコード数" value={norm.rows.length} />
          {norm.issues.length > 0 && norm.issues.map((s, i) => (
            <p key={i} style={{ fontSize: 11, color: "#dc2626", margin: "1px 0" }}>• {s}</p>
          ))}
          {norm.rows.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ fontSize: 11, color: accent, cursor: "pointer" }}>先頭レコード</summary>
              <pre style={preStyle}>{JSON.stringify(norm.rows[0], null, 2)}</pre>
            </details>
          )}
        </Section>
      )}
      {isNonJson && (
        <div style={{ marginTop: 8, padding: 8, background: "#fef9c3", borderRadius: 6 }}>
          <p style={{ fontSize: 11, color: "#854d0e", margin: 0 }}>
            このレスポンスはJSON形式ではありませんでした。これはAPIの仕様未確定に起因する可能性があります。
            エンドポイントパスやContent-Typeを確認してください。
          </p>
        </div>
      )}
      {isEmpty && (
        <div style={{ marginTop: 8, padding: 8, background: "#fef9c3", borderRadius: 6 }}>
          <p style={{ fontSize: 11, color: "#854d0e", margin: 0 }}>
            レスポンスボディが空でした。エンドポイントパス、期間指定、認証状態を確認してください。
          </p>
        </div>
      )}
    </Card>
  );
}

/* ================================================================
   HomeScreen — Dashboard
   ================================================================ */

function HomeScreen({ normInfo, normDetail, dailyRows, fetchRes, onGoShort, onGoLong, onGoUltra, isDarkMode }) {
  const hasInfo = normInfo && normInfo.rows.length > 0;
  const hasDetail = normDetail && normDetail.rows.length > 0;

  if (!hasInfo && !hasDetail) {
    return (
      <Card accent="#94a3b8">
        <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", margin: 0 }}>
          データなし — ログイン後にデータ取得を実行してください。
          {fetchRes && " (データ取得済みですが表示可能なデータがありません。診断タブを確認してください。)"}
        </p>
      </Card>
    );
  }

  const rows = Array.isArray(dailyRows) ? dailyRows : [];
const latest = rows.length > 0
  ? rows[rows.length - 1]
  : (hasInfo ? normInfo.rows[normInfo.rows.length - 1] : {});
  const detailRows = hasDetail ? normDetail.rows : [];

  const sleepScore = safeNum(latest.sleep_score);
  const healthScore = safeNum(latest.health_score);
  const activityScore = safeNum(latest.activity_score);
  const qolScore = safeNum(latest.qol_score);

  const dateField = findFieldValue(latest, ["_time", "time", "date"]);
  const displayDate = dateField ? formatDateLabel(dateField) : null;

  const sleepDetail = extractSleepDetail(detailRows, latest);

  const steps = safeNum(latest.activity_steps) ?? safeNum(latest.steps) ?? safeNum(latest.step) ?? safeNum(latest.step_count);
  const calories = safeNum(latest.activity_calories) ?? safeNum(latest.activity_calorie) ?? safeNum(latest.calories) ?? safeNum(latest.calorie) ?? safeNum(latest.cal) ?? safeNum(latest.active_calories) ?? safeNum(latest.activity_ree_calories);

  const growthState = computeGrowthState(rows);
  const weather = getLatestWeather(rows);
  console.log("HomeScreen rows length =", rows.length);
console.log("HomeScreen first row =", rows[0]);
console.log("HomeScreen last row =", rows[rows.length - 1]);
console.log("growthState =", growthState);
  const isDark = !!isDarkMode;

  return (
    <>
      

      <CharacterPet
  growthState={growthState}
  weather={weather}
  isDarkMode={isDarkMode}
/>

      {/* ── Advice placeholder ── */}
      <Card accent="#059669">
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#166534", margin: "0 0 2px" }}>💡 助言機能（準備中）</p>
          <p style={{ fontSize: 10, color: "#64748b", margin: 0 }}>分析レイヤー完成後に実装予定</p>
        </div>
      </Card>

      <button onClick={onGoShort} style={{
        width: "100%", padding: "12px 0", background: "#f0f4ff", color: "#2563eb",
        border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: "pointer", marginBottom: 12,
      }}>
        📊 直近の推移を見る（短期分析）
      </button>

            <button onClick={onGoLong} style={{
        width: "100%", padding: "12px 0", background: "#eff6ff", color: "#1d4ed8",
        border: "1px solid #93c5fd", borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: "pointer", marginBottom: 12,
      }}>
        📈 長期傾向を見る（長期分析）
      </button>

      <button onClick={onGoUltra} style={{
        width: "100%", padding: "12px 0", background: "#faf5ff", color: "#7c3aed",
        border: "1px solid #d8b4fe", borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: "pointer", marginBottom: 12,
      }}>
        🔮 周期性を見る（超長期分析）
      </button>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
  <PlaceholderTab label="臨床グレード" desc="詳細データ確認後" />
</div>

      <p style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.5, margin: 0, padding: "0 4px" }}>
        本画面のスコアはSOXAI APIから取得した値です。SOXAIアプリ上の表示値との完全な一致は確認されていません。
        フルーツ育成・環境演出・虹演出は本ツール独自のモチベーション演出であり、SOXAI純正機能ではありません。
      </p>
    </>
  );
}

/* ── Home sub-components ─────────────────────────────────── */

function HeroScore({ label, value, color, bgColor, icon }) {
  return (
    <div style={{
      flex: 1, background: bgColor, borderRadius: 10, padding: "14px 10px",
      textAlign: "center", border: `1px solid ${color}22`,
    }}>
      <p style={{ fontSize: 10, color: "#64748b", margin: "0 0 4px", fontWeight: 600 }}>
        {icon} {label}
      </p>
      <p style={{ fontSize: 34, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>
        {value != null ? value : "—"}
      </p>
    </div>
  );
}

function SleepDetailItem({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#64748b" }}>{label}:</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#1e293b" }}>
        {value != null ? value : "—"}
      </span>
    </div>
  );
}

/* ── Home helpers ────────────────────────────────────────── */



function findFieldValue(record, candidates) {
  if (!record) return null;
  for (const c of candidates) {
    if (record[c] != null) return record[c];
  }
  return null;
}

function formatDateLabel(val) {
  if (typeof val === "string") {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${parseInt(m[2])}月${parseInt(m[3])}日`;
    return val.slice(0, 10);
  }
  return String(val).slice(0, 10);
}

function extractSleepDetail(detailRows, infoRecord) {
  const out = { bedtime: null, wakeTime: null, totalSleep: null };

  const infoDate = findFieldValue(infoRecord, ["_time", "time", "date"]);
  const infoDateStr = infoDate ? String(infoDate).slice(0, 10) : null;

  let targetRow = null;
  if (detailRows.length > 0) {
    if (infoDateStr) {
      targetRow = detailRows.find(r => {
        const t = findFieldValue(r, ["_time", "time", "date"]);
        return t && String(t).slice(0, 10) === infoDateStr;
      });
    }
    if (!targetRow) targetRow = detailRows[detailRows.length - 1];
  }

  const sources = [];
  if (targetRow) sources.push(targetRow);
  if (infoRecord && Object.keys(infoRecord).length > 0) sources.push(infoRecord);
  if (sources.length === 0) return out;

  const bedPartials = [
    "sleep_start_time", "sleep_start", "bedtime", "sleep_onset", "sleep_begin",
    "bed_time", "sleep_began", "start_sleep",
  ];
  const wakePartials = [
    "sleep_end_time", "sleep_end", "wake_time", "waketime", "wake_up",
    "sleep_offset", "wakeup_time", "end_sleep",
  ];
  const totalPartials = [
    "sleep_total_time_true", "sleep_total_time_exclude_awake",
    "sleep_total_time_include_latency", "sleep_total_time",
    "total_sleep_time", "total_sleep", "sleep_duration", "sleep_total",
    "sleep_time_total", "sleep_time",
  ];

  for (const src of sources) {
    if (out.bedtime == null) {
      const k = findKey(src, bedPartials);
      if (k) out.bedtime = formatTimeValue(src[k]);
    }
    if (out.wakeTime == null) {
      const k = findKey(src, wakePartials);
      if (k) out.wakeTime = formatTimeValue(src[k]);
    }
    if (out.totalSleep == null) {
      const k = findKey(src, totalPartials);
      if (k) out.totalSleep = formatDurationValue(src[k]);
    }
  }

  return out;
}

function findKey(record, partials) {
  if (!record) return null;
  const keys = Object.keys(record);
  for (const p of partials) {
    const found = keys.find(k => k.toLowerCase().includes(p.toLowerCase()));
    if (found && record[found] != null) return found;
  }
  return null;
}

function formatTimeValue(v) {
  if (v == null) return null;
  if (typeof v === "number") {
    if (v > 1e9) {
      const d = new Date(v > 1e12 ? v : v * 1000);
      if (!isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }
    if (v >= 0 && v < 48) {
      const h = Math.floor(v);
      const m = Math.round((v - h) * 60);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return String(v);
  }
  if (typeof v === "string") {
    const m = v.match(/(\d{1,2}:\d{2})/);
    if (m) return m[1];
    return v.slice(0, 16);
  }
  return String(v);
}

function formatDurationValue(v) {
  if (v == null) return null;
  if (typeof v === "number") {
    let mins;
    if (v < 48) {
      const h = Math.floor(v);
      const m = Math.round((v - h) * 60);
      return `${h}時間${m > 0 ? m + "分" : ""}`;
    } else if (v < 1500) {
      mins = v;
    } else {
      mins = Math.round(v / 60);
    }
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${h}時間${m > 0 ? m + "分" : ""}`;
  }
  if (typeof v === "string") {
    const hms = v.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (hms) {
      const h = parseInt(hms[1]);
      const m = parseInt(hms[2]);
      return `${h}時間${m > 0 ? m + "分" : ""}`;
    }
    const n = Number(v);
    if (!isNaN(n) && v.trim() !== "") return formatDurationValue(n);
    return v;
  }
  return String(v);
}

function extractSleepHours(record) {
  if (!record) return null;
  const hourCandidates = [
    "sleep_hours", "sleep_hour", "sleep_duration_hours",
    "total_sleep_hours", "sleep_time_hours",
  ];
  for (const k of hourCandidates) {
    const v = safeNum(record[k]);
    if (v != null && v > 0 && v < 24) return Math.round(v * 100) / 100;
  }

  const durationCandidates = [
    "sleep_total_time_true", "sleep_total_time_exclude_awake",
    "sleep_total_time_include_latency", "sleep_total_time",
    "total_sleep_time", "total_sleep", "sleep_duration",
    "sleep_total", "sleep_time_total", "sleep_time",
  ];
  for (const k of durationCandidates) {
    const v = safeNum(record[k]);
    if (v == null) continue;
    if (v > 0 && v < 24) return Math.round(v * 100) / 100;
    if (v >= 60 && v < 1440) return Math.round((v / 60) * 100) / 100;
    if (v >= 1440) return Math.round((v / 3600) * 100) / 100;
  }

  for (const [k, raw] of Object.entries(record)) {
    const lk = k.toLowerCase();
    if (!lk.includes("sleep")) continue;
    if (!(lk.includes("time") || lk.includes("hour") || lk.includes("duration"))) continue;
    const v = safeNum(raw);
    if (v == null) continue;
    if (v > 0 && v < 24) return Math.round(v * 100) / 100;
    if (v >= 60 && v < 1440) return Math.round((v / 60) * 100) / 100;
    if (v >= 1440) return Math.round((v / 3600) * 100) / 100;
  }
  return null;
}

function mergeSleepHours(infoDaily, detailRows) {
  const map = {};
  for (const d of infoDaily) {
    const h = extractSleepHours(d);
    if (h != null) map[d._date] = h;
  }
  for (const r of (detailRows || [])) {
    const t = findFieldValue(r, ["_time", "time", "date"]);
    if (!t) continue;
    const ds = String(t).slice(0, 10);
    const h = extractSleepHours(r);
    if (h != null) map[ds] = h;
  }
  return map;
}

function detectPeriodicity(values, candidatePeriods) {
  const n = values.length;
  if (n < 30) return [];
  const valid = values.filter(v => v != null);
  if (valid.length < 20) return candidatePeriods.map(p => ({ period: p, corr: 0 }));
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length;
  if (variance < 1) return candidatePeriods.map(p => ({ period: p, corr: 0 }));

  return candidatePeriods.filter(lag => lag < n - 5).map(lag => {
    let sum = 0, cnt = 0;
    for (let i = 0; i < n - lag; i++) {
      if (values[i] != null && values[i + lag] != null) {
        sum += (values[i] - mean) * (values[i + lag] - mean);
        cnt++;
      }
    }
    const corr = cnt > 5 ? Math.round(sum / (cnt * variance) * 100) / 100 : 0;
    return { period: lag, corr };
  });
}

function extractDailyData(rows) {
  if (!rows || rows.length === 0) return [];
  const map = {};
  for (const r of rows) {
    const t = findFieldValue(r, ["_time", "time", "date"]);
    if (!t) continue;
    const ds = String(t).slice(0, 10);
    map[ds] = r;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ds, r]) => ({ ...r, _date: ds }));
}

function safeAvgArr(arr) {
  const valid = arr.filter(v => v != null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10;
}

function movingAvg(values, window) {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1).filter(v => v != null);
    return slice.length > 0
      ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length * 10) / 10
      : null;
  });
}

function buildLongTermAnalysis(rows, detailRows) {
  const daily = extractDailyData(rows);
  if (daily.length < 14) {
    return { sufficient: false, dataLength: daily.length, reason: "14日以上のデータが必要です" };
  }

  const metrics = ["sleep_score", "health_score", "activity_score"];
  const values = {};
  for (const m of metrics) {
    values[m] = daily.map(d => safeNum(d[m]));
  }

  const ma7 = {};
  const ma30 = {};
  for (const m of metrics) {
    ma7[m] = movingAvg(values[m], 7);
    ma30[m] = movingAvg(values[m], 30);
  }

  const dowBuckets = [[], [], [], [], [], [], []];
  const dowLabels = ["日", "月", "火", "水", "木", "金", "土"];


  
  for (const d of daily) {
    const dow = new Date(d._date).getDay();
    const hs = safeNum(d.health_score);
    if (hs != null) dowBuckets[dow].push(hs);
  }
  const dowAvg = dowBuckets.map((b, i) => ({
    day: dowLabels[i],
    avg: safeAvgArr(b),
    count: b.length,
  }));

  const sleepMap = mergeSleepHours(daily, detailRows);
  const sleepHours = daily.map(d => sleepMap[d._date] ?? null).filter(v => v != null);

  let sleepStdDev = null;
  let sleepMetricUsed = "hours";

  if (sleepHours.length >= 7) {
    const mean = sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length;
    sleepStdDev =
      Math.round(
        Math.sqrt(
          sleepHours.reduce((a, b) => a + (b - mean) ** 2, 0) / sleepHours.length
        ) * 100
      ) / 100;
  } else {
    const ssVals = values.sleep_score.filter(v => v != null);
    if (ssVals.length >= 7) {
      const mean = ssVals.reduce((a, b) => a + b, 0) / ssVals.length;
      sleepStdDev =
        Math.round(
          Math.sqrt(
            ssVals.reduce((a, b) => a + (b - mean) ** 2, 0) / ssVals.length
          ) * 100
        ) / 100;
      sleepMetricUsed = "score";
    }
  }

  const trends = {};
  for (const m of metrics) {
    const mid = Math.floor(values[m].length / 2);
    const fh = safeAvgArr(values[m].slice(0, mid));
    const sh = safeAvgArr(values[m].slice(mid));
    trends[m] = {
      firstHalf: fh,
      secondHalf: sh,
      direction:
        fh != null && sh != null
          ? sh - fh > 3
            ? "improving"
            : sh - fh < -3
              ? "declining"
              : "stable"
          : "unknown",
    };
  }

  const chartSlice = daily.slice(-90);
  const chartData = chartSlice.map((d, i) => {
    const idx = daily.length - chartSlice.length + i;
    return {
      label: d._date.slice(5),
      health: safeNum(d.health_score),
      sleep: safeNum(d.sleep_score),
      activity: safeNum(d.activity_score),
      healthMA: ma7.health_score[idx],
      sleepMA: ma7.sleep_score[idx],
      activityMA: ma7.activity_score[idx],
    };
  });

  const longInsights = [];
  for (const m of metrics) {
    const lb = m === "sleep_score" ? "睡眠" : m === "health_score" ? "体調" : "活動";
    const t = trends[m];
    if (t.direction === "improving") {
      longInsights.push(`${lb}はデータ期間を通じて緩やかに改善傾向です`);
    } else if (t.direction === "declining") {
      longInsights.push(`${lb}はデータ期間を通じてやや低下傾向が見られます`);
    }
  }

  if (sleepStdDev != null && sleepMetricUsed === "hours" && sleepStdDev > 1.5) {
    longInsights.push(
      `睡眠時間のばらつきが大きい傾向があります（標準偏差 ${sleepStdDev}時間）。リズムの安定が改善の鍵になる可能性があります`
    );
  } else if (sleepStdDev != null && sleepMetricUsed === "score" && sleepStdDev > 12) {
    longInsights.push(
      `睡眠スコアのばらつきが大きい傾向があります（標準偏差 ${sleepStdDev}）。睡眠の質が安定していない可能性があります`
    );
  }

  const worstDow = dowAvg
    .filter(d => d.count >= 2)
    .sort((a, b) => (a.avg ?? 999) - (b.avg ?? 999))[0];

  const bestDow = dowAvg
    .filter(d => d.count >= 2)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))[0];

  if (
    worstDow &&
    bestDow &&
    worstDow.avg != null &&
    bestDow.avg != null &&
    bestDow.avg - worstDow.avg >= 5
  ) {
    longInsights.push(
      `曜日別では${worstDow.day}曜日に体調が低くなりやすく、${bestDow.day}曜日が最も高い傾向です`
    );
  }

  return {
    sufficient: true,
    dataLength: daily.length,
    dateFrom: daily[0]._date,
    dateTo: daily[daily.length - 1]._date,
    trends,
    dowAvg,
    sleepStdDev,
    sleepMetricUsed,
    chartData,
    longInsights,
    ma7,
    ma30,
  };
}

/* ══════════════════════════════════════════════════════════════
   Ultra-Long-Term Analysis — 第三層
   週周期・月周期・長い反復性の検出に特化
   中医学は注釈レイヤーとしてのみ使用（推定エンジンには不使用）
   ══════════════════════════════════════════════════════════════ */

// ── Helper: 21-day robust smooth (median-based) ──
function robustSmooth(values, windowSize) {
  return values.map((_, i) => {
    const half = Math.floor(windowSize / 2);
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    const win = [];
    for (let j = start; j < end; j++) {
      if (values[j] != null) win.push(values[j]);
    }
    if (win.length === 0) return null;
    win.sort((a, b) => a - b);
    return win[Math.floor(win.length / 2)];
  });
}

// ── Helper: detrend series by subtracting smooth ──
function detrendSeries(values, smoothed) {
  return values.map((v, i) => {
    if (v == null || smoothed[i] == null) return null;
    return v - smoothed[i];
  });
}

// ── Helper: simplified Lomb-Scargle-like power scan for mostly-regular daily series ──
// 欠測は null のまま扱い、補間しない
function lombScarglePower(residuals, candidatePeriods) {
  const n = residuals.length;
  const times = [];
  const vals = [];

  for (let i = 0; i < n; i++) {
    if (residuals[i] != null) {
      times.push(i);
      vals.push(residuals[i]);
    }
  }

  const N = vals.length;
  if (N < 20) return candidatePeriods.map(() => 0);

  const mean = vals.reduce((a, b) => a + b, 0) / N;
  const centered = vals.map(v => v - mean);
  const variance = centered.reduce((a, b) => a + b * b, 0) / N;
  if (variance < 1e-6) return candidatePeriods.map(() => 0);

  return candidatePeriods.map(period => {
    const omega = (2 * Math.PI) / period;

    let s2 = 0;
    let c2 = 0;
    for (let j = 0; j < N; j++) {
      s2 += Math.sin(2 * omega * times[j]);
      c2 += Math.cos(2 * omega * times[j]);
    }
    const tau = Math.atan2(s2, c2) / (2 * omega);

    let cc = 0;
    let ss = 0;
    let ccs = 0;
    let sss = 0;

    for (let j = 0; j < N; j++) {
      const cosArg = Math.cos(omega * (times[j] - tau));
      const sinArg = Math.sin(omega * (times[j] - tau));
      cc += centered[j] * cosArg;
      ss += centered[j] * sinArg;
      ccs += cosArg * cosArg;
      sss += sinArg * sinArg;
    }

    const power =
      ccs > 0 && sss > 0
        ? 0.5 * ((cc * cc) / ccs + (ss * ss) / sss) / variance
        : 0;

    return Math.round(power * 1000) / 1000;
  });
}

// ── Helper: cosinor fit for a given period ──
// returns { amplitude, phase, rSquared, betaCos, betaSin, meanLevel }
function cosinorFit(values, period) {
  const times = [];
  const vals = [];

  for (let i = 0; i < values.length; i++) {
    if (values[i] != null) {
      times.push(i);
      vals.push(values[i]);
    }
  }

  const N = vals.length;
  if (N < 10) return null;

  const omega = (2 * Math.PI) / period;

  let sumY = 0;
  let sumC = 0;
  let sumS = 0;
  let sumCC = 0;
  let sumSS = 0;
  let sumCS = 0;
  let sumYC = 0;
  let sumYS = 0;

  for (let j = 0; j < N; j++) {
    const c = Math.cos(omega * times[j]);
    const s = Math.sin(omega * times[j]);
    sumY += vals[j];
    sumC += c;
    sumS += s;
    sumCC += c * c;
    sumSS += s * s;
    sumCS += c * s;
    sumYC += vals[j] * c;
    sumYS += vals[j] * s;
  }

  const meanY = sumY / N;
  const cCentered = sumYC - meanY * sumC;
  const sCentered = sumYS - meanY * sumS;
  const ccCentered = sumCC - (sumC * sumC) / N;
  const ssCentered = sumSS - (sumS * sumS) / N;
  const csCentered = sumCS - (sumC * sumS) / N;

  const det = ccCentered * ssCentered - csCentered * csCentered;
  if (Math.abs(det) < 1e-10) return null;

  const betaCos = (ssCentered * cCentered - csCentered * sCentered) / det;
  const betaSin = (ccCentered * sCentered - csCentered * cCentered) / det;

  const amplitude = Math.sqrt(betaCos * betaCos + betaSin * betaSin);
  const phase = Math.atan2(-betaSin, betaCos) / omega;

  let ssRes = 0;
  let ssTot = 0;
  for (let j = 0; j < N; j++) {
    const fitted =
      meanY +
      betaCos * Math.cos(omega * times[j]) +
      betaSin * Math.sin(omega * times[j]);
    ssRes += (vals[j] - fitted) ** 2;
    ssTot += (vals[j] - meanY) ** 2;
  }

  const rSquared =
    ssTot > 0 ? Math.round((1 - ssRes / ssTot) * 1000) / 1000 : 0;

  return {
    amplitude: Math.round(amplitude * 100) / 100,
    phase: Math.round((((phase % period) + period) % period) * 10) / 10,
    rSquared,
    betaCos: Math.round(betaCos * 100) / 100,
    betaSin: Math.round(betaSin * 100) / 100,
    meanLevel: Math.round(meanY * 10) / 10,
  };
}

// ── Helper: rolling-window stability ──
function assessStability(residuals, period, windowDays) {
  const stepSize = Math.max(7, Math.floor(windowDays / 3));
  const fits = [];

  for (let start = 0; start + windowDays <= residuals.length; start += stepSize) {
    const slice = residuals.slice(start, start + windowDays);
    const fit = cosinorFit(slice, period);
    if (fit && fit.amplitude > 0.5) fits.push(fit);
  }

  if (fits.length < 3) return 0;

  const phases = fits.map(f => f.phase);
  const amps = fits.map(f => f.amplitude);

  const meanCos =
    phases.reduce((a, p) => a + Math.cos((2 * Math.PI * p) / period), 0) /
    phases.length;
  const meanSin =
    phases.reduce((a, p) => a + Math.sin((2 * Math.PI * p) / period), 0) /
    phases.length;
  const phaseConsistency = Math.sqrt(meanCos * meanCos + meanSin * meanSin);

  const ampMean = amps.reduce((a, b) => a + b, 0) / amps.length;
  const ampStd = Math.sqrt(
    amps.reduce((a, b) => a + (b - ampMean) ** 2, 0) / amps.length
  );
  const ampStability = ampMean > 0 ? Math.max(0, 1 - ampStd / ampMean) : 0;

  return Math.round(((phaseConsistency + ampStability) / 2) * 100) / 100;
}

// ── Helper: confidence score 0–100 ──
function computeUltraConfidence(spectralPower, rSquared, stability, missingRate) {
  const spectralScore = Math.min(1, spectralPower / 8);
  const fitScore = Math.max(0, rSquared);
  const stableScore = stability;
  const completeness = 1 - missingRate;

  const raw =
    (spectralScore * 0.3 +
      fitScore * 0.3 +
      stableScore * 0.25 +
      completeness * 0.15) *
    100;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

// ── Helper: neutral reference annotations only ──
function generateTcmAnnotations(dominantPeriods, confidence) {
  const annotations = [];

  for (const [metric, period] of Object.entries(dominantPeriods)) {
    const conf = confidence[metric] || 0;
    if (conf < 20 || period == null) continue;

    const label =
      metric === "sleep_score"
        ? "睡眠"
        : metric === "health_score"
          ? "体調"
          : "活動";

    if (period >= 6 && period <= 8) {
      annotations.push(
        `${label}に約${period}日の反復性が見られます。週間スケジュールや生活リズムの影響が考えられます（参考）`
      );
    } else if (period >= 13 && period <= 16) {
      annotations.push(
        `${label}に約${period}日の反復性が見られます。2週間前後の生活・体調サイクルが存在する可能性があります（参考）`
      );
    } else if (period >= 25 && period <= 35) {
      annotations.push(
        `${label}に約${period}日の変動が見られます。長めの生活・体調サイクルが存在する可能性があります（参考）`
      );
    } else if (period >= 40 && period <= 60) {
      annotations.push(
        `${label}に約${period}日の長期的な変動が見られます。季節的な環境変化の影響も考えられます（参考）`
      );
    } else if (period >= 9 && period <= 12) {
      annotations.push(`${label}に約${period}日の反復性が見られます（参考）`);
    }
  }

  if (annotations.length === 0) {
    annotations.push("明確な超長期リズムは現時点では検出されていません");
  }

  return annotations;
}

// ══════════════════════════════════════════════════════════════
// Main: buildUltraLongTermAnalysis
// ══════════════════════════════════════════════════════════════
function buildUltraLongTermAnalysis(rows, detailRows) {
  const daily = extractDailyData(rows);

  if (daily.length < 56) {
    return {
      sufficient: false,
      dataLength: daily.length,
      reason: "超長期分析には56日以上のデータが必要です",
    };
  }

  const lastDateStr = daily[daily.length - 1]?._date || null;

  const addDays = (dateStr, days) => {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const pickNum = (row, keys) => {
    for (const k of keys) {
      const v = safeNum(row?.[k]);
      if (v != null) return v;
    }
    return null;
  };

  const toHours = (v) => {
    const n = safeNum(v);
    if (n == null) return null;
    if (n > 0 && n < 24) return Math.round(n * 10) / 10;
    if (n >= 60 && n < 1440) return Math.round((n / 60) * 10) / 10;
    if (n >= 1440) return Math.round((n / 3600) * 10) / 10;
    return null;
  };

  const metricDefs = {
    sleep: [
      {
        key: "sleepScore",
        label: "睡眠スコア",
        getValue: (r) => pickNum(r, ["sleep_score"]),
        unit: "点",
      },
      {
        key: "sleepHours",
        label: "睡眠時間",
        getValue: (r) => {
          const h = pickNum(r, ["sleep_hours"]);
          if (h != null && h > 0) return Math.round(h * 10) / 10;
          const mins = pickNum(r, [
            "total_sleep_minutes",
            "sleep_total_time_true",
            "sleep_total_time_exclude_awake",
            "sleep_total_time",
            "sleep_total_time_include_latency",
          ]);
          return toHours(mins);
        },
        unit: "時間",
      },
      {
        key: "sleepEfficiency",
        label: "睡眠効率",
        getValue: (r) => {
          const v = pickNum(r, [
            "efficiency",
            "sleep_efficiency",
            "sleep_efficiency_include_latency",
          ]);
          if (v == null || v <= 0) return null;
          return v <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
        },
        unit: "%",
      },
      {
        key: "sleepDeep",
        label: "Deep睡眠",
        getValue: (r) => pickNum(r, ["sleep_deep_time", "sleep_deep_sleep_time", "sleep_n3_time"]),
        unit: "分",
      },
      {
        key: "sleepLight",
        label: "Light睡眠",
        getValue: (r) => pickNum(r, ["sleep_light_time", "sleep_light_sleep_time", "sleep_n1_time", "sleep_n2_time"]),
        unit: "分",
      },
      {
        key: "sleepRem",
        label: "REM睡眠",
        getValue: (r) => pickNum(r, ["sleep_rem_time"]),
        unit: "分",
      },
      {
        key: "sleepHrMean",
        label: "睡眠中平均HR",
        getValue: (r) => pickNum(r, ["sleep_hr_mean"]),
        unit: "bpm",
      },
      {
        key: "sleepHrvMean",
        label: "睡眠中平均HRV",
        getValue: (r) => pickNum(r, ["sleep_hrv_mean"]),
        unit: "ms",
      },
    ],
    health: [
      {
        key: "healthScore",
        label: "体調スコア",
        getValue: (r) => pickNum(r, ["health_score"]),
        unit: "点",
      },
      {
        key: "healthHr",
        label: "心拍数",
        getValue: (r) => pickNum(r, ["health_hr"]),
        unit: "bpm",
      },
      {
        key: "healthStress",
        label: "ストレス",
        getValue: (r) => pickNum(r, ["health_stress"]),
        unit: "",
      },
      {
        key: "healthSpo2",
        label: "SpO2",
        getValue: (r) => pickNum(r, ["health_spo2"]),
        unit: "%",
      },
      {
        key: "healthTemp",
        label: "体温",
        getValue: (r) => pickNum(r, ["health_temperature"]),
        unit: "℃",
      },
    ],
    activity: [
      {
        key: "activityScore",
        label: "活動スコア",
        getValue: (r) => pickNum(r, ["activity_score"]),
        unit: "点",
      },
      {
        key: "activitySteps",
        label: "歩数",
        getValue: (r) => pickNum(r, ["activity_steps"]),
        unit: "歩",
      },
      {
        key: "activityCalories",
        label: "活動カロリー",
        getValue: (r) => pickNum(r, ["activity_calories"]),
        unit: "kcal",
      },
      {
        key: "activityReeCalories",
        label: "REEカロリー",
        getValue: (r) => pickNum(r, ["activity_ree_calories"]),
        unit: "kcal",
      },
      {
        key: "qolScore",
        label: "QoLスコア",
        getValue: (r) => pickNum(r, ["qol_score"]),
        unit: "点",
      },
    ],
  };

  const maxPeriod = daily.length >= 180 ? 120 : daily.length >= 120 ? 90 : 45;
  const candidatePeriods = [];
  for (let p = 5; p <= maxPeriod; p++) {
    candidatePeriods.push(p);
  }

  function buildMetricAnalysis(values, label, unit) {
    const validCount = values.filter((v) => v != null).length;
    const missingRate = values.length > 0 ? 1 - validCount / values.length : 1;

    const chartBase = daily.map((r, idx) => ({
  idx,
  date: r._date,
  label: r._date ? `${parseInt(r._date.split("-")[1], 10)}/${parseInt(r._date.split("-")[2], 10)}` : `#${idx + 1}`,
  raw: values[idx] ?? null,
}));

const modelDisplay =
  "21日中央値平滑化 → detrend → Lomb-Scargle-like spectral scan → Cosinor fit → rolling-window stability";

    if (validCount < 28) {
      return {
        label,
        unit,
        hasEnoughData: false,
        validCount,
        dominantPeriod: null,
        secondaryPeriod: null,
        amplitude: null,
        phase: null,
        stability: 0,
        confidence: 0,
        nextRiskWindowStart: null,
        nextRiskWindowEnd: null,
        summary: "有効データが不足しているため、周期性を安定して推定できません。",
        tcmTag: null,
        chartSeries: chartBase,
modelDisplay,
      };
    }

    const smoothed = robustSmooth(values, 21);
    const residuals = detrendSeries(values, smoothed);
    const spectral = lombScarglePower(residuals, candidatePeriods);

    let bestIdx = -1;
    let secondIdx = -1;

    for (let i = 0; i < spectral.length; i++) {
      if (bestIdx === -1 || spectral[i] > spectral[bestIdx]) {
        secondIdx = bestIdx;
        bestIdx = i;
      } else if (
        secondIdx === -1 ||
        (spectral[i] > spectral[secondIdx] &&
          Math.abs(candidatePeriods[i] - candidatePeriods[bestIdx]) >= 3)
      ) {
        secondIdx = i;
      }
    }

    const dominantPeriod =
      bestIdx >= 0 && spectral[bestIdx] > 1.0 ? candidatePeriods[bestIdx] : null;
    const secondaryPeriod =
      secondIdx >= 0 && spectral[secondIdx] > 0.8 ? candidatePeriods[secondIdx] : null;

    if (dominantPeriod == null) {
      return {
        label,
        unit,
        hasEnoughData: true,
        validCount,
        dominantPeriod: null,
        secondaryPeriod: null,
        amplitude: null,
        phase: null,
        stability: 0,
        confidence: 0,
        nextRiskWindowStart: null,
        nextRiskWindowEnd: null,
        summary: "明確な主周期は検出されませんでした。データ蓄積とともに精度向上が見込まれます。",
        tcmTag: null,
        chartSeries: chartBase,
modelDisplay,
      };
    }

    const fit = cosinorFit(residuals, dominantPeriod);
    const amplitude = fit?.amplitude ?? null;
    const phase = fit?.phase ?? null;
    const rSquared = fit?.rSquared ?? 0;

    const windowDays = Math.min(daily.length, Math.max(28, dominantPeriod * 3));
    const stability = assessStability(residuals, dominantPeriod, windowDays);

    const confidence = computeUltraConfidence(
      spectral[bestIdx],
      rSquared,
      stability,
      missingRate
    );

    let nextRiskWindowStart = null;
    let nextRiskWindowEnd = null;

    if (phase != null && lastDateStr) {
      const lastIndex = daily.length - 1;
      const troughBase = phase + dominantPeriod / 2;
      let k = Math.ceil((lastIndex - troughBase) / dominantPeriod);
      let nextCenter = troughBase + k * dominantPeriod;
      if (nextCenter <= lastIndex) nextCenter += dominantPeriod;
      const centerOffset = Math.round(nextCenter - lastIndex);
      nextRiskWindowStart = addDays(lastDateStr, centerOffset - 1);
      nextRiskWindowEnd = addDays(lastDateStr, centerOffset + 1);
    }

    let tcmTag = null;
    if (dominantPeriod >= 6 && dominantPeriod <= 8) tcmTag = "週間リズム型";
    else if (dominantPeriod >= 13 && dominantPeriod <= 16) tcmTag = "隔週リズム型";
    else if (dominantPeriod >= 25 && dominantPeriod <= 35) tcmTag = "月間リズム型";
    else if (dominantPeriod >= 40) tcmTag = "長周期リズム型";

    const stabilityText =
      stability >= 0.6 ? "安定した" : stability >= 0.3 ? "やや不安定な" : "不安定な";

    const summary =
      confidence >= 30
        ? `${label}には約${dominantPeriod}日の${stabilityText}周期が見られます。次の低下警戒窓は ${nextRiskWindowStart ?? "—"} 〜 ${nextRiskWindowEnd ?? "—"} です。`
        : `${label}には周期候補がありますが、現時点では信頼度が十分ではありません。`;

    const fittedSeries = daily.map((r, idx) => {
  let fitted = null;

  if (fit && dominantPeriod != null) {
    const omega = (2 * Math.PI) / dominantPeriod;
    fitted =
      fit.meanLevel +
      fit.betaCos * Math.cos(omega * idx) +
      fit.betaSin * Math.sin(omega * idx);

    fitted = Math.round(fitted * 10) / 10;
  }

  return {
    idx,
    date: r._date,
    label: r._date ? `${parseInt(r._date.split("-")[1], 10)}/${parseInt(r._date.split("-")[2], 10)}` : `#${idx + 1}`,
    raw: values[idx] ?? null,
    smooth: smoothed[idx] != null ? Math.round(smoothed[idx] * 10) / 10 : null,
    fitted,
    residual: residuals[idx] != null ? Math.round(residuals[idx] * 10) / 10 : null,
  };
});

    return {
      label,
      unit,
      hasEnoughData: true,
      validCount,
      dominantPeriod,
      secondaryPeriod,
      amplitude,
      phase,
      stability,
      confidence,
      nextRiskWindowStart,
      nextRiskWindowEnd,
      summary,
      tcmTag,
      chartSeries: fittedSeries,
modelDisplay,
    };
  }

  const metrics = {
    sleep: {},
    health: {},
    activity: {},
  };

  Object.entries(metricDefs).forEach(([categoryKey, defs]) => {
    defs.forEach((def) => {
      const values = daily.map((r) => def.getValue(r));
      metrics[categoryKey][def.key] = buildMetricAnalysis(values, def.label, def.unit);
    });
  });

  return {
    sufficient: true,
    dataLength: daily.length,
    dateFrom: daily[0]._date,
    dateTo: daily[daily.length - 1]._date,
    metrics,
  };
}

  function ShortTermPanel({ dailyNorm }) {
  const shortRows = dailyNorm?.normalizedDaily
    ? sliceByLastNDays(dailyNorm.normalizedDaily, ANALYSIS_DAYS.SHORT)
    : [];

  const hasData = shortRows.length >= MIN_DAYS.SHORT;

  const cards = useMemo(() => buildDailySleepCards(shortRows), [shortRows]);
const overview = useMemo(() => computeWeeklyOverview(cards), [cards]);
const sleepFindings = useMemo(() => buildSleepFindings(cards), [cards]);
const coreAnalysis = useMemo(() => analyzeSleepCore(shortRows, ANALYSIS_DAYS.SHORT), [shortRows]);
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

const fmtDateLabel = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
};


const [selectedIndex, setSelectedIndex] = useState(0);

useEffect(() => {
  if (shortRows.length > 0) {
    setSelectedIndex(shortRows.length - 1);
  }
}, [shortRows.length]);

const selectedRow =
  shortRows.length > 0
    ? shortRows[Math.min(selectedIndex, shortRows.length - 1)]
    : null;

const selectedCard =
  cards.length > 0 && selectedRow?._date
    ? cards.find((c) => c.date === selectedRow._date) ?? cards[cards.length - 1]
    : null;

const selectedDateLabel = selectedRow?._date
  ? fmtDateLabel(selectedRow._date)
  : "";

const selectedItems = selectedCard
  ? [
      {
        label: "睡眠スコア",
        value: selectedCard.sleepScore != null ? String(selectedCard.sleepScore) : null,
      },
      {
        label: "体調スコア",
        value: selectedCard.healthScore != null ? String(selectedCard.healthScore) : null,
      },
      {
        label: "活動スコア",
        value: selectedCard.activityScore != null ? String(selectedCard.activityScore) : null,
      },
      {
        label: "QoL",
        value: selectedCard.qolScore != null ? String(selectedCard.qolScore) : null,
      },
      {
        label: "睡眠時間",
        value: selectedCard.totalSleepHours != null ? `${selectedCard.totalSleepHours}h` : null,
      },
      {
        label: "睡眠効率",
        value: selectedCard.efficiency != null ? `${selectedCard.efficiency}%` : null,
      },
      {
        label: "就寝時刻",
        value: selectedCard.bedtime ?? null,
      },
      {
        label: "起床時刻",
        value: selectedCard.wakeTime ?? null,
      },
      {
        label: "覚醒時間",
        value: selectedCard.awakeTime != null ? `${selectedCard.awakeTime}分` : null,
      },
      {
        label: "Deep",
        value:
          selectedCard.stages?.deep != null
            ? `${selectedCard.stages.deep}分${selectedCard.deepRatio != null ? ` (${selectedCard.deepRatio}%)` : ""}`
            : null,
      },
      {
        label: "Light",
        value:
          selectedCard.stages?.light != null
            ? `${selectedCard.stages.light}分${selectedCard.lightRatio != null ? ` (${selectedCard.lightRatio}%)` : ""}`
            : null,
      },
      {
        label: "REM",
        value:
          selectedCard.stages?.rem != null
            ? `${selectedCard.stages.rem}分${selectedCard.remRatio != null ? ` (${selectedCard.remRatio}%)` : ""}`
            : null,
      },
      {
        label: "平均HR",
        value: selectedCard.hrAvg != null ? `${selectedCard.hrAvg} bpm` : null,
      },
      {
        label: "HRV",
        value: selectedCard.hrv != null ? `${selectedCard.hrv} ms` : null,
      },
      {
        label: "歩数",
        value: selectedCard.steps != null ? selectedCard.steps.toLocaleString() : null,
      },
      {
        label: "消費カロリー",
        value: selectedCard.calories != null ? `${Math.round(selectedCard.calories)} kcal` : null,
      },
    ].filter((item) => item.value != null)
  : [];

  

  const chartData = shortRows.map((r) => ({
    label: r._date
      ? `${parseInt(r._date.split("-")[1])}/${parseInt(r._date.split("-")[2])}`
      : "",
    sleepScore: safeNum(r.sleep_score),
    healthScore: safeNum(r.health_score),
    activityScore: safeNum(r.activity_score),
  }));

  if (!hasData) {
    return (
      <Card title={`短期分析（直近${ANALYSIS_DAYS.SHORT}日）`} accent="#7c3aed">
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          {!dailyNorm
            ? "データなし — ログインすると自動的にデータが取得されます。"
            : `データ不足 — 短期分析には${MIN_DAYS.SHORT}日以上のデータが必要です（現在: ${shortRows.length}件）。`}
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card title={`📊 短期分析（直近${ANALYSIS_DAYS.SHORT}日）`} accent="#7c3aed">
  <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>
    {shortRows[0]._date} 〜 {shortRows[shortRows.length - 1]._date}（{shortRows.length}日分）
  </p>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
      padding: "8px 4px",
    }}
  >
    <button
      onClick={() => setSelectedIndex((v) => Math.max(0, v - 1))}
      disabled={selectedIndex <= 0}
      style={{
        width: 44,
        height: 44,
        borderRadius: "999px",
        border: "1px solid var(--theme-border, #e2e8f0)",
        background: selectedIndex <= 0 ? "#f8fafc" : "#fff",
        color: selectedIndex <= 0 ? "#cbd5e1" : "#475569",
        fontSize: 20,
        fontWeight: 700,
        cursor: selectedIndex <= 0 ? "default" : "pointer",
      }}
    >
      ←
    </button>

    <div style={{ flex: 1, textAlign: "center" }}>
      <p
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: "var(--theme-text, #1e293b)",
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {selectedDateLabel}
      </p>
      <p
        style={{
          fontSize: 11,
          color: "#94a3b8",
          margin: "4px 0 0",
        }}
      >
        その日の取得データ
      </p>
    </div>

    <button
      onClick={() => setSelectedIndex((v) => Math.min(shortRows.length - 1, v + 1))}
      disabled={selectedIndex >= shortRows.length - 1}
      style={{
        width: 44,
        height: 44,
        borderRadius: "999px",
        border: "1px solid var(--theme-border, #e2e8f0)",
        background: selectedIndex >= shortRows.length - 1 ? "#f8fafc" : "#fff",
        color: selectedIndex >= shortRows.length - 1 ? "#cbd5e1" : "#475569",
        fontSize: 20,
        fontWeight: 700,
        cursor: selectedIndex >= shortRows.length - 1 ? "default" : "pointer",
      }}
    >
      →
    </button>
  </div>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 8,
      padding: "10px 12px",
      background: "var(--theme-sub-bg, #f8fafc)",
      borderRadius: 8,
      border: "1px solid var(--theme-border, #e2e8f0)",
    }}
  >
    {selectedItems.map((item) => (
      <div key={item.label}>
        <span style={{ fontSize: 12, color: "#64748b" }}>{item.label}</span>
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--theme-text, #1e293b)",
            margin: "2px 0 0",
          }}
        >
          {item.value}
        </p>
      </div>
    ))}
  </div>
</Card>

      <Card title="スコア推移（7日）" accent="#2563eb">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis domain={[30, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="sleepScore" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3.5 }} name="睡眠" />
              <Line type="monotone" dataKey="healthScore" stroke="#059669" strokeWidth={1.7} dot={{ r: 2.5 }} name="体調" />
              <Line type="monotone" dataKey="activityScore" stroke="#f59e0b" strokeWidth={1.7} dot={{ r: 2.5 }} name="活動" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
            チャート表示には2日以上のデータが必要です。
          </p>
        )}
      </Card>

            
<Card title="日別詳細" accent="#1e40af">
  <details>
    <summary
      style={{
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 700,
        color: "var(--theme-text, #1e293b)",
        marginBottom: 10,
      }}
    >
      日別詳細を表示 / 折りたたむ
    </summary>

    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      {[...cards].reverse().map((c) => (
        <div
          key={c.date}
          style={{
            background: "var(--theme-sub-bg, #f8fafc)",
            border: "1px solid var(--theme-border, #e2e8f0)",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--theme-text, #1e293b)", margin: "0 0 8px" }}>
            {fmtDateLabel(c.date)}
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            {c.sleepScore != null && <span style={{ fontSize: 13, color: "#2563eb" }}>🌙 睡眠: <strong>{c.sleepScore}</strong></span>}
            {c.healthScore != null && <span style={{ fontSize: 13, color: "#059669" }}>💚 体調: <strong>{c.healthScore}</strong></span>}
            {c.activityScore != null && <span style={{ fontSize: 13, color: "#f59e0b" }}>🏃 活動: <strong>{c.activityScore}</strong></span>}
            {c.qolScore != null && <span style={{ fontSize: 13, color: "#7c3aed" }}>✨ QoL: <strong>{c.qolScore}</strong></span>}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#64748b" }}>
            {c.totalSleepHours != null && <span>睡眠: <strong>{c.totalSleepHours}h</strong></span>}
            {c.efficiency != null && <span>効率: <strong>{c.efficiency}%</strong></span>}
            {c.bedtime != null && <span>就寝: <strong>{c.bedtime}</strong></span>}
            {c.wakeTime != null && <span>起床: <strong>{c.wakeTime}</strong></span>}
            {c.awakeTime != null && <span>覚醒: <strong>{c.awakeTime}分</strong></span>}
          </div>

          {c.stages && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#64748b", marginTop: 4 }}>
              {c.stages.deep != null && <span>Deep: <strong>{c.stages.deep}分</strong>{c.deepRatio != null ? ` (${c.deepRatio}%)` : ""}</span>}
              {c.stages.light != null && <span>Light: <strong>{c.stages.light}分</strong>{c.lightRatio != null ? ` (${c.lightRatio}%)` : ""}</span>}
              {c.stages.rem != null && <span>REM: <strong>{c.stages.rem}分</strong>{c.remRatio != null ? ` (${c.remRatio}%)` : ""}</span>}
            </div>
          )}

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#64748b", marginTop: 4 }}>
            {c.hrAvg != null && <span>HR: <strong>{c.hrAvg} bpm</strong></span>}
            {c.hrv != null && <span>HRV: <strong>{c.hrv} ms</strong></span>}
            {c.stress != null && <span>ストレス: <strong>{c.stress}</strong></span>}
            {c.steps != null && <span>歩数: <strong>{c.steps.toLocaleString()}</strong></span>}
            {c.calories != null && <span>消費: <strong>{Math.round(c.calories)} kcal</strong></span>}
          </div>
        </div>
      ))}
    </div>
  </details>
</Card>
      

            {sleepFindings && sleepFindings.findings.length > 0 && (() => {
        const primary = sleepFindings.findings.filter((f) => f.tier === "primary");
        const auxiliary = sleepFindings.findings.filter((f) => f.tier === "auxiliary");

        const primaryGood = primary.filter((f) => f.type === "good");
        const primaryConcern = primary.filter((f) => f.type === "concern");
        const primaryNeutral = primary.filter((f) => f.type === "neutral");

        const auxGood = auxiliary.filter((f) => f.type === "good");
        const auxConcern = auxiliary.filter((f) => f.type === "concern");
        const auxNeutral = auxiliary.filter((f) => f.type === "neutral");

        const iconMap = { good: "✅", concern: "⚠️", neutral: "ℹ️" };
        const colorMap = {
          good: { border: "#86efac", text: "#166534" },
          concern: { border: "#fca5a5", text: "#991b1b" },
          neutral: { border: "var(--theme-border, #cbd5e1)", text: "var(--theme-text-sub, #475569)" },
        };

        const renderItem = (f, idx) => {
  const cm = colorMap[f.type] || colorMap.neutral;
  return (
    <div
      key={idx}
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        marginBottom: 8,
        background: "var(--theme-card-bg, #fff)",
        borderLeft: `4px solid ${cm.border}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {f.title && (
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: cm.text,
            margin: "0 0 6px",
            lineHeight: 1.5,
          }}
        >
          {iconMap[f.type] || "ℹ️"} {f.title}
        </p>
      )}

      <p
        style={{
          fontSize: 14,
          color: "var(--theme-text, #1e293b)",
          margin: 0,
          lineHeight: 1.75,
        }}
      >
        {f.text}
      </p>

      {f.advice && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--theme-sub-bg, #f8fafc)",
            border: "1px solid var(--theme-border, #e2e8f0)",
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#475569",
              margin: "0 0 4px",
            }}
          >
            推奨アクション
          </p>
          <p
            style={{
              fontSize: 12,
              color: "#64748b",
              margin: 0,
              lineHeight: 1.7,
            }}
          >
            {f.advice}
          </p>
        </div>
      )}
    </div>
  );
};

        return (
          <>
            <div style={{ marginBottom: 6 }}>
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: "var(--theme-text, #1e293b)",
                  margin: "0 0 4px",
                }}
              >
                🔍 睡眠の主要所見
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--theme-text-muted, #94a3b8)",
                  margin: "0 0 14px",
                  lineHeight: 1.6,
                }}
              >
                睡眠時間・規則性・睡眠効率など、エビデンスの強い指標に基づく所見
              </p>
            </div>

            {primaryGood.length > 0 && (
              <Card title="✅ 良好な傾向" accent="#059669">
                {primaryGood.map((f, i) => renderItem(f, `pg${i}`))}
              </Card>
            )}

            {primaryConcern.length > 0 && (
              <Card title="⚠️ 改善が期待される傾向" accent="#f59e0b">
                {primaryConcern.map((f, i) => renderItem(f, `pc${i}`))}
              </Card>
            )}

            {primaryNeutral.length > 0 && (
              <Card title="ℹ️ その他の所見" accent="#64748b">
                {primaryNeutral.map((f, i) => renderItem(f, `pn${i}`))}
              </Card>
            )}

            {(auxGood.length > 0 || auxConcern.length > 0 || auxNeutral.length > 0) && (
              <>
                <div
                  style={{
                    margin: "20px 0 6px",
                    paddingTop: 16,
                    borderTop: "1px solid var(--theme-border, #e2e8f0)",
                  }}
                >
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--theme-text-sub, #64748b)",
                      margin: "0 0 4px",
                    }}
                  >
                    📎 補助指標の所見
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--theme-text-muted, #94a3b8)",
                      margin: "0 0 12px",
                      lineHeight: 1.6,
                    }}
                  >
                    以下は消費者向けウェアラブルデバイスの推定値に基づく補助的な情報です。
                    デバイスの測定精度にはPSG等の臨床検査と比べ限界があるため、
                    絶対値よりも同一個人内での推移の変化を参考にすることが望ましいと考えられます。
                    これらの補助指標のみで睡眠全体の評価を行うことは推奨されません。
                  </p>
                </div>

                {auxGood.length > 0 && (
                  <Card accent="#8b5cf6">
                    {auxGood.map((f, i) => renderItem(f, `ag${i}`))}
                  </Card>
                )}

                {auxConcern.length > 0 && (
                  <Card accent="#8b5cf6">
                    {auxConcern.map((f, i) => renderItem(f, `ac${i}`))}
                  </Card>
                )}

                {auxNeutral.length > 0 && (
                  <Card accent="#8b5cf6">
                    {auxNeutral.map((f, i) => renderItem(f, `an${i}`))}
                  </Card>
                )}
              </>
            )}
{sleepFindings?.medicalNote && (
  <Card accent="#64748b">
    <p
      style={{
        fontSize: 12,
        color: "#64748b",
        margin: 0,
        lineHeight: 1.7,
      }}
    >
      {sleepFindings.medicalNote}
    </p>
  </Card>
)}
            {sleepFindings.stats.daysWithSleep > 0 && (
              <Card title="📐 睡眠統計（7日間）" accent="#475569">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 10,
                  }}
                >
                 {[
  {
    label: "平均睡眠時間",
    value:
      sleepFindings.stats.avgSleepHours != null
        ? `${sleepFindings.stats.avgSleepHours}h`
        : null,
    tier: "primary",
  },
  {
    label: "睡眠時間の範囲",
    value:
      sleepFindings.stats.minSleepHours != null &&
      sleepFindings.stats.maxSleepHours != null
        ? `${sleepFindings.stats.minSleepHours}〜${sleepFindings.stats.maxSleepHours}h`
        : null,
    tier: "primary",
  },
  {
    label: "睡眠時間 SD",
    value:
      sleepFindings.stats.sdSleepHours != null
        ? `${sleepFindings.stats.sdSleepHours}h`
        : null,
    tier: "primary",
  },
  {
    label: "平均就寝時刻",
    value: sleepFindings.stats.avgBedtime ?? null,
    tier: "primary",
  },
  {
    label: "平均起床時刻",
    value: sleepFindings.stats.avgWakeTime ?? null,
    tier: "primary",
  },
  {
    label: "就寝時刻 SD",
    value:
      sleepFindings.stats.sdBedtimeMins != null
        ? `${sleepFindings.stats.sdBedtimeMins}分`
        : null,
    tier: "primary",
  },
  {
    label: "起床時刻 SD",
    value:
      sleepFindings.stats.sdWakeTimeMins != null
        ? `${sleepFindings.stats.sdWakeTimeMins}分`
        : null,
    tier: "primary",
  },
  {
    label: "平均睡眠効率",
    value:
      sleepFindings.stats.avgEfficiency != null
        ? `${sleepFindings.stats.avgEfficiency}%`
        : null,
    tier: "primary",
  },
  {
    label: "平均覚醒時間",
    value:
      sleepFindings.stats.avgAwakeTime != null
        ? `${sleepFindings.stats.avgAwakeTime}分`
        : null,
    tier: "auxiliary",
  },
  {
    label: "Deep割合平均",
    value:
      sleepFindings.stats.avgDeepRatio != null
        ? `${sleepFindings.stats.avgDeepRatio}%`
        : null,
    tier: "auxiliary",
  },
  {
    label: "REM割合平均",
    value:
      sleepFindings.stats.avgRemRatio != null
        ? `${sleepFindings.stats.avgRemRatio}%`
        : null,
    tier: "auxiliary",
  },
  {
    label: "平均HR",
    value:
      sleepFindings.stats.avgHR != null
        ? `${sleepFindings.stats.avgHR} bpm`
        : null,
    tier: "auxiliary",
  },
  {
    label: "平均HRV",
    value:
      sleepFindings.stats.avgHRV != null
        ? `${sleepFindings.stats.avgHRV} ms`
        : null,
    tier: "auxiliary",
  },
]
  .filter((item) => item.value != null)
  .map((item) => (
                    <div
                      key={item.label}
                      style={{
                        padding: "10px 14px",
                        background: "var(--theme-sub-bg, #f8fafc)",
                        borderRadius: 8,
                        border: `1px solid ${item.tier === "primary" ? "var(--theme-border, #e2e8f0)" : "#d8b4fe44"}`,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--theme-text-sub, #64748b)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {item.label}
                        {item.tier === "auxiliary" && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: "#f3e8ff",
                              color: "#7c3aed",
                              fontWeight: 600,
                            }}
                          >
                            補助
                          </span>
                        )}
                      </span>
                      <p
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: item.value != null
                            ? "var(--theme-text, #1e293b)"
                            : "var(--theme-text-muted, #94a3b8)",
                          margin: "3px 0 0",
                        }}
                      >
                        {item.value != null ? item.value : "未取得"}
                      </p>
                    </div>
                  ))}
                </div>

                <p
                  style={{
                    fontSize: 12,
                    color: "var(--theme-text-muted, #94a3b8)",
                    margin: "12px 0 0",
                    lineHeight: 1.7,
                  }}
                >
                  ※ 上記はSOXAI APIから取得した値に基づく集計です。デバイス推定値であり、
                  臨床検査（PSG等）の結果とは異なる場合があります。
                  「補助」ラベルが付いた項目はデバイス精度の制約がより大きいため、
                  絶対値よりも推移の変化を参考にすることが望ましいと考えられます。
                  所見は行動改善の参考を目的としたもので、医療診断ではありません。
                </p>
              </Card>
            )}
          </>
        );
      })()}

      <Card accent="#94a3b8">
        <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
          ※ この画面のデータはSOXAI APIから取得した値を正規化したものです。睡眠ステージ・HR・HRV等は取得できた項目のみ表示されます。
        </p>
      </Card>
    </>
  );
  }

function LongTermPanel({ normInfo, normDetail, slicedRows }) {
  const rows = Array.isArray(slicedRows) ? slicedRows : [];
  const current = rows.length || 0;
  const sufficient = current >= MIN_DAYS.LONG;
  const [selectedCategory, setSelectedCategory] = useState("sleep");

  const pickNum = (row, keys) => {
    for (const k of keys) {
      const v = safeNum(row?.[k]);
      if (v != null) return v;
    }
    return null;
  };

  const pickPositiveNum = (row, keys) => {
    for (const k of keys) {
      const v = safeNum(row?.[k]);
      if (v != null && v > 0) return v;
    }
    return null;
  };

  const toHours = (v) => {
    const n = safeNum(v);
    if (n == null) return null;
    if (n > 0 && n < 24) return Math.round(n * 10) / 10;
    if (n >= 60 && n < 1440) return Math.round((n / 60) * 10) / 10;
    if (n >= 1440) return Math.round((n / 3600) * 10) / 10;
    return null;
  };

  const buildSectionFindings = (items = []) => items.filter(Boolean);

  const meanOf = (arr) => {
    const v = arr.filter((x) => x != null && Number.isFinite(x));
    if (v.length === 0) return null;
    return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
  };

  const sdOf = (arr) => {
    const v = arr.filter((x) => x != null && Number.isFinite(x));
    if (v.length < 2) return null;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
    return Math.round(Math.sqrt(variance) * 10) / 10;
  };

  const slopeDirection = (arr) => {
    const pts = arr
      .map((y, x) => ({ x, y }))
      .filter((p) => p.y != null && Number.isFinite(p.y));

    if (pts.length < 2) return { slope: null, direction: "unknown" };

    const n = pts.length;
    const sumX = pts.reduce((s, p) => s + p.x, 0);
    const sumY = pts.reduce((s, p) => s + p.y, 0);
    const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
    const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0);

    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return { slope: null, direction: "unknown" };

    const slope = (n * sumXY - sumX * sumY) / denom;

    let direction = "flat";
    if (slope > 0.05) direction = "up";
    if (slope < -0.05) direction = "down";

    return {
      slope: Math.round(slope * 10) / 10,
      direction,
    };
  };

  const renderFindingCards = (findings, findingColor) => {
    if (!Array.isArray(findings) || findings.length === 0) return null;

    return (
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {findings.map((f, i) => {
          const style = findingColor[f.level] || findingColor.info;

          return (
            <div
              key={`${f.title}-${i}`}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "var(--theme-card-bg, #fff)",
                borderLeft: `4px solid ${style.border}`,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: style.text,
                  margin: "0 0 6px",
                }}
              >
                {style.title} {f.title}
              </p>

              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "var(--theme-text, #1e293b)",
                  margin: 0,
                }}
              >
                {f.body}
              </p>

              {f.advice && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--theme-sub-bg, #f8fafc)",
                    border: "1px solid var(--theme-border, #e2e8f0)",
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#475569",
                      margin: "0 0 4px",
                    }}
                  >
                    推奨アクション
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: "#64748b",
                      margin: 0,
                    }}
                  >
                    {f.advice}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const longMetrics = useMemo(() => {
    if (!sufficient) return null;
    return buildLongTermMetrics(rows);
  }, [rows, sufficient]);
  console.log("longMetrics debug", longMetrics);

  const chartData = useMemo(() => {
    return rows.map((r) => {
      const label = r?._date
        ? `${parseInt(r._date.split("-")[1], 10)}/${parseInt(r._date.split("-")[2], 10)}`
        : "";

      return {
        label,
        date: r?._date ?? null,

        sleepScore: (() => {
          const v = pickNum(r, ["sleep_score"]);
          return v != null && v > 0 ? v : null;
        })(),

        sleepEfficiency: (() => {
          const v = pickNum(r, [
            "efficiency",
            "sleep_efficiency",
            "sleep_efficiency_include_latency",
          ]);
          if (v == null) return null;
          if (v <= 0) return null;
          if (v <= 1) return Math.round(v * 1000) / 10;
          return Math.round(v * 10) / 10;
        })(),

        sleepHours: (() => {
          const h = pickNum(r, ["sleep_hours"]);
          if (h != null && h > 0) return Math.round(h * 10) / 10;

          const mins = pickNum(r, [
            "total_sleep_minutes",
            "sleep_total_time_true",
            "sleep_total_time_exclude_awake",
            "sleep_total_time",
            "sleep_total_time_include_latency",
          ]);
          return toHours(mins);
        })(),

        sleepDeep: pickPositiveNum(r, [
          "sleep_deep_time",
          "sleep_deep_sleep_time",
          "sleep_n3_time",
        ]),
        sleepLight: pickPositiveNum(r, [
          "sleep_light_time",
          "sleep_light_sleep_time",
          "sleep_n1_time",
          "sleep_n2_time",
        ]),
        sleepRem: pickPositiveNum(r, ["sleep_rem_time"]),
        sleepAwake: pickPositiveNum(r, [
          "sleep_awake_time",
          "sleep_awake_time_include_latency",
        ]),
        sleepLatency: pickPositiveNum(r, ["sleep_latency"]),
        sleepDebt: pickPositiveNum(r, ["sleep_debt"]),
        sleepHrMean: (() => {
          const v = pickNum(r, ["sleep_hr_mean"]);
          return v != null && v > 0 ? v : null;
        })(),
        sleepHrvMean: pickPositiveNum(r, ["sleep_hrv_mean"]),
        sleepRespRate: pickPositiveNum(r, ["sleep_respiration_rate_mean"]),
        sleepSpo2Mean: pickPositiveNum(r, ["sleep_spo2_mean"]),
        sleepSpo2Min: pickPositiveNum(r, ["sleep_spo2_min"]),
        sleepSpo2Max: pickPositiveNum(r, ["sleep_spo2_max"]),
        sleepAhiMax: pickPositiveNum(r, ["sleep_ahi_max"]),
        sleepNapTime: pickPositiveNum(r, ["sleep_nap_time", "sleep_nap_time_1"]),

        preSleepHr120to60Mean: pickNum(r, ["pre_sleep_hr_120_60_mean"]),
        preSleepHr120to60Sd: pickNum(r, ["pre_sleep_hr_120_60_sd"]),
        preSleepHr120to60Upper:
          pickNum(r, ["pre_sleep_hr_120_60_mean"]) != null &&
          pickNum(r, ["pre_sleep_hr_120_60_sd"]) != null
            ? pickNum(r, ["pre_sleep_hr_120_60_mean"]) +
              pickNum(r, ["pre_sleep_hr_120_60_sd"])
            : null,
        preSleepHr120to60Lower:
          pickNum(r, ["pre_sleep_hr_120_60_mean"]) != null &&
          pickNum(r, ["pre_sleep_hr_120_60_sd"]) != null
            ? pickNum(r, ["pre_sleep_hr_120_60_mean"]) -
              pickNum(r, ["pre_sleep_hr_120_60_sd"])
            : null,

        preSleepHr60to30Mean: pickNum(r, ["pre_sleep_hr_60_30_mean"]),
        preSleepHr60to30Sd: pickNum(r, ["pre_sleep_hr_60_30_sd"]),
        preSleepHr60to30Upper:
          pickNum(r, ["pre_sleep_hr_60_30_mean"]) != null &&
          pickNum(r, ["pre_sleep_hr_60_30_sd"]) != null
            ? pickNum(r, ["pre_sleep_hr_60_30_mean"]) +
              pickNum(r, ["pre_sleep_hr_60_30_sd"])
            : null,
        preSleepHr60to30Lower:
          pickNum(r, ["pre_sleep_hr_60_30_mean"]) != null &&
          pickNum(r, ["pre_sleep_hr_60_30_sd"]) != null
            ? pickNum(r, ["pre_sleep_hr_60_30_mean"]) -
              pickNum(r, ["pre_sleep_hr_60_30_sd"])
            : null,

        preSleepHr30to0Mean: pickNum(r, ["pre_sleep_hr_30_0_mean"]),
        preSleepHr30to0Sd: pickNum(r, ["pre_sleep_hr_30_0_sd"]),
        preSleepHr30to0Upper:
          pickNum(r, ["pre_sleep_hr_30_0_mean"]) != null &&
          pickNum(r, ["pre_sleep_hr_30_0_sd"]) != null
            ? pickNum(r, ["pre_sleep_hr_30_0_mean"]) +
              pickNum(r, ["pre_sleep_hr_30_0_sd"])
            : null,
        preSleepHr30to0Lower:
          pickNum(r, ["pre_sleep_hr_30_0_mean"]) != null &&
          pickNum(r, ["pre_sleep_hr_30_0_sd"]) != null
            ? pickNum(r, ["pre_sleep_hr_30_0_mean"]) -
              pickNum(r, ["pre_sleep_hr_30_0_sd"])
            : null,

        healthScore: pickNum(r, ["health_score"]),
        healthHr: pickNum(r, ["health_hr"]),
        healthHrMin: pickNum(r, ["health_hr_min"]),
        healthHrMax: pickNum(r, ["health_hr_max"]),
        healthHrv: pickNum(r, ["health_hrv"]),
        healthStress: pickNum(r, ["health_stress"]),
        healthStressMin: pickNum(r, ["health_stress_min"]),
        healthStressMax: pickNum(r, ["health_stress_max"]),
        healthSpo2: pickNum(r, ["health_spo2"]),
        healthSpo2Min: pickNum(r, ["health_spo2_min"]),
        healthSpo2Max: pickNum(r, ["health_spo2_max"]),
        healthTemp: pickNum(r, ["health_temperature"]),
        healthTempMin: pickNum(r, ["health_temperature_min"]),
        healthTempMax: pickNum(r, ["health_temperature_max"]),

        activityScore: pickNum(r, ["activity_score"]),
        activitySteps: pickNum(r, ["activity_steps"]),
        activityCalories: pickNum(r, ["activity_calories"]),
        activityReeCalories: pickNum(r, ["activity_ree_calories"]),
        qolScore: pickNum(r, ["qol_score"]),
      };
    });
  }, [rows]);

    const healthScoreFindings = useMemo(() => {
  if (!longMetrics) return [];
  return buildHealthScoreFindings(longMetrics);
}, [longMetrics]);

const heartRateFindings = useMemo(() => {
  if (!longMetrics) return [];
  return buildHeartRateFindings(longMetrics);
}, [longMetrics]);

const stressFindings = useMemo(() => {
  if (!longMetrics) return [];
  return buildStressFindings(longMetrics);
}, [longMetrics]);

const spo2Findings = useMemo(() => {
  if (!longMetrics) return [];
  return buildSpo2Findings(longMetrics);
}, [longMetrics]);

const tempFindings = useMemo(() => {
  if (!longMetrics) return [];
  return buildTempFindings(longMetrics);
}, [longMetrics]);

  const activityScoreFindings = useMemo(() => {
  if (!longMetrics) return [];
  return buildActivityScoreFindings(longMetrics);
}, [longMetrics]);

const stepsFindings = useMemo(() => {
  if (!longMetrics) return [];
  return buildStepsFindings(longMetrics);
}, [longMetrics]);

const activityCaloriesFindings = useMemo(() => {
  if (!longMetrics) return [];
  return buildActivityCaloriesFindings(longMetrics);
}, [longMetrics]);

const reeCaloriesFindings = useMemo(() => {
  if (!longMetrics) return [];
  return buildReeCaloriesFindings(longMetrics);
}, [longMetrics]);

const qolFindings = useMemo(() => {
  if (!longMetrics) return [];
  return buildQolFindings(longMetrics);
}, [longMetrics]);

  const sleepScoreFindings = useMemo(() => {
    const values = chartData.map((d) => d.sleepScore);
    const avg = meanOf(values);
    const sd = sdOf(values);
    const trend = slopeDirection(values);

    return buildSectionFindings([
      avg != null && avg < 60
        ? {
            level: "warning",
            title: "睡眠スコアが低水準",
            body: `睡眠スコアの平均は ${avg} 点であり、30日単位では低めです。睡眠時間不足、規則性の乱れ、回復不足が背景にある可能性があります。`,
            advice:
              "まず睡眠時間の下限確保と起床時刻の固定を優先してください。単日の高低よりも、低い日が続くパターンを減らすことが重要です。",
          }
        : avg != null && avg < 75
        ? {
            level: "caution",
            title: "睡眠スコアは中等度",
            body: `睡眠スコアの平均は ${avg} 点です。大きな破綻はありませんが、改善余地が残っています。`,
            advice:
              "就寝前行動、睡眠効率、起床時刻の安定性を中心に整えると、底上げしやすいです。",
          }
        : avg != null
        ? {
            level: "good",
            title: "睡眠スコアは比較的良好",
            body: `睡眠スコアの平均は ${avg} 点であり、長期的には比較的安定しています。`,
            advice:
              "現在の生活リズムを維持しつつ、繁忙期に崩れやすいポイントだけ重点的に管理してください。",
          }
        : null,

      sd != null && sd >= 12
        ? {
            level: "warning",
            title: "睡眠スコアの変動が大きい",
            body: `睡眠スコアの標準偏差は ${sd} 点であり、日ごとの差が大きい状態です。`,
            advice:
              "平均値だけでなく、悪い日の共通点を洗い出してください。特に短時間睡眠、夜更かし、翌朝の起床遅延との関係を確認してください。",
          }
        : null,

      trend.direction === "down"
        ? {
            level: "warning",
            title: "睡眠スコアは低下傾向",
            body: "睡眠スコアはこの30日で下向きです。直近ほど回復状態が悪化している可能性があります。",
            advice:
              "直近2週間の生活負荷、就寝時刻の遅れ、睡眠時間短縮がないかを優先的に確認してください。",
          }
        : trend.direction === "up"
        ? {
            level: "good",
            title: "睡眠スコアは改善傾向",
            body: "睡眠スコアはこの30日で上向きです。睡眠全体の安定化が進んでいる可能性があります。",
            advice:
              "改善要因となった行動を維持してください。特に起床時刻固定や夜間ルーティンの再現性を保つことが重要です。",
          }
        : null,
    ]);
  }, [chartData]);

  const preSleepHr120Findings = useMemo(() => {
    const values = chartData.map((d) => d.preSleepHr120to60Mean);
    const avg = meanOf(values);
    const sd = sdOf(values);
    const trend = slopeDirection(values);

    return buildSectionFindings([
      avg != null
        ? {
            level: avg >= 75 ? "caution" : "info",
            title: "就寝120〜60分前の心拍水準",
            body: `平均は ${avg} bpm です。就寝かなり前の覚醒水準のベースラインを見る補助指標です。`,
            advice:
              "この時間帯で高めの日が多い場合は、夕方以降の活動量、カフェイン、精神的負荷の影響を確認してください。",
          }
        : null,
      sd != null && sd >= 6
        ? {
            level: "caution",
            title: "就寝120〜60分前の心拍変動が大きい",
            body: `標準偏差は ${sd} bpm であり、日ごとの差が目立ちます。`,
            advice:
              "夕食時刻、運動終了時刻、入浴時刻の揺れが大きくないか確認してください。",
          }
        : null,
      trend.direction === "up"
        ? {
            level: "caution",
            title: "就寝120〜60分前の心拍は上昇傾向",
            body: "月内でこの時間帯の心拍が上向いています。夕方以降の負荷上昇が続いている可能性があります。",
            advice:
              "夜の活動を軽くし、就寝2〜3時間前から刺激を減らす方向で調整してください。",
          }
        : null,
    ]);
  }, [chartData]);

  const preSleepHr60Findings = useMemo(() => {
    const values = chartData.map((d) => d.preSleepHr60to30Mean);
    const avg = meanOf(values);
    const sd = sdOf(values);
    const trend = slopeDirection(values);

    return buildSectionFindings([
      avg != null
        ? {
            level: avg >= 72 ? "caution" : "info",
            title: "就寝60〜30分前の心拍水準",
            body: `平均は ${avg} bpm です。入眠に向かう前の鎮静が進んでいるかを見る補助指標です。`,
            advice:
              "この時間帯で心拍が高止まりする日は、端末使用、作業継続、感情的緊張が残っていないかを確認してください。",
          }
        : null,
      sd != null && sd >= 6
        ? {
            level: "caution",
            title: "就寝60〜30分前の心拍変動が大きい",
            body: `標準偏差は ${sd} bpm です。入眠準備の安定性にばらつきがある可能性があります。`,
            advice:
              "就寝前ルーティンの開始時刻を一定にしてください。",
          }
        : null,
      trend.direction === "up"
        ? {
            level: "warning",
            title: "就寝60〜30分前の心拍は上昇傾向",
            body: "入眠前に近い時間帯の心拍が上向いています。夜間覚醒の高まりが示唆されます。",
            advice:
              "就寝1時間前から強い光、仕事、学習、SNS、動画視聴を減らしてください。",
          }
        : null,
    ]);
  }, [chartData]);

  const preSleepHr30Findings = useMemo(() => {
    const values = chartData.map((d) => d.preSleepHr30to0Mean);
    const avg = meanOf(values);
    const sd = sdOf(values);
    const trend = slopeDirection(values);

    return buildSectionFindings([
      avg != null
        ? {
            level: avg >= 70 ? "warning" : "info",
            title: "就寝30〜0分前の心拍水準",
            body: `平均は ${avg} bpm です。就寝直前の覚醒水準を見る最も近接した補助指標です。`,
            advice:
              "この時間帯で高めの日が続く場合は、就寝直前の刺激を明確に減らしてください。照明、端末、食事、感情負荷の影響が出やすい時間帯です。",
          }
        : null,
      sd != null && sd >= 6
        ? {
            level: "caution",
            title: "就寝30〜0分前の心拍変動が大きい",
            body: `標準偏差は ${sd} bpm です。就寝直前の状態が日によって安定していません。`,
            advice:
              "就寝直前の行動を固定してください。毎晩同じ順序で過ごす方が入眠前の鎮静が安定しやすいです。",
          }
        : null,
      trend.direction === "up"
        ? {
            level: "warning",
            title: "就寝直前心拍は上昇傾向",
            body: "月内で就寝直前の心拍が上向いています。入眠前の覚醒水準が徐々に高まっている可能性があります。",
            advice:
              "夜間の負荷を手前から削減し、就寝30分前は完全にクールダウンへ移行してください。",
          }
        : null,
    ]);
  }, [chartData]);

  const sleepDurationEfficiencyFindings = useMemo(() => {
    const hours = chartData.map((d) => d.sleepHours);
    const eff = chartData.map((d) => d.sleepEfficiency);
    const avgHours = meanOf(hours);
    const sdHours = sdOf(hours);
    const avgEff = meanOf(eff);
    const effTrend = slopeDirection(eff);
    const hourTrend = slopeDirection(hours);

    return buildSectionFindings([
      avgHours != null && avgHours < 7
        ? {
            level: "warning",
            title: "睡眠時間が不足気味",
            body: `平均睡眠時間は ${avgHours} 時間です。長期的には回復不足を生みやすい水準です。`,
            advice:
              "まず睡眠時間の下限を引き上げてください。長く寝る日を増やすより、短すぎる日を減らす方が安定化しやすいです。",
          }
        : avgHours != null
        ? {
            level: "good",
            title: "睡眠時間は概ね確保",
            body: `平均睡眠時間は ${avgHours} 時間です。量としては一定水準を保っています。`,
            advice:
              "今後は規則性と睡眠効率も合わせて最適化してください。",
          }
        : null,

      sdHours != null && sdHours >= 1.5
        ? {
            level: "warning",
            title: "睡眠時間のばらつきが大きい",
            body: `睡眠時間の標準偏差は ${sdHours} 時間です。`,
            advice:
              "平日と休日の差、予定の詰まり方、夜更かし日の発生頻度を見直してください。",
          }
        : null,

      avgEff != null && avgEff < 85
        ? {
            level: "warning",
            title: "睡眠効率が低め",
            body: `平均睡眠効率は ${avgEff}% です。床上時間に対して実際の睡眠が十分でない可能性があります。`,
            advice:
              "長くベッドにいるだけでなく、入眠前の覚醒を下げ、夜間中途覚醒の原因を減らす方向で調整してください。",
          }
        : avgEff != null && avgEff < 90
        ? {
            level: "caution",
            title: "睡眠効率はやや改善余地あり",
            body: `平均睡眠効率は ${avgEff}% です。`,
            advice:
              "寝床でのスマホ使用や、眠くないまま横になる時間が長くなっていないか確認してください。",
          }
        : avgEff != null
        ? {
            level: "good",
            title: "睡眠効率は比較的良好",
            body: `平均睡眠効率は ${avgEff}% です。`,
            advice:
              "現在の就床パターンを維持しつつ、睡眠時間不足だけは起こさないよう注意してください。",
          }
        : null,

      hourTrend.direction === "down"
        ? {
            level: "warning",
            title: "睡眠時間は低下傾向",
            body: "30日推移で睡眠時間が短くなっています。",
            advice:
              "直近ほど忙しくなっている可能性があります。まず削られやすい曜日を確認してください。",
          }
        : null,

      effTrend.direction === "down"
        ? {
            level: "caution",
            title: "睡眠効率は低下傾向",
            body: "30日推移で睡眠効率が下向きです。",
            advice:
              "入眠前覚醒や中途覚醒の増加がないか確認してください。",
          }
        : null,
    ]);
  }, [chartData]);

  const sleepStageFindings = useMemo(() => {
    const deep = chartData.map((d) => d.sleepDeep);
    const light = chartData.map((d) => d.sleepLight);
    const rem = chartData.map((d) => d.sleepRem);

    const deepAvg = meanOf(deep);
    const lightAvg = meanOf(light);
    const remAvg = meanOf(rem);

    const deepTrend = slopeDirection(deep);
    const remTrend = slopeDirection(rem);

    return buildSectionFindings([
      deepAvg != null
        ? {
            level: deepAvg < 60 ? "caution" : "info",
            title: "Deep睡眠の傾向",
            body: `Deep睡眠の平均は ${deepAvg} 分です。身体回復関連の補助指標として継続観察する価値があります。`,
            advice:
              "就寝前の飲酒、遅い食事、強い光、精神的負荷を減らしてください。Deepは入眠前の覚醒の影響を受けやすいです。",
          }
        : null,

      remAvg != null
        ? {
            level: remAvg < 90 ? "caution" : "info",
            title: "REM睡眠の傾向",
            body: `REM睡眠の平均は ${remAvg} 分です。睡眠後半の確保状況を見る補助指標です。`,
            advice:
              "朝を早めすぎず、睡眠後半を削らないことを優先してください。",
          }
        : null,

      lightAvg != null
        ? {
            level: "info",
            title: "Light睡眠の傾向",
            body: `Light睡眠の平均は ${lightAvg} 分です。単独で良否を断定するより、Deep・REMとの組み合わせで見るのが妥当です。`,
            advice:
              "Lightだけで判断せず、睡眠全体の量と日中の回復感も併せて確認してください。",
          }
        : null,

      deepTrend.direction === "down"
        ? {
            level: "caution",
            title: "Deep睡眠は低下傾向",
            body: "30日でDeep睡眠が減少傾向です。",
            advice:
              "就寝前の鎮静不足や生活リズムの乱れが背景にないか確認してください。",
          }
        : null,

      remTrend.direction === "down"
        ? {
            level: "caution",
            title: "REM睡眠は低下傾向",
            body: "30日でREM睡眠が減少傾向です。",
            advice:
              "起床時刻の前倒しや睡眠時間短縮が起きていないか確認してください。",
          }
        : null,
    ]);
  }, [chartData]);

  const sleepSupportFindings = useMemo(() => {
    const awake = chartData.map((d) => d.sleepAwake);
    const latency = chartData.map((d) => d.sleepLatency);
    const debt = chartData.map((d) => d.sleepDebt);
    const nap = chartData.map((d) => d.sleepNapTime);
    const ahi = chartData.map((d) => d.sleepAhiMax);

    const avgAwake = meanOf(awake);
    const avgLatency = meanOf(latency);
    const avgDebt = meanOf(debt);
    const avgNap = meanOf(nap);
    const avgAhi = meanOf(ahi);

    return buildSectionFindings([
      avgAwake != null && avgAwake >= 45
        ? {
            level: "warning",
            title: "覚醒時間が長め",
            body: `平均覚醒時間は ${avgAwake} 分です。夜間中途覚醒がやや多い可能性があります。`,
            advice:
              "寝室環境、就寝前の飲酒、遅い食事、精神的緊張の残存を確認してください。",
          }
        : null,

      avgLatency != null && avgLatency >= 30
        ? {
            level: "warning",
            title: "入眠潜時が長め",
            body: `平均入眠潜時は ${avgLatency} 分です。眠りに入るまで時間がかかっている可能性があります。`,
            advice:
              "眠くなる前にベッドに入らないこと、就寝前の強い光と作業を減らすことが重要です。",
          }
        : avgLatency != null && avgLatency >= 20
        ? {
            level: "caution",
            title: "入眠潜時にやや延長あり",
            body: `平均入眠潜時は ${avgLatency} 分です。`,
            advice:
              "就寝前の過ごし方を固定し、夜間の覚醒を下げる方向で整えてください。",
          }
        : null,

      avgDebt != null && avgDebt > 0
        ? {
            level: "caution",
            title: "睡眠負債が残っている可能性",
            body: `平均睡眠負債指標は ${avgDebt} です。回復不足が断続的に起きている可能性があります。`,
            advice:
              "睡眠不足日の反復を減らし、週末の過補償より平日底上げを優先してください。",
          }
        : null,

      avgNap != null && avgNap >= 60
        ? {
            level: "caution",
            title: "昼寝時間が長め",
            body: `平均昼寝時間は ${avgNap} 分です。日中の眠気や夜間睡眠不足の影響があるかもしれません。`,
            advice:
              "昼寝が必要な背景として、夜間睡眠不足や回復不足がないかを先に確認してください。",
          }
        : null,

      avgAhi != null && avgAhi >= 5
        ? {
            level: "warning",
            title: "AHI関連指標が高め",
            body: `平均AHI max は ${avgAhi} です。睡眠呼吸状態の乱れを示す可能性があるため、軽視しない方がよい値です。`,
            advice:
              "この値が継続的に高い、いびきや日中の強い眠気がある場合は、医療機関への相談も検討してください。",
          }
        : avgAhi != null
        ? {
            level: "info",
            title: "AHI関連指標は経過観察",
            body: `平均AHI max は ${avgAhi} です。`,
            advice:
              "単日の上下よりも、継続的上昇がないかを確認してください。",
          }
        : null,
    ]);
  }, [chartData]);

  const sleepPhysioFindings = useMemo(() => {
    const hr = chartData.map((d) => d.sleepHrMean);
    const hrv = chartData.map((d) => d.sleepHrvMean);
    const spo2Mean = chartData.map((d) => d.sleepSpo2Mean);
    const spo2Min = chartData.map((d) => d.sleepSpo2Min);
    const resp = chartData.map((d) => d.sleepRespRate);

    const avgHr = meanOf(hr);
    const avgHrv = meanOf(hrv);
    const avgSpo2Mean = meanOf(spo2Mean);
    const avgSpo2Min = meanOf(spo2Min);
    const avgResp = meanOf(resp);

    const hrTrend = slopeDirection(hr);
    const hrvTrend = slopeDirection(hrv);

    return buildSectionFindings([
      avgHr != null && avgHr >= 65
        ? {
            level: "caution",
            title: "睡眠中平均HRがやや高め",
            body: `睡眠中平均HRは ${avgHr} bpm です。回復不足、ストレス、飲酒などの影響候補があります。`,
            advice:
              "単日で断定せず、数日単位で上昇が続くかを確認してください。",
          }
        : avgHr != null
        ? {
            level: "info",
            title: "睡眠中平均HRは継続観察",
            body: `睡眠中平均HRは ${avgHr} bpm です。`,
            advice:
              "HRVや睡眠時間、ストレスとの組み合わせで評価してください。",
          }
        : null,

      avgHrv != null && avgHrv < 25
        ? {
            level: "warning",
            title: "睡眠中平均HRVが低め",
            body: `睡眠中平均HRVは ${avgHrv} ms です。回復余力の低下が示唆されます。`,
            advice:
              "休養、睡眠延長、夜間負荷軽減を優先してください。絶対値より本人内推移を重視してください。",
          }
        : avgHrv != null
        ? {
            level: "info",
            title: "睡眠中平均HRVは継続観察",
            body: `睡眠中平均HRVは ${avgHrv} ms です。`,
            advice:
              "他人比較ではなく、ご自身の平常時との差分を中心に見てください。",
          }
        : null,

      hrTrend.direction === "up"
        ? {
            level: "caution",
            title: "睡眠中平均HRは上昇傾向",
            body: "30日推移で睡眠中心拍が上向きです。",
            advice:
              "回復不足や生活負荷の増加がないか確認してください。",
          }
        : null,

      hrvTrend.direction === "down"
        ? {
            level: "warning",
            title: "睡眠中平均HRVは低下傾向",
            body: "30日推移で睡眠中HRVが下向きです。",
            advice:
              "繁忙期、短時間睡眠、高ストレス日との重なりを優先的に確認してください。",
          }
        : null,

      avgSpo2Mean != null && avgSpo2Mean < 95
        ? {
            level: "caution",
            title: "睡眠中平均SpO2がやや低め",
            body: `睡眠中平均SpO2は ${avgSpo2Mean}% です。`,
            advice:
              "継続して低い、あるいはAHI関連指標や日中眠気と重なる場合は注意してください。",
          }
        : null,

      avgSpo2Min != null && avgSpo2Min < 90
        ? {
            level: "warning",
            title: "睡眠中最低SpO2が低め",
            body: `睡眠中最低SpO2は ${avgSpo2Min}% です。`,
            advice:
              "単日ではなく反復性を確認し、気になる症状があれば医療相談も検討してください。",
          }
        : null,

      avgResp != null && (avgResp < 12 || avgResp > 20)
        ? {
            level: "caution",
            title: "睡眠時呼吸数平均が一般的範囲から外れ気味",
            body: `睡眠時呼吸数平均は ${avgResp} 回/分です。`,
            advice:
              "ウェアラブル推定値なので単独では断定せず、SpO2やAHI、体調変化と合わせて解釈してください。",
          }
        : avgResp != null
        ? {
            level: "info",
            title: "睡眠時呼吸数は継続観察",
            body: `睡眠時呼吸数平均は ${avgResp} 回/分です。`,
            advice:
              "急な変化や他指標との同時悪化がないかに注目してください。",
          }
        : null,
    ]);
  }, [chartData]);

  const metricCardItems = [
    {
      label: "平均睡眠時間",
      value: longMetrics?.sleep?.mean != null ? `${longMetrics.sleep.mean}時間` : null,
    },
    {
      label: "睡眠時間SD",
      value: longMetrics?.sleep?.sd != null ? `${longMetrics.sleep.sd}時間` : null,
    },
    {
      label: "平均就寝時刻",
      value: longMetrics?.regularity?.sleepStartMean ?? null,
    },
    {
      label: "平均起床時刻",
      value: longMetrics?.regularity?.sleepEndMean ?? null,
    },
    {
      label: "Deep割合平均",
      value:
        longMetrics?.sleepStage?.deepPercentMean != null
          ? `${longMetrics.sleepStage.deepPercentMean}%`
          : null,
    },
    {
      label: "REM割合平均",
      value:
        longMetrics?.sleepStage?.remPercentMean != null
          ? `${longMetrics.sleepStage.remPercentMean}%`
          : null,
    },
    {
      label: "平均HR",
      value:
        longMetrics?.recovery?.avgHeartRateMean != null
          ? `${longMetrics.recovery.avgHeartRateMean} bpm`
          : null,
    },
    {
      label: "平均HRV",
      value:
        longMetrics?.recovery?.avgHrvMean != null
          ? `${longMetrics.recovery.avgHrvMean} ms`
          : null,
    },
    {
      label: "平均ストレス",
      value:
        longMetrics?.stress?.avgStressMean != null
          ? `${longMetrics.stress.avgStressMean}`
          : null,
    },
  ].filter((item) => item.value != null);

  const findingColor = {
    warning: { border: "#fca5a5", text: "#991b1b", title: "⚠️ 要注意" },
    caution: { border: "#fde68a", text: "#92400e", title: "△ 注意" },
    good: { border: "#86efac", text: "#166534", title: "✅ 良好" },
    info: { border: "#93c5fd", text: "#1d4ed8", title: "ℹ️ 情報" },
  };

  const axisTick = { fontSize: 12, fill: "#475569" };
  const tooltipStyle = { fontSize: 12 };

  const unitTooltip = (value, name) => {
    if (value == null) return ["—", name];

    if (name === "睡眠効率") {
      const displayValue = value <= 1 ? Math.round(value * 1000) / 10 : value;
      return [`${displayValue}%`, name];
    }

    const unitMap = {
      "睡眠スコア": "",
      "睡眠時間": "h",
      "Deep": "分",
      "Light": "分",
      "REM": "分",
      "覚醒時間": "分",
      "入眠潜時": "分",
      "睡眠負債": "",
      "昼寝時間": "分",
      "AHI max": "",
      "睡眠HR平均": " bpm",
      "睡眠HRV平均": " ms",
      "呼吸数平均": "",
      "睡眠SpO2平均": "%",
      "睡眠SpO2最小": "%",
      "睡眠SpO2最大": "%",
      "体調スコア": "",
      "HR": " bpm",
      "ストレス": "",
      "SpO2": "%",
      "体温": "℃",
      "活動スコア": "",
      "歩数": "歩",
      "活動カロリー": " kcal",
      "REE": " kcal",
      "QoL": "",
      "就寝前HR 120-60分 平均": " bpm",
      "就寝前HR 60-30分 平均": " bpm",
      "就寝前HR 30-0分 平均": " bpm",
    };

    const unit = unitMap[name] ?? "";
    return [`${value}${unit}`, name];
  };

  const categoryButtonStyle = (selected, accent) => ({
    flex: 1,
    padding: "18px 16px",
    borderRadius: 12,
    cursor: "pointer",
    border: selected ? `2px solid ${accent}` : "1px solid var(--theme-border, #e2e8f0)",
    background: selected ? "var(--theme-card-bg, #fff)" : "var(--theme-sub-bg, #f8fafc)",
    boxShadow: selected
      ? "0 8px 20px rgba(15,23,42,0.12)"
      : "inset 0 0 0 1px rgba(148,163,184,0.08)",
    opacity: selected ? 1 : 0.6,
    transform: selected ? "translateY(-1px)" : "none",
    transition: "all 0.2s ease",
    textAlign: "center",
  });

  const renderPreSleepHrTooltip = ({
    active,
    payload,
    label,
    meanKey,
    sdKey,
    meanLabel,
    color,
  }) => {
    if (!active || !payload || payload.length === 0) return null;

    const row = payload[0]?.payload;
    if (!row) return null;

    const mean = row[meanKey];
    const sd = row[sdKey];
    const sleepHrMean = row.sleepHrMean;
    const gap =
      mean != null && sleepHrMean != null
        ? Math.round((mean - sleepHrMean) * 10) / 10
        : null;

    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: "10px 12px",
          boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>
          日付: {label}
        </p>
        <p style={{ fontSize: 12, color, margin: "0 0 4px", fontWeight: 700 }}>
          {meanLabel}: {mean != null ? `${mean} bpm` : "—"}
        </p>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 4px" }}>
          SD: {sd != null ? `${sd} bpm` : "—"}
        </p>
        <p style={{ fontSize: 12, color: "#7c3aed", margin: "0 0 4px", fontWeight: 600 }}>
          睡眠中平均HR: {sleepHrMean != null ? `${sleepHrMean} bpm` : "未取得"}
        </p>
        <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>
          乖離: {gap != null ? `${gap > 0 ? "+" : ""}${gap} bpm` : "未算出"}
        </p>
      </div>
    );
  };

  const hasAny = (keys) =>
    chartData.some((d) => keys.some((k) => d[k] != null));

  const renderPreSleepHrCard = ({
    title,
    accent,
    meanKey,
    sdKey,
    lowerKey,
    upperKey,
    meanLabel,
    lineColor,
    bandColor,
    note,
    findings,
  }) => {
    if (!hasAny([meanKey])) return null;

    return (
      <Card title={title} accent={accent}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 20, bottom: 10, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis
              tick={axisTick}
              width={52}
              label={{ value: "bpm", angle: -90, position: "insideLeft", fontSize: 12 }}
            />
            <Tooltip
              content={(props) =>
                renderPreSleepHrTooltip({
                  ...props,
                  meanKey,
                  sdKey,
                  meanLabel,
                  color: lineColor,
                })
              }
            />
            <Legend />

            <Area
              type="monotone"
              dataKey={lowerKey}
              stackId={`${meanKey}-band`}
              stroke="none"
              fill="rgba(255,255,255,0)"
              isAnimationActive={false}
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey={(d) =>
                d[upperKey] != null && d[lowerKey] != null
                  ? d[upperKey] - d[lowerKey]
                  : null
              }
              stackId={`${meanKey}-band`}
              stroke="none"
              fill={bandColor}
              fillOpacity={1}
              isAnimationActive={false}
              legendType="none"
            />

            <Line
              type="monotone"
              dataKey={meanKey}
              stroke={lineColor}
              strokeWidth={3}
              dot={{ r: 3 }}
              name={meanLabel}
              connectNulls={false}
            />

            {hasAny(["sleepHrMean"]) && (
              <Line
                type="monotone"
                dataKey="sleepHrMean"
                stroke="#7c3aed"
                strokeWidth={2.2}
                strokeDasharray="6 4"
                dot={false}
                name="睡眠中平均HR"
                connectNulls={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {note && (
          <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, margin: "12px 0 0" }}>
            {note}
          </p>
        )}

        {renderFindingCards(findings, findingColor)}
      </Card>
    );
  };

  if (!sufficient) {
    const remaining = Math.max(0, MIN_DAYS.LONG - current);
    return (
      <Card accent="#f59e0b">
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          長期分析には{MIN_DAYS.LONG}日以上のデータが必要です。
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "6px 0 0" }}>
          現在のデータ: {current}日分
          {remaining > 0 && ` — あと${remaining}日分のデータが蓄積されると分析が開始されます`}
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card title={`長期分析（直近${rows.length}日）`} accent="#2563eb">
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>
          対象期間: {rows[0]?._date} 〜 {rows[rows.length - 1]?._date}
        </p>

        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setSelectedCategory("sleep")}
            style={categoryButtonStyle(selectedCategory === "sleep", "#2563eb")}
          >
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#2563eb" }}>睡眠</p>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
              睡眠スコア、効率、睡眠段階、生理指標
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("health")}
            style={categoryButtonStyle(selectedCategory === "health", "#059669")}
          >
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#059669" }}>体調</p>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
              体調スコア、HR、ストレス、SpO2、体温
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("activity")}
            style={categoryButtonStyle(selectedCategory === "activity", "#f59e0b")}
          >
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>活動</p>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
              活動スコア、歩数、消費カロリー、QoL
            </p>
          </button>
        </div>

        {metricCardItems.length > 0 && selectedCategory === "sleep" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 10,
            }}
          >
            {metricCardItems.map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "12px 14px",
                  background: "var(--theme-sub-bg, #f8fafc)",
                  borderRadius: 8,
                  border: "1px solid var(--theme-border, #e2e8f0)",
                }}
              >
                <span style={{ fontSize: 13, color: "#64748b" }}>{item.label}</span>
                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "var(--theme-text, #1e293b)",
                    margin: "4px 0 0",
                  }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selectedCategory === "sleep" && (
        <>
          {hasAny(["sleepScore"]) && (
            <Card title="睡眠スコアの推移（点）" accent="#2563eb">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={axisTick} />
                  <YAxis domain={[30, 100]} tick={axisTick} width={44} />
                  <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
                  <Line
                    type="monotone"
                    dataKey="sleepScore"
                    stroke="#2563eb"
                    strokeWidth={4}
                    dot={{ r: 3 }}
                    name="睡眠スコア"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              {renderFindingCards(sleepScoreFindings, findingColor)}
            </Card>
          )}

          {(hasAny(["preSleepHr120to60Mean"]) ||
            hasAny(["preSleepHr60to30Mean"]) ||
            hasAny(["preSleepHr30to0Mean"])) && (
            <Card title="睡眠前における心拍状態" accent="#2563eb">
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--theme-text, #1e293b)",
                    marginBottom: 10,
                  }}
                >
                  グラフと詳細を表示 / 折りたたむ
                </summary>

                <div style={{ marginTop: 14 }}>
                  {renderPreSleepHrCard({
                    title: "就寝前HR 120〜60分の推移",
                    accent: "#2563eb",
                    meanKey: "preSleepHr120to60Mean",
                    sdKey: "preSleepHr120to60Sd",
                    lowerKey: "preSleepHr120to60Lower",
                    upperKey: "preSleepHr120to60Upper",
                    meanLabel: "就寝前HR 120-60分 平均",
                    lineColor: "#2563eb",
                    bandColor: "rgba(37, 99, 235, 0.12)",
                    note: "各日の入眠開始推定時刻を基準に、就寝120〜60分前の平均心拍数を算出しています。薄い帯は標準偏差を表します。",
                    findings: preSleepHr120Findings,
                  })}

                  {renderPreSleepHrCard({
                    title: "就寝前HR 60〜30分の推移",
                    accent: "#ea580c",
                    meanKey: "preSleepHr60to30Mean",
                    sdKey: "preSleepHr60to30Sd",
                    lowerKey: "preSleepHr60to30Lower",
                    upperKey: "preSleepHr60to30Upper",
                    meanLabel: "就寝前HR 60-30分 平均",
                    lineColor: "#ea580c",
                    bandColor: "rgba(234, 88, 12, 0.12)",
                    note: "各日の入眠開始推定時刻を基準に、就寝60〜30分前の平均心拍数を算出しています。記録が無い日は欠測として扱います。薄い帯は標準偏差です。",
                    findings: preSleepHr60Findings,
                  })}

                  {renderPreSleepHrCard({
                    title: "就寝前HR 30〜0分の推移",
                    accent: "#16a34a",
                    meanKey: "preSleepHr30to0Mean",
                    sdKey: "preSleepHr30to0Sd",
                    lowerKey: "preSleepHr30to0Lower",
                    upperKey: "preSleepHr30to0Upper",
                    meanLabel: "就寝前HR 30-0分 平均",
                    lineColor: "#16a34a",
                    bandColor: "rgba(22, 163, 74, 0.12)",
                    note: "各日の入眠開始推定時刻を基準に、就寝30〜0分前の平均心拍数を算出しています。就寝直前の覚醒水準の変化を見るための補助指標です。薄い帯は標準偏差です。",
                    findings: preSleepHr30Findings,
                  })}
                </div>
              </details>
            </Card>
          )}

          {hasAny(["sleepHours", "sleepEfficiency"]) && (
            <Card title="睡眠時間・睡眠効率の推移（時間 / %）" accent="#1d4ed8">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 10, right: 28, bottom: 10, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={axisTick} />
                  <YAxis yAxisId="left" tick={axisTick} width={44} label={{ value: "時間", angle: -90, position: "insideLeft", fontSize: 12 }} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={axisTick}
                    width={46}
                    label={{ value: "%", angle: 90, position: "insideRight", fontSize: 12 }}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} labelFormatter={(label) => `日付: ${label}`} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="sleepEfficiency"
                    stroke="#7c3aed"
                    strokeWidth={2.8}
                    dot={{ r: 3 }}
                    name="睡眠効率"
                    connectNulls={false}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="sleepHours"
                    stroke="#2563eb"
                    strokeWidth={2.8}
                    dot={{ r: 3 }}
                    name="睡眠時間"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              {renderFindingCards(sleepDurationEfficiencyFindings, findingColor)}
            </Card>
          )}

          {(hasAny(["sleepDeep"]) || hasAny(["sleepLight"]) || hasAny(["sleepRem"])) && (
  <Card title="睡眠段階の推移" accent="#2563eb">
    <details>
      <summary
        style={{
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--theme-text, #1e293b)",
          marginBottom: 10,
        }}
      >
        Deep・Light・REM のグラフを表示 / 折りたたむ
      </summary>

      <div style={{ marginTop: 14 }}>
        {hasAny(["sleepDeep"]) && (
          <Card title="Deep睡眠の推移（分）" accent="#2563eb">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={axisTick} />
                <YAxis tick={axisTick} width={44} label={{ value: "分", angle: -90, position: "insideLeft", fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
                <Line type="monotone" dataKey="sleepDeep" stroke="#2563eb" strokeWidth={2.8} dot={{ r: 3 }} name="Deep" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {hasAny(["sleepLight"]) && (
          <Card title="Light睡眠の推移（分）" accent="#06b6d4">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={axisTick} />
                <YAxis tick={axisTick} width={44} label={{ value: "分", angle: -90, position: "insideLeft", fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
                <Line type="monotone" dataKey="sleepLight" stroke="#06b6d4" strokeWidth={2.8} dot={{ r: 3 }} name="Light" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {hasAny(["sleepRem"]) && (
          <Card title="REM睡眠の推移（分）" accent="#8b5cf6">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={axisTick} />
                <YAxis tick={axisTick} width={44} label={{ value: "分", angle: -90, position: "insideLeft", fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
                <Line type="monotone" dataKey="sleepRem" stroke="#8b5cf6" strokeWidth={2.8} dot={{ r: 3 }} name="REM" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        <div style={{ marginTop: 12 }}>
          {renderFindingCards(sleepStageFindings, findingColor)}
        </div>
      </div>
    </details>
  </Card>
)}

          {hasAny(["sleepAwake", "sleepLatency", "sleepDebt", "sleepNapTime", "sleepAhiMax"]) && (
            <Card title="睡眠補助指標の推移" accent="#6366f1">
              <ResponsiveContainer width="100%" height={270}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={axisTick} />
                  <YAxis tick={axisTick} width={44} />
                  <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
                  <Line type="monotone" dataKey="sleepAwake" stroke="#0ea5e9" strokeWidth={2.1} dot={{ r: 2.5 }} name="覚醒時間" connectNulls={false} />
                  <Line type="monotone" dataKey="sleepLatency" stroke="#f59e0b" strokeWidth={2.1} dot={{ r: 2.5 }} name="入眠潜時" connectNulls={false} />
                  <Line type="monotone" dataKey="sleepDebt" stroke="#ef4444" strokeWidth={2.1} dot={{ r: 2.5 }} name="睡眠負債" connectNulls={false} />
                  <Line type="monotone" dataKey="sleepNapTime" stroke="#10b981" strokeWidth={2.1} dot={{ r: 2.5 }} name="昼寝時間" connectNulls={false} />
                  <Line type="monotone" dataKey="sleepAhiMax" stroke="#7c3aed" strokeWidth={2.1} dot={{ r: 2.5 }} name="AHI max" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
              {renderFindingCards(sleepSupportFindings, findingColor)}
            </Card>
          )}

          {hasAny(["sleepHrMean", "sleepHrvMean", "sleepRespRate", "sleepSpo2Mean", "sleepSpo2Min", "sleepSpo2Max"]) && (
            <Card title="睡眠中の生理指標の推移" accent="#0f766e">
              <ResponsiveContainer width="100%" height={290}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={axisTick} />
                  <YAxis tick={axisTick} width={44} />
                  <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
                  <Line type="monotone" dataKey="sleepSpo2Max" stroke="#1d4ed8" strokeWidth={1.7} dot={false} name="睡眠SpO2最大" connectNulls={false} />
                  <Line type="monotone" dataKey="sleepSpo2Mean" stroke="#2563eb" strokeWidth={2.1} dot={{ r: 2.5 }} name="睡眠SpO2平均" connectNulls={false} />
                  <Line type="monotone" dataKey="sleepSpo2Min" stroke="#60a5fa" strokeWidth={1.7} dot={false} name="睡眠SpO2最小" connectNulls={false} />
                  <Line type="monotone" dataKey="sleepHrvMean" stroke="#10b981" strokeWidth={2.1} dot={{ r: 2.5 }} name="睡眠平均HRV" connectNulls={false} />
                  <Line type="monotone" dataKey="sleepHrMean" stroke="#ef4444" strokeWidth={2.1} dot={{ r: 2.5 }} name="睡眠平均HR" connectNulls={false} />
                  <Line type="monotone" dataKey="sleepRespRate" stroke="#f59e0b" strokeWidth={2.1} dot={{ r: 2.5 }} name="睡眠時呼吸数平均" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
              <p style={{ fontSize: 12, color: "#475569", margin: 0, lineHeight: 1.7 }}>
                「睡眠時呼吸数平均」は、睡眠中に1分あたり何回呼吸していたかの推定平均値です。成人の安静時の一般的な基準はおおむね12〜20回/分ですが、ウェアラブル推定値であるため、単独での診断には用いず、同一個人内での推移やSpO2・AHIと合わせて解釈してください。
              </p>
              {renderFindingCards(sleepPhysioFindings, findingColor)}
            </Card>
          )}
        </>
      )}

      {selectedCategory === "health" && (
  <>
    {hasAny(["healthScore"]) && (
      <Card title="体調スコアの推移（点）" accent="#059669">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis domain={[30, 100]} tick={axisTick} width={44} />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="healthScore"
              stroke="#059669"
              strokeWidth={3.5}
              dot={{ r: 3 }}
              name="体調スコア"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(healthScoreFindings, findingColor)}
      </Card>
    )}

    {hasAny(["healthHr", "healthHrMin", "healthHrMax"]) && (
      <Card title="心拍数の推移（bpm）" accent="#dc2626">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis
              tick={axisTick}
              width={52}
              label={{ value: "bpm", angle: -90, position: "insideLeft", fontSize: 12 }}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="healthHr"
              stroke="#ef4444"
              strokeWidth={2.8}
              dot={{ r: 3 }}
              name="HR"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="healthHrMin"
              stroke="#fca5a5"
              strokeWidth={1.8}
              dot={false}
              name="HR最小"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="healthHrMax"
              stroke="#b91c1c"
              strokeWidth={1.8}
              dot={false}
              name="HR最大"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(heartRateFindings, findingColor)}
      </Card>
    )}

    {hasAny(["healthStress", "healthStressMin", "healthStressMax"]) && (
      <Card title="ストレス指標の推移" accent="#d97706">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis tick={axisTick} width={44} />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="healthStress"
              stroke="#f59e0b"
              strokeWidth={2.8}
              dot={{ r: 3 }}
              name="ストレス"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="healthStressMin"
              stroke="#fde68a"
              strokeWidth={1.8}
              dot={false}
              name="ストレス最小"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="healthStressMax"
              stroke="#d97706"
              strokeWidth={1.8}
              dot={false}
              name="ストレス最大"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(stressFindings, findingColor)}
      </Card>
    )}

    {hasAny(["healthSpo2", "healthSpo2Min", "healthSpo2Max"]) && (
      <Card title="血中酸素濃度の推移（%）" accent="#2563eb">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis
              domain={[85, 100]}
              tick={axisTick}
              width={50}
              label={{ value: "%", angle: -90, position: "insideLeft", fontSize: 12 }}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="healthSpo2"
              stroke="#2563eb"
              strokeWidth={2.8}
              dot={{ r: 3 }}
              name="SpO2"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="healthSpo2Min"
              stroke="#60a5fa"
              strokeWidth={1.8}
              dot={false}
              name="SpO2最小"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="healthSpo2Max"
              stroke="#1d4ed8"
              strokeWidth={1.8}
              dot={false}
              name="SpO2最大"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(spo2Findings, findingColor)}
      </Card>
    )}

    {hasAny(["healthTemp", "healthTempMin", "healthTempMax"]) && (
      <Card title="体温の推移（℃）" accent="#7c3aed">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis
              tick={axisTick}
              width={52}
              label={{ value: "℃", angle: -90, position: "insideLeft", fontSize: 12 }}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="healthTemp"
              stroke="#7c3aed"
              strokeWidth={2.8}
              dot={{ r: 3 }}
              name="体温"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="healthTempMin"
              stroke="#c4b5fd"
              strokeWidth={1.8}
              dot={false}
              name="体温最小"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="healthTempMax"
              stroke="#6d28d9"
              strokeWidth={1.8}
              dot={false}
              name="体温最大"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(tempFindings, findingColor)}
      </Card>
    )}
  </>
)}

  {selectedCategory === "activity" && (
  <>
    {hasAny(["activityScore"]) && (
      <Card title="活動スコアの推移（点）" accent="#f59e0b">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis domain={[30, 100]} tick={axisTick} width={44} />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="activityScore"
              stroke="#f59e0b"
              strokeWidth={3.5}
              dot={{ r: 3 }}
              name="活動スコア"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(activityScoreFindings, findingColor)}
      </Card>
    )}

    {hasAny(["activitySteps"]) && (
      <Card title="歩数の推移（歩）" accent="#ea580c">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis
              tick={axisTick}
              width={56}
              label={{ value: "歩", angle: -90, position: "insideLeft", fontSize: 12 }}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="activitySteps"
              stroke="#f59e0b"
              strokeWidth={2.8}
              dot={{ r: 3 }}
              name="歩数"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(stepsFindings, findingColor)}
      </Card>
    )}

    {hasAny(["activityCalories"]) && (
      <Card title="活動カロリーの推移（kcal）" accent="#f97316">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis
              tick={axisTick}
              width={56}
              label={{ value: "kcal", angle: -90, position: "insideLeft", fontSize: 12 }}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="activityCalories"
              stroke="#ea580c"
              strokeWidth={2.8}
              dot={{ r: 3 }}
              name="活動カロリー"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(activityCaloriesFindings, findingColor)}
      </Card>
    )}

    {hasAny(["activityReeCalories"]) && (
      <Card title="REEカロリーの推移（kcal）" accent="#b45309">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis
              tick={axisTick}
              width={56}
              label={{ value: "kcal", angle: -90, position: "insideLeft", fontSize: 12 }}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="activityReeCalories"
              stroke="#b45309"
              strokeWidth={2.8}
              dot={{ r: 3 }}
              name="REE"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(reeCaloriesFindings, findingColor)}
      </Card>
    )}

    {hasAny(["qolScore"]) && (
      <Card title="QoLスコアの推移" accent="#7c3aed">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis tick={axisTick} width={44} />
            <Tooltip contentStyle={tooltipStyle} formatter={unitTooltip} />
            <Line
              type="monotone"
              dataKey="qolScore"
              stroke="#7c3aed"
              strokeWidth={2.8}
              dot={{ r: 3 }}
              name="QoL"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {renderFindingCards(qolFindings, findingColor)}
      </Card>
    )}
  </>
)}

    
      <Card accent="#94a3b8">
        <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px", lineHeight: 1.7 }}>
          長期分析では、「睡眠」「体調」「活動」を切り替えて個別に参照できる構成に変更しています。選択されていないカテゴリは意図的に控えめな表示とし、現在見ている分析対象が分かるようにしています。
        </p>
        <p style={{ fontSize: 11, color: "#94a3b8", margin: 0, lineHeight: 1.7 }}>
          また、欠測値は 0 として補完せず、記録が無い日として扱っています。そのため、記録のない期間では線が途切れることがありますが、これは誤った低値表示を避けるための仕様です。
        </p>
      </Card>
    </>
  );
}

  
 function MiniChart({ rows, scoreCandidates, timeCandidates }) {
  const timeField = timeCandidates.length > 0 ? timeCandidates[0].field : null;
  const candidateSet = new Set(scoreCandidates.map(c => c.field));
  const numericFields = [];
  if (rows.length > 0) {
    for (const [k, v] of Object.entries(rows[0])) {
      if (!k.startsWith("_") && typeof v === "number") numericFields.push(k);
    }
  }
  const chartFields = [
    ...numericFields.filter(f => candidateSet.has(f)),
    ...numericFields.filter(f => !candidateSet.has(f)),
  ].slice(0, 4);
  const palette = ["#2563eb", "#dc2626", "#059669", "#f59e0b"];

  const data = rows.map((r, i) => {
  const pt = { _i: i };
  if (r._date) {
    const parts = r._date.split("-");
    pt.label = parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : r._date;
  } else if (timeField && r[timeField]) {
    const d = new Date(r[timeField]);
    pt.label = isNaN(d.getTime()) ? String(r[timeField]).slice(0, 10) : `${d.getMonth() + 1}/${d.getDate()}`;
  } else {
    pt.label = `#${i + 1}`;
  }
    for (const f of chartFields) pt[f] = r[f];
    return pt;
  });

  if (chartFields.length === 0) {
    return <p style={{ fontSize: 12, color: "#94a3b8" }}>チャート表示可能な数値フィールドが見つかりませんでした。</p>;
  }

  return (
    <>
      <p style={{ fontSize: 10, color: "#64748b", margin: "0 0 10px" }}>
        {chartFields.map((f, i) => (
          <span key={f} style={{ marginRight: 12 }}>
            <span style={{ color: palette[i], fontWeight: 700 }}>●</span> {f}
            {candidateSet.has(f) ? "（純正スコア候補）" : "（生データ）"}
          </span>
        ))}
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          {chartFields.map((f, i) => (
            <Line key={f} type="monotone" dataKey={f} stroke={palette[i]} strokeWidth={2} dot={{ r: 2.5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

function Section({ title, note, children }) {
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--theme-text-sub, #475569)", margin: "0 0 4px" }}>
        {title}
        {note && <span style={{ fontWeight: 400, color: "var(--theme-text-muted, #94a3b8)", marginLeft: 8, fontSize: 10 }}>{note}</span>}
      </p>
      {children}
    </div>
  );
}

function PlaceholderTab({ label, desc }) {
  return (
    <div style={{ flex: 1, padding: 14, background: "var(--theme-sub-bg, #f1f5f9)", borderRadius: 8, border: "1px dashed var(--theme-border, #cbd5e1)", textAlign: "center" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--theme-text-muted, #94a3b8)", margin: "0 0 3px" }}>{label}</p>
      <p style={{ fontSize: 10, color: "var(--theme-text-muted, #b0bec5)", margin: 0 }}>{desc}</p>
    </div>
  );
}

const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--theme-text-sub, #475569)", marginBottom: 3 };
const inp = { width: "100%", padding: "7px 10px", border: "1px solid var(--theme-border, #d1d5db)", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--theme-card-bg, #fff)", color: "var(--theme-text, #1e293b)" };
const btn = { padding: "9px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const monoBox = { background: "var(--theme-sub-bg, #f8fafc)", padding: 8, borderRadius: 6, fontSize: 11, fontFamily: "monospace", maxHeight: 180, overflow: "auto", color: "var(--theme-text, #1e293b)" };
const preStyle = { fontSize: 10, background: "var(--theme-sub-bg, #f8fafc)", padding: 8, borderRadius: 6, overflow: "auto", maxHeight: 180, color: "var(--theme-text, #1e293b)" };

