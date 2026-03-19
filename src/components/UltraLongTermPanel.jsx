import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { analyzeUltraLongTerm } from "../utils/ultraLongTerm/analyzeUltraLongTerm";

function Card({ title, children, accent = "#334155" }) {
  return (
    <div
      style={{
        background: "var(--theme-card-bg, #fff)",
        borderRadius: 10,
        padding: "18px 22px",
        marginBottom: 14,
        borderLeft: `4px solid ${accent}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        transition: "background 0.3s",
      }}
    >
      {title && (
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--theme-text, #1e293b)",
          }}
        >
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--theme-sub-bg, #f8fafc)",
        borderRadius: 8,
        border: "1px solid var(--theme-border, #e2e8f0)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--theme-text-sub, #64748b)" }}>
        {label}
      </span>
      <p
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "var(--theme-text, #1e293b)",
          margin: "4px 0 0",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function RangeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: active
          ? "1px solid #3b82f6"
          : "1px solid var(--theme-border, #cbd5e1)",
        background: active
          ? "rgba(59,130,246,0.16)"
          : "var(--theme-card-bg, #fff)",
        color: active ? "#60a5fa" : "var(--theme-text, #0f172a)",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function normalizeChartData(metric) {
  const rawSeries = Array.isArray(metric?.chartSeries)
    ? metric.chartSeries
    : Array.isArray(metric?.chart)
    ? metric.chart
    : [];

  return rawSeries.map((d, idx) => ({
    idx,
    date: d?.date ?? d?.label ?? `#${idx + 1}`,
    label: d?.label ?? d?.date ?? `#${idx + 1}`,
    raw: d?.raw ?? d?.value ?? null,
    smooth: d?.smooth ?? null,
    fitted: d?.fitted ?? null,
    residual: d?.residual ?? null,
  }));
}

function formatMetricValue(value, suffix = "") {
  if (value == null || value === "") return "未取得";
  return suffix ? `${value}${suffix}` : String(value);
}

function sliceRowsByDays(rows, days) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (!days || rows.length <= days) return rows;
  return rows.slice(-days);
}

function UltraMetricCard({ metric }) {
  const chartData = normalizeChartData(metric);

  const hasChart = chartData.some(
    (d) => d.raw != null || d.smooth != null || d.fitted != null
  );

  const modelDisplay =
    metric.modelDisplay ||
    "21日中央値平滑化 → 自己相関ベース周期探索 → Cosinor fit → rolling-window stability";

  const axisTick = { fontSize: 12, fill: "var(--theme-text-sub, #64748b)" };
const tooltipStyle = {
  fontSize: 12,
  background: "var(--theme-card-bg, #fff)",
  color: "var(--theme-text, #1e293b)",
  border: "1px solid var(--theme-border, #e2e8f0)",
};

  return (
    <Card title={metric.label} accent="#7c3aed">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <InfoCell
          label="主周期"
          value={metric.dominantPeriod ? `${metric.dominantPeriod}日` : "未確定"}
        />
        <InfoCell
          label="副周期"
          value={metric.secondaryPeriod ? `${metric.secondaryPeriod}日` : "未確定"}
        />
        <InfoCell label="振幅" value={formatMetricValue(metric.amplitude)} />
        <InfoCell
          label="位相"
          value={metric.phase != null ? `${metric.phase}` : "未取得"}
        />
        <InfoCell
          label="安定性"
          value={
            metric.stability != null
              ? `${Math.round(metric.stability * 100)}%`
              : "未取得"
          }
        />
        <InfoCell
          label="信頼度"
          value={metric.confidence != null ? `${metric.confidence}%` : "0%"}
        />
        <InfoCell
          label="次の悪化予測窓"
          value={
            metric.riskWindowStart && metric.riskWindowEnd
              ? `${metric.riskWindowStart}〜${metric.riskWindowEnd}`
              : "未確定"
          }
        />
      </div>

      {hasChart ? (
        <Card title="周期可視化グラフ" accent="#2563eb">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 20, bottom: 10, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={axisTick} minTickGap={24} />
              <YAxis tick={axisTick} width={52} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  if (value == null) return ["—", name];
                  return [String(value), name];
                }}
                labelFormatter={(label) => `日付: ${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="raw"
                stroke="#2563eb"
                strokeWidth={2.2}
                dot={{ r: 2.5 }}
                name="生データ"
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="smooth"
                stroke="#10b981"
                strokeWidth={2.6}
                dot={false}
                name="21日中央値平滑"
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="fitted"
                stroke="#7c3aed"
                strokeWidth={2.6}
                strokeDasharray="6 4"
                dot={false}
                name="Cosinor周期フィット"
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      ) : (
        <Card accent="#94a3b8">
  <p
    style={{
      fontSize: 13,
      color: "var(--theme-text-sub, #64748b)",
      margin: 0,
    }}
  >
    グラフに表示できる系列データがありません。
  </p>
</Card>
      )}

      <Card title="周期所見" accent="#475569">
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.8,
            color: "var(--theme-text, #1e293b)",
            margin: 0,
          }}
        >
          {metric.summary || metric.finding || "所見はまだ生成されていません。"}
        </p>
      </Card>

      <Card title="使用モデル" accent="#475569">
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.8,
            color: "#334155",
            margin: 0,
          }}
        >
          {modelDisplay}
        </p>
      </Card>

      <Card title="予防的アドバイス" accent="#059669">
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.8,
            color: "#334155",
            margin: 0,
          }}
        >
          {metric.advice || "アドバイスはまだ生成されていません。"}
        </p>
      </Card>
    </Card>
  );
}

export default function UltraLongTermPanel({
  allRows = [],
  defaultDays = 90,
}) {
  const [selectedCategory, setSelectedCategory] = useState("sleep");
  const [days, setDays] = useState(defaultDays);

  const rangedRows = useMemo(() => sliceRowsByDays(allRows, days), [allRows, days]);
  const ultra = useMemo(() => analyzeUltraLongTerm(rangedRows), [rangedRows]);

  const sufficient = rangedRows.length >= 56;

  const items =
    selectedCategory === "sleep"
      ? ultra?.sleep || []
      : selectedCategory === "health"
      ? ultra?.health || []
      : ultra?.activity || [];

  const categoryButtonStyle = (selected, accent) => ({
  flex: 1,
  padding: "18px 16px",
  borderRadius: 12,
  cursor: "pointer",
  border: selected
    ? `2px solid ${accent}`
    : "1px solid var(--theme-border, #e2e8f0)",
  background: selected
    ? "var(--theme-card-bg, #fff)"
    : "var(--theme-sub-bg, #f8fafc)",
  boxShadow: selected
    ? "0 8px 20px rgba(15,23,42,0.12)"
    : "inset 0 0 0 1px rgba(148,163,184,0.08)",
  opacity: selected ? 1 : 0.78,
  transform: selected ? "translateY(-1px)" : "none",
  transition: "all 0.2s ease",
  textAlign: "center",
});

  if (!sufficient) {
    const remaining = Math.max(0, 56 - rangedRows.length);
    return (
      <Card accent="#f59e0b">
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          超長期分析には56日以上のデータが必要です。
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "6px 0 0" }}>
          現在のデータ: {rangedRows.length}日分
          {remaining > 0 && ` — あと${remaining}日分のデータが蓄積されると分析が開始されます`}
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card title={`超長期分析（直近${rangedRows.length}日）`} accent="#7c3aed">
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>
          対象期間: {rangedRows[0]?._date} 〜 {rangedRows[rangedRows.length - 1]?._date}
        </p>

        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setSelectedCategory("sleep")}
            style={categoryButtonStyle(selectedCategory === "sleep", "#2563eb")}
          >
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#2563eb" }}>
              睡眠
            </p>
            <p
  style={{
    margin: "6px 0 0",
    fontSize: 12,
    color: "var(--theme-text-sub, #64748b)",
  }}
>
              睡眠リズム、位相ずれ、長周期の反復
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("health")}
            style={categoryButtonStyle(selectedCategory === "health", "#059669")}
          >
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#059669" }}>
              体調
            </p>
            <p
  style={{
    margin: "6px 0 0",
    fontSize: 12,
    color: "var(--theme-text-sub, #64748b)",
  }}
>
              体調スコア、HR、HRV、ストレス、SpO2
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("activity")}
            style={categoryButtonStyle(selectedCategory === "activity", "#f59e0b")}
          >
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>
              活動
            </p>
           <p
  style={{
    margin: "6px 0 0",
    fontSize: 12,
    color: "var(--theme-text-sub, #64748b)",
  }}
>
              活動量、歩数、消費カロリー、QoLの周期
            </p>
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {[90, 180, 365, 730].map((d) => (
            <RangeButton key={d} active={days === d} onClick={() => setDays(d)}>
              直近{d}日
            </RangeButton>
          ))}
        </div>
      </Card>

      {items.map((metric) => (
        <UltraMetricCard key={metric.key} metric={metric} />
      ))}

      <Card accent="#94a3b8">
        <p
  style={{
    fontSize: 11,
    color: "var(--theme-text-sub, #64748b)",
    margin: "0 0 6px",
    lineHeight: 1.7,
  }}
>
          超長期分析では、「睡眠」「体調」「活動」を切り替えて個別に参照できる構成に変更しています。選択されていないカテゴリは意図的に控えめな表示とし、現在見ている分析対象が分かるようにしています。
        </p>
        <p
  style={{
    fontSize: 11,
    color: "var(--theme-text-muted, #94a3b8)",
    margin: 0,
    lineHeight: 1.7,
  }}
>
          また、欠測値は 0 として補完せず、記録が無い日として扱う前提です。そのため、記録のない期間では線が途切れることがありますが、これは誤った低値表示を避けるための仕様です。
        </p>
      </Card>
    </>
  );
}