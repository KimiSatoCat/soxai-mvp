/**
 * buildTcmAnnotations.js
 *
 * 検出された周期に中医学・東洋医学の理論的文脈を付与する。
 * 診断・医療行為ではなく、研究・参考目的の注釈のみを生成する。
 *
 * 主な参考理論：
 *   - 素問「生気通天論」「四気調神大論」
 *   - 陰陽消長の七日節律（七損八益）
 *   - 月節律（月経・月周期との関連）
 *   - 五運六気（72日季節周期）
 *   - 六十甲子（60日周期）
 */

/**
 * 候補周期の日数から TCM 理論上の対応周期名を返す。
 * 複数の候補を返す（1つの観測周期が複数の理論と対応し得るため）。
 *
 * @param {number} period  - 検出された主周期（日数）
 * @returns {Array<{name: string, days: string, theory: string, note: string}>}
 */
export function matchTcmPeriod(period) {
  if (period == null || !Number.isFinite(period)) return [];

  const matches = [];

  // 7日：七日節律 / 陽気の七日周期
  if (period >= 6 && period <= 8) {
    matches.push({
      name: "七日節律",
      days: "7日",
      theory: "素問・上古天真論 / 陰陽消長",
      note:
        "素問の「七損八益」に基づく陽気の7日周期。男性の8年・女性の7年周期の基本単位とされる。週間スケジュールの社会的影響との交絡に注意。",
    });
  }

  // 14日：二七節律 / 隔週リズム
  if (period >= 13 && period <= 16) {
    matches.push({
      name: "二七（隔週）節律",
      days: "14日",
      theory: "七日節律の倍周期 / 月相（上弦・下弦）",
      note:
        "七日節律の2倍周期。月相の上弦・下弦（約14日間隔）と対応し、陰陽転換の節目と考えられる。",
    });
  }

  // 21日：三七節律
  if (period >= 19 && period <= 23) {
    matches.push({
      name: "三七節律",
      days: "21日",
      theory: "七日節律の3倍周期",
      note:
        "七日節律の3倍周期。長期的な気力・体力変動の観察に用いられる。",
    });
  }

  // 28-30日：月節律 / 月経周期
  if (period >= 25 && period <= 32) {
    matches.push({
      name: "月節律（朔望周期）",
      days: "28–30日",
      theory: "素問・八正神明論 / 朔望月",
      note:
        "「月始生則気血始精」（素問・八正神明論）。月の満ち欠けに同期した気血の消長周期。月経周期との対応としても古典に記載がある。",
    });
  }

  // 60日：六十甲子 / 一甲周期の1/6
  if (period >= 55 && period <= 65) {
    matches.push({
      name: "六十甲子サイクル単位",
      days: "60日",
      theory: "五運六気 / 六十甲子",
      note:
        "五運六気における60年周期の1/365スケールの縮図として捉える研究的視点。60日は客気の一気（60日）にも相当する。",
    });
  }

  // 72日：五季（五運の各季節）
  if (period >= 68 && period <= 76) {
    matches.push({
      name: "五季（五運一季）",
      days: "72–73日",
      theory: "五運六気 / 素問・六節蔵象論",
      note:
        "一年365日を五行（木火土金水）に配当した五季の単位（72〜73日）。五臓の気が順に旺じる季節周期に対応する。",
    });
  }

  // 90日：四季（1/4年）
  if (period >= 85 && period <= 95) {
    matches.push({
      name: "四季節律（一季）",
      days: "90–92日",
      theory: "四時養生 / 素問・四気調神大論",
      note:
        "「春夏養陽、秋冬養陰」の四季養生論における一季の長さ。90日は一季の自然な変動周期と対応する可能性がある。",
    });
  }

  // 180日：半年
  if (period >= 170 && period <= 190) {
    matches.push({
      name: "半年節律",
      days: "180–182日",
      theory: "二至（夏至・冬至） / 陰陽の大転換",
      note:
        "夏至から冬至、あるいは冬至から夏至の期間。陰陽の大きな転換点（二至）に対応する半年周期。",
    });
  }

  // 365日：年節律
  if (period >= 350 && period <= 380) {
    matches.push({
      name: "歳節律（年節律）",
      days: "365日",
      theory: "五運六気 / 素問・天元紀大論",
      note:
        "一年の気の巡りに対応する最大周期。五運六気における年運の単位。",
    });
  }

  // 候補なし（TCM理論に直接対応しない周期）
  if (matches.length === 0) {
    // 一般的なコメントのみ
    if (period < 6) {
      matches.push({
        name: "超短期変動",
        days: `${period}日`,
        theory: "日内変動 / 昼夜リズム",
        note:
          "七日節律より短い変動。日内リズムや計測誤差の影響を考慮する必要がある。",
      });
    } else {
      matches.push({
        name: "経験的周期",
        days: `${period}日`,
        theory: "—",
        note:
          `約${period}日の周期。現在の中医学古典には直接対応する理論周期が見当たらないが、個人差や生活環境の影響を反映した経験的なリズムとして解釈できる。`,
      });
    }
  }

  return matches;
}

/**
 * 周期分析結果のセット（複数指標）から TCM 注釈オブジェクトを生成する。
 *
 * @param {Object} metricsMap  - { [metricKey]: { dominantPeriod, confidence, label } }
 * @returns {Object} - { byPeriod: {...}, annotations: string[], researchNotes: string[] }
 */
export function buildTcmAnnotations(metricsMap) {
  if (!metricsMap || typeof metricsMap !== "object") {
    return { byPeriod: {}, annotations: [], researchNotes: [] };
  }

  const byPeriod = {};
  const annotations = [];
  const researchNotes = [];

  for (const [key, metric] of Object.entries(metricsMap)) {
    const period = metric?.dominantPeriod;
    const conf = metric?.confidence ?? 0;
    const label = metric?.label ?? key;

    if (period == null || conf < 20) continue;

    const tcmMatches = matchTcmPeriod(period);
    byPeriod[key] = { period, confidence: conf, label, tcmMatches };

    for (const m of tcmMatches) {
      if (m.name !== "経験的周期" && m.name !== "超短期変動") {
        annotations.push(
          `【${label}】${m.name}（${m.days}）が検出されています（信頼度 ${conf}%）。`
        );
        researchNotes.push(
          `${label} — 理論: ${m.theory} / ${m.note}`
        );
      }
    }
  }

  if (annotations.length === 0) {
    annotations.push(
      "現時点では中医学理論に対応する明確な周期は検出されていません。データ蓄積（56日以上）とともに精度が向上します。"
    );
  }

  return { byPeriod, annotations, researchNotes };
}
