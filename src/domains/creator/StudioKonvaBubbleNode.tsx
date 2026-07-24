import {
  Circle as KCircle,
  Ellipse,
  Group,
  Line,
  Path,
  Rect,
  Text as KText,
} from "react-konva/lib/ReactKonvaCore";

import {
  computeBubbleShapeGeometry,
  hasCustomBubbleShape,
  normalizeCustomShapePoints,
} from "./studio-bubble-custom-shape";
import {
  normalizeBubbleOutlineStyle,
  styledBubblePathData,
  styledBubblePolygonPathData,
} from "./studio-bubble-outline-style";
import {
  BURST_STAR_VARIANT_PARAMS,
  bubblePathData,
  bubblePathDataMulti,
  burstStarPathData,
  doubleBubblePathData,
  heartBubblePathData,
  normalizeBurstStarPoints,
  normalizeExtraTails,
  scaredBubblePathData,
  thoughtBubbleBodyPath,
  thoughtTailDots,
} from "./studio-bubble-path";
import {
  BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT,
  bubbleHorizontalPadding,
  bubbleVerticalPadding,
  fitBubbleFontSize,
} from "./studio-bubble-text-fit";
import {
  BUBBLE_TEXT_MEASURER,
  formatVerticalText,
} from "./studio-bubble-text-runtime";
import {
  planDialogueRubyOverlayPlacements,
  readDialogueRubySpans,
} from "./studio-dialogue-ruby-layout";
import { konvaGradientProps } from "./studio-gradient-engine";
import { withStudioNodeInteractionGuards } from "./studio-node-props";
import { normalizeStrokeStyle, strokeDashArray } from "./studio-stroke-shapes";

import type { El } from "./studio-element-model";
import type Konva from "konva";

export interface StudioKonvaBubbleNodeProps {
  el: Extract<El, { type: "bubble" }>;
  theme: "classic" | "soft" | "vivid";
  customShapeDraftPoints?: number[];
  selected: boolean;
  exporting: boolean;
  effectiveScale: number;
  draggable: boolean;
  innerRef: (node: Konva.Node | null) => void;
  dragBoundFunc: (pos: Konva.Vector2d) => Konva.Vector2d;
  onSelect: () => void;
  onEdit: () => void;
  onChange: (patch: Partial<El>) => void;
  onInteractionBegin?: () => boolean;
  onInteractionEnd?: () => void;
}

export function StudioKonvaBubbleNode({
  el,
  theme,
  customShapeDraftPoints,
  selected,
  exporting,
  effectiveScale,
  draggable,
  innerRef,
  dragBoundFunc,
  onSelect,
  onEdit,
  onChange,
  onInteractionBegin,
  onInteractionEnd,
}: StudioKonvaBubbleNodeProps) {
  // 외곽선 두께: 사용자 지정 우선, 없으면 말풍선 평균크기 3단계(작을수록 가늘게).
  const avgSize = (el.width + el.height) / 2;
  let bStroke = el.stroke ?? "#1f1a16"; // 순흑 대신 따뜻한 잉크색
  let bStrokeW = el.strokeWidth ?? (avgSize < 300 ? 2.5 : avgSize < 500 ? 3 : 3.5);
  // 그림자: 사용자 지정 없으면 테마별 기본값(종이 위에 살짝 뜬 미세 그림자).
  let bShadowColor = el.shadowColor !== undefined ? el.shadowColor : "rgba(0, 0, 0, 0.2)";
  let bShadowBlur = el.shadowBlur !== undefined ? el.shadowBlur : 5;
  let bShadowOpacity = el.shadowOpacity !== undefined ? el.shadowOpacity : 0.16;
  let bShadowOffset = el.shadowOffsetX !== undefined && el.shadowOffsetY !== undefined
    ? { x: el.shadowOffsetX, y: el.shadowOffsetY }
    : { x: 1, y: 2 };
  const tXRatio = el.tailXRatio ?? 0.35;
  const tHeight = el.tailHeight ?? 30;
  const tailDir = el.tail ?? "left";
  const tailDirection = el.tailDirection ?? "bottom";
  const showTail = tailDir !== "none";

  if (theme === "soft") {
    bStroke = el.stroke ?? "#2d2d2d";
    bStrokeW = el.strokeWidth ?? (avgSize < 300 ? 1.5 : avgSize < 500 ? 1.8 : 2);
    if (el.shadowColor === undefined) {
      bShadowColor = "rgba(0, 0, 0, 0.1)";
      bShadowBlur = 5;
      bShadowOpacity = 0.16;
      bShadowOffset = { x: 1, y: 2 };
    }
  } else if (theme === "vivid") {
    bStroke = el.stroke ?? "#444444";
    bStrokeW = el.strokeWidth ?? (avgSize < 300 ? 1.2 : avgSize < 500 ? 1.5 : 1.8);
    if (el.shadowColor === undefined) {
      bShadowColor = "black";
      bShadowBlur = 8;
      bShadowOpacity = 0.16;
      bShadowOffset = { x: 2, y: 3 };
    }
  }

  // 점선 등 스트로크 스타일 — strokeStyle을 지정하면 그걸 우선 적용한다. whisper는
  // strokeStyle 미지정 시 기존 하드코딩 dash([8,5])를 그대로 유지한다(하위호환).
  // scared/system/angry는 스트로크 색(및 system은 두께)이 이미 하드코딩이라 점선도
  // 적용하지 않는다(사용자가 지정 안 한 색 위에 점선만 얹히는 어색함 방지 — 기존 갭,
  // 이 배치의 책임 밖).
  const bDash = el.strokeStyle
    ? strokeDashArray(normalizeStrokeStyle(el.strokeStyle).dash, bStrokeW)
    : el.variant === "whisper"
      ? [8, 5]
      : undefined;

  // 실제 렌더와 커스텀 외곽선 전환이 같은 기하 소스를 사용해야 전환 순간 모양이 튀지 않는다.
  // extraTails는 저장 문서의 불신 입력을 먼저 정규화한 뒤 geometry 계약으로 넘긴다.
  const bMinDim = Math.min(el.width, el.height);
  const bubbleGeometry = computeBubbleShapeGeometry({
    width: el.width,
    height: el.height,
    theme,
    tail: tailDir,
    tailDirection,
    tailXRatio: tXRatio,
    tailHeight: tHeight,
    tailBase: el.tailBase,
    tailBend: el.tailBend,
    extraTails: normalizeExtraTails(el.extraTails),
  });
  const bRadius = bubbleGeometry.radius;
  const bubbleTailSpec = bubbleGeometry.tailSpec;
  const bubbleExtraTails = bubbleGeometry.extraTails;
  const bTailLen = bubbleTailSpec?.length ?? 0;
  // 드래그 중이면 미확정 draft를(커밋 전 실시간 미리보기), 아니면 저장된 값을 정규화해 쓴다 —
  // StudioDrawNode의 nodeEditDraft 병합과 동일한 관례. normalizeCustomShapePoints는 위
  // normalizeExtraTails(el.extraTails)와 동일하게, 저장 문서에서 불러온 값을 매 렌더 방어적으로
  // 정규화한다(짝수 길이·유한수 아니면 undefined로 폴백 — 커스텀 모양 미적용 취급).
  const liveCustomShapePoints = customShapeDraftPoints ?? normalizeCustomShapePoints(el.customShapePoints);
  const showCustomShape = hasCustomBubbleShape(liveCustomShapePoints);
  // 손그림 외곽선(studio-bubble-outline-style) — 미설정이면 styled()는 입력 d를 그대로 돌려줘
  // 기본 렌더 경로가 바이트 단위로 불변이다(하위호환).
  const outlineStyle = normalizeBubbleOutlineStyle(el.outlineStyle);
  const styled = (d: string) => styledBubblePathData(d, outlineStyle, el.id, bStrokeW);
  const speechPathData = styled(
    bubbleExtraTails.length > 0
      ? bubblePathDataMulti(el.width, el.height, bRadius, [
          ...(bubbleTailSpec ? [bubbleTailSpec] : []),
          ...bubbleExtraTails,
        ])
      : bubblePathData(el.width, el.height, bRadius, bubbleTailSpec)
  );
  // 타이포: 한글 가독성을 위한 테마별 줄간격 + 약한 자간(세로쓰기는 넉넉히).
  const bubbleLineHeight =
    el.lineHeight ?? (el.vertical ? 1.4 : theme === "soft" ? 1.35 : theme === "vivid" ? 1.2 : 1.25);
  const bubbleLetterSpacing = theme === "vivid" ? 0 : 0.3;
  // 안쪽 여백: 글자 크기 비례(좌우 대칭, 상<하로 시각 중심 보정).
  const bubbleMaxFontSize = el.fontSize ?? 24;
  const bFs = el.autoShrinkText
    ? fitBubbleFontSize(
        {
          text: el.vertical ? formatVerticalText(el.text) : el.text,
          boxWidth: el.width,
          boxHeight: el.height,
          maxFontSize: bubbleMaxFontSize,
          minFontSize: el.autoShrinkMinFontSize ?? BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT,
          fontFamily: el.font ?? "Pretendard, sans-serif",
          fontStyle: el.fontStyle ?? "bold",
          lineHeight: bubbleLineHeight,
        },
        BUBBLE_TEXT_MEASURER,
      ).fontSize
    : bubbleMaxFontSize;
  // bHPad/bVPadTop/bVPadBot 공식을 studio-bubble-text-fit.ts와 공유(§1.1) — fitBubbleFontSize의
  // 내부 탐색이 가정한 패딩과 실제 렌더 패딩이 정확히 일치해야 한다.
  const bHPad = bubbleHorizontalPadding(bFs);
  const { top: bVPadTop, bottom: bVPadBot } = bubbleVerticalPadding(bFs);

  // 생각 말풍선 꼬리: 큰→중간→작은 3단 구름방울(코미포식) — 캔버스·SVG export 가 공유하는
  // thoughtTailDots 단일 소스. tailXRatio/tailHeight 가 있으면 손잡이를 따라 움직인다.
  const thoughtSW = bStrokeW * 0.8;
  const thoughtEllipses = showTail
    ? thoughtTailDots({
        width: el.width,
        height: el.height,
        direction: tailDirection,
        mirror: tailDir === "right" ? "right" : "left",
        ratio: el.tailXRatio,
        length: el.tailHeight,
      }).map((dot, index) => (
        <Ellipse
          key={`thought-dot-${index}`}
          x={dot.x}
          y={dot.y}
          radiusX={dot.rx}
          radiusY={dot.ry}
          fill={el.fill}
          stroke={bStroke}
          strokeWidth={thoughtSW}
        />
      ))
    : null;

  let lx = el.width * tXRatio;
  let ly = el.height + bTailLen;

  if (tailDirection === "bottom") {
    const ratio = tailDir === "right" ? 1 - tXRatio : tXRatio;
    lx = el.width * ratio;
    ly = el.height + bTailLen;
  } else if (tailDirection === "top") {
    const ratio = tailDir === "right" ? 1 - tXRatio : tXRatio;
    lx = el.width * ratio;
    ly = -bTailLen;
  } else if (tailDirection === "left") {
    lx = -bTailLen;
    ly = el.height * tXRatio;
  } else if (tailDirection === "right") {
    lx = el.width + bTailLen;
    ly = el.height * tXRatio;
  }

  const tailHandle = selected && showTail && !exporting && !showCustomShape && (
    <KCircle
      x={lx}
      y={ly}
      radius={6 / effectiveScale}
      fill="#ffcc00"
      stroke="#1f1a16"
      strokeWidth={1.5 / effectiveScale}
      draggable
      onDragStart={(e) => {
        e.cancelBubble = true;
        if (onInteractionBegin && !onInteractionBegin()) {
          e.target.stopDrag();
        }
      }}
      onDragMove={(e) => {
        e.cancelBubble = true;
        const node = e.target;
        const dx = node.x();
        const dy = node.y();

        const dTop = Math.abs(dy);
        const dBot = Math.abs(dy - el.height);
        const dLeft = Math.abs(dx);
        const dRight = Math.abs(dx - el.width);
        const minDist = Math.min(dTop, dBot, dLeft, dRight);

        let newDir: "bottom" | "top" | "left" | "right" = "bottom";
        let ratio = tXRatio;
        let len = tHeight;

        if (minDist === dBot) {
          newDir = "bottom";
          const rawRatio = dx / el.width;
          ratio = Math.max(0.15, Math.min(0.85, rawRatio));
          len = Math.max(8, Math.min(150, dy - el.height));
        } else if (minDist === dTop) {
          newDir = "top";
          const rawRatio = dx / el.width;
          ratio = Math.max(0.15, Math.min(0.85, rawRatio));
          len = Math.max(8, Math.min(150, -dy));
        } else if (minDist === dLeft) {
          newDir = "left";
          const rawRatio = dy / el.height;
          ratio = Math.max(0.15, Math.min(0.85, rawRatio));
          len = Math.max(8, Math.min(150, -dx));
        } else if (minDist === dRight) {
          newDir = "right";
          const rawRatio = dy / el.height;
          ratio = Math.max(0.15, Math.min(0.85, rawRatio));
          len = Math.max(8, Math.min(150, dx - el.width));
        }

        if (tailDir === "right" && (newDir === "bottom" || newDir === "top")) {
          ratio = 1 - ratio;
        }

        onChange({
          tailDirection: newDir,
          tailXRatio: Math.round(ratio * 100) / 100,
          tailHeight: Math.round(len),
        });
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        try {
          e.target.x(lx);
          e.target.y(ly);
          e.target.getLayer()?.batchDraw();
        } finally {
          onInteractionEnd?.();
        }
      }}
    />
  );

  const bubbleInteractionProps = withStudioNodeInteractionGuards(
    {
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
        onChange({ x: e.target.x(), y: e.target.y() });
      },
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
        const node = e.target as Konva.Group;
        const w = Math.max(60, el.width * node.scaleX());
        const h = Math.max(50, el.height * node.scaleY());
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          x: node.x(),
          y: node.y(),
          width: w,
          height: h,
          rotation: node.rotation(),
        });
      },
    },
    { onInteractionBegin, onInteractionEnd }
  );

  // Text box + optional horizontal ruby overlays (base stays one KText; vertical skips ruby paint).
  const textBoxWidth = Math.max(8, el.width - bHPad * 2);
  const textBoxHeight = Math.max(8, el.height - (bVPadTop + bVPadBot));
  const bubbleAlign = el.align ?? "center";
  const bubbleFontFamily = el.font ?? "Pretendard, sans-serif";
  const bubbleFontStyle = el.fontStyle ?? "bold";
  const baseText = el.vertical ? formatVerticalText(el.text) : el.text;
  // Vertical bubbles keep base-only paint (formatVerticalText). Stacked ruby is horizontal-only
  // in this MVP — column layout does not host furigana beside upright glyphs yet.
  const rubySpans = !el.vertical
    ? readDialogueRubySpans(
        (el as Extract<El, { type: "bubble" }> & { rubySpans?: unknown }).rubySpans,
      )
    : undefined;
  const rubyOverlays = rubySpans
    ? planDialogueRubyOverlayPlacements(el.text, rubySpans, {
        fontSize: bFs,
        letterSpacing: bubbleLetterSpacing,
        textWidth: textBoxWidth,
        align: bubbleAlign,
      })
    : [];

  return (
    <Group
      studioElementId={el.id}
      key={el.id}
      ref={innerRef}
      x={el.x}
      y={el.y}
      rotation={el.rotation}
      opacity={el.opacity ?? 1}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      shadowColor={bShadowColor}
      shadowBlur={bShadowBlur}
      shadowOpacity={bShadowOpacity}
      shadowOffset={bShadowOffset}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDblClick={onEdit}
      onDblTap={onEdit}
      {...bubbleInteractionProps}
    >
      {showCustomShape ? (
        outlineStyle ? (
          <Path
            data={styledBubblePolygonPathData(liveCustomShapePoints, outlineStyle, el.id, bStrokeW)}
            fill={el.fill}
            stroke={bStroke}
            strokeWidth={bStrokeW}
            lineJoin="round"
            lineCap="round"
          />
        ) : (
          <Line
            points={liveCustomShapePoints}
            closed
            fill={el.fill}
            stroke={bStroke}
            strokeWidth={bStrokeW}
            lineJoin="round"
            lineCap="round"
          />
        )
      ) : el.variant === "double" ? (
        <Path
          data={styled(doubleBubblePathData(el.width, el.height, bubbleTailSpec))}
          fill={el.fill}
          {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
          stroke={bStroke}
          strokeWidth={bStrokeW}
          dash={bDash}
          lineJoin="round"
          lineCap="round"
        />
      ) : el.variant === "shout" ? (
        <Path
          data={styled(burstStarPathData(
            el.width,
            el.height,
            normalizeBurstStarPoints(el.starPoints, BURST_STAR_VARIANT_PARAMS.shout.points),
            68 * Math.min(0.95, Math.max(0.1, el.starAmplitude ?? 36 / 68)),
            68,
          ))}
          fill={el.fill}
          {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
          stroke={bStroke}
          strokeWidth={bStrokeW}
          dash={bDash}
          lineJoin="round"
          lineCap="round"
        />
      ) : el.variant === "thought" ? (
        <>
          <Path
            data={styled(thoughtBubbleBodyPath(el.width, el.height))}
            fill={el.fill}
            {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
            stroke={bStroke}
            strokeWidth={bStrokeW}
            dash={bDash}
            lineJoin="round"
            lineCap="round"
          />
          {thoughtEllipses}
        </>
      ) : el.variant === "whisper" ? (
        <Path
          data={speechPathData}
          fill={el.fill}
          {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
          stroke={bStroke}
          strokeWidth={bStrokeW}
          lineJoin="round"
          lineCap="round"
          dash={bDash}
        />
      ) : el.variant === "scared" ? (
        <Path
          data={styled(scaredBubblePathData(el.width, el.height, bubbleTailSpec))}
          fill={el.fill === "transparent" ? "transparent" : (el.fill === "#ffffff" ? "#f5f3ff" : el.fill)}
          {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
          stroke="#7c3aed"
          strokeWidth={2}
          shadowColor="#7c3aed"
          shadowBlur={6}
          shadowOpacity={0.16}
          lineJoin="round"
          lineCap="round"
        />
      ) : el.variant === "system" ? (
        <>
          <Rect
            width={el.width}
            height={el.height}
            fill="#0a0f24"
            opacity={0.88}
            cornerRadius={4}
            stroke="#0ea5e9"
            strokeWidth={2.5}
            shadowColor="#0ea5e9"
            shadowBlur={8}
            shadowOpacity={0.4}
          />
          <Rect
            x={4}
            y={4}
            width={el.width - 8}
            height={el.height - 8}
            fill="transparent"
            cornerRadius={2}
            stroke="#38bdf8"
            strokeWidth={1}
            opacity={0.5}
          />
        </>
      ) : el.variant === "angry" ? (
        <Path
          data={styled(burstStarPathData(
            el.width,
            el.height,
            normalizeBurstStarPoints(el.starPoints, BURST_STAR_VARIANT_PARAMS.angry.points),
            64 * Math.min(0.95, Math.max(0.1, el.starAmplitude ?? 28 / 64)),
            64,
          ))}
          fill={el.fill}
          {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
          stroke={theme === "soft" ? "#dc2626" : theme === "vivid" ? "#7f1d1d" : "#991b1b"}
          strokeWidth={Math.max(bStrokeW, 3.5)}
          lineJoin="round"
          lineCap="round"
        />
      ) : el.variant === "phone" ? (
        <Path
          data={styled(bubblePathData(
            el.width,
            el.height,
            theme === "soft" ? 10 : theme === "vivid" ? 6 : 8,
            // 메신저는 짧은 꼬리(채팅 꼬리 느낌) — 없으면 본체만.
            showTail && bubbleTailSpec
              ? {
                  ...bubbleTailSpec,
                  length: Math.min(bubbleTailSpec.length, Math.max(8, bMinDim * 0.1)),
                  base: Math.min(bubbleTailSpec.base, Math.max(6, bMinDim * 0.12)),
                }
              : null,
          ))}
          fill={el.fill}
          {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
          stroke={bStroke}
          strokeWidth={bStrokeW}
          dash={bDash}
          lineJoin="round"
          lineCap="round"
        />
      ) : el.variant === "heart" ? (
        <Path
          data={heartBubblePathData(el.width, el.height)}
          fill={el.fill}
          {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
          stroke={bStroke}
          strokeWidth={bStrokeW}
          dash={bDash}
          lineJoin="round"
          lineCap="round"
        />
      ) : el.variant === "box" ? (
        <Rect
          width={el.width}
          height={el.height}
          fill={el.fill}
          {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
          cornerRadius={theme === "soft" ? 6 : theme === "vivid" ? 3 : 4}
          stroke={bStroke}
          strokeWidth={bStrokeW}
          dash={bDash}
        />
      ) : (
        <Path
          data={speechPathData}
          fill={el.fill}
          {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: el.width, height: el.height })}
          stroke={bStroke}
          strokeWidth={bStrokeW}
          dash={bDash}
          lineJoin="round"
          lineCap="round"
        />
      )}
      <KText
        text={baseText}
        width={textBoxWidth}
        height={textBoxHeight}
        x={bHPad}
        y={bVPadTop}
        fontSize={bFs}
        fontFamily={bubbleFontFamily}
        fontStyle={bubbleFontStyle}
        fill={el.textFill}
        align={bubbleAlign}
        verticalAlign="middle"
        lineHeight={bubbleLineHeight}
        letterSpacing={bubbleLetterSpacing}
      />
      {rubyOverlays.map((placement) => (
        <KText
          key={`bubble-ruby-${placement.start}-${placement.end}-${placement.ruby}`}
          text={placement.ruby}
          // First-line approximation: y is relative to the text box top (verticalAlign middle
          // is not re-measured). Honest MVP — multi-line wrap is not modelled.
          x={bHPad + placement.x}
          y={bVPadTop + placement.y}
          width={Math.max(placement.baseWidth, 1)}
          align="center"
          wrap="none"
          fontSize={placement.rubyFontSize}
          fontFamily={bubbleFontFamily}
          fontStyle={bubbleFontStyle}
          fill={el.textFill}
          listening={false}
        />
      ))}
      {tailHandle}
    </Group>
  );
}
