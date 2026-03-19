import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

const PROXY = "http://localhost:3001";

/* ── UI primitives ───────────────────────────────────────── */

const C = {
  success: { bg: "#dcfce7", fg: "#166534", bd: "#86efac" },
  failure: { bg: "#fee2e2", fg: "#991b1b", bd: "#fca5a5" },
  warning: { bg: "#fef9c3", fg: "#854d0e", bd: "#fde047" },
  info:    { bg: "#dbeafe", fg: "#1e40af", bd: "#93c5fd" },
  pending: { bg: "#f1f5f9", fg: "#64748b", bd: "#cbd5e1" },
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
      background: "#fff", borderRadius: 10, padding: "18px 22px",
      marginBottom: 14, borderLeft: `4px solid ${accent}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      {title && <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{title}</h3>}
      {children}
    </div>
  );
}

function Row({ label, value, status }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "5px 0", borderBottom: "1px solid #f1f5f9", gap: 8,
    }}>
      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: 6, textAlign: "right", wordBreak: "break-all" }}>
        {status && <Badge status={status} />}
        {value != null && value !== "" ? String(value) : ""}
      </span>
    </div>
  );
}

/* ── data utilities ──────────────────────────────────────── */

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
  if (r.success && r.structure) return "success";
  if (r.success && r.errorCode === "UNEXPECTED_STRUCTURE") return "warning";
  if (r.errorCode === "EMPTY_RESPONSE") return "warning";
  if (r.errorCode === "NON_JSON_RESPONSE") return "warning";
  if (r.errorCode === "JSON_PARSE_ERROR") return "warning";
  return "failure";
}

/* ═══════════════════════════════════════════════════════════
   Character Evolution System — 本ツール独自演出
   6果物系統 × 5成長段階 × 周回型育成（Lv.100上限）

   境界条件:
   - Lv.100到達 = 周回完了（追加XP不要）
   - 1周に必要なXP = (MAX_LEVEL - 1) * XP_PER_LEVEL = 2970
   - Lv.100は瞬間的な遷移点であり、到達と同時に周回が完了し
     次の果物が配布される
   - 祝賀表示は completedRounds > 0 のとき表示し、
     直前に完成した果物系統名を明示する
   ═══════════════════════════════════════════════════════════ */

const FRUIT_SPECIES = [
  {
    id: "cherry", name: "サクランボ系",
    stages: [
      { name: "ちぇりん",       emoji: "🌰", desc: "小さな種から旅が始まる" },
      { name: "さくらっこ",     emoji: "🌱", desc: "芽を出し光を求める" },
      { name: "はなまるん",     emoji: "🌸", desc: "花を咲かせ実りを待つ" },
      { name: "あかねちゃん",   emoji: "🍒", desc: "赤く色づき甘さを蓄える" },
      { name: "ルビーベリー",   emoji: "💎", desc: "宝石のように輝く完熟の実" },
    ],
  },
  {
    id: "lemon", name: "レモン系",
    stages: [
      { name: "れもたん",       emoji: "🌰", desc: "酸っぱい未来を秘めた種" },
      { name: "すっぱるん",     emoji: "🌱", desc: "元気いっぱいに伸びる若芽" },
      { name: "しとりん",       emoji: "🍃", desc: "シトラスの香りが漂い始める" },
      { name: "きわみん",       emoji: "🍋", desc: "酸味と旨味が極まる" },
      { name: "こがねレモン",   emoji: "✨", desc: "黄金に輝く完熟の果実" },
    ],
  },
  {
    id: "muscat", name: "マスカット系",
    stages: [
      { name: "つぶりん",       emoji: "🌰", desc: "ひと粒の可能性を秘めた種" },
      { name: "みどりっこ",     emoji: "🌱", desc: "瑞々しい緑が芽吹く" },
      { name: "かがやん",       emoji: "🍀", desc: "透き通る翠色に育つ" },
      { name: "たわわん",       emoji: "🍇", desc: "房が重く実り始める" },
      { name: "翠玉のしずく",   emoji: "💚", desc: "宝石のような一粒一粒" },
    ],
  },
  {
    id: "peach", name: "モモ系",
    stages: [
      { name: "ももたん",       emoji: "🌰", desc: "ふわふわの夢を抱く種" },
      { name: "ふわりん",       emoji: "🌱", desc: "柔らかな芽がそっと開く" },
      { name: "ほのかちゃん",   emoji: "🌺", desc: "ほんのり桃色に染まる" },
      { name: "まろみん",       emoji: "🍑", desc: "甘く芳醇な香りを放つ" },
      { name: "白桃ひめ",       emoji: "👑", desc: "気品あふれる完熟の桃" },
    ],
  },
  {
    id: "grape", name: "ぶどう系",
    stages: [
      { name: "つぶっこ",       emoji: "🌰", desc: "深い紫の夢を見る種" },
      { name: "むらさきん",     emoji: "🌱", desc: "力強く伸びる蔓" },
      { name: "ふさりん",       emoji: "🍃", desc: "房の形が見え始める" },
      { name: "みのりん",       emoji: "🍇", desc: "一粒ずつ味わい深くなる" },
      { name: "巨峰まる",       emoji: "🟣", desc: "堂々たる完熟の大粒" },
    ],
  },
  {
    id: "blueberry", name: "ブルーベリー系",
    stages: [
      { name: "べりたん",       emoji: "🌰", desc: "小さくても志は大きい種" },
      { name: "あおまるん",     emoji: "🌱", desc: "青みがかった新芽" },
      { name: "つみりん",       emoji: "💧", desc: "朝露を浴びて育つ" },
      { name: "こもれびん",     emoji: "🫐", desc: "木漏れ日の中で色づく" },
      { name: "藍玉ベリー",     emoji: "💙", desc: "深い藍色に輝く完熟の実" },
    ],
  },
];

const SPECIES_COUNT = FRUIT_SPECIES.length; // 6
const XP_PER_LEVEL = 30;
const MAX_LEVEL = 100;
// ★ Lv.100は30XP分の滞在可能な最終レベル。
// Lv.100滞在中に祝賀表示。次の30XP境界で次周回へ移行。
const XP_PER_ROUND = MAX_LEVEL * XP_PER_LEVEL; // 3000

/* ── Stable deterministic hash ── */

function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getSpeciesIndexForRound(originDateStr, roundIndex) {
  if (roundIndex === 0) {
    return stableHash("fruit:" + originDateStr + ":r0") % SPECIES_COUNT;
  }
  const prev = getSpeciesIndexForRound(originDateStr, roundIndex - 1);
  const raw = stableHash("fruit:" + originDateStr + ":r" + roundIndex) % (SPECIES_COUNT - 1);
  return raw >= prev ? raw + 1 : raw;
}

function getStageIndex(level) {
  if (level <= 19) return 0;
  if (level <= 39) return 1;
  if (level <= 59) return 2;
  if (level <= 79) return 3;
  return 4; // 80-99 (within a round) or Lv.100 transient
}

function computeCharacter(rows) {
    const empty = {
    level: 1, totalXP: 0, xpInLevel: 0, xpPerLevel: XP_PER_LEVEL,
    roundIndex: 0, speciesIdx: 0, stageIndex: 0,
    isMaxLevel: false, completedRounds: 0, originDate: null,
    species: FRUIT_SPECIES[0], stage: FRUIT_SPECIES[0].stages[0],
  };
  if (!rows || rows.length === 0) return empty;

  const dateMap = {};
  for (const r of rows) {
    const t = findFieldValue(r, ["_time", "time", "date"]);
    if (!t) continue;
    const ds = String(t).slice(0, 10);
    if (!dateMap[ds]) dateMap[ds] = [];
    dateMap[ds].push(r);
  }
  const sortedDates = Object.keys(dateMap).sort();
  if (sortedDates.length === 0) return empty;

  const originDate = sortedDates[0];

  // XP accumulation (same rule as before)
  let totalXP = 0;
  for (let i = 1; i < sortedDates.length; i++) {
    totalXP += 10;
    const dayRows = dateMap[sortedDates[i]];
    const rec = dayRows[dayRows.length - 1];
    const ss = safeNum(rec.sleep_score);
    const hs = safeNum(rec.health_score);
    const as = safeNum(rec.activity_score);
    const available = [ss, hs, as].filter(v => v != null);
    if (available.length > 0) {
      const avg = available.reduce((a, b) => a + b, 0) / available.length;
      if (avg >= 85) totalXP += 5;
      else if (avg >= 70) totalXP += 3;
      else if (avg >= 55) totalXP += 1;
    }
  }
    const completedRounds = Math.floor(totalXP / XP_PER_ROUND);
  const xpInRound = totalXP % XP_PER_ROUND;
  const level = Math.min(MAX_LEVEL, Math.floor(xpInRound / XP_PER_LEVEL) + 1);
  const isMaxLevel = level === MAX_LEVEL;
  const xpInLevel = isMaxLevel
    ? xpInRound - (MAX_LEVEL - 1) * XP_PER_LEVEL
    : xpInRound % XP_PER_LEVEL;

  const roundIndex = completedRounds;
  const speciesIdx = getSpeciesIndexForRound(originDate, roundIndex);
  const stageIndex = getStageIndex(level);
  const species = FRUIT_SPECIES[speciesIdx];
  const stage = species.stages[stageIndex];

  return {
    level, totalXP, xpInLevel, xpPerLevel: XP_PER_LEVEL,
    roundIndex, speciesIdx, stageIndex,
    isMaxLevel, completedRounds, originDate,
    species, stage,
  };
}

/* ── Health condition classification (本ツール独自演出) ── */

function classifyCondition(row) {
  if (!row) return "calm";
  let val = safeNum(row.health_score);
  if (val == null) {
    const available = [safeNum(row.sleep_score), safeNum(row.health_score), safeNum(row.activity_score)].filter(v => v != null);
    if (available.length > 0) val = available.reduce((a, b) => a + b, 0) / available.length;
  }
  if (val == null) return "calm";
  if (val <= 39) return "worst";
  if (val <= 59) return "bad";
  if (val <= 74) return "normal";
  return "good";
}

const CONDITION_CONFIG = {
  worst:  { label: "最悪", bg: "#1a1a2e", accent: "#6b21a8", icon: "⛈️", desc: "嵐" },
  bad:    { label: "悪い", bg: "#1e293b", accent: "#475569", icon: "💨", desc: "強風" },
  normal: { label: "普通", bg: "#f0fdf4", accent: "#86efac", icon: "🍃", desc: "穏やか" },
  good:   { label: "良い", bg: "#fffbeb", accent: "#fbbf24", icon: "☀️", desc: "太陽" },
  calm:   { label: "—",    bg: "#f8fafc", accent: "#cbd5e1", icon: "🍃", desc: "穏やか" },
};

function shouldShowRainbow(rows) {
  if (!rows || rows.length < 2) return false;
  const dateMap = {};
  for (const r of rows) {
    const t = findFieldValue(r, ["_time", "time", "date"]);
    if (!t) continue;
    const ds = String(t).slice(0, 10);
    dateMap[ds] = r;
  }
  const sortedDates = Object.keys(dateMap).sort();
  if (sortedDates.length < 2) return false;
  const today = dateMap[sortedDates[sortedDates.length - 1]];
  const yesterday = dateMap[sortedDates[sortedDates.length - 2]];
  const condToday = classifyCondition(today);
  const condYesterday = classifyCondition(yesterday);
  return (condYesterday === "worst" || condYesterday === "bad") && condToday === "good";
}

/* ================================================================
   MAIN APP
   ================================================================ */

export default function App() {
  const [tab, setTab] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [authRes, setAuthRes] = useState(null);
  const [tokens, setTokens] = useState({ idToken: null, localId: null });

  const [fetchRes, setFetchRes] = useState(null);
  const [normInfo, setNormInfo] = useState(null);
  const [normDetail, setNormDetail] = useState(null);

  const [pipe, setPipe] = useState({
    proxy: "pending", login: "pending", idToken: "pending", localId: "pending",
    fetchInfo: "pending", fetchDetail: "pending",
    parseInfo: "pending", parseDetail: "pending",
    normalize: "pending", display: "pending",
  });

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${PROXY}/api/health`).then(r => r.json())
      .then(d => setPipe(p => ({ ...p, proxy: d.status === "ok" ? "success" : "warning" })))
      .catch(() => setPipe(p => ({ ...p, proxy: "failure" })));
  }, []);

  const doLogin = useCallback(async () => {
    setBusy(true);
    setAuthRes(null); setFetchRes(null); setNormInfo(null); setNormDetail(null);
    setPipe(p => ({
      ...p, login: "pending", idToken: "pending", localId: "pending",
      fetchInfo: "pending", fetchDetail: "pending",
      parseInfo: "pending", parseDetail: "pending",
      normalize: "pending", display: "pending",
    }));
    try {
      const r = await fetch(`${PROXY}/api/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      setAuthRes(d);
      if (d.success && d.idToken && d.localId) {
        setTokens({ idToken: d.idToken, localId: d.localId });
        setPipe(p => ({ ...p, login: "success", idToken: "success", localId: "success" }));
      } else {
        setPipe(p => ({
          ...p,
          login: d.success ? "warning" : "failure",
          idToken: d.idToken ? "success" : "failure",
          localId: d.localId ? "success" : "failure",
        }));
      }
    } catch (err) {
      setAuthRes({ success: false, errorCode: "NETWORK_ERROR", errorDetail: err.message });
      setPipe(p => ({ ...p, login: "failure", idToken: "failure", localId: "failure" }));
    }
    setBusy(false);
  }, [email, password]);

  const doFetch = useCallback(async () => {
    if (!tokens.idToken) return;
    setBusy(true);
    setFetchRes(null); setNormInfo(null); setNormDetail(null);
    try {
      const r = await fetch(`${PROXY}/api/fetch-data`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: tokens.idToken, localId: tokens.localId,
          startDate, endDate, dataType: "both",
        }),
      });
      const d = await r.json();
      setFetchRes(d);

      const ri = d.results?.dailyInfo;
      const rd = d.results?.dailyDetail;
      const infoStatus = classifyResult(ri);
      const detailStatus = classifyResult(rd);

      setPipe(p => ({
        ...p,
        fetchInfo: ri ? (ri.success || ri.errorCode === "EMPTY_RESPONSE" || ri.errorCode === "NON_JSON_RESPONSE" || ri.errorCode === "JSON_PARSE_ERROR" ? infoStatus : "failure") : "pending",
        fetchDetail: rd ? (rd.success || rd.errorCode === "EMPTY_RESPONSE" || rd.errorCode === "NON_JSON_RESPONSE" || rd.errorCode === "JSON_PARSE_ERROR" ? detailStatus : "failure") : "pending",
        parseInfo: ri?.structure ? "success" : (ri && !ri.success ? infoStatus : "pending"),
        parseDetail: rd?.structure ? "success" : (rd && !rd.success ? detailStatus : "pending"),
      }));

      let anyNorm = false;
      let newNormInfo = null;
      let newNormDetail = null;
      if (ri?.success && ri.data) {
        const recs = extractRecords(ri.data);
        if (recs.length > 0) { newNormInfo = minimalNormalize(recs); anyNorm = true; }
      }
      if (rd?.success && rd.data) {
        const recs = extractRecords(rd.data);
        if (recs.length > 0) { newNormDetail = minimalNormalize(recs); anyNorm = true; }
      }

      setNormInfo(newNormInfo);
      setNormDetail(newNormDetail);

      setPipe(p => ({
        ...p,
        normalize: anyNorm ? "success" : (ri?.success || rd?.success ? "warning" : "failure"),
        display: anyNorm ? "success" : "pending",
      }));

      if (anyNorm) {
        setTab("home");
      }
    } catch (err) {
      setFetchRes({ success: false, errorCode: "NETWORK_ERROR", errorDetail: err.message });
      setPipe(p => ({ ...p, fetchInfo: "failure", fetchDetail: "failure" }));
    }
    setBusy(false);
  }, [tokens, startDate, endDate]);

  const structInfo = fetchRes?.results?.dailyInfo?.structure || null;
  const structDetail = fetchRes?.results?.dailyDetail?.structure || null;

  const TABS = [
    { id: "login", label: "ログイン / 設定" },
    { id: "diag", label: "データ診断" },
    { id: "home", label: "ホーム" },
    { id: "short", label: "短期分析" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Noto Sans JP','Helvetica Neue',Arial,sans-serif" }}>

      <header style={{
        background: "linear-gradient(135deg,#0f172a,#1e3a5f)", color: "#fff",
        padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>SOXAI Health Intelligence</h1>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: "#94a3b8" }}>MVP Stage 6 revised — Connection &amp; Diagnostics</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>Proxy:</span>
          <Badge status={pipe.proxy} />
        </div>
      </header>

      <nav style={{ display: "flex", background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 12px" }}>
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
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>開始日</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inp} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>終了日</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inp} />
                  </div>
                </div>
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
              <Card title="データ取得" accent="#7c3aed">
                <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}>認証済み。データ取得を試みます。</p>
                <button onClick={doFetch} disabled={busy} style={{ ...btn, background: "#7c3aed", opacity: busy ? 0.5 : 1 }}>
                  {busy ? "取得中…" : "データ取得実行"}
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
            fetchRes={fetchRes}
            onGoShort={() => setTab("short")}
          />
        )}

        {tab === "short" && (
          <>
            <Card title="短期分析（直近数日の推移）" accent="#7c3aed">
              {(!normInfo || normInfo.rows.length < 2) ? (
                <div>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                    {!normInfo
                      ? "データなし — ログイン後にデータ取得を実行してください。"
                      : `データ不足 — 短期分析には2日以上のデータが必要です（現在: ${normInfo.rows.length}件）。`}
                  </p>
                  {fetchRes && !normInfo && (
                    <p style={{ fontSize: 11, color: "#f59e0b", margin: "6px 0 0" }}>
                      データ取得は実行されましたが、JSON配列形式のデータが得られていません。診断タブを確認してください。
                    </p>
                  )}
                </div>
              ) : (
                <MiniChart
                  rows={normInfo.rows}
                  scoreCandidates={structInfo?.nativeScoreCandidates || []}
                  timeCandidates={structInfo?.timeFieldCandidates || []}
                />
              )}
            </Card>
            <Card accent="#94a3b8">
              <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>
                ※ この画面のデータはAPI取得値またはSOXAI純正スコア候補値です。本ツール独自推定値は含まれていません。
              </p>
            </Card>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <PlaceholderTab label="長期分析" desc="1か月以上のデータ蓄積後に利用可能" />
              <PlaceholderTab label="超長期分析" desc="さらにデータ蓄積後に利用可能" />
              <PlaceholderTab label="臨床グレード" desc="DailyDetailData確認後に実装予定" />
            </div>
          </>
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

function HomeScreen({ normInfo, normDetail, fetchRes, onGoShort }) {
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

  const rows = hasInfo ? normInfo.rows : [];
  const latest = hasInfo ? rows[rows.length - 1] : {};
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

  const charData = computeCharacter(rows);
  const condition = classifyCondition(latest);
  const condCfg = CONDITION_CONFIG[condition];
  const rainbow = shouldShowRainbow(rows);
  const isDark = condition === "worst" || condition === "bad";

  return (
    <>
      {/* ── HERO: 3 Main Scores ── */}
      <div style={{
        background: "#fff", borderRadius: 12, padding: "20px 22px",
        marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        {displayDate && (
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 14px", fontWeight: 500 }}>
            {displayDate} のデータ
          </p>
        )}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <HeroScore label="睡眠" value={sleepScore} color="#1e40af" bgColor="#eff6ff" icon="🌙" />
          <HeroScore label="体調" value={healthScore} color="#047857" bgColor="#ecfdf5" icon="💚" />
          <HeroScore label="運動" value={activityScore} color="#b45309" bgColor="#fffbeb" icon="🏃" />
        </div>
        <div style={{
          display: "flex", gap: 16, padding: "10px 12px",
          background: "#f8fafc", borderRadius: 8, flexWrap: "wrap",
        }}>
          <SleepDetailItem label="就寝" value={sleepDetail.bedtime} />
          <SleepDetailItem label="起床" value={sleepDetail.wakeTime} />
          <SleepDetailItem label="合計睡眠" value={sleepDetail.totalSleep} />
        </div>
        <p style={{ fontSize: 9, color: "#94a3b8", margin: "10px 0 0", letterSpacing: 0.3 }}>
          ※ 上記スコアはSOXAI APIから取得した値です。アプリ表示値との完全な一致は未確認です。
        </p>
      </div>

      {/* ── QoL + Activity ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div style={{
          flex: 1, background: "#fff", borderRadius: 10, padding: "14px 16px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: "3px solid #7c3aed",
        }}>
          <p style={{ fontSize: 10, color: "#64748b", fontWeight: 600, margin: "0 0 4px" }}>QoLスコア（補助指標）</p>
          <p style={{ fontSize: 26, fontWeight: 800, color: "#7c3aed", margin: 0, lineHeight: 1 }}>
            {qolScore != null ? qolScore : "—"}
          </p>
          <p style={{ fontSize: 9, color: "#94a3b8", margin: "4px 0 0" }}>API取得値</p>
        </div>
        <div style={{
          flex: 1, background: "#fff", borderRadius: 10, padding: "14px 16px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: "#1e293b", margin: "0 0 6px" }}>活動サマリ</p>
          {steps != null && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>歩数</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#1e293b" }}>{steps.toLocaleString()}</span>
            </div>
          )}
          {calories != null && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>消費カロリー</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#1e293b" }}>{calories.toLocaleString()} kcal</span>
            </div>
          )}
          {steps == null && calories == null && (
            <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>活動データなし</p>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
         Character Area — 周回型育成（本ツール独自演出）
         Lv.100到達 = 周回完了（追加XP不要）
         ══════════════════════════════════════════════════════ */}
      <div style={{
        background: condCfg.bg, borderRadius: 12, padding: "18px 20px",
        marginBottom: 14, border: `2px solid ${condCfg.accent}`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        position: "relative", overflow: "hidden",
        transition: "background 0.4s, border-color 0.4s",
      }}>
        {/* Weather overlay */}
        <div style={{
          position: "absolute", top: 8, right: 12,
          fontSize: 22, opacity: 0.6, pointerEvents: "none",
        }}>
          {condition === "worst" && "⛈️⛈️"}
          {condition === "bad" && "💨💨"}
          {condition === "normal" && "🍃"}
          {condition === "good" && "☀️"}
          {condition === "calm" && "🍃"}
        </div>

        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: isDark ? "#e2e8f0" : "#475569" }}>
            🌿 フルーツ育成
          </p>
          <span style={{
            fontSize: 9, padding: "1px 6px", borderRadius: 4,
            background: "#f59e0b22", color: "#b45309", fontWeight: 600,
          }}>
            本ツール独自演出
          </span>
          {charData.completedRounds > 0 && (
            <span style={{
              fontSize: 9, padding: "1px 6px", borderRadius: 4, marginLeft: "auto",
              background: isDark ? "rgba(255,255,255,0.1)" : "#eff6ff",
              color: isDark ? "#93c5fd" : "#2563eb", fontWeight: 600,
            }}>
              {charData.completedRounds}周クリア済
            </span>
          )}
        </div>

        {/* ★ 周回完了祝賀バナー（completedRounds > 0 のとき表示） */}
                       {charData.isMaxLevel && (
          <div style={{
            background: "linear-gradient(135deg, #fef9c3, #fde68a)",
            borderRadius: 8, padding: "12px 14px", marginBottom: 12,
            border: "1px solid #f59e0b", textAlign: "center",
          }}>
            <p style={{ fontSize: 16, margin: "0 0 4px" }}>🎉🎊 Lv.100 到達おめでとう！ 🎊🎉</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", margin: "0 0 4px" }}>
              {charData.stage.name}（{charData.species.name}）が完全体に成長しました！
            </p>
            <p style={{ fontSize: 11, color: "#a16207", margin: 0 }}>
              🎁 あと少しXPを貯めると、新しいフルーツをお配りします！
            </p>
          </div>
        )}
            

        {/* Character row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: isDark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            position: "relative", flexShrink: 0,
          }}>
            {charData.stage.emoji}
            {rainbow && (
              <span style={{ position: "absolute", top: -6, right: -10, fontSize: 22 }}>🌈</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 10, margin: "0 0 1px", fontWeight: 500,
              color: isDark ? "#94a3b8" : "#64748b",
            }}>
              {charData.species.name}
            </p>
            <p style={{
              fontSize: 16, fontWeight: 800, margin: "0 0 2px",
              color: isDark ? "#f1f5f9" : "#1e293b",
            }}>
              {charData.stage.name}
            </p>
            <p style={{
              fontSize: 10, margin: "0 0 8px",
              color: isDark ? "#94a3b8" : "#64748b", fontStyle: "italic",
            }}>
              {charData.stage.desc}
            </p>

            <p style={{
  fontSize: 11,
  margin: "0 0 6px",
  color: isDark ? "#cbd5e1" : "#475569",
  fontWeight: 600,
}}>
  Lv.{charData.level}{charData.isMaxLevel ? " (MAX)" : ""}
  <span
    style={{
      fontWeight: 400,
      marginLeft: 8,
      color: isDark ? "#94a3b8" : "#64748b",
    }}
  >
    進化 {charData.stageIndex + 1}/5段階
  </span>
  <span
    style={{
      fontWeight: 400,
      marginLeft: 8,
      color: isDark ? "#64748b" : "#94a3b8",
    }}
  >
    総XP {charData.totalXP}
  </span>
</p>

            {/* XP gauge */}
            <div style={{
              width: "100%", height: 10, borderRadius: 5,
              background: isDark ? "rgba(255,255,255,0.15)" : "#e2e8f0",
              overflow: "hidden",
            }}>
              <div style={{
                                width: charData.isMaxLevel
                  ? "100%"
                  : `${(charData.xpInLevel / charData.xpPerLevel) * 100}%`,
                height: "100%", borderRadius: 5,
                                background: charData.isMaxLevel
                  ? "linear-gradient(90deg, #f59e0b, #eab308)"
                  : "linear-gradient(90deg, #34d399, #059669)",
                transition: "width 0.4s",
              }} />
            </div>
                        <p style={{
              fontSize: 9, margin: "3px 0 0",
              color: isDark ? "#64748b" : "#94a3b8",
            }}>
              {charData.isMaxLevel
                ? `Lv.100 到達済 — あと ${XP_PER_ROUND - (charData.totalXP % XP_PER_ROUND)} XP で次の果物へ`
                : `次のレベルまで ${charData.xpPerLevel - charData.xpInLevel} XP`}
            </p>
          </div>
        </div>

        {/* Condition */}
        <div style={{
          marginTop: 10, padding: "6px 10px", borderRadius: 6,
          background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.03)",
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 14 }}>{condCfg.icon}</span>
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: isDark ? "#e2e8f0" : "#475569",
          }}>
            環境: {condCfg.desc}（体調判定: {condCfg.label}）
          </span>
          {rainbow && (
            <span style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b", marginLeft: "auto" }}>
              🌈 回復虹 — 前日からの大幅改善！
            </span>
          )}
        </div>

        {/* Logic detail */}
        <details style={{ marginTop: 8 }}>
          <summary style={{
            fontSize: 10, cursor: "pointer",
            color: isDark ? "#94a3b8" : "#64748b",
          }}>
            育成ロジック詳細（本ツール独自演出）
          </summary>
          <div style={{
            fontSize: 10, lineHeight: 1.7, marginTop: 4, padding: "8px 10px",
            borderRadius: 6,
            background: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
            color: isDark ? "#94a3b8" : "#64748b",
          }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600, color: isDark ? "#cbd5e1" : "#475569" }}>経験値ルール</p>
            <p style={{ margin: "0 0 2px" }}>・起点日（データ最古日）は Lv.1、XP=0</p>
            <p style={{ margin: "0 0 2px" }}>・以降の日: データ存在で +10 XP</p>
            <p style={{ margin: "0 0 2px" }}>・3スコア平均 85以上: +5 / 70以上: +3 / 55以上: +1</p>
            <p style={{ margin: "0 0 2px" }}>・{XP_PER_LEVEL} XP ごとにレベルアップ（上限 Lv.{MAX_LEVEL}）</p>
                        <p style={{ margin: "0 0 8px" }}>・1周 = {XP_PER_ROUND} XP（Lv.{MAX_LEVEL} 到達後、次の{XP_PER_LEVEL}XP境界で次の果物へ）</p>
            <p style={{ margin: "0 0 2px" }}>・Lv.1〜19: 第1段階 / Lv.20〜39: 第2段階 / Lv.40〜59: 第3段階</p>
            <p style={{ margin: "0 0 8px" }}>・Lv.60〜79: 第4段階 / Lv.80〜100: 第5段階（完成体）</p>
            <p style={{ margin: "0 0 4px", fontWeight: 600, color: isDark ? "#cbd5e1" : "#475569" }}>周回ルール</p>
            <p style={{ margin: "0 0 2px" }}>・直前と同じ系統は連続配布されない</p>
            <p style={{ margin: "0 0 2px" }}>・配布先は起点日と周回数から決定論的に割り当て（リロードで変わらない）</p>
            <p style={{ margin: "0 0 8px" }}>・全6系統: サクランボ / レモン / マスカット / モモ / ぶどう / ブルーベリー</p>
            <p style={{ margin: "0 0 4px", fontWeight: 600, color: isDark ? "#cbd5e1" : "#475569" }}>現在の状態</p>
            <p style={{ margin: "0 0 2px" }}>・起点日: {charData.originDate || "—"}</p>
            <p style={{ margin: "0 0 2px" }}>・総XP: {charData.totalXP} / 現在周回: 第{charData.roundIndex + 1}周</p>
            <p style={{ margin: 0 }}>・クリア済周回数: {charData.completedRounds}</p>
          </div>
        </details>
      </div>

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

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <PlaceholderTab label="長期分析" desc="1か月以上のデータ蓄積後" />
        <PlaceholderTab label="超長期分析" desc="さらにデータ蓄積後" />
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

function safeNum(v) {
  if (v == null) return null;
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") { const n = Number(v); if (!isNaN(n) && v.trim() !== "") return n; }
  return null;
}

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

/* ── Shared sub-components ───────────────────────────────── */

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
    if (timeField && r[timeField]) {
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
      <p style={{ fontSize: 11, fontWeight: 700, color: "#475569", margin: "0 0 4px" }}>
        {title}
        {note && <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: 8, fontSize: 10 }}>{note}</span>}
      </p>
      {children}
    </div>
  );
}

function PlaceholderTab({ label, desc }) {
  return (
    <div style={{ flex: 1, padding: 14, background: "#f1f5f9", borderRadius: 8, border: "1px dashed #cbd5e1", textAlign: "center" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", margin: "0 0 3px" }}>{label}</p>
      <p style={{ fontSize: 10, color: "#b0bec5", margin: 0 }}>{desc}</p>
    </div>
  );
}

const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 3 };
const inp = { width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" };
const btn = { padding: "9px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const monoBox = { background: "#f8fafc", padding: 8, borderRadius: 6, fontSize: 11, fontFamily: "monospace", maxHeight: 180, overflow: "auto" };
const preStyle = { fontSize: 10, background: "#f8fafc", padding: 8, borderRadius: 6, overflow: "auto", maxHeight: 180 };
