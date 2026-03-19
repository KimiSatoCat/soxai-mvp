/**
 * characterAnimation.js
 * ─────────────────────────────────────────────────────────
 * CSSアニメーション定義ユーティリティ
 *
 * 3種のアニメーション:
 *   1. 通常待機（idle）: 軽い上下動 + まばたき風
 *   2. 進化演出（evolve）: 光・点滅・変身感
 *   3. 天候エフェクト（weather）: storm/wind/calm/sunny/rainbow
 *
 * 使い方:
 *   injectAnimationStyles() を一度呼ぶとグローバルに注入される
 * ─────────────────────────────────────────────────────────
 */

let injected = false;

/**
 * CSSキーフレームとアニメーションクラスをドキュメントに注入
 * 複数回呼んでもOK（冪等）
 */
export function injectAnimationStyles() {
  if (injected) return;
  injected = true;

  const style = document.createElement("style");
  style.id = "soxai-character-animations";
  style.textContent = `
/* ═══════════════════════════════════════
   Character Idle Animation
   ═══════════════════════════════════════ */

@keyframes soxai-idle-bounce {
  0%, 100% { transform: translateY(0px); }
  50%      { transform: translateY(-3px); }
}

@keyframes soxai-idle-blink {
  0%, 90%, 100% { opacity: 1; }
  95%           { opacity: 0.3; }
}

.soxai-char-idle {
  animation: soxai-idle-bounce 2.5s ease-in-out infinite;
}

.soxai-char-blink {
  animation: soxai-idle-blink 4s step-end infinite;
}

/* ═══════════════════════════════════════
   Evolution Animation
   ═══════════════════════════════════════ */

@keyframes soxai-evolve-glow {
  0%   { filter: brightness(1) saturate(1); box-shadow: 0 0 0 0 rgba(255,255,200,0); }
  15%  { filter: brightness(2) saturate(0.3); box-shadow: 0 0 30px 10px rgba(255,255,200,0.8); }
  30%  { filter: brightness(3) saturate(0); box-shadow: 0 0 50px 20px rgba(255,255,255,0.9); }
  50%  { filter: brightness(4) saturate(0); box-shadow: 0 0 60px 25px rgba(255,255,255,1); }
  70%  { filter: brightness(2) saturate(0.5); box-shadow: 0 0 30px 10px rgba(255,255,200,0.6); }
  100% { filter: brightness(1) saturate(1); box-shadow: 0 0 0 0 rgba(255,255,200,0); }
}

@keyframes soxai-evolve-scale {
  0%   { transform: scale(1); }
  25%  { transform: scale(1.1); }
  50%  { transform: scale(0.9); }
  75%  { transform: scale(1.15); }
  100% { transform: scale(1); }
}

@keyframes soxai-evolve-sparkle {
  0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
  20%      { opacity: 1; transform: scale(1.2) rotate(72deg); }
  40%      { opacity: 0.8; transform: scale(0.8) rotate(144deg); }
  60%      { opacity: 1; transform: scale(1) rotate(216deg); }
  80%      { opacity: 0.5; transform: scale(0.6) rotate(288deg); }
}

.soxai-evolve-active {
  animation: soxai-evolve-glow 2.5s ease-in-out forwards,
             soxai-evolve-scale 2.5s ease-in-out forwards;
}

.soxai-evolve-sparkle {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, #fffde7, #ffd54f);
  animation: soxai-evolve-sparkle 2.5s ease-in-out forwards;
  pointer-events: none;
}

/* ═══════════════════════════════════════
   Weather Effect Animations
   ═══════════════════════════════════════ */

/* Storm — 暗雲・雨・雷 */
@keyframes soxai-storm-rain {
  0%   { transform: translateY(-20px) translateX(0); opacity: 1; }
  100% { transform: translateY(100px) translateX(-10px); opacity: 0; }
}

@keyframes soxai-storm-flash {
  0%, 94%, 100% { background: transparent; }
  95%, 97%      { background: rgba(255,255,255,0.3); }
}

@keyframes soxai-storm-shake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-2px); }
  75%      { transform: translateX(2px); }
}

.soxai-weather-storm {
  background: linear-gradient(180deg, #1a1a2e 0%, #2d2d44 100%) !important;
  animation: soxai-storm-flash 3s infinite;
}

.soxai-weather-storm .soxai-char-idle {
  animation: soxai-storm-shake 0.4s infinite, soxai-idle-bounce 2.5s ease-in-out infinite;
}

.soxai-storm-drop {
  position: absolute;
  width: 2px;
  height: 10px;
  background: linear-gradient(180deg, rgba(120,160,255,0.8), rgba(120,160,255,0));
  animation: soxai-storm-rain 0.6s linear infinite;
  pointer-events: none;
}

/* Wind — 風線 */
@keyframes soxai-wind-line {
  0%   { transform: translateX(-40px) scaleX(0.3); opacity: 0; }
  30%  { opacity: 0.7; }
  100% { transform: translateX(120px) scaleX(1); opacity: 0; }
}

@keyframes soxai-wind-sway {
  0%, 100% { transform: rotate(0deg) translateX(0); }
  25%      { transform: rotate(-2deg) translateX(2px); }
  75%      { transform: rotate(2deg) translateX(-2px); }
}

.soxai-weather-wind {
  background: linear-gradient(180deg, #1e293b 0%, #334155 100%) !important;
}

.soxai-weather-wind .soxai-char-idle {
  animation: soxai-wind-sway 1.5s ease-in-out infinite, soxai-idle-bounce 2.5s ease-in-out infinite;
}

.soxai-wind-streak {
  position: absolute;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, rgba(148,163,184,0.6), transparent);
  animation: soxai-wind-line 1.2s linear infinite;
  pointer-events: none;
}

/* Calm — 穏やかな静止 */
.soxai-weather-calm {
  background: linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%) !important;
}

/* Sunny — 日差し */
@keyframes soxai-sun-ray {
  0%   { opacity: 0.3; transform: scale(0.95); }
  50%  { opacity: 0.6; transform: scale(1.05); }
  100% { opacity: 0.3; transform: scale(0.95); }
}

@keyframes soxai-sun-particle {
  0%   { opacity: 0; transform: translateY(0) scale(0); }
  50%  { opacity: 1; transform: translateY(-15px) scale(1); }
  100% { opacity: 0; transform: translateY(-30px) scale(0.5); }
}

.soxai-weather-sunny {
  background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%) !important;
}

.soxai-sun-glow {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(251,191,36,0.3), transparent 70%);
  animation: soxai-sun-ray 3s ease-in-out infinite;
  pointer-events: none;
}

/* Rainbow — 虹 */
@keyframes soxai-rainbow-arc {
  0%   { opacity: 0; transform: scaleY(0); }
  30%  { opacity: 0.8; transform: scaleY(1); }
  100% { opacity: 0.5; transform: scaleY(1); }
}

@keyframes soxai-rainbow-shimmer {
  0%, 100% { filter: hue-rotate(0deg) brightness(1); }
  50%      { filter: hue-rotate(30deg) brightness(1.1); }
}

.soxai-weather-rainbow {
  background: linear-gradient(180deg, #eff6ff 0%, #faf5ff 50%, #fff7ed 100%) !important;
}

.soxai-rainbow-arc {
  position: absolute;
  border-radius: 50%;
  border-top: 4px solid transparent;
  border-image: linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #8b5cf6) 1;
  border-image-slice: 1;
  animation: soxai-rainbow-arc 2s ease-out forwards, soxai-rainbow-shimmer 4s ease-in-out infinite;
  pointer-events: none;
}

/* ═══════════════════════════════════════
   Shared Utility Classes
   ═══════════════════════════════════════ */

.soxai-pixel-canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.soxai-char-container {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  transition: background 0.5s ease;
}
`;

  document.head.appendChild(style);
}

/**
 * 進化スパークル用の位置配列を生成
 * @param {number} count - パーティクル数
 * @returns {Array<{top, left, delay}>}
 */
export function generateSparklePositions(count = 8) {
  const sparkles = [];
  for (let i = 0; i < count; i++) {
    sparkles.push({
      top: `${15 + Math.random() * 70}%`,
      left: `${10 + Math.random() * 80}%`,
      delay: `${i * 0.15}s`,
    });
  }
  return sparkles;
}

/**
 * 嵐の雨滴位置配列を生成
 */
export function generateRainDrops(count = 12) {
  const drops = [];
  for (let i = 0; i < count; i++) {
    drops.push({
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 0.6}s`,
      duration: `${0.4 + Math.random() * 0.3}s`,
    });
  }
  return drops;
}

/**
 * 風線位置配列を生成
 */
export function generateWindStreaks(count = 5) {
  const streaks = [];
  for (let i = 0; i < count; i++) {
    streaks.push({
      top: `${15 + Math.random() * 70}%`,
      width: `${30 + Math.random() * 40}px`,
      delay: `${i * 0.25}s`,
    });
  }
  return streaks;
}