function safeNum(v) {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return n;
  }
  return null;
}

function avg(arr) {
  const valid = arr.filter((v) => v != null);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function stdDev(arr) {
  const valid = arr.filter((v) => v != null);
  if (valid.length < 2) return null;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance =
    valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

function minutesFromHHMM(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function normalizeBedtimeMinutes(mins) {
  if (mins == null) return null;
  if (mins < 360) return mins + 1440;
  return mins;
}

function hhmmFromMinutes(mins) {
  if (mins == null) return null;
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function detectTrend(values) {
  const pts = values
    .map((v, i) => (v != null ? { x: i, y: v } : null))
    .filter(Boolean);

  if (pts.length < 3) {
    return { slope: null, direction: "unknown" };
  }

  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sx2 = pts.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sx2 - sx * sx;
  if (denom === 0) {
    return { slope: 0, direction: "stable" };
  }

  const slope = (n * sxy - sx * sy) / denom;

  let direction = "stable";
  if (slope > 2) direction = "improving";
  if (slope < -2) direction = "declining";

  return {
    slope: Math.round(slope * 100) / 100,
    direction,
  };
}

function buildInsights(stats) {
  const findings = [];

  if (stats.avgSleepHours != null) {
    if (stats.avgSleepHours < 6) {
      findings.push({
        tier: "primary",
        type: "concern",
        text: `平均睡眠時間は ${stats.avgSleepHours}時間で、かなり短い傾向です。`,
      });
    } else if (stats.avgSleepHours < 7) {
      findings.push({
        tier: "primary",
        type: "concern",
        text: `平均睡眠時間は ${stats.avgSleepHours}時間で、7時間をやや下回っています。`,
      });
    } else {
      findings.push({
        tier: "primary",
        type: "good",
        text: `平均睡眠時間は ${stats.avgSleepHours}時間で、一定の確保ができています。`,
      });
    }
  }

  if (stats.avgEfficiency != null) {
    if (stats.avgEfficiency >= 85) {
      findings.push({
        tier: "primary",
        type: "good",
        text: `平均睡眠効率は ${stats.avgEfficiency}% で、比較的良好です。`,
      });
    } else if (stats.avgEfficiency >= 80) {
      findings.push({
        tier: "primary",
        type: "neutral",
        text: `平均睡眠効率は ${stats.avgEfficiency}% で、境界域です。`,
      });
    } else {
      findings.push({
        tier: "primary",
        type: "concern",
        text: `平均睡眠効率は ${stats.avgEfficiency}% で、やや低めです。`,
      });
    }
  }

  if (stats.sdBedtimeMinutes != null) {
    if (stats.sdBedtimeMinutes > 60) {
      findings.push({
        tier: "primary",
        type: "concern",
        text: `就寝時刻のばらつきが大きいです（SD ${stats.sdBedtimeMinutes}分）。`,
      });
    } else if (stats.sdBedtimeMinutes <= 30 && stats.avgBedtime != null) {
      findings.push({
        tier: "primary",
        type: "good",
        text: `就寝時刻は比較的安定しています（平均 ${stats.avgBedtime}）。`,
      });
    }
  }

  if (stats.sdWakeTimeMinutes != null) {
    if (stats.sdWakeTimeMinutes > 45) {
      findings.push({
        tier: "primary",
        type: "concern",
        text: `起床時刻のばらつきがやや大きいです（SD ${stats.sdWakeTimeMinutes}分）。`,
      });
    }
  }

  if (stats.avgAwakeTime != null && stats.avgAwakeTime > 30) {
    findings.push({
      tier: "primary",
      type: "concern",
      text: `平均覚醒時間は ${stats.avgAwakeTime}分で、長めです。`,
    });
  }

  if (stats.avgLatency != null && stats.avgLatency > 20) {
    findings.push({
      tier: "primary",
      type: "concern",
      text: `平均入眠潜時は ${stats.avgLatency}分で、寝つきに時間がかかる傾向があります。`,
    });
  }

  if (stats.sleepTrend?.direction === "improving") {
    findings.push({
      tier: "primary",
      type: "good",
      text: "睡眠時間は期間内で改善傾向です。",
    });
  } else if (stats.sleepTrend?.direction === "declining") {
    findings.push({
      tier: "primary",
      type: "concern",
      text: "睡眠時間は期間内で減少傾向です。",
    });
  }

  if (stats.debtAvg != null) {
    if (stats.debtAvg > 60) {
      findings.push({
        tier: "primary",
        type: "concern",
        text: `平均睡眠負債は ${stats.debtAvg}分で、蓄積傾向があります。`,
      });
    } else if (stats.debtAvg <= 30) {
      findings.push({
        tier: "primary",
        type: "good",
        text: "睡眠負債は比較的小さい状態です。",
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      tier: "primary",
      type: "neutral",
      text: "主要睡眠指標に大きな偏りは見られませんでした。",
    });
  }

  return findings;
}

export function analyzeSleepCore(rows = [], days = 7) {
  const slice = rows.slice(-days);
  if (slice.length === 0) return null;

  const sleepMinutes = slice.map((r) => safeNum(r.total_sleep_minutes));
  const sleepHours = slice.map((r) => safeNum(r.totalSleepHours ?? r.sleep_hours));
  const efficiency = slice.map((r) => safeNum(r.efficiency));
  const awake = slice.map((r) => safeNum(r.awakeTime ?? r.awake_time_minutes));
  const latency = slice.map((r) => safeNum(r.sleep_latency ?? r.sleep_latency_minutes ?? r.sleepLatency));
  const debt = slice.map((r) => safeNum(r.sleep_debt));

  const bedtimeMinutes = slice.map((r) =>
    normalizeBedtimeMinutes(minutesFromHHMM(r.bedtime))
  );
  const wakeMinutes = slice.map((r) =>
    minutesFromHHMM(r.wakeTime ?? r.wake_time)
  );

  const stats = {
    days: slice.length,
    avgSleepMinutes: avg(sleepMinutes),
    avgSleepHours: avg(sleepHours),
    avgEfficiency: avg(efficiency),
    avgAwakeTime: avg(awake),
    avgLatency: avg(latency),
    debtAvg: avg(debt),

    sdSleepMinutes: stdDev(sleepMinutes),
    sdSleepHours: stdDev(sleepHours),
    sdBedtimeMinutes: stdDev(bedtimeMinutes),
    sdWakeTimeMinutes: stdDev(wakeMinutes),

    avgBedtime: hhmmFromMinutes(avg(bedtimeMinutes)),
    avgWakeTime: hhmmFromMinutes(avg(wakeMinutes)),

    sleepTrend: detectTrend(sleepMinutes),
    efficiencyTrend: detectTrend(efficiency),
  };

  const findings = buildInsights(stats);

  return {
    stats,
    findings,
  };
}