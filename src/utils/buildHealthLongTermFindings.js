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

export function buildHealthScoreFindings(metrics) {
  const findings = [];
  const h = metrics?.health;
  if (!h) return findings;

  if (isValidNumber(h.healthScoreMean)) {
    if (h.healthScoreMean < 60) {
      pushFinding(
        findings,
        "warning",
        "体調スコアが低水準です",
        `体調スコアの平均は${round1(h.healthScoreMean)}点であり、全体として低めです。`,
        "睡眠不足、強いストレス、生活リズムの乱れが重なっていないかを優先的に確認してください。",
        95
      );
    } else if (h.healthScoreMean < 75) {
      pushFinding(
        findings,
        "caution",
        "体調スコアは中程度です",
        `体調スコアの平均は${round1(h.healthScoreMean)}点であり、改善余地があります。`,
        "単日の変動よりも、低い日が続く曜日や生活パターンを確認してください。",
        75
      );
    } else {
      pushFinding(
        findings,
        "good",
        "体調スコアは比較的良好です",
        `体調スコアの平均は${round1(h.healthScoreMean)}点であり、比較的安定しています。`,
        "現在の生活パターンを維持しつつ、忙しい週でも同水準を保てるか確認してください。",
        45
      );
    }
  }

  if (h.healthScoreTrend?.direction === "down") {
    pushFinding(
      findings,
      "warning",
      "体調スコアが低下傾向です",
      "推移上、体調スコアは下向きです。",
      "直近2週間の睡眠時間、ストレス増加、活動量低下の有無を見直してください。",
      92
    );
  } else if (h.healthScoreTrend?.direction === "up") {
    pushFinding(
      findings,
      "good",
      "体調スコアが改善傾向です",
      "推移上、体調スコアは上向きです。",
      "改善につながった睡眠・運動・休養の条件を維持してください。",
      40
    );
  }

  if (isValidNumber(h.healthScoreHalfCompare)) {
    if (h.healthScoreHalfCompare < -5) {
      pushFinding(
        findings,
        "caution",
        "後半で体調スコアが低下しています",
        `前半と比べて後半は${round1(Math.abs(h.healthScoreHalfCompare))}点低下しています。`,
        "最近の予定密度や疲労蓄積が影響していないか確認してください。",
        78
      );
    } else if (h.healthScoreHalfCompare > 5) {
      pushFinding(
        findings,
        "good",
        "後半で体調スコアが改善しています",
        `前半と比べて後半は${round1(h.healthScoreHalfCompare)}点改善しています。`,
        "改善に寄与した行動を再現できるようにしてください。",
        35
      );
    }
  }

  return sortFindings(findings);
}

export function buildHeartRateFindings(metrics) {
  const findings = [];
  const h = metrics?.health;
  if (!h) return findings;

  if (isValidNumber(h.healthHrMean)) {
    if (h.healthHrMean >= 80) {
      pushFinding(
        findings,
        "caution",
        "平均心拍数がやや高めです",
        `平均心拍数は${round1(h.healthHrMean)} bpmです。`,
        "睡眠不足、精神的負荷、カフェイン摂取、体調不良などと重なっていないか確認してください。",
        85
      );
    } else if (h.healthHrMean >= 70) {
      pushFinding(
        findings,
        "info",
        "平均心拍数は中間的な水準です",
        `平均心拍数は${round1(h.healthHrMean)} bpmです。`,
        "絶対値だけでなく、ストレス指標や睡眠状態と一緒に解釈してください。",
        50
      );
    } else {
      pushFinding(
        findings,
        "good",
        "平均心拍数は比較的安定しています",
        `平均心拍数は${round1(h.healthHrMean)} bpmです。`,
        "今後も睡眠と回復の質を保ちながら推移を確認してください。",
        35
      );
    }
  }

  if (h.healthHrTrend?.direction === "up") {
    pushFinding(
      findings,
      "caution",
      "心拍数が上昇傾向です",
      "推移上、心拍数は上向きです。",
      "ストレス上昇や回復不足と同時に起きていないかを確認してください。",
      82
    );
  } else if (h.healthHrTrend?.direction === "down") {
    pushFinding(
      findings,
      "good",
      "心拍数が低下傾向です",
      "推移上、心拍数は下向きです。",
      "疲労回復や睡眠安定の結果である可能性があるため、他指標と合わせて維持状況を見てください。",
      30
    );
  }

  if (isValidNumber(h.healthHrSd) && h.healthHrSd >= 8) {
    pushFinding(
      findings,
      "caution",
      "心拍数のばらつきが大きめです",
      `心拍数の標準偏差は${round1(h.healthHrSd)}です。`,
      "日による負荷差が大きい可能性があるため、予定や睡眠時間のばらつきを確認してください。",
      70
    );
  }

  return sortFindings(findings);
}

export function buildStressFindings(metrics) {
  const findings = [];
  const h = metrics?.health;
  if (!h) return findings;

  if (isValidNumber(h.healthStressMean)) {
    if (h.healthStressMean >= 70) {
      pushFinding(
        findings,
        "warning",
        "ストレス水準が高めです",
        `平均ストレス指標は${round1(h.healthStressMean)}です。`,
        "就寝前の認知負荷を減らし、短睡眠日や高心拍日との重なりを優先的に減らしてください。",
        95
      );
    } else if (h.healthStressMean >= 50) {
      pushFinding(
        findings,
        "caution",
        "ストレス水準はやや高めです",
        `平均ストレス指標は${round1(h.healthStressMean)}です。`,
        "負荷の高い曜日や活動パターンを切り分け、回復時間を確保してください。",
        75
      );
    } else {
      pushFinding(
        findings,
        "good",
        "ストレス水準は比較的安定しています",
        `平均ストレス指標は${round1(h.healthStressMean)}です。`,
        "急な上昇が出ていないか、今後も連続推移を見てください。",
        35
      );
    }
  }

  if (h.healthStressTrend?.direction === "up") {
    pushFinding(
      findings,
      "warning",
      "ストレス指標が上昇傾向です",
      "推移上、ストレス指標は上向いています。",
      "睡眠不足、予定過密、回復不足が同時進行していないか確認してください。",
      90
    );
  } else if (h.healthStressTrend?.direction === "down") {
    pushFinding(
      findings,
      "good",
      "ストレス指標が改善傾向です",
      "推移上、ストレス指標は下向いています。",
      "改善につながった休養や行動調整を維持してください。",
      32
    );
  }

  if (isValidNumber(h.highStressDays) && h.highStressDays >= 5) {
    pushFinding(
      findings,
      "caution",
      "高ストレス日が多めです",
      `ストレス指標が高い日が${h.highStressDays}日あります。`,
      "一時的な負荷ではなく、繰り返し発生する要因がないかを確認してください。",
      80
    );
  }

  return sortFindings(findings);
}

export function buildSpo2Findings(metrics) {
  const findings = [];
  const h = metrics?.health;
  if (!h) return findings;

  if (isValidNumber(h.healthSpo2Mean)) {
    if (h.healthSpo2Mean < 95) {
      pushFinding(
        findings,
        "caution",
        "血中酸素濃度がやや低めです",
        `平均SpO2は${round1(h.healthSpo2Mean)}%です。`,
        "単発値だけでなく、継続的な低下かどうか、眠気やいびきなどと重なるかを確認してください。",
        88
      );
    } else {
      pushFinding(
        findings,
        "good",
        "血中酸素濃度は概ね安定しています",
        `平均SpO2は${round1(h.healthSpo2Mean)}%です。`,
        "今後も継続推移を確認し、急な低下が続かないかを見てください。",
        35
      );
    }
  }

  if (isValidNumber(h.healthSpo2MinMean) && h.healthSpo2MinMean < 93) {
    pushFinding(
      findings,
      "caution",
      "最低SpO2が低めです",
      `最低SpO2の平均は${round1(h.healthSpo2MinMean)}%です。`,
      "装着状態や測定条件の影響もあり得るため、継続的に低いかどうかを優先して確認してください。",
      82
    );
  }

  if (h.healthSpo2Trend?.direction === "down") {
    pushFinding(
      findings,
      "caution",
      "血中酸素濃度が低下傾向です",
      "推移上、SpO2は下向きです。",
      "測定条件の乱れを除外したうえで、睡眠状態や体調変化と併せて確認してください。",
      78
    );
  }

  pushFinding(
    findings,
    "info",
    "ウェアラブル測定の注意点",
    "SpO2は装着状態、体動、末梢循環などの影響を受けやすい指標です。",
    "単発の低値だけで強く判断せず、連続傾向を重視してください。",
    20
  );

  return sortFindings(findings);
}

export function buildTempFindings(metrics) {
  const findings = [];
  const h = metrics?.health;
  if (!h) return findings;

  if (isValidNumber(h.healthTempMean)) {
    pushFinding(
      findings,
      "info",
      "平均体温の確認",
      `平均体温は${round1(h.healthTempMean)}℃です。`,
      "絶対値だけではなく、上昇傾向やばらつき増大の有無を重視してください。",
      40
    );
  }

  if (h.healthTempTrend?.direction === "up") {
    pushFinding(
      findings,
      "caution",
      "体温が上昇傾向です",
      "推移上、体温は上向いています。",
      "睡眠悪化、疲労感、体調不良感が重なっていないか確認してください。",
      82
    );
  } else if (h.healthTempTrend?.direction === "down") {
    pushFinding(
      findings,
      "info",
      "体温は低下傾向です",
      "推移上、体温はやや下向きです。",
      "測定時刻や環境条件による影響もあるため、他指標と合わせて解釈してください。",
      28
    );
  }

  if (isValidNumber(h.healthTempSd) && h.healthTempSd >= 0.3) {
    pushFinding(
      findings,
      "caution",
      "体温のばらつきが大きめです",
      `体温の標準偏差は${round1(h.healthTempSd)}℃です。`,
      "測定条件の差だけでなく、体調変化や生活リズムの乱れがないか確認してください。",
      72
    );
  }

  return sortFindings(findings);
}