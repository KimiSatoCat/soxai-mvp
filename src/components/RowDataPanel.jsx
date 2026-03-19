import { useMemo, useState } from "react";

function Card({ title, children, accent = "#334155" }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 16,
          marginBottom: 12,
          color: accent,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
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

function formatDateLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, delta) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + delta);
  return formatDateLocal(d);
}

function escapeCsv(value) {
  if (value == null) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows = []) {
  if (!rows.length) return "";
  const keys = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );

  const header = keys.map(escapeCsv).join(",");
  const body = rows
    .map((row) => keys.map((k) => escapeCsv(row?.[k])).join(","))
    .join("\n");

  return `${header}\n${body}`;
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function filterByRange(rows = [], startDate, endDate) {
  return rows.filter((row) => {
    const d = getDateLabel(row);
    if (!d) return false;
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });
}

const PRESETS = [
  { label: "1ヶ月", days: 30 },
  { label: "3ヶ月", days: 90 },
  { label: "6ヶ月", days: 180 },
  { label: "9ヶ月", days: 270 },
  { label: "1年", days: 365 },
  { label: "2年", days: 730 },
  { label: "3年", days: 1095 },
  { label: "4年", days: 1460 },
  { label: "5年", days: 1825 },
  { label: "10年", days: 3650 },
  { label: "20年", days: 7300 },
  { label: "30年", days: 10950 },
];

export default function RowDataPanel({
  infoRows = [],
  detailRows = [],
  normalizedRows = [],
}) {
  const datePool = useMemo(() => {
    const xs = [...infoRows, ...detailRows, ...normalizedRows]
      .map(getDateLabel)
      .filter(Boolean)
      .sort();
    return xs;
  }, [infoRows, detailRows, normalizedRows]);

  const availableMin = datePool[0] || "";
  const availableMax = datePool[datePool.length - 1] || "";

  const [presetDays, setPresetDays] = useState(90);
  const [mode, setMode] = useState("preset");
  const [customStart, setCustomStart] = useState(availableMin);
  const [customEnd, setCustomEnd] = useState(availableMax);
  const [confirmedRange, setConfirmedRange] = useState(null);

  const preview = useMemo(() => {
    let startDate = "";
    let endDate = "";

    if (mode === "preset") {
      endDate = availableMax;
      startDate = availableMax ? addDays(availableMax, -(presetDays - 1)) : "";
    } else {
      startDate = customStart || "";
      endDate = customEnd || "";
    }

    const info = filterByRange(infoRows, startDate, endDate);
    const detail = filterByRange(detailRows, startDate, endDate);
    const normalized = filterByRange(normalizedRows, startDate, endDate);

    return {
      startDate,
      endDate,
      info,
      detail,
      normalized,
      bytes:
        new Blob([
          toCsv(info),
          "\n",
          toCsv(detail),
          "\n",
          toCsv(normalized),
        ]).size,
    };
  }, [mode, presetDays, customStart, customEnd, availableMax, infoRows, detailRows, normalizedRows]);

  function handleConfirm() {
    setConfirmedRange(preview);
  }

  function handleDownload() {
    if (!confirmedRange) return;

    const start = confirmedRange.startDate || "unknown_start";
    const end = confirmedRange.endDate || "unknown_end";

    if (!confirmedRange.info.length && !confirmedRange.detail.length && !confirmedRange.normalized.length) {
      window.alert("指定範囲にデータがありません。");
      return;
    }

    if (confirmedRange.info.length) {
      triggerDownload(
        `soxai_raw_daily_info_${start}_${end}.csv`,
        toCsv(confirmedRange.info)
      );
    }
    if (confirmedRange.detail.length) {
      triggerDownload(
        `soxai_raw_daily_detail_${start}_${end}.csv`,
        toCsv(confirmedRange.detail)
      );
    }
    if (confirmedRange.normalized.length) {
      triggerDownload(
        `soxai_normalized_daily_${start}_${end}.csv`,
        toCsv(confirmedRange.normalized)
      );
    }
  }

  return (
    <div>
      <Card title="ROW DATA" accent="#475569">
        <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.8 }}>
          取得範囲を選択し、確定後に raw_daily_info、raw_daily_detail、normalized_daily のCSVをダウンロードします。
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setMode("preset")}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: mode === "preset" ? "1px solid #0f172a" : "1px solid #cbd5e1",
              background: mode === "preset" ? "#0f172a" : "#fff",
              color: mode === "preset" ? "#fff" : "#0f172a",
              cursor: "pointer",
            }}
          >
            プリセット
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: mode === "custom" ? "1px solid #0f172a" : "1px solid #cbd5e1",
              background: mode === "custom" ? "#0f172a" : "#fff",
              color: mode === "custom" ? "#fff" : "#0f172a",
              cursor: "pointer",
            }}
          >
            手動範囲
          </button>
        </div>

        {mode === "preset" && (
          <div style={{ marginTop: 16 }}>
            <select
              value={presetDays}
              onChange={(e) => setPresetDays(Number(e.target.value))}
              style={{
                padding: 10,
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                minWidth: 220,
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.days} value={p.days}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "custom" && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>開始日</div>
              <input
                type="date"
                value={customStart}
                min={availableMin}
                max={availableMax}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>終了日</div>
              <input
                type="date"
                value={customEnd}
                min={availableMin}
                max={availableMax}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
              />
            </div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            確定
          </button>
        </div>
      </Card>

      {confirmedRange && (
        <Card title="ダウンロード確認" accent="#1e293b">
          <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
            <div>対象期間: {confirmedRange.startDate || "-"} 〜 {confirmedRange.endDate || "-"}</div>
            <div>Daily Info 件数: {confirmedRange.info.length}</div>
            <div>Daily Detail 件数: {confirmedRange.detail.length}</div>
            <div>Normalized Daily 件数: {confirmedRange.normalized.length}</div>
            <div>推定サイズ: {Math.round((confirmedRange.bytes || 0) / 1024)} KB</div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={handleDownload}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid #1d4ed8",
                background: "#1d4ed8",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              CSVダウンロード
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}