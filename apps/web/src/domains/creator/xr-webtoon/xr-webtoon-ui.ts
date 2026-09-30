import type { CSSProperties } from "react";

/**
 * XR 웹툰 패널 공용 비주얼 토큰.
 *
 * 방향성: 화려하면서도 직관적. 그라데이션·글로우·부드러운 애니메이션은 살리되
 * 정보 구조는 단순하게 — 핵심 액션 1개 강조, 2차 액션 격하, 다음 행동 명시.
 */
export const XR_WEBTOON_COLORS = Object.freeze({
  bgDeep: "#0b1026",
  bgCard: "rgba(20, 28, 58, 0.72)",
  accentViolet: "#8b5cf6",
  accentCyan: "#22d3ee",
  accentPink: "#f472b6",
  textPrimary: "#f1f5ff",
  textSecondary: "rgba(226, 232, 255, 0.72)",
  textMuted: "rgba(226, 232, 255, 0.5)",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#fb7185",
});

export const xrCardStyle: CSSProperties = {
  background: `linear-gradient(135deg, ${XR_WEBTOON_COLORS.bgCard}, rgba(12, 17, 40, 0.85))`,
  border: "1px solid rgba(139, 92, 246, 0.28)",
  borderRadius: 20,
  padding: 24,
  color: XR_WEBTOON_COLORS.textPrimary,
  boxShadow:
    "0 12px 40px rgba(8, 10, 30, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
  backdropFilter: "blur(8px)",
};

export const xrPrimaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "14px 28px",
  fontSize: 16,
  fontWeight: 700,
  color: "#fff",
  background: `linear-gradient(135deg, ${XR_WEBTOON_COLORS.accentViolet}, ${XR_WEBTOON_COLORS.accentPink})`,
  border: "none",
  borderRadius: 14,
  cursor: "pointer",
  boxShadow:
    "0 8px 24px rgba(139, 92, 246, 0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
  transition: "transform 160ms ease, box-shadow 160ms ease, filter 160ms ease",
};

export const xrSecondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 600,
  color: XR_WEBTOON_COLORS.textPrimary,
  background: "rgba(139, 92, 246, 0.14)",
  border: "1px solid rgba(139, 92, 246, 0.35)",
  borderRadius: 12,
  cursor: "pointer",
};

export const xrGhostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  color: XR_WEBTOON_COLORS.textSecondary,
  background: "transparent",
  border: "1px solid rgba(226, 232, 255, 0.18)",
  borderRadius: 10,
  cursor: "pointer",
};

export const xrTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  background: "linear-gradient(120deg, #fff, #c4b5fd 60%, #67e8f9)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

export const xrSubtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 14,
  lineHeight: 1.6,
  color: XR_WEBTOON_COLORS.textSecondary,
};

export const xrStatusPillStyle = (tone: "ok" | "warn" | "bad" | "idle"): CSSProperties => {
  const dot =
    tone === "ok"
      ? XR_WEBTOON_COLORS.success
      : tone === "warn"
        ? XR_WEBTOON_COLORS.warning
        : tone === "bad"
          ? XR_WEBTOON_COLORS.danger
          : XR_WEBTOON_COLORS.textMuted;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 999,
    background: "rgba(10, 14, 34, 0.6)",
    border: "1px solid rgba(226, 232, 255, 0.14)",
    color: XR_WEBTOON_COLORS.textPrimary,
    ["--xr-dot" as string]: dot,
  };
};

export const xrNextStepStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  marginTop: 16,
  padding: "14px 16px",
  borderRadius: 14,
  background: "rgba(34, 211, 238, 0.08)",
  border: "1px dashed rgba(34, 211, 238, 0.4)",
  fontSize: 14,
  lineHeight: 1.6,
  color: XR_WEBTOON_COLORS.textSecondary,
};
