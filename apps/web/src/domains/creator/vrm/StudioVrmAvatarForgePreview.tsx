/* eslint-disable react-refresh/only-export-components -- Pure visual-summary helpers are the preview renderer's canonical contract. */
import { useId, type ReactNode } from "react";

import {
  AVATAR_FORGE_BANG_STYLE_OPTIONS,
  AVATAR_FORGE_HAIR_STYLE_OPTIONS,
  DEFAULT_AVATAR_FORGE_STATE,
  sanitizeAvatarForgeState,
  type AvatarForgeBangStyle,
  type AvatarForgeHairStyle,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";

export type StudioVrmAvatarForgePreviewVariant = "compact" | "card" | "hero";

export interface StudioVrmAvatarForgePreviewProps {
  readonly state: AvatarForgeState;
  readonly variant?: StudioVrmAvatarForgePreviewVariant;
  readonly className?: string;
  readonly label?: string;
  readonly showBody?: boolean;
}

export interface StudioVrmAvatarForgeVisualSummary {
  readonly hair: string;
  readonly bangs: string;
  readonly face: string;
  readonly body: string;
  readonly changedControls: number;
}

function almostEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}

function changedNumericRecord(
  current: object,
  baseline: object,
): number {
  const currentRecord = current as Record<string, unknown>;
  const baselineRecord = baseline as Record<string, unknown>;
  let count = 0;
  for (const key of new Set([...Object.keys(currentRecord), ...Object.keys(baselineRecord)])) {
    const currentValue = currentRecord[key];
    const baselineValue = baselineRecord[key];
    if (typeof currentValue === "number" && typeof baselineValue === "number") {
      if (!almostEqual(currentValue, baselineValue)) count += 1;
    } else if (currentValue !== baselineValue) {
      count += 1;
    }
  }
  return count;
}

export function countStudioVrmAvatarForgeChanges(
  state: AvatarForgeState,
  baseline: AvatarForgeState = DEFAULT_AVATAR_FORGE_STATE,
): number {
  const current = sanitizeAvatarForgeState(state);
  const reference = sanitizeAvatarForgeState(baseline);
  let count = 0;
  count += changedNumericRecord(current.face, reference.face);
  count += changedNumericRecord(
    current.semanticFaceMorphs ?? {},
    reference.semanticFaceMorphs ?? {},
  );
  count += changedNumericRecord(current.proportions, reference.proportions);
  count += changedNumericRecord(current.hair, reference.hair);
  const referenceAccents = new Map(
    (reference.faceAccents ?? []).map((accent) => [accent.id, accent] as const),
  );
  for (const accent of current.faceAccents ?? []) {
    const before = referenceAccents.get(accent.id);
    if (!before) {
      count += 1;
      continue;
    }
    if (accent.enabled !== before.enabled) count += 1;
    if (accent.color !== before.color) count += 1;
    if (!almostEqual(accent.intensity, before.intensity)) count += 1;
  }
  return count;
}

function faceShapeLabel(state: AvatarForgeState): string {
  const { headWidth, headHeight, cheekVolume, chinLength } = state.face;
  if (headHeight >= 1.07 && chinLength >= 1.05) return "긴 계란형";
  if (headWidth >= 1.07 || cheekVolume >= 0.65) return "둥근형";
  if (headWidth <= 0.94 && chinLength >= 1.06) return "샤프형";
  if (cheekVolume >= 0.65) return "볼륨형";
  if (chinLength <= 0.94) return "짧은 턱";
  return "균형형";
}

function bodyShapeLabel(state: AvatarForgeState): string {
  const { shoulderWidth, torsoLength, legLength } = state.proportions;
  if (shoulderWidth >= 1.08) return "넓은 어깨";
  if (legLength >= 1.08 || torsoLength >= 1.07) return "롱라인";
  if (legLength <= 0.95 || torsoLength <= 0.95) return "컴팩트";
  return "균형 체형";
}

export function describeStudioVrmAvatarForgeState(
  state: AvatarForgeState,
  baseline: AvatarForgeState = DEFAULT_AVATAR_FORGE_STATE,
): StudioVrmAvatarForgeVisualSummary {
  const safe = sanitizeAvatarForgeState(state);
  return Object.freeze({
    hair:
      AVATAR_FORGE_HAIR_STYLE_OPTIONS.find((option) => option.id === safe.hair.style)?.label
      ?? "헤어 없음",
    bangs:
      AVATAR_FORGE_BANG_STYLE_OPTIONS.find((option) => option.id === safe.hair.bangStyle)?.label
      ?? "기본 앞머리",
    face: faceShapeLabel(safe),
    body: bodyShapeLabel(safe),
    changedControls: countStudioVrmAvatarForgeChanges(safe, baseline),
  });
}

function Braid({
  x,
  startY,
  direction = 1,
}: {
  readonly x: number;
  readonly startY: number;
  readonly direction?: 1 | -1;
}) {
  return (
    <g>
      {[0, 1, 2, 3, 4].map((index) => (
        <ellipse
          key={index}
          cx={x + direction * (index % 2 === 0 ? -2 : 2)}
          cy={startY + index * 12}
          rx={7 - index * 0.55}
          ry={9.2 - index * 0.45}
        />
      ))}
    </g>
  );
}

function HairBack({ style }: { readonly style: AvatarForgeHairStyle }): ReactNode {
  switch (style) {
    case "none":
      return null;
    case "short":
      return (
        <path d="M43 61C44 34 56 18 77 16c18-2 33 7 40 24l5 16-9-5 3 13-12-8-4 13-10-16-11 15-8-14-12 13-3-14-13 8Z" />
      );
    case "pixie":
      return (
        <path d="M48 58c1-23 12-37 31-41 13-3 25 1 34 11l10-2-7 10 9 3-11 6 4 11-12-5-2 13-9-12-10 12-7-12-10 10-2-13-10 7Z" />
      );
    case "bob":
      return (
        <path d="M41 62C42 30 59 14 81 14c25 0 40 19 39 52l-5 38-12 13-14-5-8 11-9-11-14 5-13-13-4-42Z" />
      );
    case "long":
      return (
        <path d="M40 63C41 28 59 13 81 13c27 0 42 20 40 59l-3 83-12 19-17-10-8 17-9-17-17 10-12-19-3-92Z" />
      );
    case "hime":
      return (
        <path d="M40 61C41 27 58 13 81 13c28 0 42 21 40 58l-2 96-21 8-17-16-17 16-21-8-3-106Z" />
      );
    case "wavy":
      return (
        <path d="M39 62C41 27 59 13 81 13c27 0 42 20 40 59 6 9 5 20-1 29 8 10 7 23 0 33 7 10 4 24-6 34l-20 7-13-19-13 19-20-7c-10-10-13-24-6-34-7-10-8-23 0-33-6-9-7-20-3-39Z" />
      );
    case "ponytail":
      return (
        <>
          <path d="M43 61C44 29 60 15 81 15c24 0 39 18 37 50-9-14-21-20-37-20-15 0-28 6-38 16Z" />
          <path d="M109 42c24 4 38 21 38 43 0 18-10 28-13 42-3 13 0 25 8 38-24-7-37-27-32-51 3-16 14-27 12-44-1-10-6-20-13-28Z" />
          <circle cx="112" cy="49" r="8" />
        </>
      );
    case "twintail":
      return (
        <>
          <path d="M43 61C44 29 60 15 81 15c24 0 39 18 37 50-9-14-21-20-37-20-15 0-28 6-38 16Z" />
          <path d="M46 50C21 57 11 78 18 103c4 14 14 25 13 39-1 11-6 20-13 27 24-3 39-19 39-42 0-16-10-30-8-47 1-11 3-20-3-30Z" />
          <path d="M116 50c25 7 35 28 28 53-4 14-14 25-13 39 1 11 6 20 13 27-24-3-39-19-39-42 0-16 10-30 8-47-1-11-3-20 3-30Z" />
          <circle cx="47" cy="58" r="7" />
          <circle cx="115" cy="58" r="7" />
        </>
      );
    case "bun":
      return (
        <>
          <ellipse cx="82" cy="18" rx="24" ry="20" />
          <path d="M44 63C45 31 61 17 82 17c24 0 38 18 36 51-10-15-21-21-37-21-15 0-27 6-37 16Z" />
          <path d="M64 19c8-9 28-9 36 0-4-13-12-19-19-19-8 0-14 6-17 19Z" />
        </>
      );
    case "braid":
      return (
        <>
          <path d="M44 62C45 28 62 15 82 16c25 1 38 20 35 53-10-16-21-23-36-23-15 0-27 6-37 16Z" />
          <Braid x={113} startY={65} />
        </>
      );
    case "twin-braid":
      return (
        <>
          <path d="M44 62C45 28 62 15 82 16c25 1 38 20 35 53-10-16-21-23-36-23-15 0-27 6-37 16Z" />
          <Braid x={43} startY={65} direction={-1} />
          <Braid x={117} startY={65} />
        </>
      );
    case "wolf":
      return (
        <path d="M42 62C43 31 57 16 78 15l10 1 9 5 13-2-5 10 14 4-9 8 12 9-12 5 11 15-14 0 8 18-16-5 5 25-15-11-8 46-9-46-16 11 5-25-17 5 8-18-15 0 12-15-13-5 13-9-9-8 15-4Z" />
      );
    case "half-up":
      return (
        <>
          <path d="M41 62C42 29 59 14 81 14c27 0 41 20 40 57l-3 88-15 14-15-12-7 16-8-16-15 12-15-14-2-97Z" />
          <ellipse cx="82" cy="29" rx="17" ry="12" />
          <path d="M66 31c5-10 26-11 32-1l-5 9-11-4-11 4-5-8Z" />
        </>
      );
  }
}

function HairFrontLocks({ style }: { readonly style: AvatarForgeHairStyle }): ReactNode {
  switch (style) {
    case "short":
      return (
        <>
          <path d="M47 49c-5 11-4 25 2 35l9-6-2-22Z" />
          <path d="M115 49c5 11 4 25-2 35l-9-6 2-22Z" />
        </>
      );
    case "pixie":
      return (
        <>
          <path d="M48 48c-3 9-1 19 5 26l7-8-3-16Z" />
          <path d="M113 47c2 8 0 17-5 24l-6-8 3-14Z" />
        </>
      );
    case "bob":
      return (
        <>
          <path d="M45 50c-5 19-3 43 8 59l10-4-5-52Z" />
          <path d="M117 50c5 19 3 43-8 59l-10-4 5-52Z" />
        </>
      );
    case "hime":
      return (
        <>
          <path d="M45 48h15l-1 64-15 3Z" />
          <path d="M102 48h15l1 67-15-3Z" />
        </>
      );
    case "long":
    case "half-up":
      return (
        <>
          <path d="M45 50c-7 27-4 61 7 86l10-6-4-77Z" />
          <path d="M117 50c7 27 4 61-7 86l-10-6 4-77Z" />
        </>
      );
    case "wavy":
      return (
        <>
          <path d="M45 50c-9 18 4 28-3 43-6 14-1 29 10 43l10-8c-9-13-11-23-5-35 7-15-4-28 2-42Z" />
          <path d="M117 50c9 18-4 28 3 43 6 14 1 29-10 43l-10-8c9-13 11-23 5-35-7-15 4-28-2-42Z" />
        </>
      );
    case "wolf":
      return (
        <>
          <path d="M45 49l-8 20 12-2-6 20 15-9-2-28Z" />
          <path d="M117 49l8 20-12-2 6 20-15-9 2-28Z" />
        </>
      );
    default:
      return null;
  }
}

function HairDetailLines({ style }: { readonly style: AvatarForgeHairStyle }): ReactNode {
  switch (style) {
    case "none":
      return null;
    case "short":
      return <><path d="M52 43c9-8 19-11 30-10" /><path d="M88 31c8 2 14 6 19 13" /></>;
    case "pixie":
      return <><path d="M54 36l12-8" /><path d="M68 31l11-12" /><path d="M91 26l12 8" /></>;
    case "bob":
      return <><path d="M52 43c-3 21-1 43 5 60" /><path d="M109 43c4 21 2 43-5 60" /></>;
    case "long":
    case "hime":
      return <><path d="M50 45c-3 35-2 72 4 105" /><path d="M111 45c3 35 2 72-4 105" /></>;
    case "wavy":
      return <><path d="M50 48c-8 17 8 27 0 45s8 28 0 45" /><path d="M111 48c8 17-8 27 0 45s-8 28 0 45" /></>;
    case "ponytail":
      return <><path d="M56 39c14-8 31-8 44 0" /><path d="M121 61c15 14 10 32 2 47-7 14-6 28 3 41" /></>;
    case "twintail":
      return <><path d="M39 64c-12 18-3 32 5 45" /><path d="M123 64c12 18 3 32-5 45" /></>;
    case "bun":
      return <><path d="M66 18c9-8 23-8 32 0" /><path d="M57 40c14-8 34-8 49 0" /></>;
    case "braid":
      return <><path d="M56 39c14-8 31-8 44 0" /><path d="M111 70c7 14 6 29 0 43" /></>;
    case "twin-braid":
      return <><path d="M56 39c14-8 31-8 44 0" /><path d="M45 70c-7 14-6 29 0 43" /><path d="M115 70c7 14 6 29 0 43" /></>;
    case "wolf":
      return <><path d="M49 46l12-5-7 13 13-5" /><path d="M111 45l-11-5 6 13-12-5" /></>;
    case "half-up":
      return <><path d="M67 29c8-6 21-6 29 0" /><path d="M50 50c-3 28-1 55 5 79" /><path d="M111 50c3 28 1 55-5 79" /></>;
  }
}

function Bangs({ style }: { readonly style: AvatarForgeBangStyle }): ReactNode {
  switch (style) {
    case "none":
      return null;
    case "full":
      return <path d="M50 52c8-20 21-28 33-27 15 1 26 11 31 30-10-7-18-10-25-8l-6 18-7-18c-8-2-17 0-26 5Z" />;
    case "split":
      return <path d="M49 54c7-20 20-29 33-28l-2 27-12 18 4-30c-8 1-15 5-23 13Zm65 2c-8-20-19-29-32-30l2 27 12 18-4-30c8 2 15 7 22 15Z" />;
    case "side-swept":
      return <path d="M49 55c8-23 25-31 41-27 13 3 21 13 25 29-19-10-38-4-58 19l8-28-16 7Z" />;
    case "curtain":
      return <path d="M49 55c8-22 20-29 33-29-5 21-13 37-26 51l7-31-14 9Zm66 0c-8-22-20-29-33-29 5 21 13 37 26 51l-7-31 14 9Z" />;
    case "blunt":
      return <path d="M48 53c8-21 21-28 34-28 15 0 27 10 33 29l-8 16H57L48 53Z" />;
  }
}

function FaceAccents({ state, cx, cy, width, height }: {
  readonly state: AvatarForgeState;
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
}) {
  const accents = new Map((state.faceAccents ?? []).map((accent) => [accent.id, accent] as const));
  const blush = accents.get("blush");
  const freckles = accents.get("freckles");
  const beauty = accents.get("beauty-mark");
  return (
    <g>
      {blush?.enabled ? (
        <g fill={blush.color} opacity={0.22 + blush.intensity * 0.35}>
          <ellipse cx={cx - width * 0.29} cy={cy + height * 0.15} rx={width * 0.15} ry={height * 0.07} />
          <ellipse cx={cx + width * 0.29} cy={cy + height * 0.15} rx={width * 0.15} ry={height * 0.07} />
        </g>
      ) : null}
      {freckles?.enabled ? (
        <g fill={freckles.color} opacity={0.35 + freckles.intensity * 0.45}>
          {[-3, -2, -1, 1, 2, 3].map((index) => (
            <circle key={index} cx={cx + index * width * 0.075} cy={cy + height * (0.08 + Math.abs(index) * 0.008)} r={1.25} />
          ))}
        </g>
      ) : null}
      {beauty?.enabled ? (
        <circle
          cx={cx + width * 0.25}
          cy={cy + height * 0.24}
          fill={beauty.color}
          opacity={0.45 + beauty.intensity * 0.45}
          r="1.8"
        />
      ) : null}
    </g>
  );
}

export function StudioVrmAvatarForgePreview({
  state,
  variant = "card",
  className = "",
  label,
  showBody = true,
}: StudioVrmAvatarForgePreviewProps) {
  const safe = sanitizeAvatarForgeState(state);
  const summary = describeStudioVrmAvatarForgeState(safe);
  const rawId = useId().replaceAll(":", "");
  const hairGradientId = `forge-hair-${rawId}`;
  const hairShadowId = `forge-hair-shadow-${rawId}`;
  const skinGradientId = `forge-skin-${rawId}`;
  const backgroundGradientId = `forge-bg-${rawId}`;
  const headWidth = 57 * safe.face.headWidth * (1 + (safe.face.cheekVolume - 0.35) * 0.05);
  const headHeight = 72 * safe.face.headHeight * (0.78 + safe.face.chinLength * 0.22);
  const headCx = 80;
  const headCy = 70;
  const eyeSpacing = headWidth * 0.23;
  const shoulderHalf = 35 * safe.proportions.shoulderWidth;
  const torsoHeight = 45 * safe.proportions.torsoLength;
  const legHeight = 48 * safe.proportions.legLength;
  const svgHeightClass = variant === "hero"
    ? "h-44"
    : variant === "compact"
      ? "h-[4.6rem]"
      : "h-24";
  const accessibleLabel = label
    ?? `${summary.face}, ${summary.hair}, ${summary.bangs}, ${summary.body} 스타일 미리보기`;

  return (
    <svg
      aria-label={accessibleLabel}
      className={`${svgHeightClass} w-full overflow-visible ${className}`}
      data-forge-preview="true"
      data-hair-style={safe.hair.style}
      data-bang-style={safe.hair.bangStyle}
      role="img"
      viewBox={showBody ? "0 0 160 200" : "18 0 124 138"}
    >
      <title>{accessibleLabel}</title>
      <defs>
        <linearGradient id={backgroundGradientId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-card, #fffaf5)" />
          <stop offset="1" stopColor="var(--color-panel, #f3ebe3)" />
        </linearGradient>
        <linearGradient id={skinGradientId} x1="0.15" x2="0.85" y1="0" y2="1">
          <stop offset="0" stopColor="#ffe8d9" />
          <stop offset="0.62" stopColor="#f5cdb8" />
          <stop offset="1" stopColor="#dca98f" />
        </linearGradient>
        <linearGradient id={hairGradientId} x1="0" x2="0.9" y1="0" y2="1">
          <stop offset="0" stopColor={safe.hair.shadowColor ?? safe.hair.baseColor} />
          <stop offset="0.22" stopColor={safe.hair.baseColor} />
          <stop offset="0.52" stopColor={safe.hair.baseColor} />
          <stop offset="0.78" stopColor={safe.hair.tipColor} stopOpacity="0.94" />
          <stop offset="1" stopColor={safe.hair.shadowColor ?? safe.hair.tipColor} />
        </linearGradient>
        <filter id={hairShadowId} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="1.4" floodColor="#000" floodOpacity="0.24" stdDeviation="1.1" />
        </filter>
      </defs>

      <rect fill={`url(#${backgroundGradientId})`} height="196" rx="18" width="156" x="2" y="2" />
      <path d="M24 184c8-22 25-35 56-35s48 13 56 35v12H24Z" fill="var(--color-raised, #ddd1c7)" />
      {showBody ? (
        <g>
          <path
            d={`M${80 - shoulderHalf} 176c5-${torsoHeight * 0.45} 16-${torsoHeight * 0.75} 30-${torsoHeight * 0.82}l10 0c14 ${torsoHeight * 0.07} 25 ${torsoHeight * 0.37} 30 ${torsoHeight * 0.82}v20H${80 - shoulderHalf}Z`}
            fill="var(--color-accent-soft, #ead7c6)"
            stroke="var(--color-line, #8b786a)"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <path d={`M67 143v${Math.min(18, legHeight * 0.3)}h26v-${Math.min(18, legHeight * 0.3)}Z`} fill={`url(#${skinGradientId})`} />
        </g>
      ) : null}

      {safe.hair.style !== "none" ? (
        <g
          data-forge-hair-back="true"
          data-hair-layer="back"
          fill={`url(#${hairGradientId})`}
          filter={`url(#${hairShadowId})`}
          stroke={safe.hair.shadowColor ?? safe.hair.baseColor}
          strokeLinejoin="round"
          strokeWidth="2.4"
        >
          <HairBack style={safe.hair.style} />
        </g>
      ) : null}
      <ellipse
        cx={headCx - headWidth * 0.52}
        cy={headCy + 3}
        fill={`url(#${skinGradientId})`}
        rx="5.5"
        ry="11"
        stroke="#b98772"
        strokeWidth="1.2"
      />
      <ellipse
        cx={headCx + headWidth * 0.52}
        cy={headCy + 3}
        fill={`url(#${skinGradientId})`}
        rx="5.5"
        ry="11"
        stroke="#b98772"
        strokeWidth="1.2"
      />
      <ellipse
        cx={headCx}
        cy={headCy}
        fill={`url(#${skinGradientId})`}
        rx={headWidth / 2}
        ry={headHeight / 2}
        stroke="#9f6f5d"
        strokeWidth="1.6"
      />
      <g fill="#2d2321" stroke="#2d2321" strokeLinecap="round">
        <path d={`M${headCx - eyeSpacing - 7} ${headCy - 6}q7-5 14 0`} fill="none" strokeWidth="2.1" />
        <path d={`M${headCx + eyeSpacing - 7} ${headCy - 6}q7-5 14 0`} fill="none" strokeWidth="2.1" />
        <ellipse cx={headCx - eyeSpacing} cy={headCy - 4.5} rx="3.2" ry="4.8" />
        <ellipse cx={headCx + eyeSpacing} cy={headCy - 4.5} rx="3.2" ry="4.8" />
        <circle cx={headCx - eyeSpacing - 0.8} cy={headCy - 6.2} fill="#fff" r="0.9" stroke="none" />
        <circle cx={headCx + eyeSpacing - 0.8} cy={headCy - 6.2} fill="#fff" r="0.9" stroke="none" />
      </g>
      <path d={`M${headCx - 2} ${headCy + 5}q2 3 4 0`} fill="none" stroke="#b77f6b" strokeLinecap="round" strokeWidth="1.4" />
      <path d={`M${headCx - 8} ${headCy + 18}q8 ${4 + safe.face.cheekVolume * 2} 16 0`} fill="none" stroke="#9f4f55" strokeLinecap="round" strokeWidth="1.8" />
      <FaceAccents state={safe} cx={headCx} cy={headCy} width={headWidth} height={headHeight} />
      {safe.hair.style !== "none" ? (
        <>
          <g
            data-forge-hair-front="true"
            data-hair-layer="bangs"
            fill={`url(#${hairGradientId})`}
            filter={`url(#${hairShadowId})`}
            stroke={safe.hair.shadowColor ?? safe.hair.baseColor}
            strokeLinejoin="round"
            strokeWidth="2.2"
          >
            <HairFrontLocks style={safe.hair.style} />
            <Bangs style={safe.hair.bangStyle} />
          </g>
          <g
            data-forge-hair-detail="true"
            fill="none"
            opacity={0.18 + safe.hair.shine * 0.34}
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="1.5"
          >
            <HairDetailLines style={safe.hair.style} />
          </g>
          <path
            data-hair-layer="shine"
            d="M56 37c13-16 39-19 54-1"
            fill="none"
            opacity={0.22 + safe.hair.shine * 0.4}
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="4"
          />
        </>
      ) : null}
    </svg>
  );
}
