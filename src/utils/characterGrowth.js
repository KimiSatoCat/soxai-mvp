/**
 * characterGrowth.js
 * ─────────────────────────────────────────────────────────
 * 育成キャラ用の成長計算ロジック
 * App.jsx / CharacterPet.jsx から利用される共通モジュール
 *
 * 仕様
 * ・データ最古日を起点として育成を開始する
 * ・初回のみキャラ系統をランダム決定する
 * ・一度決まったキャラ系統は Lv.100 到達まで固定する
 * ・Lv.100 到達後、新しいデータが入った場合のみ別系統へ切り替える
 * ・新キャラの起点日は、前キャラの lastSyncDate より後の最初の日とする
 * ・行の日付は _date / date / _time / time のいずれからでも解釈する
 * ─────────────────────────────────────────────────────────
 */

import { loadCharacterState } from "./characterStorage.js";

export const XP_PER_LEVEL = 25;
export const MAX_LEVEL = 100;
export const SPECIES_COUNT = 7;

export const WEATHER_EFFECTS = {
  storm:   { id: "storm",   label: "嵐",   icon: "⛈️", desc: "体調が大きく悪化" },
  wind:    { id: "wind",    label: "強風", icon: "💨", desc: "やや悪化傾向" },
  calm:    { id: "calm",    label: "穏やか", icon: "🍃", desc: "安定" },
  sunny:   { id: "sunny",   label: "晴れ", icon: "☀️", desc: "改善傾向" },
  rainbow: { id: "rainbow", label: "虹",   icon: "🌈", desc: "大幅改善！" },
};

function safeNum(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calcStageIndex(level) {
  if (level < 25) return 0;
  if (level < 50) return 1;
  if (level < 70) return 2;
  return 3;
}

function pickScoreAverage(row) {
  if (!row || typeof row !== "object") return null;

  const sleep = safeNum(row.sleep_score);
  const health = safeNum(row.health_score);
  const activity = safeNum(row.activity_score);

  const vals = [sleep, health, activity].filter((v) => v != null);
  if (vals.length === 0) return null;

  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pickRandomSpeciesIndex(excludeIndex = null) {
  if (SPECIES_COUNT <= 1) return 0;

  let idx = randomInt(SPECIES_COUNT);

  if (excludeIndex == null) return idx;

  let guard = 0;
  while (idx === excludeIndex && guard < 100) {
    idx = randomInt(SPECIES_COUNT);
    guard += 1;
  }

  return idx;
}

function buildEmptyGrowthState() {
  return {
    speciesIndex: 0,
    originDate: null,
    totalXP: 0,
    level: 1,
    stageIndex: 0,
    xpInLevel: 0,
    xpForNext: XP_PER_LEVEL,
    isMax: false,
    latestDate: null,
    lastSyncDate: null,
    dayCount: 0,
    evolvedStages: [0],
  };
}

function extractDateStringFromRow(row) {
  if (!row || typeof row !== "object") return null;

  const candidates = [row._date, row.date, row._time, row.time];

  for (const value of candidates) {
    if (value == null) continue;

    const s = String(value).trim();
    if (!s) continue;

    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];

    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${y}-${mo}-${da}`;
    }
  }

  return null;
}

function normalizeRowsWithDate(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const byDate = new Map();

  for (const row of safeRows) {
    if (!row || typeof row !== "object") continue;

    const dateStr = extractDateStringFromRow(row);
    if (!dateStr) continue;

    byDate.set(dateStr, {
      ...row,
      _date: dateStr,
    });
  }

  return Array.from(byDate.values()).sort((a, b) =>
    String(a._date).localeCompare(String(b._date))
  );
}

function calculateXpFromRows(rows) {
  let totalXP = 0;

  for (const row of rows) {
    let dailyXP = 0;

    dailyXP += 10;

    const avg = pickScoreAverage(row);
    if (avg != null) {
      if (avg >= 85) dailyXP += 8;
      else if (avg >= 70) dailyXP += 5;
      else if (avg >= 55) dailyXP += 3;
      else if (avg >= 40) dailyXP += 1;
    }

    dailyXP = clamp(dailyXP, 0, 18);
    totalXP += dailyXP;
  }

  return totalXP;
}

function buildGrowthStateFromRows({ speciesIndex, originDate, cycleRows, latestDate }) {
  const safeCycleRows = Array.isArray(cycleRows) ? cycleRows : [];
  const totalXP = calculateXpFromRows(safeCycleRows);
  const rawLevel = 1 + Math.floor(totalXP / XP_PER_LEVEL);
  const level = clamp(rawLevel, 1, MAX_LEVEL);
  const isMax = level >= MAX_LEVEL;
  const xpInLevel = isMax ? XP_PER_LEVEL : totalXP % XP_PER_LEVEL;
  const xpForNext = isMax ? 0 : XP_PER_LEVEL - xpInLevel;
  const stageIndex = calcStageIndex(level);

  const evolvedStages = [];
  for (let i = 0; i <= stageIndex; i += 1) {
    evolvedStages.push(i);
  }

  return {
    speciesIndex: clamp(safeNum(speciesIndex) ?? 0, 0, SPECIES_COUNT - 1),
    originDate: originDate ?? null,
    totalXP,
    level,
    stageIndex,
    xpInLevel,
    xpForNext,
    isMax,
    latestDate: latestDate ?? null,
    lastSyncDate: latestDate ?? null,
    dayCount: safeCycleRows.length,
    evolvedStages,
  };
}

/**
 * rows: buildNormalizedDaily(...).normalizedDaily を想定
 */
export function computeGrowthState(rows = []) {
  const datedRows = normalizeRowsWithDate(rows);

  if (datedRows.length === 0) {
    return buildEmptyGrowthState();
  }

  const saved = loadCharacterState();
  const latestDate = datedRows[datedRows.length - 1]._date;
  const oldestDate = datedRows[0]._date;

  if (!saved) {
    const initialSpeciesIndex = pickRandomSpeciesIndex();

    return buildGrowthStateFromRows({
      speciesIndex: initialSpeciesIndex,
      originDate: oldestDate,
      cycleRows: datedRows,
      latestDate,
    });
  }

  const savedSpeciesIndex = clamp(
    safeNum(saved.speciesIndex) ?? 0,
    0,
    SPECIES_COUNT - 1
  );

  const savedOriginDate =
    typeof saved.originDate === "string" && saved.originDate
      ? saved.originDate
      : oldestDate;

  const savedLastSyncDate =
    typeof saved.lastSyncDate === "string" && saved.lastSyncDate
      ? saved.lastSyncDate
      : savedOriginDate;

  const savedLevel = clamp(safeNum(saved.level) ?? 1, 1, MAX_LEVEL);
  const savedIsMax = savedLevel >= MAX_LEVEL;

  if (!savedIsMax) {
    const cycleRows = datedRows.filter(
      (r) => String(r._date) >= String(savedOriginDate)
    );

    return buildGrowthStateFromRows({
      speciesIndex: savedSpeciesIndex,
      originDate: savedOriginDate,
      cycleRows,
      latestDate,
    });
  }

  const hasNewerData =
    latestDate != null &&
    savedLastSyncDate != null &&
    String(latestDate) > String(savedLastSyncDate);

  if (!hasNewerData) {
    const cycleRows = datedRows.filter(
      (r) => String(r._date) >= String(savedOriginDate)
    );

    return {
      speciesIndex: savedSpeciesIndex,
      originDate: savedOriginDate,
      totalXP: safeNum(saved.totalXP) ?? ((MAX_LEVEL - 1) * XP_PER_LEVEL),
      level: MAX_LEVEL,
      stageIndex: calcStageIndex(MAX_LEVEL),
      xpInLevel: XP_PER_LEVEL,
      xpForNext: 0,
      isMax: true,
      latestDate,
      lastSyncDate: savedLastSyncDate,
      dayCount: cycleRows.length,
      evolvedStages: [0, 1, 2, 3],
    };
  }

  const nextOriginRow = datedRows.find(
    (r) => String(r._date) > String(savedLastSyncDate)
  );

  const nextOriginDate = nextOriginRow?._date ?? latestDate;
  const nextSpeciesIndex = pickRandomSpeciesIndex(savedSpeciesIndex);

  const nextCycleRows = datedRows.filter(
    (r) => String(r._date) >= String(nextOriginDate)
  );

  return buildGrowthStateFromRows({
    speciesIndex: nextSpeciesIndex,
    originDate: nextOriginDate,
    cycleRows: nextCycleRows,
    latestDate,
  });
}

/**
 * 最新日の3スコア平均と前日平均との差から天候演出を決定
 */
export function getLatestWeather(rows = []) {
  const datedRows = normalizeRowsWithDate(rows);

  if (datedRows.length < 2) return "calm";

  const latest = datedRows[datedRows.length - 1];
  const previous = datedRows[datedRows.length - 2];

  const latestAvg = pickScoreAverage(latest);
  const previousAvg = pickScoreAverage(previous);

  if (latestAvg == null || previousAvg == null) return "calm";

  const diff = latestAvg - previousAvg;

  if (diff <= -15) return "storm";
  if (diff <= -5) return "wind";
  if (diff >= 15) return "rainbow";
  if (diff >= 5) return "sunny";
  return "calm";
}