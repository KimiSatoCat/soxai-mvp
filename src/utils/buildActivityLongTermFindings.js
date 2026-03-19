function isValidNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function round1(v) {
  return isValidNumber(v) ? Math.round(v * 10) / 10 : null;
}

function pushFinding(arr, level, title, body, advice, priority = 50) {
  arr.push({ level, title, body, advice, priority });
}

function sortFindings(findings) {
  const levelRank = { warning: 0, caution: 1, good: 2, info: 3 };
  return findings.slice().sort((a, b) => {
    if ((b.priority ?? 0) !== (a.priority ?? 0)) {
      return (b.priority ?? 0) - (a.priority ?? 0);
    }
    return (levelRank[a.level] ?? 99) - (levelRank[b.level] ?? 99);
  });
}

export function buildActivityScoreFindings(metrics) {
  const findings = [];
  const a = metrics?.activity;
  if (!a) return findings;

  if (isValidNumber(a.activityScoreMean)) {
    if (a.activityScoreMean < 60) {
      pushFinding(
        findings,
        "warning",
        "活動スコアが低水準です",
        `活動スコアの平均は${round1(a.activityScoreMean)}点であり、全体として低めです。`,
        "歩数、活動カロリー、生活リズムの崩れが同時に起きていないか確認してください。",
        92
      );
    } else if (a.activityScoreMean < 75) {
      pushFinding(
        findings,
        "caution",
        "活動スコアは中程度です",
        `活動スコアの平均は${round1(a.activityScoreMean)}点です。`,
        "低活動日が続く曜日や予定の型を確認してください。",
        72
      );
    } else {
      pushFinding(
        findings,
        "good",
        "活動スコアは比較的良好です",
        `活動スコアの平均は${round1(a.activityScoreMean)}点であり、比較的安定しています。`,
        "無理に強度を上げるより、継続性を維持してください。",
        40
      );
    }
  }

  if (a.activityScoreTrend?.direction === "down") {
    pushFinding(
      findings,
      "warning",
      "活動スコアが低下傾向です",
      "推移上、活動スコアは下向いています。",
      "直近で歩数低下や活動量減少が起きていないか確認してください。",
      88
    );
  } else if (a.activityScoreTrend?.direction === "up") {
    pushFinding(
      findings,
      "good",
      "活動スコアが改善傾向です",
      "推移上、活動スコアは上向いています。",
      "改善に寄与した行動習慣を維持してください。",
      36
    );
  }

  if (isValidNumber(a.activityScoreHalfCompare)) {
    if (a.activityScoreHalfCompare < -5) {
      pushFinding(
        findings,
        "caution",
        "後半で活動スコアが低下しています",
        `前半と比べて後半は${round1(Math.abs(a.activityScoreHalfCompare))}点低下しています。`,
        "最近の運動不足や座位時間増加が影響していないか確認してください。",
        70
      );
    } else if (a.activityScoreHalfCompare > 5) {
      pushFinding(
        findings,
        "good",
        "後半で活動スコアが改善しています",
        `前半と比べて後半は${round1(a.activityScoreHalfCompare)}点改善しています。`,
        "改善につながった生活パターンを維持してください。",
        32
      );
    }
  }

  return sortFindings(findings);
}

export function buildStepsFindings(metrics) {
  const findings = [];
  const a = metrics?.activity;
  if (!a) return findings;

  if (isValidNumber(a.activityStepsMean)) {
    if (a.activityStepsMean < 4000) {
      pushFinding(
        findings,
        "warning",
        "平均歩数が少ない状態です",
        `平均歩数は${Math.round(a.activityStepsMean)}歩です。`,
        "まずは日常移動を増やし、運動強度より低活動日を減らすことを優先してください。",
        95
      );
    } else if (a.activityStepsMean < 8000) {
      pushFinding(
        findings,
        "caution",
        "歩数は中程度です",
        `平均歩数は${Math.round(a.activityStepsMean)}歩です。`,
        "あと少し増やすより、歩かない日を減らす方が安定化しやすいです。",
        70
      );
    } else {
      pushFinding(
        findings,
        "good",
        "歩数は比較的確保されています",
        `平均歩数は${Math.round(a.activityStepsMean)}歩です。`,
        "現在の活動量を維持しつつ、休養とのバランスも見てください。",
        40
      );
    }
  }

  if (isValidNumber(a.lowStepDays) && a.lowStepDays >= 7) {
    pushFinding(
      findings,
      "warning",
      "低活動日が多めです",
      `4,000歩未満の日が${a.lowStepDays}日あります。`,
      "一部の日だけ多く動くより、低活動日を減らす方が長期安定につながります。",
      90
    );
  }

  if (isValidNumber(a.highStepDays) && a.highStepDays >= 10) {
    pushFinding(
      findings,
      "good",
      "高活動日が一定数あります",
      `8,000歩以上の日が${a.highStepDays}日あります。`,
      "高活動日を維持しつつ、活動の波を整えるとさらに安定しやすいです。",
      35
    );
  }

  if (a.activityStepsTrend?.direction === "down") {
    pushFinding(
      findings,
      "caution",
      "歩数が低下傾向です",
      "推移上、歩数は下向いています。",
      "移動量の減少、在宅時間の増加、疲労蓄積がないか確認してください。",
      76
    );
  } else if (a.activityStepsTrend?.direction === "up") {
    pushFinding(
      findings,
      "good",
      "歩数が改善傾向です",
      "推移上、歩数は上向いています。",
      "改善につながった行動を維持してください。",
      30
    );
  }

  return sortFindings(findings);
}

export function buildActivityCaloriesFindings(metrics) {
  const findings = [];
  const a = metrics?.activity;
  if (!a) return findings;

  if (isValidNumber(a.activityCaloriesMean)) {
    pushFinding(
      findings,
      a.activityCaloriesMean < 150 ? "caution" : "info",
      "活動カロリーの確認",
      `平均活動カロリーは${Math.round(a.activityCaloriesMean)} kcalです。`,
      "歩数や活動スコアと同方向に動いているかを合わせて確認してください。",
      a.activityCaloriesMean < 150 ? 72 : 36
    );
  }

  if (a.activityCaloriesTrend?.direction === "down") {
    pushFinding(
      findings,
      "caution",
      "活動カロリーが低下傾向です",
      "推移上、活動カロリーは下向いています。",
      "歩数や外出頻度の低下と一致していないか確認してください。",
      74
    );
  } else if (a.activityCaloriesTrend?.direction === "up") {
    pushFinding(
      findings,
      "good",
      "活動カロリーが改善傾向です",
      "推移上、活動カロリーは上向いています。",
      "無理のない範囲で継続してください。",
      28
    );
  }

  if (isValidNumber(a.activityCaloriesSd) && a.activityCaloriesSd >= 120) {
    pushFinding(
      findings,
      "caution",
      "活動カロリーのばらつきが大きめです",
      `標準偏差は${round1(a.activityCaloriesSd)} kcalです。`,
      "活動量が極端に高い日と低い日に偏っていないか確認してください。",
      66
    );
  }

  return sortFindings(findings);
}

export function buildReeCaloriesFindings(metrics) {
  const findings = [];
  const a = metrics?.activity;
  if (!a) return findings;

  if (isValidNumber(a.activityReeCaloriesMean)) {
    pushFinding(
      findings,
      "info",
      "REEカロリーの確認",
      `平均REEカロリーは${Math.round(a.activityReeCaloriesMean)} kcalです。`,
      "基礎的な消費推定値として、急変より推移の安定性を見てください。",
      40
    );
  }

  if (a.activityReeCaloriesTrend?.direction === "down") {
    pushFinding(
      findings,
      "info",
      "REEカロリーは低下傾向です",
      "推移上、REEカロリーはやや下向きです。",
      "体重変化、活動量変化、計測条件の変化がないか確認してください。",
      30
    );
  } else if (a.activityReeCaloriesTrend?.direction === "up") {
    pushFinding(
      findings,
      "info",
      "REEカロリーは上昇傾向です",
      "推移上、REEカロリーはやや上向きです。",
      "単独ではなく、活動量や体調変化と合わせて解釈してください。",
      28
    );
  }

  if (isValidNumber(a.activityReeCaloriesSd) && a.activityReeCaloriesSd >= 100) {
    pushFinding(
      findings,
      "caution",
      "REEカロリーの変動がやや大きめです",
      `標準偏差は${round1(a.activityReeCaloriesSd)} kcalです。`,
      "測定条件や生活リズムのばらつきが影響していないか確認してください。",
      60
    );
  }

  return sortFindings(findings);
}

export function buildQolFindings(metrics) {
  const findings = [];
  const a = metrics?.activity;
  if (!a) return findings;

  if (isValidNumber(a.qolScoreMean)) {
    if (a.qolScoreMean < 60) {
      pushFinding(
        findings,
        "warning",
        "QoLスコアが低水準です",
        `QoLスコアの平均は${round1(a.qolScoreMean)}点です。`,
        "睡眠、体調、活動のどこで継続的な低下が起きているかを横断的に確認してください。",
        92
      );
    } else if (a.qolScoreMean < 75) {
      pushFinding(
        findings,
        "caution",
        "QoLスコアは改善余地があります",
        `QoLスコアの平均は${round1(a.qolScoreMean)}点です。`,
        "単独で見るのではなく、睡眠や体調指標と合わせて解釈してください。",
        72
      );
    } else {
      pushFinding(
        findings,
        "good",
        "QoLスコアは比較的良好です",
        `QoLスコアの平均は${round1(a.qolScoreMean)}点です。`,
        "現在の生活全体のバランスを維持してください。",
        38
      );
    }
  }

  if (a.qolScoreTrend?.direction === "down") {
    pushFinding(
      findings,
      "warning",
      "QoLスコアが低下傾向です",
      "推移上、QoLスコアは下向いています。",
      "睡眠、体調、活動のどの要素がボトルネックになっているか切り分けてください。",
      88
    );
  } else if (a.qolScoreTrend?.direction === "up") {
    pushFinding(
      findings,
      "good",
      "QoLスコアが改善傾向です",
      "推移上、QoLスコアは上向いています。",
      "改善要因となった生活パターンを維持してください。",
      32
    );
  }

  if (isValidNumber(a.qolScoreHalfCompare)) {
    if (a.qolScoreHalfCompare < -5) {
      pushFinding(
        findings,
        "caution",
        "後半でQoLスコアが低下しています",
        `前半と比べて後半は${round1(Math.abs(a.qolScoreHalfCompare))}点低下しています。`,
        "生活全体の負荷増大がないか確認してください。",
        68
      );
    } else if (a.qolScoreHalfCompare > 5) {
      pushFinding(
        findings,
        "good",
        "後半でQoLスコアが改善しています",
        `前半と比べて後半は${round1(a.qolScoreHalfCompare)}点改善しています。`,
        "改善につながった要因を維持してください。",
        28
      );
    }
  }

  return sortFindings(findings);
}