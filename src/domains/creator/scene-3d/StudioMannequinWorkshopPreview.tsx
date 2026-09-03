import { useId } from "react";

import {
  applyShaperSelectionToBodyParams,
  DEFAULT_SHAPER_SELECTION,
  type ShaperPresetCategory,
  type ShaperPresetSelection,
} from "./studio-shaper-model";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
  clampStudioMannequinBodyParams,
  type StudioMannequinBodyParams,
} from "./studio-mannequin-model";

export type StudioMannequinWorkshopPreviewVariant = "card" | "compact" | "hero";

export interface StudioMannequinWorkshopPreviewProps {
  readonly params?: StudioMannequinBodyParams;
  readonly selection?: Partial<ShaperPresetSelection>;
  readonly variant?: StudioMannequinWorkshopPreviewVariant;
  readonly focus?: ShaperPresetCategory | "all";
  readonly label?: string;
  readonly className?: string;
}

export interface StudioMannequinWorkshopVisualSummary {
  readonly body: string;
  readonly face: string;
  readonly eyes: string;
  readonly nose: string;
  readonly pose: string;
}

function completeSelection(selection?: Partial<ShaperPresetSelection>): ShaperPresetSelection {
  return { ...DEFAULT_SHAPER_SELECTION, ...selection };
}

function completeParams(params?: StudioMannequinBodyParams): StudioMannequinBodyParams {
  return clampStudioMannequinBodyParams({
    ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
    ...STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
    ...params,
  });
}

export function describeStudioMannequinWorkshopState(
  params: StudioMannequinBodyParams,
  selection: ShaperPresetSelection,
): StudioMannequinWorkshopVisualSummary {
  const safe = completeParams(params);
  const body = safe.headCount <= 4.2
    ? "SD 체형"
    : safe.headCount >= 8.2
      ? "장신 체형"
      : safe.build >= 2.3
        ? "근육 체형"
        : safe.shoulderWidth <= 0.94
          ? "슬림 체형"
          : "균형 체형";
  const faceWidth = safe.faceWidth ?? 1;
  const chinLength = safe.chinLength ?? 1;
  const face = faceWidth >= 1.12 && chinLength <= 0.9
    ? "둥근 얼굴"
    : faceWidth <= 0.88 && chinLength >= 1.08
      ? "샤프 얼굴"
      : chinLength >= 1.04
        ? "성숙한 얼굴"
        : "웹툰 계란형";
  const eyeScale = safe.eyeScale ?? 1;
  const eyes = eyeScale >= 1.22 ? "SD 큰 눈" : eyeScale >= 1.1 ? "큰 눈" : eyeScale <= 0.92 ? "작은 눈" : "표준 눈";
  const noseHeight = safe.noseHeight ?? 1;
  const nose = noseHeight >= 1.12 ? "높은 코" : noseHeight <= 0.9 ? "낮은 코" : "표준 코";
  const pose = selection.bodypose === "pose-run"
    ? "달리기"
    : selection.bodypose === "pose-sit"
      ? "앉기"
      : selection.bodypose === "pose-sword"
        ? "전투 자세"
        : selection.bodypose === "pose-hip"
          ? "짝다리"
          : "기본 기립";
  return Object.freeze({ body, face, eyes, nose, pose });
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PosePoints {
  readonly leftHand: Point;
  readonly rightHand: Point;
  readonly leftElbow: Point;
  readonly rightElbow: Point;
  readonly leftFoot: Point;
  readonly rightFoot: Point;
  readonly leftKnee: Point;
  readonly rightKnee: Point;
  readonly torsoTilt: number;
}

function posePoints(selection: ShaperPresetSelection, scale: number): PosePoints {
  const shoulderY = 83;
  const hipY = 128;
  const handPoseLift = selection.handpose === "hand-peace"
    ? -13
    : selection.handpose === "hand-point"
      ? -4
      : selection.handpose === "hand-chin"
        ? -23
        : 0;
  if (selection.bodypose === "pose-run") {
    return {
      leftElbow: { x: 47, y: shoulderY + 10 },
      leftHand: { x: 65, y: shoulderY + 23 },
      rightElbow: { x: 116, y: shoulderY - 8 },
      rightHand: { x: 131, y: shoulderY - 20 },
      leftKnee: { x: 67, y: hipY + 35 * scale },
      leftFoot: { x: 47, y: hipY + 58 * scale },
      rightKnee: { x: 105, y: hipY + 25 * scale },
      rightFoot: { x: 127, y: hipY + 45 * scale },
      torsoTilt: -7,
    };
  }
  if (selection.bodypose === "pose-sit") {
    return {
      leftElbow: { x: 54, y: shoulderY + 27 },
      leftHand: { x: 66, y: shoulderY + 45 },
      rightElbow: { x: 106, y: shoulderY + 27 },
      rightHand: { x: 94, y: shoulderY + 45 },
      leftKnee: { x: 55, y: hipY + 23 },
      leftFoot: { x: 48, y: hipY + 60 * scale },
      rightKnee: { x: 105, y: hipY + 23 },
      rightFoot: { x: 112, y: hipY + 60 * scale },
      torsoTilt: 0,
    };
  }
  if (selection.bodypose === "pose-sword") {
    return {
      leftElbow: { x: 57, y: shoulderY + 13 },
      leftHand: { x: 90, y: shoulderY + 31 },
      rightElbow: { x: 106, y: shoulderY + 7 },
      rightHand: { x: 89, y: shoulderY + 30 },
      leftKnee: { x: 51, y: hipY + 32 * scale },
      leftFoot: { x: 31, y: hipY + 55 * scale },
      rightKnee: { x: 108, y: hipY + 30 * scale },
      rightFoot: { x: 131, y: hipY + 52 * scale },
      torsoTilt: 4,
    };
  }
  if (selection.bodypose === "pose-hip") {
    return {
      leftElbow: { x: 45, y: shoulderY + 27 },
      leftHand: { x: 56, y: shoulderY + 45 },
      rightElbow: { x: 110, y: shoulderY + 17 },
      rightHand: { x: 101, y: shoulderY + 39 + handPoseLift },
      leftKnee: { x: 64, y: hipY + 35 * scale },
      leftFoot: { x: 57, y: hipY + 67 * scale },
      rightKnee: { x: 103, y: hipY + 33 * scale },
      rightFoot: { x: 114, y: hipY + 65 * scale },
      torsoTilt: 3,
    };
  }
  return {
    leftElbow: { x: 48, y: shoulderY + 28 },
    leftHand: { x: 45, y: shoulderY + 53 + handPoseLift },
    rightElbow: { x: 112, y: shoulderY + 28 },
    rightHand: { x: 115, y: shoulderY + 53 + handPoseLift },
    leftKnee: { x: 66, y: hipY + 34 * scale },
    leftFoot: { x: 62, y: hipY + 68 * scale },
    rightKnee: { x: 94, y: hipY + 34 * scale },
    rightFoot: { x: 98, y: hipY + 68 * scale },
    torsoTilt: 0,
  };
}

function Limb({
  start,
  middle,
  end,
  width,
  fill,
  outline,
}: {
  readonly start: Point;
  readonly middle: Point;
  readonly end: Point;
  readonly width: number;
  readonly fill: string;
  readonly outline: string;
}) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${start.x} ${start.y}L${middle.x} ${middle.y}L${end.x} ${end.y}`} stroke={outline} strokeWidth={width + 4} />
      <path d={`M${start.x} ${start.y}L${middle.x} ${middle.y}L${end.x} ${end.y}`} stroke={fill} strokeWidth={width} />
      <circle cx={middle.x} cy={middle.y} fill={fill} r={width * 0.48} stroke={outline} strokeWidth="1.4" />
    </g>
  );
}

export function StudioMannequinWorkshopPreview({
  params,
  selection,
  variant = "card",
  focus = "all",
  label,
  className = "",
}: StudioMannequinWorkshopPreviewProps) {
  const chosen = completeSelection(selection);
  const baseParams = completeParams(params);
  const safe = applyShaperSelectionToBodyParams(baseParams, chosen);
  const summary = describeStudioMannequinWorkshopState(safe, chosen);
  const rawId = useId().replaceAll(":", "");
  const bodyGradient = `mannequin-body-${rawId}`;
  const backgroundGradient = `mannequin-bg-${rawId}`;
  const headCount = safe.headCount;
  const bodyScale = Math.min(1.05, Math.max(0.74, 7 / Math.max(3, headCount)));
  const headRx = 20 * (safe.faceWidth ?? 1) * (headCount <= 4.2 ? 1.15 : 1);
  const headRy = 24 * (0.78 + (safe.chinLength ?? 1) * 0.22) * (headCount <= 4.2 ? 1.08 : 1);
  const shoulderHalf = 25 * safe.shoulderWidth;
  const hipHalf = 17 * safe.pelvisWidth;
  const torsoHeight = Math.max(38, Math.min(58, 47 / bodyScale));
  const armWidth = Math.max(8, 9 + safe.build * 1.7);
  const legWidth = Math.max(10, 11 + safe.build * 1.9);
  const pose = posePoints(chosen, Math.min(1.15, Math.max(0.85, safe.legLength)));
  const eyeScale = safe.eyeScale ?? 1;
  const noseHeight = safe.noseHeight ?? 1;
  const heightClass = variant === "hero" ? "h-52" : variant === "compact" ? "h-20" : "h-32";
  const outline = "#473b35";
  const bodyFill = `url(#${bodyGradient})`;
  const focusOpacity = (category: ShaperPresetCategory): number =>
    focus === "all" || focus === category ? 1 : 0.42;
  const accessibleLabel = label
    ?? `${summary.body}, ${summary.face}, ${summary.eyes}, ${summary.nose}, ${summary.pose} 미리보기`;

  return (
    <svg
      aria-label={accessibleLabel}
      className={`${heightClass} w-full ${className}`}
      data-mannequin-workshop-preview="true"
      data-body-preset={chosen.body}
      data-face-preset={chosen.face}
      data-pose-preset={chosen.bodypose}
      role="img"
      viewBox="0 0 160 210"
    >
      <title>{accessibleLabel}</title>
      <defs>
        <linearGradient id={backgroundGradient} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-card, #fffaf4)" />
          <stop offset="1" stopColor="var(--color-panel, #e8ddd4)" />
        </linearGradient>
        <linearGradient id={bodyGradient} x1="0" x2="0.9" y1="0" y2="1">
          <stop offset="0" stopColor="#efd4b8" />
          <stop offset="0.52" stopColor="#c58b57" />
          <stop offset="1" stopColor="#8e5734" />
        </linearGradient>
      </defs>

      <rect fill={`url(#${backgroundGradient})`} height="206" rx="18" width="156" x="2" y="2" />
      <path d="M18 192H142" opacity="0.22" stroke="var(--color-fg-3, #766b63)" strokeDasharray="3 3" />
      <ellipse cx="80" cy="194" fill="#2f251f" opacity="0.14" rx="43" ry="7" />

      <g transform={`rotate(${pose.torsoTilt} 80 112)`}>
        <g opacity={focusOpacity("body")}>
          <Limb
            start={{ x: 80 - shoulderHalf, y: 83 }}
            middle={pose.leftElbow}
            end={pose.leftHand}
            width={armWidth}
            fill={bodyFill}
            outline={outline}
          />
          <Limb
            start={{ x: 80 + shoulderHalf, y: 83 }}
            middle={pose.rightElbow}
            end={pose.rightHand}
            width={armWidth}
            fill={bodyFill}
            outline={outline}
          />
          <Limb
            start={{ x: 80 - hipHalf * 0.62, y: 128 }}
            middle={pose.leftKnee}
            end={pose.leftFoot}
            width={legWidth}
            fill={bodyFill}
            outline={outline}
          />
          <Limb
            start={{ x: 80 + hipHalf * 0.62, y: 128 }}
            middle={pose.rightKnee}
            end={pose.rightFoot}
            width={legWidth}
            fill={bodyFill}
            outline={outline}
          />
          <path
            d={`M${80 - shoulderHalf} 81Q80 ${75 - safe.build * 1.3} ${80 + shoulderHalf} 81L${80 + hipHalf} ${82 + torsoHeight}Q80 ${91 + torsoHeight} ${80 - hipHalf} ${82 + torsoHeight}Z`}
            fill={bodyFill}
            stroke={outline}
            strokeLinejoin="round"
            strokeWidth="2.6"
          />
          <ellipse cx="80" cy={82 + torsoHeight} fill={bodyFill} rx={hipHalf} ry="12" stroke={outline} strokeWidth="2.2" />
          <circle cx={pose.leftHand.x} cy={pose.leftHand.y} fill={bodyFill} r={armWidth * 0.58} stroke={outline} strokeWidth="1.6" />
          <circle cx={pose.rightHand.x} cy={pose.rightHand.y} fill={bodyFill} r={armWidth * 0.58} stroke={outline} strokeWidth="1.6" />
        </g>

        <g opacity={Math.max(focusOpacity("face"), focusOpacity("eye"), focusOpacity("nose"))}>
          <path d="M71 62V76M89 62V76" stroke={outline} strokeLinecap="round" strokeWidth="5" />
          <ellipse cx="80" cy="44" fill={bodyFill} rx={headRx} ry={headRy} stroke={outline} strokeWidth="2.6" />
          <g opacity={focusOpacity("eye")}>
            <ellipse cx={80 - headRx * 0.36} cy="42" fill="#2f2825" rx={3.1 * eyeScale} ry={2.1 * eyeScale} />
            <ellipse cx={80 + headRx * 0.36} cy="42" fill="#2f2825" rx={3.1 * eyeScale} ry={2.1 * eyeScale} />
            <circle cx={80 - headRx * 0.36 - 0.7} cy="41.3" fill="#fff" r={0.7 * eyeScale} />
            <circle cx={80 + headRx * 0.36 - 0.7} cy="41.3" fill="#fff" r={0.7 * eyeScale} />
          </g>
          <g opacity={focusOpacity("nose")}>
            <path d={`M80 46v${6.5 * noseHeight}l${2.4 * noseHeight} 1.3`} fill="none" stroke="#8e5734" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          </g>
          <path d="M75 59q5 3.4 10 0" fill="none" stroke="#8f4e4e" strokeLinecap="round" strokeWidth="1.5" />
        </g>
      </g>

      {variant !== "compact" ? (
        <g aria-hidden="true">
          <rect fill="var(--color-card, #fffaf4)" height="22" opacity="0.88" rx="8" width="104" x="28" y="178" />
          <text fill="var(--color-fg-2, #4d443f)" fontSize="7.5" fontWeight="700" textAnchor="middle" x="80" y="191">
            {summary.body} · {summary.pose}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
