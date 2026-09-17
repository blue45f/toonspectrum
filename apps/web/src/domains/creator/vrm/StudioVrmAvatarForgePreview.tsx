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
        <>
          <path d="M45 61C46 34 60 18 81 17c22-1 36 14 37 43-8-9-17-14-29-16-16-3-30 2-44 17Z" />
          <path d="M48 55c-3 10-2 22 3 31l8-12 5 14 8-17 9 13 8-15 10 12 7-14 9 8c3-9 3-17 1-25-14-2-27-3-38 0-11 2-21 4-30 5Z" opacity="0.94" />
        </>
      );
    case "pixie":
      return (
        <>
          <path d="M46 60C49 35 61 21 80 18c18-2 31 8 37 28l-13-7 5 12-16-7 2 13-16-9-7 12-7-12-16 12 4-15-12 6c1-4 3-8 5-11Z" />
          <path d="M48 58c2 9 5 15 10 21l8-12 7 10 7-14 8 10 9-14 8 7 8-12c-3 19-14 30-32 31-17 1-29-8-33-27Z" opacity="0.88" />
        </>
      );
    case "bob":
      return (
        <path d="M42 61C43 27 60 14 81 15c27 1 39 20 37 54l-5 44-20 7-12-9-12 9-22-8-5-51Z" />
      );
    case "long":
      return (
        <>
          <path d="M40 63C41 27 59 13 81 14c28 1 42 21 40 58l-4 97-22 9-14-19-14 19-24-9-3-106Z" />
          <path d="M46 77c4 27 5 57 5 84l14 7 16-18 15 18 14-7c2-31 3-58 5-86-11 7-22 10-34 10-13 0-24-3-35-8Z" opacity="0.88" />
        </>
      );
    case "hime":
      return (
        <>
          <path d="M40 62C41 27 59 13 81 14c28 1 42 21 40 58l-4 96-22 8-14-18-14 18-24-8-3-106Z" />
          <path d="M43 66h19v64l-12 8-8-7 1-65Zm57 0h19l1 65-9 7-11-8V66Z" />
          <path d="M50 68h12v51l-8 5-4-4V68Zm50 0h12v52l-5 4-7-5V68Z" opacity="0.76" />
        </>
      );
    case "wavy":
      return (
        <path d="M40 62C42 25 60 13 81 14c28 1 41 21 39 59 6 12 3 24-4 34 8 13 6 27-2 38 6 10 3 21-5 29l-22-8-6-17-7 17-22 8c-8-9-10-20-4-30-8-11-10-25-2-38-7-10-9-22-5-34Z" />
      );
    case "ponytail":
      return (
        <>
          <path d="M44 62C45 28 62 15 82 16c25 1 38 20 35 53-10-16-21-23-36-23-15 0-27 6-37 16Z" />
          <path d="M112 50c31 14 38 46 21 79-7 13-10 27-6 43-25-17-33-44-19-70 12-21 10-38 4-52Z" />
        </>
      );
    case "twintail":
      return (
        <>
          <path d="M44 62C45 28 62 15 82 16c25 1 38 20 35 53-10-16-21-23-36-23-15 0-27 6-37 16Z" />
          <path d="M47 59C18 77 14 112 31 146c8 15 9 27 5 39 23-15 31-43 18-68-10-20-11-39-7-58Z" />
          <path d="M113 59c29 18 33 53 16 87-8 15-9 27-5 39-23-15-31-43-18-68 10-20 11-39 7-58Z" />
        </>
      );
    case "bun":
      return (
        <>
          <circle cx="82" cy="18" r="24" />
          <path d="M44 64C45 30 62 17 82 18c25 1 38 20 35 53-10-16-21-23-36-23-15 0-27 6-37 16Z" />
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
        <path d="M43 62C44 27 61 15 82 16c26 1 39 21 36 54l13 16-17 2 10 20-17-4 6 25-22-14-10 42-10-42-23 14 7-25-18 4 11-20-18-2 13-24Z" />
      );
    case "half-up":
      return (
        <>
          <path d="M42 62C43 27 60 14 81 15c27 1 40 20 38 55l-3 91-22 8-13-20-12 20-23-8-4-99Z" />
          <circle cx="82" cy="28" r="15" />
        </>
      );
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
          <stop offset="0.34" stopColor={safe.hair.baseColor} />
          <stop offset="0.72" stopColor={safe.hair.baseColor} />
          <stop offset="1" stopColor={safe.hair.tipColor} />
        </linearGradient>
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
        <g data-hair-layer="back" fill={`url(#${hairGradientId})`} stroke={safe.hair.shadowColor ?? safe.hair.baseColor} strokeLinejoin="round" strokeWidth="2.4">
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
          <g data-hair-layer="bangs" fill={`url(#${hairGradientId})`} stroke={safe.hair.shadowColor ?? safe.hair.baseColor} strokeLinejoin="round" strokeWidth="2.2">
            <Bangs style={safe.hair.bangStyle} />
          </g>
          <path
            data-hair-layer="shine"
            d="M56 37c13-16 39-19 54-1"
            fill="none"
            opacity={0.18 + safe.hair.shine * 0.34}
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="3.2"
          />
        </>
      ) : null}
    </svg>
  );
}
