// src/utils/longTermMetrics.js

function isValidNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function safeNum(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round1(v) {
  if (!isValidNumber(v)) return null;
  return Math.round(v * 10) / 10;
}

function avg(arr) {
  const valid = arr.filter(isValidNumber);
  if (valid.length === 0) return null;
  return round1(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function median(arr) {
  const valid = arr.filter(isValidNumber).slice().sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 0) {
    return round1((valid[mid - 1] + valid[mid]) / 2);
  }
  return round1(valid[mid]);
}

function stdDev(arr) {
  const valid = arr.filter(isValidNumber);
  if (valid.length < 2) return null;
  const mean = valid.reduce((sum, v) => sum + v, 0) / valid.length;
  const variance =
    valid.reduce((sum, v) => sum + (v - mean) ** 2, 0) / valid.length;
  return round1(Math.sqrt(variance));
}

function minVal(arr) {
  const valid = arr.filter(isValidNumber);
  if (valid.length === 0) return null;
  return round1(Math.min(...valid));
}

function maxVal(arr) {
  const valid = arr.filter(isValidNumber);
  if (valid.length === 0) return null;
  return round1(Math.max(...valid));
}

function countWhere(arr, predicate) {
  return arr.filter((v, i) => predicate(v, i)).length;
}

function ratioWhere(arr, predicate) {
  const valid = arr.filter((v) => v != null);
  if (valid.length === 0) return null;
  const count = valid.filter((v, i) => predicate(v, i)).length;
  return round1((count / valid.length) * 100);
}

function parseMinutesFromHHMM(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

// 就寝時刻は日付またぎに弱いので、正午未満は翌日側へ寄せる
function normalizeSleepClockMinutes(mins) {
  if (!isValidNumber(mins)) return null;
  return mins < 12 * 60 ? mins + 24 * 60 : mins;
}

function minutesToHHMM(mins) {
  if (!isValidNumber(mins)) return null;
  let v = Math.round(mins) % (24 * 60);
  if (v < 0) v += 24 * 60;
  const hh = String(Math.floor(v / 60)).padStart(2, "0");
  const mm = String(v % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function linearTrend(arr) {
  const points = arr
    .map((y, x) => ({ x, y }))
    .filter((p) => isValidNumber(p.y));

  if (points.length < 2) {
    return { slopePerDay: null, direction: "unknown" };
  }

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) {
    return { slopePerDay: null, direction: "unknown" };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;

  let direction = "flat";
  if (slope > 0.05) direction = "up";
  if (slope < -0.05) direction = "down";

  return {
    slopePerDay: round1(slope),
    direction,
  };
}

function splitHalf(arr) {
  const valid = arr.filter((v) => v != null);
  if (valid.length < 2) {
    return { first: [], second: [] };
  }
  const mid = Math.floor(valid.length / 2);
  return {
    first: valid.slice(0, mid),
    second: valid.slice(mid),
  };
}

function compareFirstSecondHalf(arr) {
  const { first, second } = splitHalf(arr);
  const firstAvg = avg(first);
  const secondAvg = avg(second);
  if (!isValidNumber(firstAvg) || !isValidNumber(secondAvg)) {
    return {
      firstAvg: null,
      secondAvg: null,
      delta: null,
    };
  }
  return {
    firstAvg,
    secondAvg,
    delta: round1(secondAvg - firstAvg),
  };
}

function pickSeries(days, key) {
  return days.map((d) => safeNum(d?.[key]));
}

function pickClockSeries(days, key) {
  return days.map((d) => {
    const raw = d?.[key];
    const mins =
      typeof raw === "string" ? parseMinutesFromHHMM(raw) : safeNum(raw);
    return normalizeSleepClockMinutes(mins);
  });
}

function countConsecutiveHighDays(arr, threshold) {
  let best = 0;
  let current = 0;
  for (const v of arr) {
    if (isValidNumber(v) && v >= threshold) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

function countConsecutiveLowDays(arr, threshold) {
  let best = 0;
  let current = 0;
  for (const v of arr) {
    if (isValidNumber(v) && v <= threshold) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

function countOverlapDays(arrA, predA, arrB, predB) {
  const len = Math.min(arrA.length, arrB.length);
  let count = 0;
  for (let i = 0; i < len; i += 1) {
    if (predA(arrA[i], i) && predB(arrB[i], i)) count += 1;
  }
  return count;
}

function validCount(arr) {
  return arr.filter((v) => v != null).length;
}

function pickWeekendWeekdayClockGap(days, key) {
  const weekday = [];
  const weekend = [];

  for (const d of days) {
    const raw = d?.[key];
    const date = d?._date;
    if (!date) continue;

    const mins =
      typeof raw === "string"
        ? parseMinutesFromHHMM(raw)
        : safeNum(raw);

    const norm = normalizeSleepClockMinutes(mins);
    if (!isValidNumber(norm)) continue;

    const jsDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(jsDate.getTime())) continue;

    const dow = jsDate.getDay();
    if (dow === 0 || dow === 6) weekend.push(norm);
    else weekday.push(norm);
  }

  const weekdayAvg = avg(weekday);
  const weekendAvg = avg(weekend);

  if (!isValidNumber(weekdayAvg) || !isValidNumber(weekendAvg)) return null;
  return round1(Math.abs(weekendAvg - weekdayAvg));
}

/**
 * days の各要素には、少なくとも以下のような日別正規化済み値が入っている想定
 * - sleepHours
 * - deepPercent
 * - remPercent
 * - avgHeartRate
 * - avgHrv
 * - avgStress
 * - sleepStart / sleepEnd （"23:45" 形式を推奨）
 */
export function buildLongTermMetrics(days = []) {
  const sleepHours = pickSeries(days, "sleepHours");
  const deepPercent = pickSeries(days, "deepPercent");
  const remPercent = pickSeries(days, "remPercent");
  const avgHeartRate = pickSeries(days, "avgHeartRate");
  const avgHrv = pickSeries(days, "avgHrv");
  const avgStress = pickSeries(days, "avgStress");

  const sleepStart = pickClockSeries(days, "sleepStart");
  const sleepEnd = pickClockSeries(days, "sleepEnd");

  const sleepTrend = linearTrend(sleepHours);
  const hrTrend = linearTrend(avgHeartRate);
  const hrvTrend = linearTrend(avgHrv);
  const stressTrend = linearTrend(avgStress);

  const sleepHalf = compareFirstSecondHalf(sleepHours);
  const hrHalf = compareFirstSecondHalf(avgHeartRate);
  const hrvHalf = compareFirstSecondHalf(avgHrv);
  const stressHalf = compareFirstSecondHalf(avgStress);

  const shortSleepDays = countWhere(sleepHours, (v) => isValidNumber(v) && v < 7);
  const veryShortSleepDays = countWhere(sleepHours, (v) => isValidNumber(v) && v < 6);
  const longSleepDays = countWhere(sleepHours, (v) => isValidNumber(v) && v > 9);
  const highStressDays = countWhere(avgStress, (v) => isValidNumber(v) && v >= 70);
  const lowHrvDays = countWhere(avgHrv, (v) => isValidNumber(v) && v <= 30);

  const shortSleepRatio = ratioWhere(sleepHours, (v) => isValidNumber(v) && v < 7);
  const veryShortSleepRatio = ratioWhere(sleepHours, (v) => isValidNumber(v) && v < 6);

  const shortSleepAndHighStressDays = countOverlapDays(
    sleepHours,
    (v) => isValidNumber(v) && v < 7,
    avgStress,
    (v) => isValidNumber(v) && v >= 70
  );

  const hrUpAndHrvDownDays = countOverlapDays(
    avgHeartRate,
    (v) => isValidNumber(v) && isValidNumber(avg(avgHeartRate)) && v > avg(avgHeartRate),
    avgHrv,
    (v) => isValidNumber(v) && isValidNumber(avg(avgHrv)) && v < avg(avgHrv)
  );

  const sleepStartSdMinutes = stdDev(sleepStart);
  const sleepEndSdMinutes = stdDev(sleepEnd);
  const sleepHoursSd = stdDev(sleepHours);

  const socialJetlagMinutes = pickWeekendWeekdayClockGap(days, "sleepStart");

  return {
    observedDays: days.length,

    validDays: {
      sleepHours: validCount(sleepHours),
      deepPercent: validCount(deepPercent),
      remPercent: validCount(remPercent),
      avgHeartRate: validCount(avgHeartRate),
      avgHrv: validCount(avgHrv),
      avgStress: validCount(avgStress),
      sleepStart: validCount(sleepStart),
      sleepEnd: validCount(sleepEnd),
    },

    sleep: {
      mean: avg(sleepHours),
      median: median(sleepHours),
      min: minVal(sleepHours),
      max: maxVal(sleepHours),
      sd: sleepHoursSd,
      sleepHoursSd,
      shortSleepDays,
      veryShortSleepDays,
      longSleepDays,
      shortSleepRatio,
      veryShortSleepRatio,
      trend: sleepTrend,
      halfCompare: sleepHalf,
    },

    regularity: {
      sleepStartSdMinutes,
      sleepEndSdMinutes,
      sleepHoursSd,
      sleepStartMean: minutesToHHMM(avg(sleepStart)),
      sleepEndMean: minutesToHHMM(avg(sleepEnd)),
      socialJetlagMinutes,
    },

    sleepStage: {
      deepPercentMean: avg(deepPercent),
      deepPercentSd: stdDev(deepPercent),
      remPercentMean: avg(remPercent),
      remPercentSd: stdDev(remPercent),
    },

    recovery: {
      avgHeartRateMean: avg(avgHeartRate),
      avgHeartRateSd: stdDev(avgHeartRate),
      avgHeartRateTrend: hrTrend,
      avgHeartRateHalfCompare: hrHalf,

      avgHrvMean: avg(avgHrv),
      avgHrvSd: stdDev(avgHrv),
      avgHrvTrend: hrvTrend,
      avgHrvHalfCompare: hrvHalf,
      lowHrvDays,
      longestLowHrvStreak: countConsecutiveLowDays(avgHrv, 30),
      hrUpAndHrvDownDays,
    },

    stress: {
      avgStressMean: avg(avgStress),
      avgStressSd: stdDev(avgStress),
      avgStressTrend: stressTrend,
      avgStressHalfCompare: stressHalf,
      highStressDays,
      longestHighStressStreak: countConsecutiveHighDays(avgStress, 70),
      shortSleepAndHighStressDays,
    },

        health: {
  healthScoreMean: avg(pickSeries(days, "health_score")),
  healthScoreSd: stdDev(pickSeries(days, "health_score")),
  healthScoreTrend: linearTrend(pickSeries(days, "health_score")),
  healthScoreHalfCompare: compareFirstSecondHalf(pickSeries(days, "health_score")),

  healthHrMean: avg(pickSeries(days, "health_hr")),
  healthHrSd: stdDev(pickSeries(days, "health_hr")),
  healthHrTrend: linearTrend(pickSeries(days, "health_hr")),

  healthHrvMean: avg(pickSeries(days, "health_hrv")),
  healthHrvSd: stdDev(pickSeries(days, "health_hrv")),
  healthHrvTrend: linearTrend(pickSeries(days, "health_hrv")),

  healthSpo2Mean: avg(pickSeries(days, "health_spo2")),
  healthSpo2MinMean: avg(pickSeries(days, "health_spo2_min")),
  healthSpo2Trend: linearTrend(pickSeries(days, "health_spo2")),

  healthTempMean: avg(pickSeries(days, "health_temperature")),
  healthTempSd: stdDev(pickSeries(days, "health_temperature")),
  healthTempTrend: linearTrend(pickSeries(days, "health_temperature")),

  highStressDays: countWhere(
    pickSeries(days, "health_stress"),
    (v) => isValidNumber(v) && v >= 70
  ),
  healthStressMean: avg(pickSeries(days, "health_stress")),
  healthStressSd: stdDev(pickSeries(days, "health_stress")),
  healthStressTrend: linearTrend(pickSeries(days, "health_stress")),
  healthStressHalfCompare: compareFirstSecondHalf(pickSeries(days, "health_stress")),
},

activity: {
  activityScoreMean: avg(pickSeries(days, "activity_score")),
  activityScoreSd: stdDev(pickSeries(days, "activity_score")),
  activityScoreTrend: linearTrend(pickSeries(days, "activity_score")),
  activityScoreHalfCompare: compareFirstSecondHalf(pickSeries(days, "activity_score")),

  activityStepsMean: avg(pickSeries(days, "activity_steps")),
  activityStepsMedian: median(pickSeries(days, "activity_steps")),
  activityStepsSd: stdDev(pickSeries(days, "activity_steps")),
  activityStepsTrend: linearTrend(pickSeries(days, "activity_steps")),

  activityCaloriesMean: avg(pickSeries(days, "activity_calories")),
  activityCaloriesSd: stdDev(pickSeries(days, "activity_calories")),
  activityCaloriesTrend: linearTrend(pickSeries(days, "activity_calories")),

  activityReeCaloriesMean: avg(pickSeries(days, "activity_ree_calories")),
  activityReeCaloriesSd: stdDev(pickSeries(days, "activity_ree_calories")),
  activityReeCaloriesTrend: linearTrend(pickSeries(days, "activity_ree_calories")),

  qolScoreMean: avg(pickSeries(days, "qol_score")),
  qolScoreSd: stdDev(pickSeries(days, "qol_score")),
  qolScoreTrend: linearTrend(pickSeries(days, "qol_score")),
  qolScoreHalfCompare: compareFirstSecondHalf(pickSeries(days, "qol_score")),

  lowStepDays: countWhere(
    pickSeries(days, "activity_steps"),
    (v) => isValidNumber(v) && v < 4000
  ),
  highStepDays: countWhere(
    pickSeries(days, "activity_steps"),
    (v) => isValidNumber(v) && v >= 8000
  ),
},
}}