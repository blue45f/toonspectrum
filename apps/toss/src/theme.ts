/**
 * 토스 셸 크롬(인라인 스타일 BottomNav·FAB·More 시트)이 참조하는 디자인 토큰.
 *
 * 단일 출처: 값은 globals.css 의 OKLCH 토큰(--color-*)을 var() 로 가리킨다(웹과 동일 팔레트).
 * 인라인 style 로 박힌 chrome 도 정확히 같은 warm-ink/persimmon 토큰을 쓰게 해
 * raw hex/rgba 표류·DESIGN.md 위반(#000/#fff·쿨블루)을 없앤다. CSS 변수는 index.css 로드 후
 * :root 에 항상 존재하므로 토스 WebView 에서 안전하다.
 */
export const theme = {
  // 표면 (canvas→panel→card→raised 단계)
  bg: "var(--color-canvas)",
  panel: "var(--color-panel)",
  surface: "var(--color-card)",
  surfaceAlt: "var(--color-raised)",
  // 보더
  border: "var(--color-line)",
  borderStrong: "var(--color-line-strong)",
  // 텍스트 (크림→보조→희미)
  text: "var(--color-fg)",
  text2: "var(--color-fg-2)",
  textMuted: "var(--color-fg-3)",
  // 악센트 persimmon (라이브·액티브·프라이머리 전용)
  accent: "var(--color-accent)",
  accentSoft: "var(--color-accent-soft)",
  accentInk: "var(--color-on-accent)",
  // 시맨틱
  danger: "var(--color-bad)",
  radius: 16,
} as const;

export const pageShell: React.CSSProperties = {
  maxWidth: 520,
  margin: "0 auto",
  padding: "4px 16px 40px",
};
