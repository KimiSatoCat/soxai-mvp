import { buildPreSleepHrStats } from "./preSleepHrAnalysis.js";

export function buildNormalizedDaily(infoRows = [], detailRows = []) {
  const byDate = new Map();

  const rawPreSleepHrStats = buildPreSleepHrStats(detailRows || []);
  const preSleepHrStatsByDate =
    rawPreSleepHrStats instanceof Map
      ? rawPreSleepHrStats
      : new Map(Object.entries(rawPreSleepHrStats || {}));

  function ensure(dateStr) {
    if (!byDate.has(dateStr)) {
      byDate.set(dateStr, {
        _date: dateStr,

        // raw columns from SOXAI info
        _time: null,
        custom_group: null,
        month: null,
        uid: null,
        workday: null,
        year: null,
        year_week: null,

        activity_calories: null,
        activity_ree_calories: null,
        activity_score: null,
        activity_steps: null,

        health_blood_pressure: null,
        health_hr: null,
        health_hr_max: null,
        health_hr_min: null,
        health_hrv: null,
        health_hrv_max: null,
        health_hrv_min: null,
        health_score: null,
        health_spo2: null,
        health_spo2_max: null,
        health_spo2_min: null,
        health_stress: null,
        health_stress_max: null,
        health_stress_min: null,
        health_temperature: null,
        health_temperature_max: null,
        health_temperature_min: null,

        qol_score: null,

        sleep_ahi_max: null,
        sleep_awake_time: null,
        sleep_awake_time_include_latency: null,
        sleep_debt: null,
        sleep_deep_sleep_time: null,
        sleep_deep_time: null,
        sleep_efficiency: null,
        sleep_efficiency_include_latency: null,
        sleep_end_time: null,
        sleep_end_time_offset_mins: null,
        sleep_hr_mean: null,
        sleep_hr_min: null,
        sleep_hrv_mean: null,
        sleep_latency: null,
        sleep_light_sleep_time: null,
        sleep_light_time: null,
        sleep_n1_time: null,
        sleep_n2_time: null,
        sleep_n3_time: null,
        sleep_nap_time: null,
        sleep_rem_time: null,
        sleep_respiration_rate_mean: null,
        sleep_score: null,
        sleep_spo2_max: null,
        sleep_spo2_mean: null,
        sleep_spo2_min: null,
        sleep_start_time: null,
        sleep_start_time_include_latency: null,
        sleep_start_time_include_latency_offset_mins: null,
        sleep_start_time_offset_mins: null,
        sleep_total_time: null,
        sleep_total_time_exclude_awake: null,
        sleep_total_time_include_latency: null,
        sleep_total_time_true: null,
        utc_offset_mins: null,
        sleep_nap_end_time_1: null,
        sleep_nap_end_time_1_offset_mins: null,
        sleep_nap_start_time_1: null,
        sleep_nap_start_time_1_offset_mins: null,
        sleep_nap_time_1: null,

        // raw columns from detail
        sleep_sleep: null,
        sleep_sleep_1min: null,
        sleep_stage: null,
        sleep_stage_1min: null,
        user_valid: null,
        user_wear: null,

        // compatibility raw fields from older proxy shapes
        activity_act_mlc: null,
        activity_actigraph: null,
        activity_calorie: null,
        health_T: null,
        health_hr_mean: null,
        health_hrv_mean: null,
        health_spo2_100: null,
        sleep_ahi: null,
        sleep_respiration: null,

        // app-side normalized fields
        sleep_hours: null,
        bedtime: null,
        wake_time: null,
        total_sleep_minutes: null,
        time_in_bed_minutes: null,
        efficiency: null,
        awake_time_minutes: null,

        deep_minutes: null,
        light_minutes: null,
        rem_minutes: null,
        deep_ratio: null,
        light_ratio: null,
        rem_ratio: null,

        steps: null,
        calories: null,

        // pre-sleep HR analysis from detail timeline
        pre_sleep_onset_local: null,

        pre_sleep_hr_120_60_mean: null,
        pre_sleep_hr_120_60_sd: null,
        pre_sleep_hr_120_60_n: null,

        pre_sleep_hr_60_30_mean: null,
        pre_sleep_hr_60_30_sd: null,
        pre_sleep_hr_60_30_n: null,

        pre_sleep_hr_30_0_mean: null,
        pre_sleep_hr_30_0_sd: null,
        pre_sleep_hr_30_0_n: null,
      });
    }
    return byDate.get(dateStr);
  }

  function toDateStr(v) {
    if (v == null) return null;
    return String(v).slice(0, 10);
  }

  function pickNumber(obj, keys) {
    for (const k of keys) {
      const val = obj?.[k];
      if (val == null || val === "") continue;
      const n = Number(val);
      if (!Number.isNaN(n)) return n;
    }
    return null;
  }

  function pickTime(obj, keys) {
    for (const k of keys) {
      const val = obj?.[k];
      if (val == null || val === "") continue;

      if (typeof val === "number" && val > 1e9) {
        const d = new Date(val > 1e12 ? val : val * 1000);
        if (!Number.isNaN(d.getTime())) {
          return `${String(d.getHours()).padStart(2, "0")}:${String(
            d.getMinutes()
          ).padStart(2, "0")}`;
        }
      }

      const s = String(val);
      const m = s.match(/(\d{1,2}:\d{2})/);
      if (m) return m[1];
      return s.slice(0, 16);
    }
    return null;
  }

  function hhmmToMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== "string") return null;
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function diffMinutesAcrossMidnight(startHHMM, endHHMM) {
    const start = hhmmToMinutes(startHHMM);
    const end = hhmmToMinutes(endHHMM);
    if (start == null || end == null) return null;

    let diff = end - start;
    if (diff <= 0) diff += 1440;

    if (diff <= 0 || diff > 16 * 60) return null;
    return diff;
  }

  function shiftDateStr(dateStr, days) {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // 1) dailyInfo を主データ源として日次集計を作る
  for (const row of infoRows || []) {
    const dateStr = toDateStr(row?._time ?? row?.time ?? row?.date);
    if (!dateStr) continue;

    const rec = ensure(dateStr);

    // raw columns from newer info shape
    rec._time = row?._time ?? rec._time;
    rec.custom_group = row?.custom_group ?? rec.custom_group;
    rec.month = row?.month ?? rec.month;
    rec.uid = row?.uid ?? rec.uid;
    rec.workday = row?.workday ?? rec.workday;
    rec.year = row?.year ?? rec.year;
    rec.year_week = row?.year_week ?? rec.year_week;

    rec.activity_calories =
      pickNumber(row, ["activity_calories"]) ?? rec.activity_calories;
    rec.activity_ree_calories =
      pickNumber(row, ["activity_ree_calories"]) ?? rec.activity_ree_calories;
    rec.activity_score =
      pickNumber(row, ["activity_score"]) ?? rec.activity_score;
    rec.activity_steps =
      pickNumber(row, ["activity_steps"]) ?? rec.activity_steps;

    rec.health_blood_pressure =
      row?.health_blood_pressure ?? rec.health_blood_pressure;
    rec.health_hr = pickNumber(row, ["health_hr"]) ?? rec.health_hr;
    rec.health_hr_max = pickNumber(row, ["health_hr_max"]) ?? rec.health_hr_max;
    rec.health_hr_min = pickNumber(row, ["health_hr_min"]) ?? rec.health_hr_min;
    rec.health_hrv = pickNumber(row, ["health_hrv"]) ?? rec.health_hrv;
    rec.health_hrv_max =
      pickNumber(row, ["health_hrv_max"]) ?? rec.health_hrv_max;
    rec.health_hrv_min =
      pickNumber(row, ["health_hrv_min"]) ?? rec.health_hrv_min;
    rec.health_score = pickNumber(row, ["health_score"]) ?? rec.health_score;
    rec.health_spo2 = pickNumber(row, ["health_spo2"]) ?? rec.health_spo2;
    rec.health_spo2_max =
      pickNumber(row, ["health_spo2_max"]) ?? rec.health_spo2_max;
    rec.health_spo2_min =
      pickNumber(row, ["health_spo2_min"]) ?? rec.health_spo2_min;
    rec.health_stress =
      pickNumber(row, ["health_stress"]) ?? rec.health_stress;
    rec.health_stress_max =
      pickNumber(row, ["health_stress_max"]) ?? rec.health_stress_max;
    rec.health_stress_min =
      pickNumber(row, ["health_stress_min"]) ?? rec.health_stress_min;
    rec.health_temperature =
      pickNumber(row, ["health_temperature"]) ?? rec.health_temperature;
    rec.health_temperature_max =
      pickNumber(row, ["health_temperature_max"]) ?? rec.health_temperature_max;
    rec.health_temperature_min =
      pickNumber(row, ["health_temperature_min"]) ?? rec.health_temperature_min;

    rec.qol_score = pickNumber(row, ["qol_score"]) ?? rec.qol_score;

    rec.sleep_ahi_max = pickNumber(row, ["sleep_ahi_max"]) ?? rec.sleep_ahi_max;
    rec.sleep_awake_time =
      pickNumber(row, ["sleep_awake_time"]) ?? rec.sleep_awake_time;
    rec.sleep_awake_time_include_latency =
      pickNumber(row, ["sleep_awake_time_include_latency"]) ??
      rec.sleep_awake_time_include_latency;
    rec.sleep_debt = pickNumber(row, ["sleep_debt"]) ?? rec.sleep_debt;
    rec.sleep_deep_sleep_time =
      pickNumber(row, ["sleep_deep_sleep_time"]) ?? rec.sleep_deep_sleep_time;
    rec.sleep_deep_time =
      pickNumber(row, ["sleep_deep_time"]) ?? rec.sleep_deep_time;
    rec.sleep_efficiency =
      pickNumber(row, ["sleep_efficiency"]) ?? rec.sleep_efficiency;
    rec.sleep_efficiency_include_latency =
      pickNumber(row, ["sleep_efficiency_include_latency"]) ??
      rec.sleep_efficiency_include_latency;
    rec.sleep_end_time = row?.sleep_end_time ?? rec.sleep_end_time;
    rec.sleep_end_time_offset_mins =
      pickNumber(row, ["sleep_end_time_offset_mins"]) ??
      rec.sleep_end_time_offset_mins;
    rec.sleep_hr_mean = pickNumber(row, ["sleep_hr_mean"]) ?? rec.sleep_hr_mean;
    rec.sleep_hr_min = pickNumber(row, ["sleep_hr_min"]) ?? rec.sleep_hr_min;
    rec.sleep_hrv_mean =
      pickNumber(row, ["sleep_hrv_mean"]) ?? rec.sleep_hrv_mean;
    rec.sleep_latency = pickNumber(row, ["sleep_latency"]) ?? rec.sleep_latency;
    rec.sleep_light_sleep_time =
      pickNumber(row, ["sleep_light_sleep_time"]) ?? rec.sleep_light_sleep_time;
    rec.sleep_light_time =
      pickNumber(row, ["sleep_light_time"]) ?? rec.sleep_light_time;
    rec.sleep_n1_time = pickNumber(row, ["sleep_n1_time"]) ?? rec.sleep_n1_time;
    rec.sleep_n2_time = pickNumber(row, ["sleep_n2_time"]) ?? rec.sleep_n2_time;
    rec.sleep_n3_time = pickNumber(row, ["sleep_n3_time"]) ?? rec.sleep_n3_time;
    rec.sleep_nap_time =
      pickNumber(row, ["sleep_nap_time"]) ?? rec.sleep_nap_time;
    rec.sleep_rem_time =
      pickNumber(row, ["sleep_rem_time"]) ?? rec.sleep_rem_time;
    rec.sleep_respiration_rate_mean =
      pickNumber(row, ["sleep_respiration_rate_mean"]) ??
      rec.sleep_respiration_rate_mean;
    rec.sleep_score = pickNumber(row, ["sleep_score"]) ?? rec.sleep_score;
    rec.sleep_spo2_max =
      pickNumber(row, ["sleep_spo2_max"]) ?? rec.sleep_spo2_max;
    rec.sleep_spo2_mean =
      pickNumber(row, ["sleep_spo2_mean"]) ?? rec.sleep_spo2_mean;
    rec.sleep_spo2_min =
      pickNumber(row, ["sleep_spo2_min"]) ?? rec.sleep_spo2_min;
    rec.sleep_start_time = row?.sleep_start_time ?? rec.sleep_start_time;
    rec.sleep_start_time_include_latency =
      row?.sleep_start_time_include_latency ??
      rec.sleep_start_time_include_latency;
    rec.sleep_start_time_include_latency_offset_mins =
      pickNumber(row, ["sleep_start_time_include_latency_offset_mins"]) ??
      rec.sleep_start_time_include_latency_offset_mins;
    rec.sleep_start_time_offset_mins =
      pickNumber(row, ["sleep_start_time_offset_mins"]) ??
      rec.sleep_start_time_offset_mins;
    rec.sleep_total_time =
      pickNumber(row, ["sleep_total_time"]) ?? rec.sleep_total_time;
    rec.sleep_total_time_exclude_awake =
      pickNumber(row, ["sleep_total_time_exclude_awake"]) ??
      rec.sleep_total_time_exclude_awake;
    rec.sleep_total_time_include_latency =
      pickNumber(row, ["sleep_total_time_include_latency"]) ??
      rec.sleep_total_time_include_latency;
    rec.sleep_total_time_true =
      pickNumber(row, ["sleep_total_time_true"]) ?? rec.sleep_total_time_true;
    rec.utc_offset_mins =
      pickNumber(row, ["utc_offset_mins"]) ?? rec.utc_offset_mins;
    rec.sleep_nap_end_time_1 =
      row?.sleep_nap_end_time_1 ?? rec.sleep_nap_end_time_1;
    rec.sleep_nap_end_time_1_offset_mins =
      pickNumber(row, ["sleep_nap_end_time_1_offset_mins"]) ??
      rec.sleep_nap_end_time_1_offset_mins;
    rec.sleep_nap_start_time_1 =
      row?.sleep_nap_start_time_1 ?? rec.sleep_nap_start_time_1;
    rec.sleep_nap_start_time_1_offset_mins =
      pickNumber(row, ["sleep_nap_start_time_1_offset_mins"]) ??
      rec.sleep_nap_start_time_1_offset_mins;
    rec.sleep_nap_time_1 =
      pickNumber(row, ["sleep_nap_time_1"]) ?? rec.sleep_nap_time_1;

    // compatibility raw columns from older shapes
    rec.activity_act_mlc =
      pickNumber(row, ["activity_act_mlc"]) ?? rec.activity_act_mlc;
    rec.activity_actigraph =
      pickNumber(row, ["activity_actigraph"]) ?? rec.activity_actigraph;
    rec.activity_calorie =
      pickNumber(row, ["activity_calorie"]) ?? rec.activity_calorie;

    rec.health_T = pickNumber(row, ["health_T"]) ?? rec.health_T;
    rec.health_hr_mean =
      pickNumber(row, ["health_hr_mean"]) ?? rec.health_hr_mean;
    rec.health_hrv_mean =
      pickNumber(row, ["health_hrv_mean"]) ?? rec.health_hrv_mean;
    rec.health_spo2_100 =
      pickNumber(row, ["health_spo2_100"]) ?? rec.health_spo2_100;

    rec.sleep_ahi = pickNumber(row, ["sleep_ahi"]) ?? rec.sleep_ahi;
    rec.sleep_respiration =
      pickNumber(row, ["sleep_respiration"]) ?? rec.sleep_respiration;

    // normalized main fields
    rec.steps =
      pickNumber(row, ["activity_steps", "steps", "step_count"]) ?? rec.steps;
    rec.calories =
      pickNumber(row, [
        "activity_calories",
        "activity_calorie",
        "calories",
        "calorie",
      ]) ?? rec.calories;

    const totalSleep =
      pickNumber(row, [
        "sleep_total_time_true",
        "sleep_total_time_exclude_awake",
        "sleep_total_time_include_latency",
        "sleep_total_time",
      ]) ?? rec.total_sleep_minutes;

    if (totalSleep != null) {
      rec.total_sleep_minutes = totalSleep;
      rec.sleep_hours = Math.round((totalSleep / 60) * 100) / 100;
    }

    const awakeTime = pickNumber(row, [
      "sleep_awake_time",
      "sleep_awake_time_include_latency",
      "awake_time",
      "sleep_waso",
      "waso",
    ]);

    if (awakeTime != null) {
      rec.awake_time_minutes = awakeTime;
    }

    const deepMinutes = pickNumber(row, [
      "sleep_deep_time",
      "sleep_deep_sleep_time",
      "sleep_n3_time",
    ]);

    const lightDirect = pickNumber(row, [
      "sleep_light_time",
      "sleep_light_sleep_time",
    ]);

    const n1Minutes = pickNumber(row, ["sleep_n1_time"]);
    const n2Minutes = pickNumber(row, ["sleep_n2_time"]);

    const lightMinutes =
      lightDirect != null
        ? lightDirect
        : n1Minutes != null || n2Minutes != null
          ? (n1Minutes ?? 0) + (n2Minutes ?? 0)
          : null;

    const remMinutes = pickNumber(row, ["sleep_rem_time"]);

    if (deepMinutes != null) rec.deep_minutes = deepMinutes;
    if (lightMinutes != null) rec.light_minutes = lightMinutes;
    if (remMinutes != null) rec.rem_minutes = remMinutes;

    const totalStageMinutes =
      (rec.deep_minutes ?? 0) +
      (rec.light_minutes ?? 0) +
      (rec.rem_minutes ?? 0);

    if (totalStageMinutes > 0) {
      rec.deep_ratio =
        rec.deep_minutes != null
          ? Math.round((rec.deep_minutes / totalStageMinutes) * 1000) / 10
          : null;

      rec.light_ratio =
        rec.light_minutes != null
          ? Math.round((rec.light_minutes / totalStageMinutes) * 1000) / 10
          : null;

      rec.rem_ratio =
        rec.rem_minutes != null
          ? Math.round((rec.rem_minutes / totalStageMinutes) * 1000) / 10
          : null;
    }

    rec.bedtime =
      pickTime(row, ["sleep_start_time", "sleep_start_time_include_latency"]) ??
      rec.bedtime;

    rec.wake_time = pickTime(row, ["sleep_end_time"]) ?? rec.wake_time;

    const timeInBedMinutes = diffMinutesAcrossMidnight(
      rec.bedtime,
      rec.wake_time
    );
    if (timeInBedMinutes != null) {
      rec.time_in_bed_minutes = timeInBedMinutes;
    }

    const efficiency = pickNumber(row, [
      "sleep_efficiency",
      "sleep_efficiency_include_latency",
      "sleep_efficiency_score",
      "efficiency",
    ]);

    if (efficiency != null) {
      rec.efficiency =
        efficiency <= 1
          ? Math.round(efficiency * 1000) / 10
          : Math.round(efficiency * 10) / 10;
    } else if (
      rec.total_sleep_minutes != null &&
      rec.time_in_bed_minutes != null &&
      rec.time_in_bed_minutes > 0 &&
      rec.total_sleep_minutes <= rec.time_in_bed_minutes
    ) {
      rec.efficiency =
        Math.round((rec.total_sleep_minutes / rec.time_in_bed_minutes) * 1000) /
        10;
    }
  }

  // 2) dailyDetail は raw 保持と補助上書きに限定する
  for (const row of detailRows || []) {
    const dateStr = toDateStr(row?._time ?? row?.time ?? row?.date);
    if (!dateStr) continue;

    const rec = ensure(dateStr);

    rec._time = row?._time ?? rec._time;
    rec.sleep_sleep = row?.sleep_sleep ?? rec.sleep_sleep;
    rec.sleep_sleep_1min = row?.sleep_sleep_1min ?? rec.sleep_sleep_1min;
    rec.sleep_stage = row?.sleep_stage ?? rec.sleep_stage;
    rec.sleep_stage_1min = row?.sleep_stage_1min ?? rec.sleep_stage_1min;
    rec.user_valid = row?.user_valid ?? rec.user_valid;
    rec.user_wear = row?.user_wear ?? rec.user_wear;

    const bedtime =
      pickTime(row, [
        "sleep_start_time",
        "sleep_start",
        "bedtime",
        "sleep_onset",
        "bed_time",
        "lights_off_time",
      ]) ?? rec.bedtime;

    const wakeTime =
      pickTime(row, [
        "sleep_end_time",
        "sleep_end",
        "wake_time",
        "waketime",
        "wakeup_time",
        "get_up_time",
      ]) ?? rec.wake_time;

    if (bedtime != null) rec.bedtime = bedtime;
    if (wakeTime != null) rec.wake_time = wakeTime;
  }

  // 3) UI 互換用の別名を付与
  for (const rec of byDate.values()) {
    rec.wakeTime = rec.wake_time;
    rec.totalSleepHours = rec.sleep_hours;
    rec.timeInBedHours =
      rec.time_in_bed_minutes != null
        ? Math.round((rec.time_in_bed_minutes / 60) * 100) / 100
        : null;
    rec.awakeTime = rec.awake_time_minutes;

    rec.deepMinutes = rec.deep_minutes;
    rec.lightMinutes = rec.light_minutes;
    rec.remMinutes = rec.rem_minutes;
        // longTermMetrics.js 互換キー
    rec.sleepHours = rec.sleep_hours;
    rec.deepPercent = rec.deep_ratio;
    rec.lightPercent = rec.light_ratio;
    rec.remPercent = rec.rem_ratio;

    rec.avgHeartRate =
      rec.sleep_hr_mean ??
      rec.health_hr ??
      rec.health_hr_mean ??
      null;

    rec.avgHrv =
      rec.sleep_hrv_mean ??
      rec.health_hrv ??
      rec.health_hrv_mean ??
      null;

    rec.avgStress =
      rec.health_stress ??
      rec.health_stress_max ??
      rec.health_stress_min ??
      null;

    rec.sleepStart = rec.bedtime;
    rec.sleepEnd = rec.wake_time;

    const currentDate = rec._date;
    const previousDate = shiftDateStr(currentDate, -1);

    // まず当日キーを見て、無ければ前日キーを参照する
    const preSleep =
      preSleepHrStatsByDate.get(currentDate) ??
      preSleepHrStatsByDate.get(previousDate) ??
      null;

    rec.pre_sleep_onset_local = preSleep?.sleep_onset_local ?? null;

    rec.pre_sleep_hr_120_60_mean =
      preSleep?.pre_sleep_hr_120_60_mean ?? null;
    rec.pre_sleep_hr_120_60_sd = preSleep?.pre_sleep_hr_120_60_sd ?? null;
    rec.pre_sleep_hr_120_60_n = preSleep?.pre_sleep_hr_120_60_n ?? null;

    rec.pre_sleep_hr_60_30_mean = preSleep?.pre_sleep_hr_60_30_mean ?? null;
    rec.pre_sleep_hr_60_30_sd = preSleep?.pre_sleep_hr_60_30_sd ?? null;
    rec.pre_sleep_hr_60_30_n = preSleep?.pre_sleep_hr_60_30_n ?? null;

    rec.pre_sleep_hr_30_0_mean = preSleep?.pre_sleep_hr_30_0_mean ?? null;
    rec.pre_sleep_hr_30_0_sd = preSleep?.pre_sleep_hr_30_0_sd ?? null;
    rec.pre_sleep_hr_30_0_n = preSleep?.pre_sleep_hr_30_0_n ?? null;
  }

  const normalizedDaily = Array.from(byDate.values()).sort((a, b) =>
    a._date.localeCompare(b._date)
  );

  return {
    normalizedDaily,
    stats: {
      totalDays: normalizedDaily.length,
      dateFrom: normalizedDaily[0]?._date ?? null,
      dateTo: normalizedDaily[normalizedDaily.length - 1]?._date ?? null,
    },
  };
}