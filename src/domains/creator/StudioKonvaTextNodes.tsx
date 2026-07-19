import { Text as KText, TextPath as KTextPath } from "react-konva/lib/ReactKonvaCore";

import { formatVerticalText } from "./studio-bubble-text-runtime";
import {
  estimateTextGradientBBox,
  konvaGradientProps,
  legacyTextGradientToSpec,
} from "./studio-gradient-engine";
import { textNodeProps } from "./studio-node-props";
import { toKonvaSkewAttrs } from "./studio-skew";
import { buildTextPathData, isFlatTextPath, normalizeTextPath } from "./studio-text-path";

import type { El } from "./studio-element-model";
import type Konva from "konva";

export interface StudioTextTransformOptions {
  minFontSize: number;
  patchWidth?: boolean;
}

interface StudioKonvaTextInteractionProps {
  draggable: boolean;
  innerRef: (node: Konva.Node | null) => void;
  onSelect: () => void;
  onEdit: (id: string) => void;
  onPatch: (id: string, patch: Partial<El>) => void;
  dragBoundFunc: (pos: Konva.Vector2d) => Konva.Vector2d;
  onInteractionBegin: () => boolean;
  onInteractionEnd: () => void;
  onCommitTransform: (
    elId: string,
    fontSize: number,
    event: Konva.KonvaEventObject<Event>,
    options: StudioTextTransformOptions,
  ) => void;
}

export interface StudioKonvaTextNodeProps extends StudioKonvaTextInteractionProps {
  el: Extract<El, { type: "text" }>;
}

export interface StudioKonvaStickerNodeProps extends StudioKonvaTextInteractionProps {
  el: Extract<El, { type: "sticker" }>;
}

export function StudioKonvaTextNode({
  el,
  draggable,
  innerRef,
  onSelect,
  onEdit,
  onPatch,
  dragBoundFunc,
  onInteractionBegin,
  onInteractionEnd,
  onCommitTransform,
}: StudioKonvaTextNodeProps) {
  const interactionProps = textNodeProps<Partial<El>>({
    id: el.id,
    draggable,
    dragBoundFunc,
    onSelect,
    onEdit,
    onPatch,
    onInteractionBegin,
    onInteractionEnd,
  });

  if (el.textPath && !isFlatTextPath(normalizeTextPath(el.textPath))) {
    return (
      <KTextPath
        studioElementId={el.id}
        key={el.id}
        ref={innerRef}
        text={el.text}
        x={el.x}
        y={el.y}
        data={buildTextPathData(normalizeTextPath(el.textPath), el.width, el.fontSize)}
        fontSize={el.fontSize}
        fill={el.fillType === "gradient" ? undefined : el.fill}
        {...(el.fillType === "gradient"
          ? konvaGradientProps(
              el.gradient ?? legacyTextGradientToSpec(el.gradientColorStart, el.gradientColorEnd, el.gradientDirection),
              // 곡선 텍스트 로컬 bbox 근사 — baseline(fontSize×1.4) 중심으로 위아래 글자 폭 커버.
              { x: 0, y: 0, width: Math.max(1, el.width), height: el.fontSize * 2.8 },
            )
          : {})}
        stroke={el.stroke}
        strokeWidth={el.strokeWidth ?? 0}
        fillAfterStrokeEnabled
        lineJoin="round"
        rotation={el.rotation}
        opacity={el.opacity ?? 1}
        fontFamily={el.font ?? "Pretendard, sans-serif"}
        fontStyle={el.fontStyle ?? "bold"}
        align={el.align ?? "left"}
        letterSpacing={el.letterSpacing ?? 0}
        shadowColor={el.shadowColor}
        shadowBlur={el.shadowBlur}
        shadowOffsetX={el.shadowOffsetX}
        shadowOffsetY={el.shadowOffsetY}
        shadowOpacity={el.shadowOpacity}
        shadowEnabled={!!el.shadowColor && (el.shadowOpacity ?? 0) > 0}
        {...toKonvaSkewAttrs(el)}
        {...interactionProps}
        onTransformEnd={(event) => onCommitTransform(el.id, el.fontSize, event, { minFontSize: 10 })}
      />
    );
  }

  const text = el.vertical ? formatVerticalText(el.text) : el.text;
  return (
    <KText
      studioElementId={el.id}
      key={el.id}
      ref={innerRef}
      text={text}
      x={el.x}
      y={el.y}
      width={el.width}
      fontSize={el.fontSize}
      fill={el.fillType === "gradient" ? undefined : el.fill}
      {...(el.fillType === "gradient"
        ? konvaGradientProps(
            el.gradient ?? legacyTextGradientToSpec(el.gradientColorStart, el.gradientColorEnd, el.gradientDirection),
            estimateTextGradientBBox({
              width: el.width,
              text,
              fontSize: el.fontSize,
              lineHeight: el.lineHeight ?? 1,
            }),
          )
        : {})}
      stroke={el.stroke}
      strokeWidth={el.strokeWidth ?? 0}
      fillAfterStrokeEnabled
      lineJoin="round"
      rotation={el.rotation}
      opacity={el.opacity ?? 1}
      fontFamily={el.font ?? "Pretendard, sans-serif"}
      fontStyle={el.fontStyle ?? "bold"}
      align={el.align ?? "left"}
      letterSpacing={el.letterSpacing ?? 0}
      lineHeight={el.lineHeight ?? 1}
      shadowColor={el.shadowColor}
      shadowBlur={el.shadowBlur}
      shadowOffsetX={el.shadowOffsetX}
      shadowOffsetY={el.shadowOffsetY}
      shadowOpacity={el.shadowOpacity}
      shadowEnabled={!!el.shadowColor && (el.shadowOpacity ?? 0) > 0}
      {...toKonvaSkewAttrs(el)}
      {...interactionProps}
      onTransformEnd={(event) => onCommitTransform(el.id, el.fontSize, event, { minFontSize: 10, patchWidth: true })}
    />
  );
}

export function StudioKonvaStickerNode({
  el,
  draggable,
  innerRef,
  onSelect,
  onEdit,
  onPatch,
  dragBoundFunc,
  onInteractionBegin,
  onInteractionEnd,
  onCommitTransform,
}: StudioKonvaStickerNodeProps) {
  return (
    <KText
      studioElementId={el.id}
      key={el.id}
      ref={innerRef}
      text={el.text}
      x={el.x}
      y={el.y}
      fontSize={el.fontSize}
      rotation={el.rotation}
      opacity={el.opacity ?? 1}
      {...toKonvaSkewAttrs(el)}
      {...textNodeProps<Partial<El>>({
        id: el.id,
        draggable,
        dragBoundFunc,
        onSelect,
        onEdit,
        onPatch,
        onInteractionBegin,
        onInteractionEnd,
      })}
      onTransformEnd={(event) => onCommitTransform(el.id, el.fontSize, event, { minFontSize: 16 })}
    />
  );
}
