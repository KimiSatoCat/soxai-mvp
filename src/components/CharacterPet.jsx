/**
 * CharacterPet.jsx
 * ─────────────────────────────────────────────────────────
 * ピクセルアート育成キャラの表示コンポーネント
 *
 * Props:
 *   growthState  — characterGrowth.computeGrowthState() の戻り値
 *   weather      — "storm" | "wind" | "calm" | "sunny" | "rainbow"
 *   isDarkMode   — ダークモード判定（背景との調和用）
 *
 * 画像差し替えポイント:
 *   PixelArtCanvas コンポーネント内の SVG 描画を
 *   <img src={stage.imageSrc} /> に置換すれば
 *   外部画像ファイルに切り替え可能。
 *   その場合 src/assets/characters/ 配下に配置する想定。
 * ─────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useMemo } from "react";
import {
  getSpeciesByIndex,
  getStageForLevel,
} from "../data/characterSpecies.js";
import * as growthModule from "../utils/characterGrowth.js";
import { saveCharacterState } from "../utils/characterStorage.js";
import {
  injectAnimationStyles,
  generateSparklePositions,
  generateRainDrops,
  generateWindStreaks,
} from "../utils/characterAnimation.js";
const XP_PER_LEVEL = growthModule.XP_PER_LEVEL ?? 25;
const MAX_LEVEL = growthModule.MAX_LEVEL ?? 100;
const WEATHER_EFFECTS = growthModule.WEATHER_EFFECTS ?? {
  storm:   { id: "storm",   label: "嵐",   icon: "⛈️", desc: "体調が大きく悪化" },
  wind:    { id: "wind",    label: "強風", icon: "💨", desc: "やや悪化傾向" },
  calm:    { id: "calm",    label: "穏やか", icon: "🍃", desc: "安定" },
  sunny:   { id: "sunny",   label: "晴れ", icon: "☀️", desc: "改善傾向" },
  rainbow: { id: "rainbow", label: "虹",   icon: "🌈", desc: "大幅改善！" },
};
console.log("CharacterPet file loaded");
console.log("CharacterPet import target: ../data/characterSpecies.js");
// ── ピクセルアートSVGレンダラ ────────────────────────────

function PixelArtCanvas({ pixelData, palette, size = 128 }) {
  if (!pixelData || !palette) return null;

  const rows = pixelData.length;
  const cols = pixelData[0]?.length || 16;
  const cellSize = size / Math.max(rows, cols);

  const rects = [];
  for (let y = 0; y < rows; y++) {
    const row = pixelData[y] || "";
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue; // 透明
      const color = palette[ch];
      if (!color) continue;
      rects.push(
        <rect
          key={`${y}-${x}`}
          x={x * cellSize}
          y={y * cellSize}
          width={cellSize + 0.5} // 隙間防止
          height={cellSize + 0.5}
          fill={color}
        />
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${cols * cellSize} ${rows * cellSize}`}
      width={size}
      height={size}
      style={{ imageRendering: "pixelated" }}
      className="soxai-pixel-canvas"
    >
      {rects}
    </svg>
  );
}

// ── 天候エフェクト重ね描画 ───────────────────────────────

function WeatherOverlay({ weather }) {
  const rainDrops = useMemo(() => generateRainDrops(14), []);
  const windStreaks = useMemo(() => generateWindStreaks(6), []);

  if (weather === "storm") {
    return (
      <>
        {rainDrops.map((d, i) => (
          <div
            key={`rain-${i}`}
            className="soxai-storm-drop"
            style={{
              left: d.left,
              top: "-10px",
              animationDelay: d.delay,
              animationDuration: d.duration,
            }}
          />
        ))}
        {/* 雷光 */}
        <div
          style={{
            position: "absolute",
            top: "5%",
            left: "20%",
            fontSize: 16,
            opacity: 0.7,
            animation: "soxai-idle-blink 2s step-end infinite",
          }}
        >
          ⚡
        </div>
      </>
    );
  }

  if (weather === "wind") {
    return (
      <>
        {windStreaks.map((s, i) => (
          <div
            key={`wind-${i}`}
            className="soxai-wind-streak"
            style={{
              top: s.top,
              left: "-20px",
              width: s.width,
              animationDelay: s.delay,
            }}
          />
        ))}
      </>
    );
  }

  if (weather === "sunny") {
    return (
      <>
        <div
          className="soxai-sun-glow"
          style={{
            top: "-20%",
            right: "-10%",
            width: "80px",
            height: "80px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "8%",
            right: "8%",
            fontSize: 18,
            opacity: 0.8,
          }}
        >
          ☀️
        </div>
      </>
    );
  }

  if (weather === "rainbow") {
    return (
      <>
        <div
          className="soxai-sun-glow"
          style={{
            top: "-15%",
            right: "-5%",
            width: "60px",
            height: "60px",
          }}
        />
        {/* 虹アーチ — CSS border-image は厳密には効かないので
            linear-gradient背景で虹を表現 */}
        <div
          style={{
            position: "absolute",
            top: "5%",
            left: "10%",
            width: "80%",
            height: "40px",
            borderRadius: "80px 80px 0 0",
            background:
              "linear-gradient(90deg, #ef444466, #f9731666, #eab30866, #22c55e66, #3b82f666, #8b5cf666)",
            opacity: 0.6,
            animation: "soxai-rainbow-arc 2s ease-out forwards",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "6%",
            right: "12%",
            fontSize: 16,
          }}
        >
          🌈
        </div>
      </>
    );
  }

  // calm — 穏やかなパーティクル
  return (
    <div
      style={{
        position: "absolute",
        bottom: "15%",
        right: "15%",
        fontSize: 14,
        opacity: 0.5,
        animation: "soxai-idle-bounce 3s ease-in-out infinite",
      }}
    >
      🍃
    </div>
  );
}

// ── 進化演出オーバーレイ ─────────────────────────────────

function EvolutionOverlay({ active }) {
  const sparkles = useMemo(() => generateSparklePositions(10), []);

  if (!active) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      {sparkles.map((s, i) => (
        <div
          key={`spark-${i}`}
          className="soxai-evolve-sparkle"
          style={{
            top: s.top,
            left: s.left,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}

// ── メインコンポーネント ─────────────────────────────────

export default function CharacterPet({ growthState, weather = "calm", isDarkMode = false }) {
  const [evolving, setEvolving] = useState(false);
  const prevStageRef = useRef(null);

  // アニメーション注入（初回のみ）
  useEffect(() => {
    injectAnimationStyles();
  }, []);

  // 進化検出
  useEffect(() => {
  if (!growthState) return;

  const currentStage = growthState.stageIndex;

  if (prevStageRef.current !== null && currentStage > prevStageRef.current) {
    setEvolving(true);
    const timer = setTimeout(() => setEvolving(false), 2800);
    prevStageRef.current = currentStage;
    return () => clearTimeout(timer);
  }

  prevStageRef.current = currentStage;
}, [growthState?.stageIndex]);

  // 状態保存
  useEffect(() => {
    if (growthState && growthState.originDate) {
      saveCharacterState(growthState);
    }
  }, [growthState?.totalXP, growthState?.level]);

  if (!growthState) {
    return (
      <div
        style={{
          background: isDarkMode ? "#1e293b" : "#f8fafc",
          borderRadius: 12,
          padding: "18px 20px",
          marginBottom: 14,
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: isDarkMode ? "#94a3b8" : "#64748b",
            margin: 0,
          }}
        >
          データを取得すると育成キャラが表示されます
        </p>
      </div>
    );
  }

  const species = getSpeciesByIndex(growthState.speciesIndex);
  const stage = getStageForLevel(species, growthState.level);
  const weatherEffect = WEATHER_EFFECTS[weather] || WEATHER_EFFECTS.calm;
  const weatherClass = `soxai-weather-${weather}`;
  const isStorm = weather === "storm" || weather === "wind";

  const xpProgress = growthState.isMax
    ? 100
    : Math.min(100, (growthState.xpInLevel / XP_PER_LEVEL) * 100);

  const xpBarColor = growthState.isMax
    ? "linear-gradient(90deg, #f59e0b, #eab308)"
    : "linear-gradient(90deg, #34d399, #059669)";

  return (
    <div
      className={`soxai-char-container ${weatherClass}`}
      style={{
        borderRadius: 12,
        padding: "18px 20px",
        marginBottom: 14,
        border: `2px solid ${isStorm ? "#475569" : "#86efac"}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.5s, border-color 0.4s",
      }}
    >
      {/* 天候エフェクト */}
      <WeatherOverlay weather={weather} />

      {/* 進化演出 */}
      <EvolutionOverlay active={evolving} />

      {/* タイトル行 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
          position: "relative",
          zIndex: 2,
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            margin: 0,
            color: isStorm ? "#e2e8f0" : "#475569",
          }}
        >
          🌿 フルーツ育成
        </p>
        <span
          style={{
            fontSize: 9,
            padding: "1px 6px",
            borderRadius: 4,
            background: "#f59e0b22",
            color: "#b45309",
            fontWeight: 600,
          }}
        >
          ピクセルアート
        </span>
        <span
          style={{
            fontSize: 9,
            padding: "1px 6px",
            borderRadius: 4,
            marginLeft: "auto",
            background: isStorm ? "rgba(255,255,255,0.1)" : "#eff6ff",
            color: isStorm ? "#93c5fd" : "#2563eb",
            fontWeight: 600,
          }}
        >
          {weatherEffect.icon} {weatherEffect.label}
        </span>
      </div>

      {/* Lv.100 祝賀 */}
      {growthState.isMax && (
        <div
          style={{
            background: "linear-gradient(135deg, #fef9c3, #fde68a)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 12,
            border: "1px solid #f59e0b",
            textAlign: "center",
            position: "relative",
            zIndex: 2,
          }}
        >
          <p style={{ fontSize: 16, margin: "0 0 4px" }}>
            🎉🎊 Lv.100 到達おめでとう！ 🎊🎉
          </p>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#92400e",
              margin: 0,
            }}
          >
            {stage.name}（{species.name}）が完全体に成長しました！
          </p>
        </div>
      )}

      {/* キャラ行 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* ピクセルアートキャラ */}
        <div
          className={evolving ? "soxai-evolve-active" : "soxai-char-idle"}
          style={{
            width: 96,
            height: 96,
            borderRadius: 12,
            background: isStorm
              ? "rgba(255,255,255,0.08)"
              : "rgba(255,255,255,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <PixelArtCanvas
            pixelData={stage.pixelData}
            palette={species.palette}
            size={80}
          />
        </div>

        {/* 情報 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 10,
              margin: "0 0 1px",
              fontWeight: 500,
              color: isStorm ? "#94a3b8" : "#64748b",
            }}
          >
            {species.name}
          </p>
          <p
            style={{
              fontSize: 16,
              fontWeight: 800,
              margin: "0 0 2px",
              color: isStorm ? "#f1f5f9" : "#1e293b",
            }}
          >
            {stage.name}
          </p>
          <p
            style={{
              fontSize: 10,
              margin: "0 0 8px",
              color: isStorm ? "#94a3b8" : "#64748b",
              fontStyle: "italic",
            }}
          >
            {stage.desc}
          </p>

          {/* レベル・進化情報 */}
          <p
            style={{
              fontSize: 11,
              margin: "0 0 6px",
              color: isStorm ? "#cbd5e1" : "#475569",
              fontWeight: 600,
            }}
          >
            Lv.{growthState.level}
            {growthState.isMax ? " (MAX)" : ""}
            <span
              style={{
                fontWeight: 400,
                marginLeft: 8,
                color: isStorm ? "#94a3b8" : "#64748b",
              }}
            >
              進化 {growthState.stageIndex + 1}/4段階
            </span>
            <span
              style={{
                fontWeight: 400,
                marginLeft: 8,
                color: isStorm ? "#64748b" : "#94a3b8",
              }}
            >
              総XP {growthState.totalXP}
            </span>
          </p>

          {/* XPゲージ */}
          <div
            style={{
              width: "100%",
              height: 10,
              borderRadius: 5,
              background: isStorm ? "rgba(255,255,255,0.15)" : "#e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${xpProgress}%`,
                height: "100%",
                borderRadius: 5,
                background: xpBarColor,
                transition: "width 0.5s ease",
              }}
            />
          </div>

          <p
            style={{
              fontSize: 9,
              margin: "3px 0 0",
              color: isStorm ? "#64748b" : "#94a3b8",
            }}
          >
            {growthState.isMax
              ? "Lv.100 到達済 — 完全体を堪能してください"
              : `次のレベルまで ${growthState.xpForNext} XP`}
          </p>
        </div>
      </div>

      {/* 天候・データ詳細 */}
      <div
        style={{
          marginTop: 10,
          padding: "6px 10px",
          borderRadius: 6,
          background: isStorm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          position: "relative",
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: 14 }}>{weatherEffect.icon}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: isStorm ? "#e2e8f0" : "#475569",
          }}
        >
          環境: {weatherEffect.label}（{weatherEffect.desc}）
        </span>
        {growthState.dayCount > 0 && (
          <span
            style={{
              fontSize: 9,
              marginLeft: "auto",
              color: isStorm ? "#64748b" : "#94a3b8",
            }}
          >
            起点日: {growthState.originDate} / {growthState.dayCount}日分
          </span>
        )}
      </div>

      {/* 育成ロジック詳細（折りたたみ） */}
      <details style={{ marginTop: 8, position: "relative", zIndex: 2 }}>
        <summary
          style={{
            fontSize: 10,
            cursor: "pointer",
            color: isStorm ? "#94a3b8" : "#64748b",
          }}
        >
          育成ロジック詳細（本ツール独自演出）
        </summary>
        <div
          style={{
            fontSize: 10,
            lineHeight: 1.7,
            marginTop: 4,
            padding: "8px 10px",
            borderRadius: 6,
            background: isStorm ? "rgba(255,255,255,0.05)" : "#f8fafc",
            color: isStorm ? "#94a3b8" : "#64748b",
          }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: 600, color: isStorm ? "#cbd5e1" : "#475569" }}>
            経験値ルール
          </p>
          <p style={{ margin: "0 0 2px" }}>・起点日（データ最古日）は Lv.1、XP=0</p>
          <p style={{ margin: "0 0 2px" }}>・以降の日: データ存在で +10 XP</p>
          <p style={{ margin: "0 0 2px" }}>・3スコア平均 85以上: +8 / 70以上: +5 / 55以上: +3 / 40以上: +1</p>
          <p style={{ margin: "0 0 2px" }}>・日次上限: 18 XP</p>
          <p style={{ margin: "0 0 8px" }}>・{XP_PER_LEVEL} XP ごとにレベルアップ（上限 Lv.{MAX_LEVEL}）</p>

          <p style={{ margin: "0 0 4px", fontWeight: 600, color: isStorm ? "#cbd5e1" : "#475569" }}>
            進化条件
          </p>
          <p style={{ margin: "0 0 2px" }}>・Lv.1〜24: 第1段階（タネ）</p>
          <p style={{ margin: "0 0 2px" }}>・Lv.25〜49: 第2段階（成長）</p>
          <p style={{ margin: "0 0 2px" }}>・Lv.50〜69: 第3段階（つぼみ）</p>
          <p style={{ margin: "0 0 8px" }}>・Lv.70〜100: 第4段階（最終形態）</p>

          <p style={{ margin: "0 0 4px", fontWeight: 600, color: isStorm ? "#cbd5e1" : "#475569" }}>
            天候エフェクト（前日と前々日を比較しております）
          </p>
          <p style={{ margin: "0 0 2px" }}>・差分 ≤ -15: 嵐 / ≤ -5: 強風</p>
          <p style={{ margin: "0 0 2px" }}>・|差分| {'<'} 5: 穏やか</p>
          <p style={{ margin: "0 0 8px" }}>・差分 ≥ 5: 晴れ / ≥ 15: 虹</p>

          <p style={{ margin: "0 0 4px", fontWeight: 600, color: isStorm ? "#cbd5e1" : "#475569" }}>
            現在の状態
          </p>
          <p style={{ margin: "0 0 2px" }}>・系統: {species.name}（{species.personality}）</p>
          <p style={{ margin: "0 0 2px" }}>・起点日: {growthState.originDate || "—"}</p>
          <p style={{ margin: 0 }}>
            ・総XP: {growthState.totalXP} / データ日数: {growthState.dayCount}
          </p>
        </div>
      </details>
    </div>
  );
}
