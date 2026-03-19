// src/utils/preSleepHrAnalysis.js

function safeNum(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function avg(arr) {
  const valid = arr.filter((v) => v != null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}

function stdDev(arr) {
  const valid = arr.filter((v) => v != null && Number.isFinite(v));
  if (valid.length < 2) return null;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance =
    valid.reduce((sum, v) => sum + (v - mean) ** 2, 0) / valid.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatLocalDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function localHour(ms) {
  return new Date(ms).getHours();
}

function parseLocalMs(row) {
  const t = row?._time;
  if (!t) return null;
  const utcMs = Date.parse(t);
  if (!Number.isFinite(utcMs)) return null;
  const offsetMins = safeNum(row?.utc_offset_mins) ?? 0;
  return utcMs + offsetMins * 60 * 1000;
}

// 睡眠セッションの日付キー。
// 深夜〜午前中の睡眠は前日夜のセッションに寄せる。
function getSleepSessionDate(localMs) {
  const d = new Date(localMs);
  const hour = d.getHours();
  if (hour < 12) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// sleep_stage が 0/1/2/3 のいずれかなら睡眠関連記録とみなす。
// ここでは stage が非nullであること自体を優先的に使う。
function hasSleepSignal(row) {
  const stage = safeNum(row?.sleep_stage);
  const sleep = safeNum(row?.sleep_sleep);

  if (stage != null) return true;
  if (sleep != null) return true;
  return false;
}

// 厳密な符号意味が未確定でも、少なくとも「睡眠関連の状態が継続した最初の時点」を
// 入眠開始候補として拾うため、直近3点中2点以上が sleep signal を持つ箇所を採用する。
function estimateSleepOnset(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const sorted = rows
    .filter((r) => r._localMs != null)
    .sort((a, b) => a._localMs - b._localMs);

  for (let i = 0; i < sorted.length; i += 1) {
    const window = sorted.slice(i, i + 3);
    const count = window.filter(hasSleepSignal).length;
    if (count >= 2 && hasSleepSignal(sorted[i])) {
      return sorted[i];
    }
  }

  const firstSleepRow = sorted.find(hasSleepSignal);
  return firstSleepRow || null;
}

function extractHr(row) {
  const healthHr = safeNum(row?.health_hr_mean);
  if (healthHr != null) return healthHr;

  const sleepHr = safeNum(row?.sleep_hr_mean);
  if (sleepHr != null) return sleepHr;

  return null;
}

function statsForWindow(rows, startMs, endMs) {
  const vals = rows
    .filter((r) => r._localMs != null && r._localMs >= startMs && r._localMs < endMs)
    .map(extractHr)
    .filter((v) => v != null);

  return {
    mean: avg(vals),
    sd: stdDev(vals),
    n: vals.length,
  };
}

/**
 * detailRows: fetchDetail 側の行配列（minimalNormalize 後でも可）
 *
 * 戻り値:
 * {
 *   "2026-02-12": {
 *      onsetLocal: "2026-02-12 23:40",
 *      pre_sleep_hr_120_60_mean: ...,
 *      pre_sleep_hr_120_60_sd: ...,
 *      pre_sleep_hr_60_30_mean: ...,
 *      pre_sleep_hr_60_30_sd: ...,
 *      pre_sleep_hr_30_0_mean: ...,
 *      pre_sleep_hr_30_0_sd: ...,
 *   },
 *   ...
 * }
 */
export function buildPreSleepHrStats(detailRows = []) {
  if (!Array.isArray(detailRows) || detailRows.length === 0) return {};

  const enriched = detailRows
    .map((row) => {
      const localMs = parseLocalMs(row);
      if (localMs == null) return null;
      return {
        ...row,
        _localMs: localMs,
        _sleepSessionDate: getSleepSessionDate(localMs),
      };
    })
    .filter(Boolean);

  const sessionMap = {};
  for (const row of enriched) {
    const hour = localHour(row._localMs);

    // 夜〜翌午前を主対象とし、日中ノイズを避ける
    const inSleepBand = hour >= 18 || hour < 12;
    if (!inSleepBand) continue;

    const key = row._sleepSessionDate;
    if (!sessionMap[key]) sessionMap[key] = [];
    sessionMap[key].push(row);
  }

  const out = {};

  for (const [sessionDate, rows] of Object.entries(sessionMap)) {
    const onsetRow = estimateSleepOnset(rows);
    if (!onsetRow || onsetRow._localMs == null) {
      out[sessionDate] = {
        onsetLocal: null,
        pre_sleep_hr_120_60_mean: null,
        pre_sleep_hr_120_60_sd: null,
        pre_sleep_hr_60_30_mean: null,
        pre_sleep_hr_60_30_sd: null,
        pre_sleep_hr_30_0_mean: null,
        pre_sleep_hr_30_0_sd: null,
      };
      continue;
    }

    const onsetMs = onsetRow._localMs;

    const w120_60 = statsForWindow(rows, onsetMs - 120 * 60 * 1000, onsetMs - 60 * 60 * 1000);
    const w60_30 = statsForWindow(rows, onsetMs - 60 * 60 * 1000, onsetMs - 30 * 60 * 1000);
    const w30_0 = statsForWindow(rows, onsetMs - 30 * 60 * 1000, onsetMs);

    const d = new Date(onsetMs);
    const onsetLocal = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    out[sessionDate] = {
      onsetLocal,
      pre_sleep_hr_120_60_mean: w120_60.mean,
      pre_sleep_hr_120_60_sd: w120_60.sd,
      pre_sleep_hr_60_30_mean: w60_30.mean,
      pre_sleep_hr_60_30_sd: w60_30.sd,
      pre_sleep_hr_30_0_mean: w30_0.mean,
      pre_sleep_hr_30_0_sd: w30_0.sd,

      // デバッグ・信頼性確認用
      pre_sleep_hr_120_60_n: w120_60.n,
      pre_sleep_hr_60_30_n: w60_30.n,
      pre_sleep_hr_30_0_n: w30_0.n,
    };
  }

  return out;
}