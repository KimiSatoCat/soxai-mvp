/**
 * characterStorage.js
 * ─────────────────────────────────────────────────────────
 * キャラ育成状態の永続化（localStorage）
 *
 * 保存キー: "soxai_character_state"
 *
 * 保存データ形式:
 * {
 *   version: 1,
 *   speciesIndex: number,   // 割り当て系統インデックス (0-6)
 *   originDate: string,     // データ取得開始日 "YYYY-MM-DD"
 *   totalXP: number,        // 累積XP
 *   level: number,          // 現在レベル
 *   stageIndex: number,     // 現在進化段階 (0-3)
 *   lastSyncDate: string,   // 最終同期日
 *   evolvedStages: number[] // 進化済み段階の記録（演出管理用）
 * }
 * ─────────────────────────────────────────────────────────
 */

const STORAGE_KEY = "soxai_character_state";
const CURRENT_VERSION = 1;

/**
 * 保存済み状態を読み込む
 * @returns {object|null}
 */
export function loadCharacterState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== CURRENT_VERSION) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * 状態を保存する
 * @param {object} state
 */
export function saveCharacterState(state) {
  try {
    const saved = loadCharacterState();

    const data = {
      version: CURRENT_VERSION,
      speciesIndex: state?.speciesIndex ?? saved?.speciesIndex ?? 0,
      originDate: state?.originDate ?? saved?.originDate ?? null,
      totalXP: state?.totalXP ?? saved?.totalXP ?? 0,
      level: state?.level ?? saved?.level ?? 1,
      stageIndex: state?.stageIndex ?? saved?.stageIndex ?? 0,
      lastSyncDate:
        state?.latestDate ?? state?.lastSyncDate ?? saved?.lastSyncDate ?? null,
      evolvedStages: state?.evolvedStages ?? saved?.evolvedStages ?? [0],
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[characterStorage] 保存失敗:", e);
  }
}

/**
 * 保存済み状態をクリアする（デバッグ・リセット用）
 */
export function clearCharacterState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

/**
 * 進化済み段階を更新する
 * 未記録の段階なら true を返す
 * @param {number} currentStageIndex
 * @returns {boolean}
 */
export function checkAndRecordEvolution(currentStageIndex) {
  const saved = loadCharacterState();
  if (!saved) return false;

  const recorded = Array.isArray(saved.evolvedStages)
    ? [...saved.evolvedStages]
    : [0];

  if (recorded.includes(currentStageIndex)) return false;

  recorded.push(currentStageIndex);

  saveCharacterState({
    ...saved,
    evolvedStages: recorded,
  });

  return true;
}