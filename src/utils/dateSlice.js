export const ANALYSIS_WINDOWS = {
  short: 7,
  long: 30,
  ultra: 56,
};

export const MIN_REQUIRED_DAYS = {
  short: 2,
  long: 14,
  ultra: 56,
};

export function sliceByLastNDays(rows = [], days = 7) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.slice(-days);
}