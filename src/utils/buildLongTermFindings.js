// src/utils/buildLongTermFindings.js

function isValidNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function round1(v) {
  return isValidNumber(v) ? Math.round(v * 10) / 10 : null;
}

function absRound1(v) {
  return isValidNumber(v) ? Math.round(Math.abs(v) * 10) / 10 : null;
}

function pushFinding(
  arr,
  level,
  title,
  body,
  advice,
  {
    category = "general",
    evidenceTier = "core",
    priority = 50,
    whyThisMatters = null,
    medicalNote = null,
  } = {}
) {
  arr.push({
    level,
    title,
    body,
    advice,
    category,
    evidenceTier,
    priority,
    whyThisMatters,
    medicalNote,
  });
}

function formatMinutes(mins) {
  if (!isValidNumber(mins)) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}

function trendLabel(direction, goodWhenDown = false) {
  if (direction === "up") return goodWhenDown ? "悪化傾向" : "上昇傾向";
  if (direction === "down") return goodWhenDown ? "改善傾向" : "低下傾向";
  return "大きな変化なし";
}

function formatHours(v) {
  if (!isValidNumber(v)) return null;
  return `${round1(v)}時間`;
}

function formatSigned(v, unit = "") {
  if (!isValidNumber(v)) return null;
  const n = round1(v);
  return `${n > 0 ? "+" : ""}${n}${unit}`;
}

function directionIs(metric, dir) {
  return metric?.trend?.direction === dir;
}

function halfDelta(metric) {
  return metric?.halfCompare?.delta;
}

function recoveryHrUp(recovery) {
  return recovery?.avgHeartRateTrend?.direction === "up";
}

function recoveryHrvDown(recovery) {
  return recovery?.avgHrvTrend?.direction === "down";
}

function stressUp(stress) {
  return stress?.avgStressTrend?.direction === "up";
}

/* ──────────────────────────────────────────────────────────
   1. 睡眠量
   ────────────────────────────────────────────────────────── */
function describeSleepAmount(metrics, findings) {
  const sleep = metrics?.sleep;
  if (!sleep) return;

  const mean = sleep.mean;
  const shortDays = sleep.shortSleepDays;
  const sd = sleep.sd;
  const delta = halfDelta(sleep);

  if (isValidNumber(mean)) {
    if (mean < 6) {
      pushFinding(
        findings,
        "warning",
        "慢性的な短睡眠傾向",
        `この30日間の平均睡眠時間は${round1(mean)}時間であり、全体としてかなり短めです。7時間未満の日は${isValidNumber(shortDays) ? shortDays : "—"}日あり、慢性的な睡眠不足が続いている可能性があります。`,
        "まず起床時刻を固定し、そのうえで就寝時刻を15〜30分ずつ段階的に前倒ししてください。就寝前1〜2時間の強い光、長時間のスマートフォン使用、遅い時間のカフェインや高負荷作業を減らすことが重要です。",
        {
          category: "sleep_amount",
          evidenceTier: "core",
          priority: 100,
          whyThisMatters:
            "短睡眠の持続は、日中機能、気分、代謝、心血管健康の面で不利になりやすいです。",
          medicalNote:
            "強い日中の眠気、居眠り、集中困難が続く場合は医療相談も検討してください。",
        }
      );
    } else if (mean < 7) {
      pushFinding(
        findings,
        "caution",
        "睡眠時間がやや不足",
        `この30日間の平均睡眠時間は${round1(mean)}時間であり、推奨水準をやや下回っています。7時間未満の日は${isValidNumber(shortDays) ? shortDays : "—"}日あります。`,
        "平均値を少し改善するだけでなく、不足日そのものを減らしてください。まずは30分前後の睡眠延長を優先し、平日の不足を休日の寝だめだけで補わない構成へ変えるのが有効です。",
        {
          category: "sleep_amount",
          evidenceTier: "core",
          priority: 90,
          whyThisMatters:
            "平均が軽度不足でも、不足日が多いと回復が追いつかないことがあります。",
        }
      );
    } else if (mean <= 9) {
      pushFinding(
        findings,
        "good",
        "睡眠時間は概ね確保",
        `この30日間の平均睡眠時間は${round1(mean)}時間であり、量的には概ね確保されています。`,
        "今後は睡眠時間そのものより、就寝・起床時刻の規則性や睡眠効率の安定を維持してください。",
        {
          category: "sleep_amount",
          evidenceTier: "core",
          priority: 55,
          whyThisMatters:
            "長期的には、量が足りていても不規則性が強いと睡眠健康は崩れやすくなります。",
        }
      );
    } else {
      pushFinding(
        findings,
        "info",
        "睡眠時間は長め",
        `この30日間の平均睡眠時間は${round1(mean)}時間であり、やや長めです。`,
        "回復期である可能性もありますが、日中の倦怠感や生活リズムの後退が伴う場合は、睡眠の質や規則性も併せて確認してください。",
        {
          category: "sleep_amount",
          evidenceTier: "core",
          priority: 40,
          whyThisMatters:
            "睡眠は長ければよいとは限らず、日中状態や規則性との整合を見る必要があります。",
        }
      );
    }
  }

  if (isValidNumber(sd)) {
    if (sd >= 1.5) {
      pushFinding(
        findings,
        "warning",
        "睡眠時間のばらつきが大きい",
        `睡眠時間の標準偏差は${round1(sd)}時間であり、夜ごとの差が大きい状態です。平均値が悪くなくても、変動の大きさ自体が体調管理上の不安定さにつながります。`,
        "忙しい日と休養日の差を縮め、まずは最低睡眠時間の底上げを優先してください。『短い日をなくす』方が、長い日をさらに伸ばすより効果的な場合があります。",
        {
          category: "sleep_amount",
          evidenceTier: "core",
          priority: 88,
        }
      );
    } else if (sd >= 0.8) {
      pushFinding(
        findings,
        "caution",
        "睡眠時間にやや変動あり",
        `睡眠時間の標準偏差は${round1(sd)}時間であり、一定の変動がみられます。`,
        "平日不足と休日の補填差が大きくなっていないか確認してください。週全体でならした安定確保を目標にする方が長期的には有利です。",
        {
          category: "sleep_amount",
          evidenceTier: "core",
          priority: 70,
        }
      );
    }
  }

  if (isValidNumber(delta)) {
    if (delta <= -0.5) {
      pushFinding(
        findings,
        "warning",
        "月後半で睡眠時間が減少",
        `月前半と比較して、月後半の平均睡眠時間は${absRound1(delta)}時間短くなっています。直近に向けて回復余地が小さくなっている可能性があります。`,
        "直近1〜2週間の予定や夜間作業量を見直し、削減できる負荷を先に減らしてください。改善では『生活を整える』より先に『削る負荷を決める』方が実行しやすいです。",
        {
          category: "sleep_amount",
          evidenceTier: "core",
          priority: 92,
        }
      );
    } else if (delta >= 0.5) {
      pushFinding(
        findings,
        "good",
        "月後半で睡眠時間が増加",
        `月前半と比較して、月後半の平均睡眠時間は${round1(delta)}時間長くなっています。後半にかけて睡眠量を確保できている傾向があります。`,
        "この改善を一過性で終わらせず、起床時刻の固定や就寝前行動の一定化と組み合わせて再現性を高めてください。",
        {
          category: "sleep_amount",
          evidenceTier: "core",
          priority: 50,
        }
      );
    }
  }

  if (sleep.trend?.direction && sleep.trend.direction !== "unknown") {
    const label = trendLabel(sleep.trend.direction, false);
    pushFinding(
      findings,
      sleep.trend.direction === "down" ? "caution" : "info",
      "睡眠時間の推移",
      `30日間の推移では、睡眠時間は${label}です。1日あたりの傾きは${isValidNumber(sleep.trend.slopePerDay) ? round1(sleep.trend.slopePerDay) : "不明"}時間です。`,
      sleep.trend.direction === "down"
        ? "下降が続く場合は、月後半に向けて回復不足が積み上がっている可能性があります。まず直近の減少要因を特定してください。"
        : "上昇傾向がある場合でも、同時に規則性が崩れていないかを併せて確認してください。",
      {
        category: "sleep_amount",
        evidenceTier: "core",
        priority: 45,
      }
    );
  }
}

/* ──────────────────────────────────────────────────────────
   2. 規則性
   ────────────────────────────────────────────────────────── */
function describeRegularity(metrics, findings) {
  const reg = metrics?.regularity;
  if (!reg) return;

  const bedSd = reg.sleepStartSdMinutes;
  const wakeSd = reg.sleepEndSdMinutes;
  const bedMean = reg.sleepStartMean;
  const wakeMean = reg.sleepEndMean;

  if (isValidNumber(bedSd)) {
    if (bedSd >= 90) {
      pushFinding(
        findings,
        "warning",
        "就寝時刻が不規則",
        `就寝時刻のばらつきは${formatMinutes(bedSd)}程度であり、生活リズムの乱れが比較的大きい状態です。`,
        "長期改善では、まず起床時刻を先に固定してください。就寝時刻だけを無理に合わせるより、朝のアンカーを一定にする方がリズムは整いやすいです。",
        {
          category: "sleep_regularity",
          evidenceTier: "core",
          priority: 96,
          whyThisMatters:
            "長期的には、睡眠の規則性そのものが健康管理上の重要指標です。",
        }
      );
    } else if (bedSd >= 45) {
      pushFinding(
        findings,
        "caution",
        "就寝時刻にばらつきあり",
        `就寝時刻のばらつきは${formatMinutes(bedSd)}程度です。大きな乱れではありませんが、一定の揺れがあります。`,
        "起床時刻とセットで固定し、平日と休日の就寝時刻差を縮めてください。就寝前ルーティンを毎日同じ順序で行うと定着しやすくなります。",
        {
          category: "sleep_regularity",
          evidenceTier: "core",
          priority: 78,
        }
      );
    } else {
      pushFinding(
        findings,
        "good",
        "就寝時刻は比較的安定",
        `就寝時刻のばらつきは${formatMinutes(bedSd)}程度であり、比較的安定しています。`,
        "この安定性は長期的な強みです。今後は睡眠時間の不足が重ならないよう、量と規則性の両立を維持してください。",
        {
          category: "sleep_regularity",
          evidenceTier: "core",
          priority: 48,
        }
      );
    }
  }

  if (isValidNumber(wakeSd)) {
    if (wakeSd >= 90) {
      pushFinding(
        findings,
        "warning",
        "起床時刻が不規則",
        `起床時刻のばらつきは${formatMinutes(wakeSd)}程度であり、朝のリズムが安定していません。`,
        "休日も平日との差を2時間以内に抑え、起床後はできるだけ早い時間帯に自然光を浴びてください。朝の光は体内時計を前向きに固定する助けになります。",
        {
          category: "sleep_regularity",
          evidenceTier: "core",
          priority: 94,
        }
      );
    } else if (wakeSd >= 45) {
      pushFinding(
        findings,
        "caution",
        "起床時刻にばらつきあり",
        `起床時刻のばらつきは${formatMinutes(wakeSd)}程度です。`,
        "アラーム時刻だけでなく、起床後の行動も固定してください。起床後の光曝露、洗面、軽い活動を一定にするとリズムが安定しやすくなります。",
        {
          category: "sleep_regularity",
          evidenceTier: "core",
          priority: 76,
        }
      );
    }
  }

  if (bedMean || wakeMean) {
    pushFinding(
      findings,
      "info",
      "平均的な睡眠スケジュール",
      `平均就寝時刻は${bedMean ?? "不明"}、平均起床時刻は${wakeMean ?? "不明"}です。長期分析では、この平均値そのものよりも、そこからどれだけ日ごとにずれているかを重視して評価します。`,
      "平均時刻を理想化するより、まずは日ごとのズレ幅を小さくすることを優先してください。",
      {
        category: "sleep_regularity",
        evidenceTier: "core",
        priority: 35,
      }
    );
  }
}

/* ──────────────────────────────────────────────────────────
   3. 睡眠段階（補助）
   ────────────────────────────────────────────────────────── */
function describeSleepStage(metrics, findings) {
  const stage = metrics?.sleepStage;
  if (!stage) return;

  if (isValidNumber(stage.deepPercentMean)) {
    const level =
      stage.deepPercentMean < 10 ? "caution" :
      stage.deepPercentMean <= 25 ? "info" : "info";

    pushFinding(
      findings,
      level,
      "深睡眠割合",
      `深睡眠割合の30日平均は${round1(stage.deepPercentMean)}%です。ウェアラブルの睡眠段階推定は補助指標として扱い、絶対値よりも、本人内での継続的な低下や睡眠時間との組み合わせを見るのが適切です。`,
      stage.deepPercentMean < 10
        ? "深睡眠割合が低めでも、まず優先すべきは睡眠時間と規則性の改善です。就寝前の飲酒、遅い食事、強い光刺激を減らしてください。"
        : "単独での良し悪しを断定せず、睡眠時間、睡眠効率、起床後の回復感と併せて解釈してください。",
      {
        category: "sleep_architecture_aux",
        evidenceTier: "auxiliary",
        priority: 28,
      }
    );
  }

  if (isValidNumber(stage.remPercentMean)) {
    const level = stage.remPercentMean < 15 ? "caution" : "info";

    pushFinding(
      findings,
      level,
      "REM睡眠割合",
      `REM睡眠割合の30日平均は${round1(stage.remPercentMean)}%です。こちらも単独で断定せず、ストレス、睡眠時間、起床後の主観状態と合わせて解釈する必要があります。`,
      stage.remPercentMean < 15
        ? "睡眠後半を削る生活パターンではREMが不足しやすくなります。起床時刻を必要以上に早めず、睡眠時間全体をまず確保してください。"
        : "REM割合は補助的に扱い、日中の眠気や気分変動との組み合わせで見てください。",
      {
        category: "sleep_architecture_aux",
        evidenceTier: "auxiliary",
        priority: 26,
      }
    );
  }

  if (isValidNumber(stage.deepPercentSd) && stage.deepPercentSd >= 8) {
    pushFinding(
      findings,
      "caution",
      "深睡眠割合の変動が大きい",
      `深睡眠割合のばらつきが${round1(stage.deepPercentSd)}%と比較的大きく、夜ごとの差が目立ちます。`,
      "生活リズム、運動強度、飲酒、就寝前行動の揺れと対応していないか確認してください。特に就寝前の習慣差が大きいと、夜ごとの差が出やすくなります。",
      {
        category: "sleep_architecture_aux",
        evidenceTier: "auxiliary",
        priority: 30,
      }
    );
  }

  if (isValidNumber(stage.remPercentSd) && stage.remPercentSd >= 8) {
    pushFinding(
      findings,
      "caution",
      "REM割合の変動が大きい",
      `REM睡眠割合のばらつきが${round1(stage.remPercentSd)}%と比較的大きく、コンディションによる揺れが示唆されます。`,
      "短期的なストレス変動、睡眠時間不足、起床時刻の変動と関係していないかを併せて確認してください。",
      {
        category: "sleep_architecture_aux",
        evidenceTier: "auxiliary",
        priority: 29,
      }
    );
  }
}

/* ──────────────────────────────────────────────────────────
   4. 回復状態（HR / HRV）
   ────────────────────────────────────────────────────────── */
function describeRecovery(metrics, findings) {
  const recovery = metrics?.recovery;
  if (!recovery) return;

  if (isValidNumber(recovery.avgHeartRateMean)) {
    pushFinding(
      findings,
      "info",
      "平均心拍の水準",
      `平均心拍の30日平均は${round1(recovery.avgHeartRateMean)}です。長期分析では絶対値よりも、本人基準からの上昇傾向や、睡眠不足・ストレスとの同時発生を重視して解釈すべきです。`,
      "心拍は睡眠不足、ストレス、飲酒、発熱、運動負荷でも変動します。単日ではなく、数日〜数週間の方向性で判断してください。",
      {
        category: "recovery",
        evidenceTier: "core",
        priority: 34,
      }
    );
  }

  if (recovery.avgHeartRateTrend?.direction && recovery.avgHeartRateTrend.direction !== "unknown") {
    const dir = recovery.avgHeartRateTrend.direction;
    if (dir === "up") {
      pushFinding(
        findings,
        "caution",
        "平均心拍は上昇傾向",
        `平均心拍は30日で上昇傾向です。回復不足、生活負荷、睡眠不足、体調変化などの影響候補を考慮する必要があります。`,
        "同時にHRVが低下していないか、ストレス日や短睡眠日が増えていないかを確認してください。心拍上昇が続く時期は、まず夜間の負荷要因から削るのが現実的です。",
        {
          category: "recovery",
          evidenceTier: "core",
          priority: 74,
        }
      );
    } else if (dir === "down") {
      pushFinding(
        findings,
        "good",
        "平均心拍は低下傾向",
        `平均心拍は30日で低下傾向です。一般には回復状態の改善や安定化を示す可能性があります。`,
        "この改善が睡眠量の確保やストレス軽減と整合しているかを確認すると、再現しやすい回復パターンが見えます。",
        {
          category: "recovery",
          evidenceTier: "core",
          priority: 46,
        }
      );
    }
  }

  if (isValidNumber(recovery.avgHrvMean)) {
    pushFinding(
      findings,
      "info",
      "HRVの水準",
      `HRVの30日平均は${round1(recovery.avgHrvMean)}です。HRVは個人差が大きいため、一般基準よりも本人内の推移を見ることが重要です。`,
      "他者比較ではなく、ご自身の直近ベースラインとの差を重視してください。数日単位で低下が続く時期は、休養と睡眠延長を優先すべきです。",
      {
        category: "recovery",
        evidenceTier: "core",
        priority: 33,
      }
    );
  }

  if (recovery.avgHrvTrend?.direction && recovery.avgHrvTrend.direction !== "unknown") {
    const dir = recovery.avgHrvTrend.direction;
    if (dir === "down") {
      pushFinding(
        findings,
        "warning",
        "HRVは低下傾向",
        `HRVは30日で低下傾向にあります。回復力の低下、ストレス負荷、睡眠不足の蓄積などを疑う補助所見として扱うのが妥当です。`,
        "睡眠時間不足、心理的負荷、運動負荷、飲酒の重なりを確認してください。改善では『頑張る対策』より『負荷を減らす対策』を先に置く方が有効です。",
        {
          category: "recovery",
          evidenceTier: "core",
          priority: 93,
        }
      );
    } else if (dir === "up") {
      pushFinding(
        findings,
        "good",
        "HRVは改善傾向",
        `HRVは30日で上昇傾向にあります。自律神経的な回復状態が改善している可能性があります。`,
        "この改善が一時的でないかを確認するため、生活パターンのどの変化が寄与したかを振り返ると有用です。",
        {
          category: "recovery",
          evidenceTier: "core",
          priority: 44,
        }
      );
    }
  }

  if (isValidNumber(recovery.avgHrvHalfCompare?.delta)) {
    const delta = recovery.avgHrvHalfCompare.delta;
    if (delta <= -5) {
      pushFinding(
        findings,
        "warning",
        "月後半でHRV低下",
        `月前半と比較して、月後半のHRV平均は${absRound1(delta)}低下しています。直近に向けて回復余力が下がっている可能性があります。`,
        "直近2週間の負荷上昇要因を特定してください。睡眠不足や高ストレスと同時に起きている場合は、優先的な改善対象です。",
        {
          category: "recovery",
          evidenceTier: "core",
          priority: 91,
        }
      );
    } else if (delta >= 5) {
      pushFinding(
        findings,
        "good",
        "月後半でHRV改善",
        `月前半と比較して、月後半のHRV平均は${round1(delta)}上昇しています。後半にかけて回復状態が改善している可能性があります。`,
        "改善に対応する生活要因を見つけて維持してください。特に睡眠時間、運動量、夜間負荷の組み合わせを見ると再現性が高まります。",
        {
          category: "recovery",
          evidenceTier: "core",
          priority: 43,
        }
      );
    }
  }

  if (isValidNumber(recovery.longestLowHrvStreak) && recovery.longestLowHrvStreak >= 3) {
    pushFinding(
      findings,
      "warning",
      "低HRVが連続",
      `低HRVの日が最長${recovery.longestLowHrvStreak}日連続しています。一時的な揺れではなく、数日単位の負荷蓄積を示唆する可能性があります。`,
      "単発の悪化ではなく連続性があるため、短期の対処だけでは不十分な可能性があります。数日単位で予定密度や夜間作業を減らし、回復期間を明示的に確保してください。",
      {
        category: "recovery",
        evidenceTier: "core",
        priority: 89,
      }
    );
  }
}

/* ──────────────────────────────────────────────────────────
   5. ストレス
   ────────────────────────────────────────────────────────── */
function describeStress(metrics, findings) {
  const stress = metrics?.stress;
  if (!stress) return;

  if (isValidNumber(stress.avgStressMean)) {
    pushFinding(
      findings,
      "info",
      "ストレス指標の平均",
      `ストレス指標の30日平均は${round1(stress.avgStressMean)}です。ウェアラブルのストレス値は推定指標であり、単独ではなく睡眠やHRVと組み合わせて読む必要があります。`,
      "平均値だけで安心・警戒せず、高ストレス日の頻度と連続性を重視してください。",
      {
        category: "stress",
        evidenceTier: "auxiliary_high",
        priority: 32,
      }
    );
  }

  if (isValidNumber(stress.highStressDays) && stress.highStressDays >= 7) {
    pushFinding(
      findings,
      "warning",
      "高ストレス日が多い",
      `高ストレス日が30日中${stress.highStressDays}日あり、月のかなりの割合を占めています。負荷が単発ではなく反復している可能性があります。`,
      "高ストレス日が集中する曜日や予定の型を確認してください。『ストレスが高い日を減らす』という視点で、就寝前負荷や予定密度を調整するのが有効です。",
      {
        category: "stress",
        evidenceTier: "auxiliary_high",
        priority: 87,
      }
    );
  } else if (isValidNumber(stress.highStressDays) && stress.highStressDays >= 3) {
    pushFinding(
      findings,
      "caution",
      "高ストレス日が散見",
      `高ストレス日は30日中${stress.highStressDays}日あります。頻度としては中等度であり、特定曜日や睡眠不足との関係を見る価値があります。`,
      "単発の出来事か、繰り返し起きるパターンかを切り分けてください。後者であれば、生活設計レベルの見直しが必要です。",
      {
        category: "stress",
        evidenceTier: "auxiliary_high",
        priority: 68,
      }
    );
  }

  if (isValidNumber(stress.longestHighStressStreak) && stress.longestHighStressStreak >= 3) {
    pushFinding(
      findings,
      "warning",
      "高ストレスが連続",
      `高ストレス状態が最長${stress.longestHighStressStreak}日連続しています。連続性がある場合は、休養を挟んでも戻りきっていない可能性があります。`,
      "単発イベント対応ではなく、連続高負荷を切る方策が必要です。夜間作業、移動、対人負荷、締切密度など、戻りきらない原因を特定してください。",
      {
        category: "stress",
        evidenceTier: "auxiliary_high",
        priority: 86,
      }
    );
  }

  if (stress.avgStressTrend?.direction && stress.avgStressTrend.direction !== "unknown") {
    const dir = stress.avgStressTrend.direction;
    if (dir === "up") {
      pushFinding(
        findings,
        "warning",
        "ストレス指標は上昇傾向",
        `ストレス指標は月内で上昇傾向です。睡眠不足、心拍上昇、HRV低下と重なっていないか重点的に確認すべきです。`,
        "ストレスだけを下げようとするより、睡眠不足と同時に起きている日を減らす方が実務的です。まず就寝前の認知負荷を下げてください。",
        {
          category: "stress",
          evidenceTier: "auxiliary_high",
          priority: 84,
        }
      );
    } else if (dir === "down") {
      pushFinding(
        findings,
        "good",
        "ストレス指標は低下傾向",
        `ストレス指標は月内で低下傾向です。全体として負荷が軽減している可能性があります。`,
        "この改善が睡眠やHRVの改善と一致しているなら、現在の負荷調整は妥当な可能性があります。",
        {
          category: "stress",
          evidenceTier: "auxiliary_high",
          priority: 42,
        }
      );
    }
  }

  if (isValidNumber(stress.shortSleepAndHighStressDays) && stress.shortSleepAndHighStressDays >= 3) {
    pushFinding(
      findings,
      "warning",
      "睡眠不足と高ストレスの重なり",
      `睡眠不足と高ストレスが同日に重なった日が${stress.shortSleepAndHighStressDays}日あります。健康管理上は、この重なりを優先的に改善対象とみなすべきです。`,
      "個別に対処するより、『短睡眠の日に高ストレスも起きる構図』を崩すことが重要です。睡眠不足が予想される日は、夜間の追加負荷を意図的に減らしてください。",
      {
        category: "stress",
        evidenceTier: "core",
        priority: 97,
      }
    );
  }
}

/* ──────────────────────────────────────────────────────────
   6. 複合所見
   ────────────────────────────────────────────────────────── */
function describeComposite(metrics, findings) {
  const sleep = metrics?.sleep;
  const reg = metrics?.regularity;
  const recovery = metrics?.recovery;
  const stress = metrics?.stress;

  const shortSleep = isValidNumber(sleep?.mean) && sleep.mean < 7;
  const irregular =
    isValidNumber(reg?.sleepStartSdMinutes) && reg.sleepStartSdMinutes >= 60;
  const hrUp = recoveryHrUp(recovery);
  const hrvDown = recoveryHrvDown(recovery);
  const stressRising = stressUp(stress);

  if (shortSleep && irregular) {
    pushFinding(
      findings,
      "warning",
      "睡眠不足と不規則性が同時に存在",
      `睡眠時間不足に加えて、就寝時刻の不規則性も目立ちます。量と規則性の両方が崩れているため、長期的な回復効率が下がりやすい構図です。`,
      "改善では『長く寝ること』だけでなく、『起床時刻を固定すること』を同時に実施してください。量だけを増やしても、不規則性が強いままだと安定しにくいです。",
      {
        category: "composite",
        evidenceTier: "core",
        priority: 99,
      }
    );
  }

  if (hrUp && hrvDown) {
    pushFinding(
      findings,
      "warning",
      "心拍上昇とHRV低下が同時に出現",
      `平均心拍の上昇傾向とHRVの低下傾向が同時にみられます。回復不足や負荷蓄積を示す組み合わせとして優先的に扱うべきです。`,
      "短期的に頑張って整えるより、数日単位で負荷を引くことが重要です。睡眠時間、就寝前負荷、飲酒、運動強度をまとめて見直してください。",
      {
        category: "composite",
        evidenceTier: "core",
        priority: 98,
      }
    );
  }

  if (shortSleep && stressRising) {
    pushFinding(
      findings,
      "warning",
      "短睡眠とストレス上昇が並行",
      `平均睡眠時間の不足とストレス指標の上昇傾向が並行しています。回復不足が負荷耐性を下げ、さらに睡眠を悪化させる循環に入りつつある可能性があります。`,
      "まず就寝前の作業負荷を軽くし、夜間の認知刺激を減らしてください。ストレス対策を増やす前に、睡眠を削る要因を減らす方が優先です。",
      {
        category: "composite",
        evidenceTier: "core",
        priority: 95,
      }
    );
  }
}

/* ──────────────────────────────────────────────────────────
   7. 並び替え
   ────────────────────────────────────────────────────────── */
function sortFindings(findings) {
  const levelRank = {
    warning: 0,
    caution: 1,
    good: 2,
    info: 3,
  };

  return findings
    .slice()
    .sort((a, b) => {
      const pa = isValidNumber(a.priority) ? a.priority : 0;
      const pb = isValidNumber(b.priority) ? b.priority : 0;
      if (pa !== pb) return pb - pa;

      const la = levelRank[a.level] ?? 99;
      const lb = levelRank[b.level] ?? 99;
      if (la !== lb) return la - lb;

      return (a.title || "").localeCompare(b.title || "", "ja");
    });
}

export function buildLongTermFindings(metrics) {
  const findings = [];

  describeSleepAmount(metrics, findings);
  describeRegularity(metrics, findings);
  describeSleepStage(metrics, findings);
  describeRecovery(metrics, findings);
  describeStress(metrics, findings);
  describeComposite(metrics, findings);

  return sortFindings(findings);
}