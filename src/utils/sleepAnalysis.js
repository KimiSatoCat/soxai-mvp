import { analyzeSleepCore } from "./sleepCoreAnalysis.js";

function safeNum(v) {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return n;
  }
  return null;
}

function findFieldValue(record, candidates) {
  if (!record) return null;
  for (const c of candidates) {
    if (record[c] != null) return record[c];
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatHHMM(value) {
  if (value == null) return null;

  if (typeof value === "string") {
    const m = value.match(/(\d{1,2}):(\d{2})/);
    if (m) return `${pad2(parseInt(m[1], 10))}:${m[2]}`;
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value < 24) {
      const h = Math.floor(value);
      const mm = Math.round((value - h) * 60);
      return `${pad2(h)}:${pad2(mm)}`;
    }
    if (value >= 0 && value < 1440) {
      const h = Math.floor(value / 60);
      const mm = Math.round(value % 60);
      return `${pad2(h)}:${pad2(mm)}`;
    }
  }

  return String(value);
}

function formatDurationHours(v) {
  const n = safeNum(v);
  if (n == null) return null;

  if (n > 0 && n < 24) return Math.round(n * 10) / 10;
  if (n >= 24 && n < 1440) return Math.round((n / 60) * 10) / 10;
  if (n >= 1440) return Math.round((n / 3600) * 10) / 10;

  return null;
}

function extractSleepHours(row) {
  if (!row) return null;

  const direct = safeNum(row.totalSleepHours ?? row.sleep_hours);
  if (direct != null) return Math.round(direct * 10) / 10;

  const candidates = [
    row.total_sleep_minutes,
    row.total_sleep_time,
    row.total_sleep,
    row.sleep_duration,
    row.sleep_time,
  ];

  for (const c of candidates) {
    const h = formatDurationHours(c);
    if (h != null) return h;
  }

  return null;
}

function extractStageMinutes(row, keys) {
  for (const k of keys) {
    const v = safeNum(row[k]);
    if (v != null) return v;
  }
  return null;
}

function ratio(part, totalHours) {
  const p = safeNum(part);
  const h = safeNum(totalHours);
  if (p == null || h == null || h <= 0) return null;
  const totalMinutes = h * 60;
  if (totalMinutes <= 0) return null;
  return Math.round((p / totalMinutes) * 1000) / 10;
}

export function buildDailySleepCards(rows = []) {
  return rows.map((r) => {
    const totalSleepHours = extractSleepHours(r);

    const deep = extractStageMinutes(r, [
      "deep_sleep_minutes",
      "deep_minutes",
      "sleep_stage_deep_minutes",
      "deep",
    ]);

    const light = extractStageMinutes(r, [
      "light_sleep_minutes",
      "light_minutes",
      "sleep_stage_light_minutes",
      "light",
    ]);

    const rem = extractStageMinutes(r, [
      "rem_sleep_minutes",
      "rem_minutes",
      "sleep_stage_rem_minutes",
      "rem",
    ]);

    const stress = safeNum(
      findFieldValue(r, ["stress_score", "stress", "stress_avg", "stress_level"])
    );

    const steps = safeNum(
      findFieldValue(r, ["activity_steps", "steps", "step", "step_count"])
    );

    const calories = safeNum(
      findFieldValue(r, [
        "activity_calories",
        "activity_calorie",
        "calories",
        "calorie",
        "cal",
        "active_calories",
        "activity_ree_calories",
      ])
    );

    const hrAvg = safeNum(
      findFieldValue(r, [
        "avg_hr",
        "average_hr",
        "hr_avg",
        "heart_rate_avg",
        "sleep_hr",
        "hr",
      ])
    );

    const hrv = safeNum(
      findFieldValue(r, [
        "avg_hrv",
        "average_hrv",
        "hrv_avg",
        "hrv",
        "sleep_hrv",
      ])
    );

    return {
      date: r._date ?? null,
      sleepScore: safeNum(r.sleep_score),
      healthScore: safeNum(r.health_score),
      activityScore: safeNum(r.activity_score),
      qolScore: safeNum(r.qol_score),

      totalSleepHours,
      efficiency: safeNum(r.efficiency),
      bedtime: formatHHMM(r.bedtime),
      wakeTime: formatHHMM(r.wakeTime ?? r.wake_time),
      awakeTime: safeNum(r.awakeTime ?? r.awake_time_minutes),

      stages:
        deep != null || light != null || rem != null
          ? { deep, light, rem }
          : null,

      deepRatio: ratio(deep, totalSleepHours),
      lightRatio: ratio(light, totalSleepHours),
      remRatio: ratio(rem, totalSleepHours),

      hrAvg,
      hrv,
      stress,
      steps,
      calories,
    };
  });
}

function avg(arr) {
  const valid = arr.filter((v) => v != null);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function min(arr) {
  const valid = arr.filter((v) => v != null);
  if (valid.length === 0) return null;
  return Math.min(...valid);
}

function max(arr) {
  const valid = arr.filter((v) => v != null);
  if (valid.length === 0) return null;
  return Math.max(...valid);
}

export function computeWeeklyOverview(cards = []) {
  return {
    avgSleepScore: avg(cards.map((c) => c.sleepScore)),
    avgHealthScore: avg(cards.map((c) => c.healthScore)),
    avgActivityScore: avg(cards.map((c) => c.activityScore)),

    avgSleepHours: avg(cards.map((c) => c.totalSleepHours)),
    minSleepHours: min(cards.map((c) => c.totalSleepHours)),
    maxSleepHours: max(cards.map((c) => c.totalSleepHours)),

    avgEfficiency: avg(cards.map((c) => c.efficiency)),
    avgAwakeTime: avg(cards.map((c) => c.awakeTime)),
    avgHR: avg(cards.map((c) => c.hrAvg)),
    avgHRV: avg(cards.map((c) => c.hrv)),
    avgStress: avg(cards.map((c) => c.stress)),
    avgSteps: avg(cards.map((c) => c.steps)),
    avgDeepRatio: avg(cards.map((c) => c.deepRatio)),
    avgRemRatio: avg(cards.map((c) => c.remRatio)),
  };
}

function makeAdviceFinding({ metric, type, title, text, advice }) {
  return {
    tier: "auxiliary",
    metric,
    type,
    title,
    text,
    advice,
  };
}

function buildSleepDurationFinding(stats) {
  const v = stats.avgSleepHours;
  if (v == null) return null;

  if (v < 6) {
    return makeAdviceFinding({
      metric: "sleepHours",
      type: "concern",
      title: "睡眠時間",
      text: `平均睡眠時間は ${v} 時間で、かなり短めです。慢性的な睡眠不足傾向が疑われます。`,
      advice:
        "まずは起床時刻を一定に保ちつつ、就寝時刻を15〜30分ずつ前倒ししてください。就寝前1〜2時間の強い光、長時間のスマートフォン使用、遅い時間のカフェイン摂取を見直すと改善につながりやすいです。",
    });
  }

  if (v < 7) {
    return makeAdviceFinding({
      metric: "sleepHours",
      type: "concern",
      title: "睡眠時間",
      text: `平均睡眠時間は ${v} 時間で、やや不足気味です。`,
      advice:
        "直近の疲労感や日中の眠気がある場合は、まず30分前後の睡眠延長を優先してください。平日だけでなく休日も大きく寝だめしすぎないことが、長期的な安定に有効です。",
    });
  }

  if (v <= 9) {
    return makeAdviceFinding({
      metric: "sleepHours",
      type: "good",
      title: "睡眠時間",
      text: `平均睡眠時間は ${v} 時間で、おおむね良好な範囲です。`,
      advice:
        "現在の睡眠時間を維持しつつ、就寝・起床時刻のばらつきも併せて小さくすると、睡眠の質がさらに安定しやすくなります。",
    });
  }

  return makeAdviceFinding({
    metric: "sleepHours",
    type: "neutral",
    title: "睡眠時間",
    text: `平均睡眠時間は ${v} 時間で、長めです。`,
    advice:
      "長時間睡眠が続く場合は、疲労の蓄積、生活リズムの乱れ、睡眠の質の低下が隠れていないかも確認してください。日中の強い眠気や倦怠感が続く場合は、他の指標とあわせて慎重に見てください。",
  });
}

function buildEfficiencyFinding(stats) {
  const v = stats.avgEfficiency;
  if (v == null) return null;

  if (v < 80) {
    return makeAdviceFinding({
      metric: "efficiency",
      type: "concern",
      title: "睡眠効率",
      text: `平均睡眠効率は ${v}% で低めです。寝床にいる時間に対して、実際に眠れている割合が低い可能性があります。`,
      advice:
        "眠くないのに早く床に入る習慣や、就寝前の覚醒を強める行動がないか確認してください。中途覚醒が多い場合は、寝室環境、飲酒、遅い時間の食事やカフェインも見直してください。",
    });
  }

  if (v < 85) {
    return makeAdviceFinding({
      metric: "efficiency",
      type: "neutral",
      title: "睡眠効率",
      text: `平均睡眠効率は ${v}% で、やや不安定です。`,
      advice:
        "睡眠時間だけでなく、中途覚醒や入眠までの長さも影響している可能性があります。就寝前ルーティンを固定し、毎日の就床時刻を安定させると改善しやすくなります。",
    });
  }

  return makeAdviceFinding({
    metric: "efficiency",
    type: "good",
    title: "睡眠効率",
    text: `平均睡眠効率は ${v}% で良好です。`,
    advice:
      "現在の睡眠環境と生活リズムは比較的安定している可能性があります。今後は睡眠時間やストレス指標とのバランスも継続的に確認してください。",
  });
}

function buildDeepRatioFinding(stats) {
  const v = stats.avgDeepRatio;
  if (v == null) return null;

  if (v < 10) {
    return makeAdviceFinding({
      metric: "deepRatio",
      type: "concern",
      title: "Deep睡眠割合",
      text: `Deep睡眠割合は平均 ${v}% で低めです。身体的回復の質が十分でない可能性があります。`,
      advice:
        "就寝時刻の不規則さ、睡眠不足、飲酒、就寝前の強い刺激はDeep睡眠を妨げやすいです。まずは十分な睡眠時間の確保と、就寝前のリラックス時間の固定を優先してください。",
    });
  }

  if (v <= 25) {
    return makeAdviceFinding({
      metric: "deepRatio",
      type: "good",
      title: "Deep睡眠割合",
      text: `Deep睡眠割合は平均 ${v}% で、おおむね良好です。`,
      advice:
        "大きな改善よりも、日ごとのばらつきを小さくすることが重要です。日中の活動量や就寝時刻の安定もあわせて確認してください。",
    });
  }

  return makeAdviceFinding({
    metric: "deepRatio",
    type: "neutral",
    title: "Deep睡眠割合",
    text: `Deep睡眠割合は平均 ${v}% です。`,
    advice:
      "単独では良し悪しを断定せず、睡眠時間、睡眠効率、起床時の主観的な回復感とあわせて評価してください。",
  });
}

function buildRemRatioFinding(stats) {
  const v = stats.avgRemRatio;
  if (v == null) return null;

  if (v < 15) {
    return makeAdviceFinding({
      metric: "remRatio",
      type: "concern",
      title: "REM睡眠割合",
      text: `REM睡眠割合は平均 ${v}% で低めです。精神的回復や記憶整理の面で不足している可能性があります。`,
      advice:
        "睡眠時間の不足や後半睡眠の削減はREM睡眠を減らしやすいです。起床時刻を早めすぎず、睡眠時間全体をまず確保してください。",
    });
  }

  if (v <= 30) {
    return makeAdviceFinding({
      metric: "remRatio",
      type: "good",
      title: "REM睡眠割合",
      text: `REM睡眠割合は平均 ${v}% で、おおむね良好です。`,
      advice:
        "睡眠後半までしっかり眠れている可能性があります。今後も休日の過度な寝だめや大きな時差睡眠を避け、安定性を重視してください。",
    });
  }

  return makeAdviceFinding({
    metric: "remRatio",
    type: "neutral",
    title: "REM睡眠割合",
    text: `REM睡眠割合は平均 ${v}% です。`,
    advice:
      "REM割合は単独での解釈が難しいため、睡眠時間、ストレス、起床後の眠気などと併せて判断してください。",
  });
}

function buildHRFinding(stats) {
  const v = stats.avgHR;
  if (v == null) return null;

  if (v >= 75) {
    return makeAdviceFinding({
      metric: "hr",
      type: "concern",
      title: "平均HR",
      text: `平均HRは ${v} bpm でやや高めです。回復不足やストレス負荷の影響を受けている可能性があります。`,
      advice:
        "睡眠不足、ストレス、飲酒、発熱、過度な運動負荷などでも心拍は上がります。数日単位の推移を見て、HRV低下や高ストレスが重なっていないか確認してください。",
    });
  }

  if (v >= 50 && v < 75) {
    return makeAdviceFinding({
      metric: "hr",
      type: "neutral",
      title: "平均HR",
      text: `平均HRは ${v} bpm です。`,
      advice:
        "単独での異常とは限りません。HRVやストレス、睡眠時間とあわせて全体傾向を見てください。",
    });
  }

  return makeAdviceFinding({
    metric: "hr",
    type: "neutral",
    title: "平均HR",
    text: `平均HRは ${v} bpm です。`,
    advice:
      "安静時心拍は個人差が大きいため、普段の自分のベースラインと比較して評価してください。",
  });
}

function buildHRVFinding(stats) {
  const v = stats.avgHRV;
  if (v == null) return null;

  if (v < 25) {
    return makeAdviceFinding({
      metric: "hrv",
      type: "concern",
      title: "平均HRV",
      text: `平均HRVは ${v} ms で低めです。自律神経の回復余力が低下している可能性があります。`,
      advice:
        "睡眠不足、精神的ストレス、連日の高負荷活動が続いていないか確認してください。1日単独ではなく、3〜7日単位の平均推移で回復傾向を見るのが重要です。",
    });
  }

  if (v < 40) {
    return makeAdviceFinding({
      metric: "hrv",
      type: "neutral",
      title: "平均HRV",
      text: `平均HRVは ${v} ms です。`,
      advice:
        "個人差が大きい指標なので、他者比較よりもご自身のベースラインとの差分で見てください。低下が続く場合は、休養や睡眠延長を優先するのが有効です。",
    });
  }

  return makeAdviceFinding({
    metric: "hrv",
    type: "good",
    title: "平均HRV",
    text: `平均HRVは ${v} ms で比較的良好です。`,
    advice:
      "回復状態は比較的保たれている可能性があります。今後も睡眠時間やストレスとのバランスを維持してください。",
  });
}

function buildStressFinding(stats) {
  const v = stats.avgStress;
  if (v == null) return null;

  if (v >= 70) {
    return makeAdviceFinding({
      metric: "stress",
      type: "concern",
      title: "平均ストレス",
      text: `平均ストレスは ${v} で高めです。長期的には睡眠の質や回復感を損ないやすい水準です。`,
      advice:
        "まずは睡眠時間の確保を優先し、就寝前の作業負荷を軽くしてください。日中の休憩、軽い運動、入浴、呼吸法など、覚醒を落とすルーティンを固定すると改善しやすくなります。",
    });
  }

  if (v >= 50) {
    return makeAdviceFinding({
      metric: "stress",
      type: "neutral",
      title: "平均ストレス",
      text: `平均ストレスは ${v} で、やや高めです。`,
      advice:
        "大きな破綻ではありませんが、HRV低下や睡眠不足と重なる場合は回復不足が進みやすくなります。睡眠前の刺激を減らし、休日の回復行動も確保してください。",
    });
  }

  return makeAdviceFinding({
    metric: "stress",
    type: "good",
    title: "平均ストレス",
    text: `平均ストレスは ${v} で、比較的安定しています。`,
    advice:
      "現在の負荷管理は比較的うまくいっている可能性があります。今後も睡眠時間の不足が重ならないように維持してください。",
  });
}

function buildAuxiliaryAdviceFindings(stats) {
  return [
    buildSleepDurationFinding(stats),
    buildEfficiencyFinding(stats),
    buildDeepRatioFinding(stats),
    buildRemRatioFinding(stats),
    buildHRFinding(stats),
    buildHRVFinding(stats),
    buildStressFinding(stats),
  ].filter(Boolean);
}

export function buildSleepFindings(cards = []) {
  
  const rows = cards.map((c) => ({
    _date: c.date,
    totalSleepHours: c.totalSleepHours,
    sleep_hours: c.totalSleepHours,
    efficiency: c.efficiency,
    awakeTime: c.awakeTime,
    bedtime: c.bedtime,
    wakeTime: c.wakeTime,
    stress: c.stress,
    avg_hr: c.hrAvg,
    hrv: c.hrv,
    deepRatio: c.deepRatio,
    remRatio: c.remRatio,
  }));

  const core = analyzeSleepCore(rows, cards.length);

  const stats = {
    days: cards.length,
    daysWithSleep: cards.filter((c) => c.totalSleepHours != null).length,

    avgSleepHours: core?.stats?.avgSleepHours ?? null,
    minSleepHours: min(cards.map((c) => c.totalSleepHours)),
    maxSleepHours: max(cards.map((c) => c.totalSleepHours)),
    sdSleepHours: core?.stats?.sdSleepHours ?? null,

    avgBedtime: core?.stats?.avgBedtime ?? null,
    avgWakeTime: core?.stats?.avgWakeTime ?? null,
    sdBedtimeMins: core?.stats?.sdBedtimeMinutes ?? null,
    sdWakeTimeMins: core?.stats?.sdWakeTimeMinutes ?? null,

    avgEfficiency: core?.stats?.avgEfficiency ?? null,
    avgAwakeTime: core?.stats?.avgAwakeTime ?? null,

    avgDeepRatio: avg(cards.map((c) => c.deepRatio)),
    avgRemRatio: avg(cards.map((c) => c.remRatio)),
    avgHR: avg(cards.map((c) => c.hrAvg)),
    avgHRV: avg(cards.map((c) => c.hrv)),
    avgStress: avg(cards.map((c) => c.stress)),
  };

    const findings = core?.findings ? [...core.findings] : [];

  const auxiliaryFindings = buildAuxiliaryAdviceFindings(stats);
  findings.push(...auxiliaryFindings);

  const medicalNote =
    "これらの所見はウェアラブルデータに基づく健康管理上の参考情報です。強い日中の眠気、動悸、息苦しさ、著しい不眠や中途覚醒が続く場合は、医療機関への相談も検討してください。";

  return {
    stats,
    findings,
    medicalNote,
  };
}