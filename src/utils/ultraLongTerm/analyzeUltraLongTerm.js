function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function safeNum(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round1(v) {
  return isNum(v) ? Math.round(v * 10) / 10 : null;
}

function round2(v) {
  return isNum(v) ? Math.round(v * 100) / 100 : null;
}

function avg(arr) {
  const xs = arr.filter(isNum);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(arr) {
  const xs = arr.filter(isNum);
  if (xs.length < 2) return null;
  const m = avg(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

function median(arr) {
  const xs = arr.filter(isNum).slice().sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

function formatDateLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

function diffDays(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db - da) / 86400000);
}

function getDateLabel(row) {
  return (
    row?._date ||
    row?.date ||
    row?.day ||
    row?.target_date ||
    row?.measured_at ||
    row?._time?.slice?.(0, 10) ||
    null
  );
}

function sortRows(rows = []) {
  return [...rows]
    .filter((r) => getDateLabel(r))
    .sort((a, b) => {
      const da = new Date(getDateLabel(a));
      const db = new Date(getDateLabel(b));
      return da - db;
    });
}

function pickMetric(row, keys = []) {
  for (const k of keys) {
    const v = safeNum(row?.[k]);
    if (v != null) return v;
  }
  return null;
}

function pickMetricNullZero(row, keys = []) {
  for (const k of keys) {
    const v = safeNum(row?.[k]);
    if (v == null) continue;
    if (v === 0) continue;
    return v;
  }
  return null;
}

function pickTimeMetricNullZero(row, keys = []) {
  for (const k of keys) {
    const v = row?.[k];
    const mins = hhmmToMinutes(v);
    if (mins != null) {
      if (mins === 0) continue;
      return mins;
    }
    const n = safeNum(v);
    if (n != null) {
      if (n === 0) continue;
      return n;
    }
  }
  return null;
}

function hhmmToMinutes(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function pickTimeMetric(row, keys = []) {
  for (const k of keys) {
    const v = row?.[k];
    const mins = hhmmToMinutes(v);
    if (mins != null) return mins;
    const n = safeNum(v);
    if (n != null) return n;
  }
  return null;
}

function rollingMean(values, windowSize = 21) {
  const out = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length - 1, i + half);
    const seg = [];
    for (let j = start; j <= end; j++) {
      if (isNum(values[j])) seg.push(values[j]);
    }
    out.push(seg.length ? avg(seg) : null);
  }
  return out;
}

function rollingMedian(values, windowSize = 21) {
  const out = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length - 1, i + half);
    const seg = [];
    for (let j = start; j <= end; j++) {
      if (isNum(values[j])) seg.push(values[j]);
    }
    out.push(seg.length ? median(seg) : null);
  }
  return out;
}

function normalize(values = []) {
  const xs = values.filter(isNum);
  const m = avg(xs);
  const s = std(xs);
  if (!isNum(m) || !isNum(s) || s === 0) {
    return values.map((v) => (isNum(v) ? 0 : null));
  }
  return values.map((v) => (isNum(v) ? (v - m) / s : null));
}

function autocorrAtLag(values, lag) {
  if (!Number.isInteger(lag) || lag < 2) return null;
  const xs = normalize(values);
  const a = [];
  const b = [];
  for (let i = lag; i < xs.length; i++) {
    if (isNum(xs[i]) && isNum(xs[i - lag])) {
      a.push(xs[i]);
      b.push(xs[i - lag]);
    }
  }
  if (a.length < Math.max(10, lag)) return null;
  const ma = avg(a);
  const mb = avg(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

function estimateRiskWindow(dateLabels, values, dominantPeriod, lowerIsWorse = true) {
  if (!dominantPeriod || !dateLabels.length) {
    return { start: null, end: null, center: null };
  }

  const xs = values
    .map((v, i) => ({ i, v, d: dateLabels[i] }))
    .filter((x) => isNum(x.v) && x.d);

  if (xs.length < 14) {
    return { start: null, end: null, center: null };
  }

  const recent = xs.slice(-Math.min(xs.length, Math.max(14, Math.round(dominantPeriod * 2))));
  const best = lowerIsWorse
    ? recent.reduce((min, cur) => (cur.v < min.v ? cur : min), recent[0])
    : recent.reduce((max, cur) => (cur.v > max.v ? cur : max), recent[0]);

  const lastDate = xs[xs.length - 1].d;
  const gap = diffDays(best.d, lastDate);
  if (gap == null) return { start: null, end: null, center: null };

  let nextCenterOffset = dominantPeriod - (gap % dominantPeriod);
  if (nextCenterOffset < 1) nextCenterOffset += dominantPeriod;

  const center = addDays(lastDate, Math.round(nextCenterOffset));
  const start = addDays(center, -1);
  const end = addDays(center, 1);

  return { start, end, center };
}

function computeStability(values, lag) {
  if (!lag || values.length < lag * 2) return null;
  const chunk = Math.max(14, Math.round(lag * 2));
  const scores = [];
  for (let i = 0; i + chunk <= values.length; i += Math.max(3, Math.floor(lag / 2))) {
    const sub = values.slice(i, i + chunk);
    const c = autocorrAtLag(sub, Math.round(lag));
    if (isNum(c)) scores.push(c);
  }
  if (!scores.length) return null;
  const m = avg(scores);
  const s = std(scores) ?? 0;
  return clamp((m + 1) / 2 - s * 0.15, 0, 1);
}

function fitCosinor(values, period) {
  if (!period || !Array.isArray(values) || values.length < 3) return null;

  const omega = (2 * Math.PI) / period;
  let sum1 = 0;
  let sumCos = 0;
  let sumSin = 0;
  let sumCosCos = 0;
  let sumSinSin = 0;
  let sumCosSin = 0;
  let sumYCos = 0;
  let sumYSin = 0;
  let sumY = 0;
  let n = 0;

  for (let i = 0; i < values.length; i++) {
    const y = values[i];
    if (!isNum(y)) continue;
    const c = Math.cos(omega * i);
    const s = Math.sin(omega * i);

    sum1 += 1;
    sumCos += c;
    sumSin += s;
    sumCosCos += c * c;
    sumSinSin += s * s;
    sumCosSin += c * s;
    sumYCos += y * c;
    sumYSin += y * s;
    sumY += y;
    n += 1;
  }

  if (n < 10) return null;

  const A = [
    [sum1, sumCos, sumSin],
    [sumCos, sumCosCos, sumCosSin],
    [sumSin, sumCosSin, sumSinSin],
  ];
  const B = [sumY, sumYCos, sumYSin];

  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const detA = det3(A);
  if (!isNum(detA) || Math.abs(detA) < 1e-10) return null;

  const replaceCol = (m, col, vec) =>
    m.map((row, r) => row.map((v, c) => (c === col ? vec[r] : v)));

  const meanLevel = det3(replaceCol(A, 0, B)) / detA;
  const betaCos = det3(replaceCol(A, 1, B)) / detA;
  const betaSin = det3(replaceCol(A, 2, B)) / detA;

  return {
    meanLevel,
    betaCos,
    betaSin,
    amplitude: Math.sqrt(betaCos ** 2 + betaSin ** 2),
  };
}

function buildFittedSeries(dateLabels, values, dominantPeriod) {
  const smoothed = rollingMedian(values, 21);
  const fit = fitCosinor(values, dominantPeriod);

  return dateLabels.map((d, i) => {
    let fitted = null;

    if (fit && dominantPeriod != null) {
      const omega = (2 * Math.PI) / dominantPeriod;
      fitted =
        fit.meanLevel +
        fit.betaCos * Math.cos(omega * i) +
        fit.betaSin * Math.sin(omega * i);
      fitted = round1(fitted);
    }

    const raw = isNum(values[i]) ? round1(values[i]) : null;
    const smooth = isNum(smoothed[i]) ? round1(smoothed[i]) : null;
    const residual =
      isNum(raw) && isNum(smooth) ? round1(raw - smooth) : null;

    return {
      idx: i,
      date: d,
      label: d ? `${parseInt(d.split("-")[1], 10)}/${parseInt(d.split("-")[2], 10)}` : `#${i + 1}`,
      raw,
      smooth,
      fitted,
      residual,
    };
  });
}

function detectPeriods(dateLabels, values) {
  const n = values.filter(isNum).length;
  if (n < 28) {
    return {
      dominantPeriod: null,
      secondaryPeriod: null,
      dominantScore: null,
      secondaryScore: null,
      confidence: 0,
      stability: null,
      phase: null,
      amplitude: null,
      baseline: avg(values),
      candidates: [],
    };
  }

  const candidatePeriods = [5, 6, 7, 8, 9, 10, 12, 14, 21, 28, 30, 35, 42, 56, 70, 84, 90, 120, 180];
  const scored = candidatePeriods
    .map((p) => ({ period: p, score: autocorrAtLag(values, p) }))
    .filter((x) => isNum(x.score))
    .sort((a, b) => b.score - a.score);

  const dominant = scored[0] || null;
  const secondary = scored.find((x) => dominant && Math.abs(x.period - dominant.period) >= 5) || null;

  const baseline = avg(values);
  const amplitude = (() => {
    const residual = values
      .map((v) => (isNum(v) && isNum(baseline) ? Math.abs(v - baseline) : null))
      .filter(isNum);
    return residual.length ? avg(residual) : null;
  })();

  const phase = (() => {
    if (!dominant) return null;
    const p = dominant.period;
    const xs = values.map((v, i) => ({ v, i })).filter((x) => isNum(x.v));
    if (!xs.length) return null;
    const bottom = xs.reduce((min, cur) => (cur.v < min.v ? cur : min), xs[0]);
    return round1(bottom.i % p);
  })();

  const stability = dominant ? computeStability(values, dominant.period) : null;
  const dataCoverage = clamp(n / values.length, 0, 1);
  const confidence = dominant
    ? Math.round(
        clamp(
          ((dominant.score + 1) / 2) * 45 +
            (secondary ? ((secondary.score + 1) / 2) * 10 : 0) +
            (stability ?? 0) * 30 +
            dataCoverage * 15,
          0,
          100
        )
      )
    : 0;

  return {
    dominantPeriod: dominant ? dominant.period : null,
    secondaryPeriod: secondary ? secondary.period : null,
    dominantScore: dominant ? round2(dominant.score) : null,
    secondaryScore: secondary ? round2(secondary.score) : null,
    confidence,
    stability: stability != null ? round2(stability) : null,
    phase,
    amplitude: round2(amplitude),
    baseline: round2(baseline),
    candidates: scored.slice(0, 6),
  };
}

function buildSummaryText(metric) {
  if (!metric) {
    return "十分なデータがありません。";
  }

  if (!metric.dominantPeriod || metric.confidence < 35) {
    return "明確な主周期はまだ安定して検出されていません。データ蓄積とともに精度向上が見込まれます。";
  }

  const parts = [];
  parts.push(`約${metric.dominantPeriod}日の主周期が検出されています。`);
  if (metric.secondaryPeriod) {
    parts.push(`副周期は約${metric.secondaryPeriod}日です。`);
  }

  if (metric.stability != null) {
    if (metric.stability >= 0.75) {
      parts.push("周期の再現性は高めです。");
    } else if (metric.stability >= 0.5) {
      parts.push("周期の再現性は中等度です。");
    } else {
      parts.push("周期の再現性はやや不安定です。");
    }
  }

  if (metric.riskWindowStart && metric.riskWindowEnd) {
    parts.push(`次の低調相は ${metric.riskWindowStart}〜${metric.riskWindowEnd} 頃が警戒窓です。`);
  }

  return parts.join("");
}

function buildMetricCard(dateLabels, values, label, lowerIsWorse = true) {
  const analysis = detectPeriods(dateLabels, values);
  const risk = estimateRiskWindow(dateLabels, values, analysis.dominantPeriod, lowerIsWorse);
  const chartSeries = buildFittedSeries(dateLabels, values, analysis.dominantPeriod);

  return {
    key: label,
    label,
    dominantPeriod: analysis.dominantPeriod,
    secondaryPeriod: analysis.secondaryPeriod,
    amplitude: analysis.amplitude,
    phase: analysis.phase,
    stability: analysis.stability,
    confidence: analysis.confidence,
    riskWindowStart: risk.start,
    riskWindowEnd: risk.end,
    baseline: analysis.baseline,
    dominantScore: analysis.dominantScore,
    secondaryScore: analysis.secondaryScore,
    chart: dateLabels.map((d, i) => ({
      date: d,
      value: isNum(values[i]) ? values[i] : null,
      smooth: rollingMean(values, 21)[i],
    })),
    chartSeries,
    modelDisplay:
      "21日中央値平滑化 → 自己相関ベース周期探索 → Cosinor fit → rolling-window stability",
    summary: buildSummaryText({
      dominantPeriod: analysis.dominantPeriod,
      secondaryPeriod: analysis.secondaryPeriod,
      stability: analysis.stability,
      confidence: analysis.confidence,
      riskWindowStart: risk.start,
      riskWindowEnd: risk.end,
    }),
  };
}

function buildFindingText(metric) {
  if (!metric) return "十分なデータがありません。";
  if (!metric.dominantPeriod || metric.confidence < 35) {
    return "この期間では明瞭な周期候補は弱く、現時点では傾向観察を優先すべき状態です。追加観測により精度向上が見込まれます。";
  }

  const parts = [];
  parts.push(`約${metric.dominantPeriod}日の主周期が検出されています。`);
  if (metric.secondaryPeriod) {
    parts.push(`副周期は約${metric.secondaryPeriod}日です。`);
  }
  if (metric.stability != null) {
    if (metric.stability >= 0.75) {
      parts.push("周期の再現性は高めです。");
    } else if (metric.stability >= 0.5) {
      parts.push("周期の再現性は中等度です。");
    } else {
      parts.push("周期の再現性はやや不安定です。");
    }
  }
  if (metric.riskWindowStart && metric.riskWindowEnd) {
    parts.push(`次の低調相は ${metric.riskWindowStart}〜${metric.riskWindowEnd} 頃が警戒窓です。`);
  }
  return parts.join("");
}

function buildAdviceText(metric, type) {
  if (!metric || !metric.dominantPeriod) {
    return "現時点では生活時刻の固定と追加ログの蓄積を優先してください。";
  }

  if (type === "sleep") {
    return "警戒窓の3日前から起床時刻を固定し、夜間の強い光、遅いカフェイン摂取、就寝直前の高負荷作業を避けてください。朝の光曝露と日中活動量の確保が有効です。";
  }
  if (type === "health") {
    return "警戒窓の前後では過密日程を避け、水分、休息、就寝前刺激の低減を優先してください。夜間の長時間作業や連続した睡眠不足は悪化因子になりやすいです。";
  }
  return "警戒窓の前後では歩数目標を極端に上げすぎず、日中の短い散歩を複数回入れてゼロ活動日を防いでください。午前から日中に活動を寄せる方がリズム維持に有利です。";
}

function buildMetricMap(rows) {
  const dateLabels = rows.map((r) => getDateLabel(r));

  return {
    sleep: [
  {
    label: "睡眠時間の周期性",
    values: rows.map((r) =>
      pickMetricNullZero(r, [
        "sleep_total_time_true",
        "sleep_total_time_exclude_awake",
        "sleep_total_time",
        "sleep_total_time_include_latency",
        "sleep_duration",
        "sleep_hours",
        "sleep_total_hours",
        "sleep_time",
      ])
    ),
    lowerIsWorse: true,
  },
  {
    label: "睡眠効率の周期性",
    values: rows.map((r) =>
      pickMetricNullZero(r, [
        "sleep_efficiency",
        "sleep_efficiency_include_latency",
        "sleep_efficiency_percent",
        "sleep_eff",
      ])
    ),
    lowerIsWorse: true,
  },
  {
    label: "睡眠スコアの周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["sleep_score"])),
    lowerIsWorse: true,
  },
  {
    label: "就寝時刻の位相ずれ",
    values: rows.map((r) =>
      pickTimeMetricNullZero(r, [
        "sleep_start_time",
        "sleep_start_time_include_latency",
        "sleep_bedtime",
        "bedtime",
        "sleep_start",
      ])
    ),
    lowerIsWorse: false,
  },
  {
    label: "起床時刻の位相ずれ",
    values: rows.map((r) =>
      pickTimeMetricNullZero(r, [
        "sleep_end_time",
        "sleep_wake_time",
        "wake_time",
        "sleep_end",
      ])
    ),
    lowerIsWorse: false,
  },
  {
    label: "Deep睡眠の周期性",
    values: rows.map((r) =>
      pickMetricNullZero(r, [
        "sleep_deep_time",
        "sleep_deep_sleep_time",
        "sleep_n3_time",
      ])
    ),
    lowerIsWorse: true,
  },
  {
    label: "Light睡眠の周期性",
    values: rows.map((r) =>
      pickMetricNullZero(r, [
        "sleep_light_time",
        "sleep_light_sleep_time",
        "sleep_n1_time",
        "sleep_n2_time",
      ])
    ),
    lowerIsWorse: true,
  },
  {
    label: "REM睡眠の周期性",
    values: rows.map((r) =>
      pickMetricNullZero(r, [
        "sleep_rem_time",
      ])
    ),
    lowerIsWorse: true,
  },
],
    health: [
  {
    label: "体調スコアの周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["health_score"])),
    lowerIsWorse: true,
  },
  {
    label: "心拍の周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["health_hr", "hr", "resting_hr"])),
    lowerIsWorse: false,
  },
  {
    label: "HRVの周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["health_hrv", "hrv"])),
    lowerIsWorse: true,
  },
  {
    label: "ストレスの周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["health_stress", "stress_score", "stress"])),
    lowerIsWorse: false,
  },
  {
    label: "SpO2の周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["health_spo2", "spo2"])),
    lowerIsWorse: true,
  },
  {
  label: "体温の周期性",
  values: rows.map((r) =>
    pickMetricNullZero(r, [
      "health_temperature",
      "health_temp",
      "body_temp",
      "temperature",
    ])
  ),
  lowerIsWorse: false,
},
],
    activity: [
  {
    label: "活動スコアの周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["activity_score"])),
    lowerIsWorse: true,
  },
  {
    label: "歩数の周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["activity_steps", "steps"])),
    lowerIsWorse: true,
  },
  {
    label: "活動カロリーの周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["activity_calories", "active_calories"])),
    lowerIsWorse: true,
  },
  {
    label: "REEの周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["activity_ree_calories", "ree_calories"])),
    lowerIsWorse: true,
  },
  {
    label: "QoLの周期性",
    values: rows.map((r) => pickMetricNullZero(r, ["qol_score", "wellbeing_score", "mood_score"])),
    lowerIsWorse: true,
  },
],
    dateLabels,
  };
  function pickMetricNullZero(row, keys = []) {
  for (const k of keys) {
    const v = safeNum(row?.[k]);
    if (v == null) continue;
    if (v === 0) continue;
    return v;
  }
  return null;
}

function pickTimeMetricNullZero(row, keys = []) {
  for (const k of keys) {
    const v = row?.[k];
    const mins = hhmmToMinutes(v);
    if (mins != null) {
      if (mins === 0) continue;
      return mins;
    }
    const n = safeNum(v);
    if (n != null) {
      if (n === 0) continue;
      return n;
    }
  }
  return null;
}
}

export function analyzeUltraLongTerm(rows = []) {
  const sorted = sortRows(rows);
  const { sleep, health, activity, dateLabels } = buildMetricMap(sorted);

  const convert = (items, type) =>
    items.map((item) => {
      const metric = buildMetricCard(dateLabels, item.values, item.label, item.lowerIsWorse);
      return {
        ...metric,
        finding: buildFindingText(metric),
        advice: buildAdviceText(metric, type),

        // 互換性維持: 旧名と新名の両方を返す
        nextRiskWindowStart: metric.riskWindowStart ?? null,
        nextRiskWindowEnd: metric.riskWindowEnd ?? null,
      };
    });

  const sleepMetrics = convert(sleep, "sleep");
  const healthMetrics = convert(health, "health");
  const activityMetrics = convert(activity, "activity");

  const firstDate = sorted.length > 0 ? getDateLabel(sorted[0]) : null;
  const lastDate = sorted.length > 0 ? getDateLabel(sorted[sorted.length - 1]) : null;

  return {
    sufficient: sorted.length >= 56,
    dataLength: sorted.length,
    reason: sorted.length >= 56 ? null : "超長期分析には56日以上のデータが必要です",
    dateFrom: firstDate,
    dateTo: lastDate,

    // 新構造
    metrics: {
      sleep: Object.fromEntries(
        sleepMetrics.map((m, i) => [m.key || `sleep_${i}`, m])
      ),
      health: Object.fromEntries(
        healthMetrics.map((m, i) => [m.key || `health_${i}`, m])
      ),
      activity: Object.fromEntries(
        activityMetrics.map((m, i) => [m.key || `activity_${i}`, m])
      ),
    },

    // 旧構造も残す
    rows: sorted,
    sleep: sleepMetrics,
    health: healthMetrics,
    activity: activityMetrics,
  };
}