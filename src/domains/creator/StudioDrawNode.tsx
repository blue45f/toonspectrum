import { memo, useEffect, useState } from "react";
import {
  Arrow,
  Circle as KCircle,
  Ellipse,
  Group,
  Line,
  Path,
  Rect,
  Shape,
  Star,
} from "react-konva/lib/ReactKonvaCore";

import {
  buildCalligraphySegments,
  gpenSegmentWidths,
  processFreehandPoints,
  processPencilPoints,
  resampleStrokePressures,
  resolveStudioBrushRenderFamily,
  resolveStudioFreehandRenderPath,
  screentoneDotRadius,
  screentoneDotsForStroke,
  strokeRenderDistance,
} from "./studio-brush";
import {
  applyStudioBrushAliasWatercolorMaterial,
  mapStudioBrushAliasPressure,
  mapStudioBrushAliasPressureSamples,
  resolveStudioBrushAliasPencilPasses,
  resolveStudioBrushAliasWatercolorPlanSettings,
  studioBrushAliasEffectiveDiameter,
} from "./studio-brush-alias-profile";
import {
  DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS,
  normalizeStudioBrushDynamicsSettings,
  planNormalizedStudioDynamicBrushDabs,
  resolveStudioBrushDynamicsPresetId,
  studioBrushDynamicsSettingsForBrushId,
  studioBrushDynamicsSeedFromKey,
} from "./studio-brush-dynamics";
import {
  resolveNormalizedStudioBrushDabColor,
  resolveNormalizedStudioBrushGrainAlphaMultiplier,
} from "./studio-brush-material-dynamics";
import {
  planStudioDynamicBrushRenderBudget,
  STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
} from "./studio-brush-render-budget";
import { resolveStudioBrushSinglePointRoute } from "./studio-brush-runtime-contract";
import {
  resolveStudioStampBrushKind,
} from "./studio-brush-stamp-engine";
import {
  studioBrushSymmetryTransforms,
  studioDynamicBrushDabVariationsFromTransforms,
} from "./studio-brush-symmetry";
import {
  composeNormalizedStudioBrushTipLayerDab,
  composeStudioBrushDualTipAlphaMap,
  studioBrushDualTipUsesSolidEllipse,
  type StudioBrushComposableDab,
} from "./studio-brush-tip-composition";
import {
  buildStudioBrushTipAlphaMap,
  planStudioBrushTipStamp,
  studioBrushTipUsesSolidEllipse,
  type NormalizedStudioBrushTipSettings,
} from "./studio-brush-tip-stamp";
import {
  DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
  planCausalWatercolorBrushDabs,
} from "./studio-causal-watercolor-brush";
import {
  drawBounds,
  drawFreehandPenSegments,
  drawStudioCausalInkDabs,
  getSymmetricPoints,
} from "./studio-draw-rendering";
import {
  fxBrushSeedFromKey,
  planGlitterBrushParticles,
  planGlowBrushPasses,
  planNeonBrushPasses,
  planOilBrushDabs,
  planPastelBrushDabs,
} from "./studio-fx-brush";
import { konvaGradientProps } from "./studio-gradient-engine";
import { studioInkFallbackPressure } from "./studio-ink-pressure-model";
import {
  konvaPatternProps,
  loadPatternTileImage,
  patternDataUrl,
} from "./studio-pattern-fill";
import {
  buildStudioPerfectFreehandOutline,
  loadStudioPerfectFreehandStroker,
  peekStudioPerfectFreehandStroker,
  studioPerfectFreehandOutlineToPathData,
  resolveStudioPerfectFreehandProfile,
} from "./studio-perfect-freehand";
import {
  fillStudioPixelPencilCells,
  isStudioPixelPencilRenderMode,
  planStudioPixelPencilCells,
} from "./studio-pixel-pencil";
import {
  buildStudioRoughShapeRenderPlan,
  loadStudioRoughGenerator,
  peekStudioRoughGenerator,
  studioRoughSeedFromElementId,
  studioSketchStyleOfElement,
} from "./studio-rough-shape";
import { isStudioStrokePaintModelCompatible } from "./studio-stroke-paint-model";
import {
  effectiveCornerRadius,
  lineArrowHeadGeoms,
  normalizeShapeParams,
  normalizeStrokeStyle,
  polygonPathNodeLayoutInBounds,
  strokeDashArray,
} from "./studio-stroke-shapes";
import {
  planWatercolorBrushDabs,
  watercolorBrushSeedFromKey,
} from "./studio-watercolor-brush";
import { StudioStampDrawShape } from "./StudioStampDrawShape";

import type { CalligraphyStylusInput } from "./studio-brush";
import type { NormalizedStudioBrushDynamicsSettings } from "./studio-brush-dynamics";
import type { DrawEl } from "./studio-element-model";
import type { StudioPatternSpec } from "./studio-pattern-fill";
import type { StudioPerfectFreehandStroker } from "./studio-perfect-freehand";
import type { StudioRoughGeneratorHandle } from "./studio-rough-shape";

type PerfectInkDebugState = {
  brush: string;
  pointCount: number;
  strokeDistance: number;
  isVeryShort: boolean;
  isSparseLong: boolean;
  profile: string;
  outlineDistance?: number;
  outlinePointCount?: number;
  isDegeneratePath?: boolean;
};

function setPerfectInkDebugState(state: PerfectInkDebugState | null): void {
  if (typeof globalThis === "undefined") {
    return;
  }
  (globalThis as { __perfectInkDebugState?: PerfectInkDebugState | null }).__perfectInkDebugState =
    state;
}

const STUDIO_PENCIL_DEFAULT_JITTER_RADIUS = 0.75;
const dynamicBrushSettingsBySnapshot = new WeakMap<object, NormalizedStudioBrushDynamicsSettings>();
const dynamicBrushDefaultSettingsById = new Map<string, NormalizedStudioBrushDynamicsSettings>();

/**
 * Active drafts replace the DrawEl shell while retaining immutable settings snapshots. Normalize
 * each custom snapshot once; built-in runtime profiles are likewise stable per brush id. This
 * avoids walking every mapping, tip and alpha payload again on each animation frame.
 */
function studioDrawNodeDynamicBrushSettings(
  el: DrawEl,
  dynamicBrushId: string
): NormalizedStudioBrushDynamicsSettings {
  const source = el.brushDynamics;
  if (typeof source === "object" && source !== null) {
    const cached = dynamicBrushSettingsBySnapshot.get(source);
    if (cached) return cached;
    const normalized = normalizeStudioBrushDynamicsSettings(source);
    dynamicBrushSettingsBySnapshot.set(source, normalized);
    return normalized;
  }
  if (source !== undefined && source !== null) {
    return normalizeStudioBrushDynamicsSettings(source);
  }

  const brushId = typeof el.brush === "string" && el.brush
    ? el.brush
    : dynamicBrushId;
  const cached = dynamicBrushDefaultSettingsById.get(brushId);
  if (cached) return cached;
  const normalized = studioBrushDynamicsSettingsForBrushId(brushId)
    ?? studioBrushDynamicsSettingsForBrushId(dynamicBrushId)
    ?? normalizeStudioBrushDynamicsSettings();
  dynamicBrushDefaultSettingsById.set(brushId, normalized);
  return normalized;
}

/**
 * `processPencilPoints` is the frozen legacy 0.75 px graphite texture. Alias profiles scale its
 * deterministic offsets instead of introducing another random source, so collaboration replay and
 * retained rendering keep identical pixels while each pencil pass can have its own grain spread.
 */
function processStudioPencilAliasPassPoints(
  points: number[],
  jitterRadius: number,
): number[] {
  const jittered = processPencilPoints(points);
  if (jitterRadius === STUDIO_PENCIL_DEFAULT_JITTER_RADIUS) return jittered;
  const scale = jitterRadius / STUDIO_PENCIL_DEFAULT_JITTER_RADIUS;
  return jittered.map((value, coordinateIndex) => {
    const source = points[coordinateIndex];
    return source === undefined ? value : source + (value - source) * scale;
  });
}

// 손그림(스케치) 도형용 rough.js generator 훅 — 스케치가 켜진 도형이 처음 보일 때만
// 동적 import로 로드한다(Studio eager 청크에 rough.js 미포함). 로드 전에는 null을 반환해
// 깨끗한 Konva 프리미티브 폴백으로 그리고, 로드가 끝나면 상태 변경으로 다시 그린다.
function useStudioRoughGenerator(wanted: boolean): StudioRoughGeneratorHandle | null {
  const [generator, setGenerator] = useState<StudioRoughGeneratorHandle | null>(
    () => peekStudioRoughGenerator()
  );
  useEffect(() => {
    if (!wanted || generator) return;
    let active = true;
    loadStudioRoughGenerator()
      .then((loaded) => {
        if (active) setGenerator(loaded);
      })
      .catch(() => {
        // 로드 실패 시 깨끗한 프리미티브 렌더를 유지한다 — 다음 마운트가 재시도.
      });
    return () => {
      active = false;
    };
  }, [wanted, generator]);
  return wanted ? generator : null;
}

// 퍼펙트-프리핸드(tldraw 필기감) 스트로커 훅 — 퍼펙트 브러시 획이 처음 보일 때만 동적
// import로 로드한다(Studio eager 청크에 perfect-freehand 미포함). 로드 전에는 null을 반환해
// 깨끗한 Line 폴백으로 그리고, 로드가 끝나면 상태 변경으로 다시 그린다.
function useStudioPerfectFreehandStroker(wanted: boolean): StudioPerfectFreehandStroker | null {
  const [stroker, setStroker] = useState<StudioPerfectFreehandStroker | null>(
    () => peekStudioPerfectFreehandStroker()
  );
  useEffect(() => {
    if (!wanted || stroker) return;
    let active = true;
    loadStudioPerfectFreehandStroker()
      .then((loaded) => {
        // 스트로커는 함수 값이라 updater 로 오인되지 않게 반드시 클로저로 감싼다.
        if (active) setStroker(() => loaded);
      })
      .catch(() => {
        // 로드 실패 시 깨끗한 Line 폴백 렌더를 유지한다 — 다음 마운트가 재시도.
      });
    return () => {
      active = false;
    };
  }, [wanted, stroker]);
  return wanted ? stroker : null;
}

// 패턴 채우기 타일 이미지 훅 — 패턴 스펙의 SVG 타일(data URL)을 HTMLImage로 비동기 로드한다.
// UrlImage의 effect 로드 방식을 훅으로 컴포넌트화한 것. 타일 src는 patternId/색에만
// 의존하므로(배율은 fillPatternScale로 적용) 배율 조절로는 재로드되지 않는다.
// 로드 전/실패 시 null → konvaPatternProps가 no-op이 되어 fill/그라데이션 폴백 유지.
function usePatternFillImage(pattern: StudioPatternSpec | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const tileSrc = pattern ? patternDataUrl(pattern) : null;
  useEffect(() => {
    if (!tileSrc) {
      setImage(null);
      return;
    }
    let active = true;
    loadPatternTileImage(tileSrc, () => new globalThis.Image())
      .then((img) => {
        if (active) setImage(img);
      })
      .catch(() => {
        if (active) setImage(null);
      });
    return () => {
      active = false;
    };
  }, [tileSrc]);
  return image;
}

// memo 는 라이브 드로잉의 핵심 계약이다: 초안이 rAF마다 리렌더를 일으켜도 커밋된 획들은 같은
// el 참조를 받으므로 여기서 잘린다. memo 가 없으면 모든 커밋 획이 매 프레임 스무딩을 재계산해
// 새 points 배열을 만들고, react-konva 가 이를 시각 변경으로 보고 메인 레이어 전체를 다시
// 래스터한다 — 콘텐츠가 쌓일수록 스트로크가 점점 무거워지던 원인.
export const StudioDrawNode = memo(function StudioDrawNode({
  el,
  activeDraft = false,
}: {
  el: DrawEl;
  /** 활성 수채 초안은 움직이는 종점 pigment를 영구 station으로 굳히지 않는다. */
  activeDraft?: boolean;
}) {
  const kind = el.kind ?? "freehand";
  // 패턴 채우기 타일(로드 전 null) — 우선순위: 패턴 > 그라데이션 > 단색(fillPriority).
  const patternImage = usePatternFillImage(el.pattern);
  const composite = el.mode === "eraser" ? "destination-out" : "source-over";
  const opacity = el.opacity ?? 1;
  const stroke = el.mode === "eraser" ? "#16100c" : el.stroke;
  const strokeWidth = Math.max(1, el.strokeWidth);
  // 스트로크 스타일(점선/선 끝) + 도형 파라미터 — 미설정 요소는 기본값으로 정규화된다.
  const strokeStyle = normalizeStrokeStyle(el.strokeStyle);
  const shapeParams = normalizeShapeParams(el.shapeParams);
  const shapeDash = strokeDashArray(strokeStyle.dash, strokeWidth);
  // 손그림(스케치) 스타일 — 켜진 도형은 rough.js 패스로 그린다(요소 id 시드로 결정적).
  const sketchStyle = kind !== "freehand" ? studioSketchStyleOfElement(el) : null;
  const roughGenerator = useStudioRoughGenerator(sketchStyle?.enabled === true);
  // 퍼펙트-프리핸드 브러시 — 커밋/리테인드 초안 렌더 전용(다이렉트 핫패스 라이브 잉크는
  // pen/marker 패밀리만 대상이라 이 패밀리는 건드리지 않는다). 프로필이 있으면 스트로커 로드.
  const perfectProfile = kind === "freehand" && el.mode !== "eraser"
    ? resolveStudioPerfectFreehandProfile(el.brush)
    : null;
  const perfectStroker = useStudioPerfectFreehandStroker(perfectProfile !== null);

  const stampBrushKind = kind === "freehand" && el.mode !== "eraser"
    ? resolveStudioStampBrushKind(el.brush)
    : null;
  const dynamicBrushId = kind === "freehand" && el.mode !== "eraser"
    ? resolveStudioBrushDynamicsPresetId(el.brush)
    : null;
  // Stamp and dynamic-dab renderers own their symmetry fan inside one bounded Shape. Do not build
  // and discard up to 64 complete transformed source-point arrays on every active-draft frame.
  const symmetricVariations = stampBrushKind || dynamicBrushId
    ? [el.points]
    : getSymmetricPoints(el.points, el.symmetry);
  const dynamicBrushPlan = dynamicBrushId
    ? (() => {
        const dynamics = studioDrawNodeDynamicBrushSettings(el, dynamicBrushId);
        const seed = studioBrushDynamicsSeedFromKey(`${el.id}:${dynamics.seed}`);
        const dabPlanInput = {
          points: el.points,
          pressures: el.pressures,
          tangentialPressures: el.tangentialPressures,
          speeds: el.speeds,
          tiltXs: el.tiltXs,
          tiltYs: el.tiltYs,
          twists: el.twists,
          baseWidth: strokeWidth,
          baseOpacity: dynamics.opacity.base,
          seed,
        };
        let baseDabs = planNormalizedStudioDynamicBrushDabs(
          { ...dabPlanInput, maxDabs: DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS },
          dynamics
        );
        const symmetryTransforms = studioBrushSymmetryTransforms(el.symmetry);
        const renderBudget = planStudioDynamicBrushRenderBudget({
          settings: dynamics,
          dabCount: baseDabs.length,
          symmetryCount: symmetryTransforms.length,
          markBudget: activeDraft
            ? STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET
            : STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
        });
        if (renderBudget.maxDabsPerVariation < baseDabs.length) {
          // The dynamics planner's bounded pass redistributes these stations across the whole
          // stroke, retaining both endpoints instead of truncating a dense prefix.
          baseDabs = planNormalizedStudioDynamicBrushDabs(
            { ...dabPlanInput, maxDabs: renderBudget.maxDabsPerVariation },
            dynamics
          );
        }
        return {
          dynamics,
          seed,
          renderBudget,
          dabVariations: studioDynamicBrushDabVariationsFromTransforms(
            baseDabs,
            symmetryTransforms
          ),
        };
      })()
    : null;
  const dynamicDabVariations = dynamicBrushPlan?.dabVariations ?? null;
  const dynamicTipRenderPlan = dynamicBrushPlan
    ? (() => {
        const tipDefinitions = [
          dynamicBrushPlan.dynamics.tip,
          ...dynamicBrushPlan.dynamics.tipLayers.map((layer) => layer.tip),
        ];
        const grainActive = dynamicBrushPlan.dynamics.grain.amount > 0;
        // 듀얼 브러시는 1차 팁(index 0)에만 합성한다 — 비활성 시 두 함수 모두 기존과 동일 반환.
        const dualBrush = dynamicBrushPlan.dynamics.dualBrush;
        const tipUsesEllipse = tipDefinitions.map((tip, tipIndex) => (
          !grainActive && (tipIndex === 0
            ? studioBrushDualTipUsesSolidEllipse(tip, dualBrush)
            : studioBrushTipUsesSolidEllipse(tip))
        ));
        return {
          tipUsesEllipse,
          tipAlphaMaps: tipDefinitions.map((tip, tipIndex) => (
            tipUsesEllipse[tipIndex]
              ? null
              : tipIndex === 0
                ? composeStudioBrushDualTipAlphaMap(tip, dualBrush)
                : buildStudioBrushTipAlphaMap(tip)
          )),
        };
      })()
    : null;

  return (
    <Group studioElementId={el.id} listening={false}>
      {symmetricVariations.map((points, index) => {
        // 손그림(스케치) 모드 — 모든 도형 종류를 rough.js 패스로 그린다. generator 로드 전이나
        // 지오메트리 부족으로 계획이 비면 아래 깨끗한 프리미티브 분기로 그대로 폴백한다.
        if (kind !== "freehand" && sketchStyle?.enabled && roughGenerator) {
          const sketchPlan = buildStudioRoughShapeRenderPlan(roughGenerator, {
            kind,
            points,
            strokeWidth,
            hasFill: Boolean(el.fill),
            shapeParams,
            style: sketchStyle,
            // 대칭 복제본은 index 오프셋으로 서로 다른(그러나 결정적인) 흔들림을 갖는다.
            seed: studioRoughSeedFromElementId(el.id) + index,
          });
          if (sketchPlan.length > 0) {
            const lineHeads =
              kind === "line" ? lineArrowHeadGeoms(points, strokeStyle, strokeWidth) : [];
            return (
              <Group key={index} opacity={opacity} listening={false}>
                {sketchPlan.map((path, pathIndex) =>
                  path.role === "outline" ? (
                    <Path
                      key={pathIndex}
                      data={path.data}
                      stroke={stroke}
                      strokeWidth={path.strokeWidth}
                      dash={shapeDash}
                      lineCap={strokeStyle.lineCap}
                      lineJoin="round"
                      globalCompositeOperation={composite}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  ) : path.role === "fill-hatch" ? (
                    <Path
                      key={pathIndex}
                      data={path.data}
                      stroke={el.fill}
                      strokeWidth={path.strokeWidth}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={composite}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  ) : (
                    <Path
                      key={pathIndex}
                      data={path.data}
                      fill={path.role === "outline-fill" ? stroke : el.fill}
                      globalCompositeOperation={composite}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  )
                )}
                {lineHeads.map((head, headIndex) =>
                  head.kind === "dot" ? (
                    <KCircle
                      key={`head-${headIndex}`}
                      x={head.cx}
                      y={head.cy}
                      radius={head.r}
                      fill={stroke}
                      globalCompositeOperation={composite}
                      listening={false}
                    />
                  ) : (
                    <Line
                      key={`head-${headIndex}`}
                      points={head.points}
                      closed
                      fill={stroke}
                      lineJoin="round"
                      globalCompositeOperation={composite}
                      listening={false}
                    />
                  )
                )}
              </Group>
            );
          }
        }

        if (kind === "rect") {
          const box = drawBounds(points);
          return (
            <Rect
              key={index}
              x={box.x}
              y={box.y}
              width={Math.max(0.1, box.width)}
              height={Math.max(0.1, box.height)}
              fill={el.fill}
              {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: Math.max(0.1, box.width), height: Math.max(0.1, box.height) })}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              cornerRadius={effectiveCornerRadius(box.width, box.height, shapeParams.cornerRadius)}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "ellipse") {
          const box = drawBounds(points);
          return (
            <Ellipse
              key={index}
              x={box.x + box.width / 2}
              y={box.y + box.height / 2}
              radiusX={Math.max(0.1, box.width / 2)}
              radiusY={Math.max(0.1, box.height / 2)}
              fill={el.fill}
              {...konvaGradientProps(el.gradient, { x: -box.width / 2, y: -box.height / 2, width: Math.max(0.1, box.width), height: Math.max(0.1, box.height) })}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "star") {
          const box = drawBounds(points);
          return (
            <Star
              key={index}
              x={box.x + box.width / 2}
              y={box.y + box.height / 2}
              numPoints={shapeParams.starPoints}
              innerRadius={Math.max(0.1, (Math.min(box.width, box.height) / 2) * shapeParams.starInnerRatio)}
              outerRadius={Math.max(0.1, Math.min(box.width, box.height) / 2)}
              fill={el.fill}
              {...konvaGradientProps(el.gradient, { x: -Math.min(box.width, box.height) / 2, y: -Math.min(box.width, box.height) / 2, width: Math.max(0.1, Math.min(box.width, box.height)), height: Math.max(0.1, Math.min(box.width, box.height)) })}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "arrow") {
          return (
            <Arrow
              key={index}
              points={points}
              pointerLength={Math.max(8, strokeWidth * 2)}
              pointerWidth={Math.max(8, strokeWidth * 2)}
              fill={stroke}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineCap={strokeStyle.lineCap}
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "triangle") {
          const box = drawBounds(points);
          const layout = polygonPathNodeLayoutInBounds(box.x, box.y, box.width, box.height, 3);
          return (
            <Line
              key={index}
              x={layout.x}
              y={layout.y}
              points={[...layout.points]}
              closed
              fill={el.fill}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "polygon") {
          const box = drawBounds(points);
          const layout = polygonPathNodeLayoutInBounds(
            box.x,
            box.y,
            box.width,
            box.height,
            shapeParams.polygonSides,
          );
          return (
            <Line
              key={index}
              x={layout.x}
              y={layout.y}
              points={[...layout.points]}
              closed
              fill={el.fill}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "freehand") {
          const brush = el.brush ?? "pen";
          const brushFamily = resolveStudioBrushRenderFamily(brush);
          const isPerfectAliasBrush = brush.startsWith("perfect-");
          const pixelPencil = isStudioPixelPencilRenderMode(brush);
          const aliasStrokeWidth = el.mode === "eraser"
            ? strokeWidth
            : studioBrushAliasEffectiveDiameter(brush, strokeWidth);
          const aliasPencilPasses = el.mode === "eraser"
            ? []
            : resolveStudioBrushAliasPencilPasses(brush);
          const stampKind = stampBrushKind;
          const dynamicBrush = dynamicBrushId !== null;
          // Legacy documents predate the explicit causal-walker marker, but their four stamp
          // brushes still need the exact dab renderer for a one-point tap. The shared pure route
          // keeps Canvas, SVG and the future WebGPU playback contract in agreement.
          const singlePointRoute = resolveStudioBrushSinglePointRoute({
            brushId: brush,
            mode: el.mode,
            causalInkEnabled:
              el.sampleSpacing !== undefined || el.pressureModel !== undefined,
          });
          const renderSampleDistance = strokeRenderDistance(el.sampleSpacing);
          const pointCount = Math.floor(points.length / 2);
          const pointBounds = pointCount < 2
            ? null
            : points.reduce<{ minX: number; minY: number; maxX: number; maxY: number }>((
              bounds,
              point,
              index,
            ) => {
              if (index % 2 === 1) return bounds;
              return {
                minX: Math.min(bounds.minX, point),
                maxX: Math.max(bounds.maxX, point),
                minY: Math.min(bounds.minY, points[index + 1]!),
                maxY: Math.max(bounds.maxY, points[index + 1]!),
              };
            }, {
              minX: points[0] ?? 0,
              maxX: points[0] ?? 0,
              minY: points[1] ?? 0,
              maxY: points[1] ?? 0,
            });
          const strokeSpanX = pointBounds ? pointBounds.maxX - pointBounds.minX : 0;
          const strokeSpanY = pointBounds ? pointBounds.maxY - pointBounds.minY : 0;
          const strokeDistance = Math.hypot(strokeSpanX, strokeSpanY);
          const isCompactPerfectDotRoute = isPerfectAliasBrush
            && singlePointRoute === "generic-dot"
            && pointCount <= 4
            && strokeDistance < 16;

          if (pixelPencil && el.mode !== "eraser") {
            const pixelPlan = planStudioPixelPencilCells({ points, strokeWidth: aliasStrokeWidth });
            if (!pixelPlan.complete) return null;
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  context.save();
                  context.fillStyle = stroke;
                  fillStudioPixelPencilCells(context, pixelPlan.cells);
                  context.restore();
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
                perfectDrawEnabled={false}
              />
            );
          }

          if (
            points.length === 2
            && singlePointRoute === "generic-dot"
            && perfectProfile === null
            && aliasPencilPasses.length > 0
          ) {
            return (
              <Group key={index} opacity={opacity} listening={false}>
                {aliasPencilPasses.map((pass) => (
                  <KCircle
                    key={pass.role}
                    x={points[0]}
                    y={points[1]}
                    radius={Math.max(0.35, aliasStrokeWidth * pass.widthScale / 2)}
                    fill={stroke}
                    opacity={pass.opacityScale}
                    globalCompositeOperation={composite}
                    listening={false}
                  />
                ))}
              </Group>
            );
          }

          if (
            points.length === 2 &&
            singlePointRoute === "generic-dot"
            && !isPerfectAliasBrush
          ) {
            const sourcePressure = Math.min(1, Math.max(0, el.pressures?.[0] ?? 0.5));
            const pressure = el.mode === "eraser"
              ? sourcePressure
              : mapStudioBrushAliasPressure(brush, sourcePressure, 0.5);
            const pressureAware = el.mode === "eraser"
              || brushFamily === "pen"
              || brushFamily === "gpen"
              || brushFamily === "calligraphy"
              || isPerfectAliasBrush
              || brushFamily === "marker";
            const width = pressureAware
              ? aliasStrokeWidth * (0.3 + pressure * 1.4)
              : aliasStrokeWidth;
            if (perfectProfile) {
              const dotWidth = Math.max(Math.max(aliasStrokeWidth, 2), width);
              const minimumDotRadius = brush === "perfect-ink" ? 3 : 1.4;
              return (
                <KCircle
                  key={index}
                  x={points[0]}
                  y={points[1]}
                  radius={Math.max(minimumDotRadius, dotWidth / 2)}
                  fill={stroke}
                  opacity={opacity}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              );
            }
            return (
              <KCircle
                key={index}
                x={points[0]}
                y={points[1]}
                radius={Math.max(0.35, width / 2)}
                fill={stroke}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (
            points.length <= 4 &&
            singlePointRoute === "generic-dot"
            && isCompactPerfectDotRoute
          ) {
            const sourcePressure = Math.min(1, Math.max(0, el.pressures?.[0] ?? 0.5));
            const pressure = el.mode === "eraser"
              ? sourcePressure
              : mapStudioBrushAliasPressure(brush, sourcePressure, 0.5);
            const pressureAware = el.mode === "eraser"
              || brushFamily === "pen"
              || brushFamily === "gpen"
              || brushFamily === "calligraphy"
              || isPerfectAliasBrush
              || brushFamily === "marker";
            const width = pressureAware
              ? aliasStrokeWidth * (0.3 + pressure * 1.4)
              : aliasStrokeWidth;
            if (perfectProfile) {
              const dotWidth = Math.max(Math.max(aliasStrokeWidth, 2), width);
              const minimumDotRadius = brush === "perfect-ink" ? 3 : 1.4;
              return (
                <KCircle
                  key={index}
                  x={points[0]}
                  y={points[1]}
                  radius={Math.max(minimumDotRadius, dotWidth / 2)}
                  fill={stroke}
                  opacity={opacity}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              );
            }
            return (
              <KCircle
                key={index}
                x={points[0]}
                y={points[1]}
                radius={Math.max(0.35, width / 2)}
                fill={stroke}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          {
            // 스탬프 엔진 계열(속도 잉크·정밀 에어브러시·그레인 연필·물맛 붓): 라이브 프리뷰와
            // 커밋이 같은 결정적 dab 시퀀스를 그린다 — 증분/재생/협업 복원에서 픽셀이 동일하다.
            if (stampKind) {
              return (
                <StudioStampDrawShape
                  key={index}
                  composite={composite}
                  el={el}
                  opacity={opacity}
                  renderSampleDistance={renderSampleDistance}
                  stampKind={stampKind}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
              );
            }
          }

          if (dynamicBrush && el.mode !== "eraser") {
            const dabVariations = dynamicDabVariations ?? [];
            const dynamics = dynamicBrushPlan!.dynamics;
            const dynamicSeed = dynamicBrushPlan!.seed;
            const stampGrid = dynamicBrushPlan!.renderBudget.stampGrid;
            const tipUsesEllipse = dynamicTipRenderPlan!.tipUsesEllipse;
            const tipAlphaMaps = dynamicTipRenderPlan!.tipAlphaMaps;
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  context.save();
                  const inheritedAlpha = context.globalAlpha;
                  for (const dabs of dabVariations) {
                    const strokeOriginX = dabs[0]?.sourceX ?? dabs[0]?.x ?? 0;
                    const strokeOriginY = dabs[0]?.sourceY ?? dabs[0]?.y ?? 0;
                    const grainAt = (x: number, y: number) => (
                      resolveNormalizedStudioBrushGrainAlphaMultiplier({
                        x,
                        y,
                        strokeOriginX,
                        strokeOriginY,
                        strokeSeed: dynamicSeed,
                      }, dynamics.grain)
                    );
                    const renderTipDab = (
                      composedDab: StudioBrushComposableDab,
                      tip: NormalizedStudioBrushTipSettings,
                      tipIndex: number,
                      dabColor: string
                    ) => {
                      const baseAlpha = inheritedAlpha
                        * Math.min(1, Math.max(
                          0,
                          composedDab.opacity * composedDab.flow * opacity
                        ));
                      const tipAlphaMap = tipAlphaMaps[tipIndex] ?? null;
                      if (tipUsesEllipse[tipIndex] || !tipAlphaMap) {
                        context.save();
                        context.globalAlpha = baseAlpha * grainAt(composedDab.x, composedDab.y);
                        context.translate(composedDab.x, composedDab.y);
                        context.rotate(composedDab.angle * Math.PI / 180);
                        context.scale(1, composedDab.roundness);
                        context.beginPath();
                        context.arc(
                          0,
                          0,
                          Math.max(0.25, composedDab.size / 2),
                          0,
                          Math.PI * 2
                        );
                        context.fillStyle = dabColor;
                        context.fill();
                        context.restore();
                        return;
                      }
                      // PNG-alpha/procedural tip path. Grain is sampled in world coordinates after
                      // multi-tip transforms, so canvas-fixed and stroke-fixed remain distinguishable.
                      const stamp = planStudioBrushTipStamp(composedDab, tip, {
                        alphaMap: tipAlphaMap,
                        grid: stampGrid,
                      });
                      for (const sample of stamp.samples) {
                        const sampleX = composedDab.x + sample.dx;
                        const sampleY = composedDab.y + sample.dy;
                        context.save();
                        context.globalAlpha = baseAlpha
                          * sample.alpha
                          * grainAt(sampleX, sampleY);
                        context.beginPath();
                        context.arc(sampleX, sampleY, sample.radius, 0, Math.PI * 2);
                        context.fillStyle = dabColor;
                        context.fill();
                        context.restore();
                      }
                    };
                    for (const dab of dabs) {
                      const dabColor = resolveNormalizedStudioBrushDabColor(
                        stroke,
                        dab.index,
                        dynamicSeed,
                        dynamics.colorDynamics
                      );
                      renderTipDab(dab, dynamics.tip, 0, dabColor);
                      for (const [layerIndex, layer] of dynamics.tipLayers.entries()) {
                        const composedDab = composeNormalizedStudioBrushTipLayerDab(dab, layer);
                        if (composedDab) {
                          renderTipDab(composedDab, layer.tip, layerIndex + 1, dabColor);
                        }
                      }
                    }
                  }
                  context.restore();
                }}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (perfectProfile && el.mode !== "eraser") {
            const debug = typeof globalThis !== "undefined"
              && (globalThis as { __debugPerfectInk?: boolean }).__debugPerfectInk;
            if (debug) {
              console.log(
                `[debug-perfect-ink] render brush=${brush} mode=${el.mode} points=${pointCount} stroker=${perfectStroker ? "loaded" : "missing"}`
              );
            }
            // 퍼펙트-프리핸드(tldraw 필기감): 필압·테이퍼가 새겨진 아웃라인 폴리곤을 선 색으로
            // 채운다(stroked Line 대체). getStroke는 순수 함수라 협업 복제본·재렌더에서 결정적.
            // 라이브 계약(§핫패스): 다이렉트 라이브 초안 파이프라인(임페러티브 sceneFunc/WebGPU)
            // 은 pen/marker 전용이며 여기서 건드리지 않는다 — "perfect" 패밀리 초안은 리테인드
            // 경로로 이 브랜치를 그대로 지나고, pointer-up 커밋 스왑 계약도 동일하게 유지된다.
            // 아주 짧은 스토크는 경량 Line 폴백이 더 안정적이다.
            // 퍼펙트 경로 생성은 짧은 이동에서 Path가 1픽셀 이하로만 변화해 보이지 않는 경우가 있다.
            // 브러시 검증 시 false negative를 만들 수 있다.
            const isVeryShortPerfectStroke = pointCount <= 3 && strokeDistance < 16;
            const sparseSpacingPx = strokeDistance / Math.max(1, pointCount - 1);
            const isSparseLongPerfectStroke = perfectProfile.id === "perfect-ink"
              && pointCount >= 4
              && strokeDistance >= 180
              && sparseSpacingPx >= Math.max(20, aliasStrokeWidth * 4);
            if (debug) {
              setPerfectInkDebugState({
                brush,
                pointCount,
                strokeDistance,
                isVeryShort: isVeryShortPerfectStroke,
                isSparseLong: isSparseLongPerfectStroke,
                profile: perfectProfile.id,
              });
            }
            if (isVeryShortPerfectStroke || isSparseLongPerfectStroke) {
              const perfectFallback = resolveStudioFreehandRenderPath(points, {
                sampleSpacing: el.sampleSpacing,
                legacyMinDistance: renderSampleDistance,
                legacyTension: 0.4,
              });
              const lineWidth = Math.max(aliasStrokeWidth, 2);
              const dotRadius = Math.max(2, lineWidth * 0.22);
              return (
                <Group key={index} opacity={opacity} listening={false}>
                  <Line
                    points={perfectFallback.points}
                    stroke={stroke}
                    strokeWidth={lineWidth}
                    lineCap="round"
                    lineJoin="round"
                    tension={perfectFallback.tension}
                    globalCompositeOperation={composite}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                  {perfectFallback.points.length >= 4 ? (
                    <>
                      <KCircle
                        x={perfectFallback.points[0]!}
                        y={perfectFallback.points[1]!}
                        radius={dotRadius}
                        fill={stroke}
                        opacity={opacity}
                        globalCompositeOperation={composite}
                        listening={false}
                      />
                      <KCircle
                        x={perfectFallback.points[perfectFallback.points.length - 2]!}
                        y={perfectFallback.points[perfectFallback.points.length - 1]!}
                        radius={dotRadius}
                        fill={stroke}
                        opacity={opacity}
                        globalCompositeOperation={composite}
                        listening={false}
                      />
                    </>
                  ) : null}
                </Group>
              );
            }
            if (perfectStroker) {
              const perfectOutline = buildStudioPerfectFreehandOutline(perfectStroker, {
                points,
                pressures: el.pressures,
                strokeWidth: aliasStrokeWidth,
                profile: perfectProfile,
              });
              const perfectPathData = studioPerfectFreehandOutlineToPathData(perfectOutline);
              const perfectOutlineBounds = perfectOutline.length < 2
                ? null
                : perfectOutline.reduce<{ minX: number; maxX: number; minY: number; maxY: number }>(
                  (bounds, point) => ({
                    minX: Math.min(bounds.minX, point[0]),
                    maxX: Math.max(bounds.maxX, point[0]),
                    minY: Math.min(bounds.minY, point[1]),
                    maxY: Math.max(bounds.maxY, point[1]),
                  }),
                  {
                    minX: perfectOutline[0]?.[0] ?? 0,
                    maxX: perfectOutline[0]?.[0] ?? 0,
                    minY: perfectOutline[0]?.[1] ?? 0,
                    maxY: perfectOutline[0]?.[1] ?? 0,
                  },
                );
              const outlineSpanX = perfectOutlineBounds
                ? perfectOutlineBounds.maxX - perfectOutlineBounds.minX
                : 0;
              const outlineSpanY = perfectOutlineBounds
                ? perfectOutlineBounds.maxY - perfectOutlineBounds.minY
                : 0;
              const outlineDistance = Math.hypot(outlineSpanX, outlineSpanY);
              const isDegeneratePerfectPath = perfectOutline.length < 12
                && strokeDistance < 120
                || outlineDistance < Math.max(6, strokeDistance * 0.35);
              if (debug) {
                console.log(
                  `[debug-perfect-ink] pathDecision brush=${brush} points=${pointCount} ` +
                    `strokeDistance=${strokeDistance.toFixed(1)} ` +
                    `outlineDistance=${outlineDistance.toFixed(1)} ` +
                    `outlinePoints=${perfectOutline.length} ` +
                    `isDegenerate=${isDegeneratePerfectPath ? "true" : "false"} ` +
                    `pathLen=${perfectPathData.length}`
                );
                setPerfectInkDebugState({
                  brush,
                  pointCount,
                  strokeDistance,
                  isVeryShort: isVeryShortPerfectStroke,
                  isSparseLong: isSparseLongPerfectStroke,
                  profile: perfectProfile.id,
                  outlineDistance,
                  outlinePointCount: perfectOutline.length,
                  isDegeneratePath: isDegeneratePerfectPath,
                });
              }
              if (perfectPathData && !isDegeneratePerfectPath) {
                return (
                  <Path
                    key={index}
                    data={perfectPathData}
                    fill={stroke}
                    opacity={opacity}
                    globalCompositeOperation={composite}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                );
              }
            }
            // 스트로커 로드 전/지오메트리 부족 — 깨끗한 Line 폴백(로드 완료 시 훅 상태로 재렌더).
            const perfectFallback = resolveStudioFreehandRenderPath(points, {
              sampleSpacing: el.sampleSpacing,
              legacyMinDistance: renderSampleDistance,
              legacyTension: 0.4,
            });
            return (
              <Line
                key={index}
                points={perfectFallback.points}
                stroke={stroke}
                strokeWidth={aliasStrokeWidth}
                opacity={opacity}
                lineCap="round"
                lineJoin="round"
                tension={perfectFallback.tension}
                globalCompositeOperation={composite}
                listening={false}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
              />
            );
          }

          if (brushFamily === "calligraphy" && el.mode !== "eraser") {
            const smoothed = processFreehandPoints(points, renderSampleDistance);
            const sourcePointCount = Math.floor(points.length / 2);
            const sampleCount = Math.min(
              sourcePointCount,
              Math.max(el.tiltXs?.length ?? 0, el.tiltYs?.length ?? 0, el.twists?.length ?? 0)
            );
            const stylusSamples: CalligraphyStylusInput[] = Array.from(
              { length: sampleCount },
              (_, sampleIndex) => ({
                pointerType: "pen",
                tiltX: el.tiltXs?.[sampleIndex],
                tiltY: el.tiltYs?.[sampleIndex],
                twist: el.twists?.[sampleIndex],
              })
            );
            const segments = buildCalligraphySegments(
              smoothed,
              el.pressures,
              stylusSamples,
              strokeWidth,
              el.brushTip
            );
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  if (segments.length === 0 && smoothed.length >= 2) {
                    context.beginPath();
                    context.arc(smoothed[0]!, smoothed[1]!, Math.max(0.5, strokeWidth * 0.18), 0, Math.PI * 2);
                    context.fillStyle = stroke;
                    context.fill();
                    return;
                  }
                  for (const segment of segments) {
                    context.beginPath();
                    context.moveTo(segment.x0, segment.y0);
                    context.lineTo(segment.x1, segment.y1);
                    context.lineWidth = segment.width;
                    context.lineCap = "round";
                    context.lineJoin = "round";
                    context.strokeStyle = stroke;
                    context.stroke();
                  }
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "brush" && el.mode !== "eraser") {
            const smoothed = processFreehandPoints(points, renderSampleDistance);
            return (
              <Shape
                key={index}
                sceneFunc={(context, shape) => {
                  if (smoothed.length < 2) return;
                  context.beginPath();
                  const angle = -Math.PI / 6;
                  const dx = (strokeWidth / 2) * Math.cos(angle);
                  const dy = (strokeWidth / 2) * Math.sin(angle);

                  if (smoothed.length === 2) {
                    const x0 = smoothed[0]!;
                    const y0 = smoothed[1]!;
                    context.moveTo(x0 - dx, y0 - dy);
                    context.lineTo(x0 + dx, y0 + dy);
                  } else {
                    for (let i = 0; i < smoothed.length - 2; i += 2) {
                      const x0 = smoothed[i]!;
                      const y0 = smoothed[i + 1]!;
                      const x1 = smoothed[i + 2]!;
                      const y1 = smoothed[i + 3]!;

                      context.moveTo(x0 - dx, y0 - dy);
                      context.lineTo(x0 + dx, y0 + dy);
                      context.lineTo(x1 + dx, y1 + dy);
                      context.lineTo(x1 - dx, y1 - dy);
                      context.closePath();
                    }
                  }
                  context.fillStrokeShape(shape);
                }}
                fill={stroke}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "watercolor" && el.mode !== "eraser") {
            const causalWatercolor = el.watercolorPipeline === "causal-walker-v2";
            const aliasPlanSettings = resolveStudioBrushAliasWatercolorPlanSettings(
              brush,
              strokeWidth,
            );
            const watercolorPressures = mapStudioBrushAliasPressureSamples(
              brush,
              el.pressures,
              Math.floor(points.length / 2),
              0.55,
            );
            // Legacy documents retain their fitted whole-stroke stations. New strokes use raw,
            // already-accepted samples and a residual arc-length cursor, so extending a prefix can
            // append pigment but can never move pigment that was already visible.
            const watercolorInput = {
              points: causalWatercolor
                ? points
                : processFreehandPoints(points, renderSampleDistance),
              pressures: watercolorPressures,
              baseWidth: aliasPlanSettings?.baseWidth ?? strokeWidth,
              spacing: aliasPlanSettings?.spacing,
              seed: watercolorBrushSeedFromKey(el.id),
              // Causal stations do not redistribute at the cap, so they need the larger shared
              // bound. Legacy documents keep their historical 512-dab fit and exact old pixels.
              maxDabs: causalWatercolor
                ? DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS
                : 512,
            };
            const plannedDabs = causalWatercolor
              ? planCausalWatercolorBrushDabs(watercolorInput, !activeDraft)
              : planWatercolorBrushDabs(watercolorInput);
            const dabs = applyStudioBrushAliasWatercolorMaterial(brush, plannedDabs);
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  if (dabs.length === 0) return;
                  context.save();
                  for (const dab of dabs) {
                    context.globalAlpha = Math.min(1, Math.max(0, dab.opacity * opacity));
                    context.beginPath();
                    context.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
                    if (dab.role === "diffuse") {
                      // 외곽이 0 alpha로 사라지는 방사 그라디언트라, 별도 blur 필터 없이도 젖은
                      // 종이 가장자리처럼 퍼진다. 중심 dab과 함께 그려져 단일 탭도 자연스러운 점이 된다.
                      const gradient = context.createRadialGradient(
                        dab.x,
                        dab.y,
                        0,
                        dab.x,
                        dab.y,
                        dab.radius
                      );
                      gradient.addColorStop(0, stroke);
                      gradient.addColorStop(0.45, stroke);
                      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
                      context.fillStyle = gradient;
                    } else {
                      context.fillStyle = stroke;
                    }
                    context.fill();
                  }
                  context.restore();
                }}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "gpen" && el.mode !== "eraser") {
            // G펜: 필압(또는 속도 기반 의사 필압)에 따라 굵기가 변하고 양 끝이 가늘어지는 만화 잉크 선.
            const smoothed = processFreehandPoints(points, renderSampleDistance);
            const segmentCount = Math.floor(smoothed.length / 2);
            const aliasPressures = mapStudioBrushAliasPressureSamples(
              brush,
              el.pressures,
              Math.floor(points.length / 2),
              0.6,
            );
            const sampled = resampleStrokePressures(aliasPressures, segmentCount, 0.6);
            const widths = gpenSegmentWidths(sampled, aliasStrokeWidth);
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  context.lineCap = "round";
                  context.lineJoin = "round";
                  context.strokeStyle = stroke;
                  // 세그먼트마다 개별 stroke() 네이티브 호출을 내는 대신, 육안으로 구분되지
                  // 않는 굵기 변화(<0.4px)는 같은 서브패스로 묶어 한 번에 stroke() 한다
                  // (라이브 프레임당 캔버스 API 호출량이 병목이지 굵기 보간 자체는 저렴하다).
                  const WIDTH_BUCKET_PX = 0.4;
                  let bucketWidth: number | null = null;
                  let pathOpen = false;
                  const flush = () => {
                    if (!pathOpen) return;
                    context.lineWidth = bucketWidth!;
                    context.stroke();
                    pathOpen = false;
                  };
                  for (let i = 2; i < smoothed.length; i += 2) {
                    const x0 = smoothed[i - 2]!;
                    const y0 = smoothed[i - 1]!;
                    const x1 = smoothed[i]!;
                    const y1 = smoothed[i + 1]!;
                    const w = widths[Math.floor(i / 2)] ?? aliasStrokeWidth;
                    const bucket = Math.round(w / WIDTH_BUCKET_PX) * WIDTH_BUCKET_PX;
                    if (bucket !== bucketWidth) {
                      flush();
                      bucketWidth = bucket;
                      context.beginPath();
                      pathOpen = true;
                    }
                    context.moveTo(x0, y0);
                    context.lineTo(x1, y1);
                  }
                  flush();
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "screentone" && el.mode !== "eraser") {
            // 스크린톤: 전역 격자에 정렬된 망점 도트를 스트로크 경로에 찍는다(겹쳐도 패턴 유지).
            const pitch = Math.max(3, strokeWidth * 0.42);
            const radius = Math.max(2, strokeWidth / 2);
            const dots = screentoneDotsForStroke(points, radius, pitch);
            const dotR = screentoneDotRadius(pitch);
            return (
              <Shape
                key={index}
                sceneFunc={(context, shape) => {
                  context.beginPath();
                  for (let i = 0; i < dots.length; i += 2) {
                    context.moveTo(dots[i]! + dotR, dots[i + 1]!);
                    context.arc(dots[i]!, dots[i + 1]!, dotR, 0, Math.PI * 2);
                  }
                  context.fillStrokeShape(shape);
                }}
                fill={stroke}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "pencil" && el.mode !== "eraser") {
            const renderPath = resolveStudioFreehandRenderPath(points, {
              sampleSpacing: el.sampleSpacing,
              legacyMinDistance: renderSampleDistance,
              legacyTension: 0.2,
            });
            if (aliasPencilPasses.length > 0) {
              return (
                <Group key={index} opacity={opacity} listening={false}>
                  {aliasPencilPasses.map((pass) => (
                    <Line
                      key={pass.role}
                      points={processStudioPencilAliasPassPoints(
                        renderPath.points,
                        pass.jitterRadius,
                      )}
                      stroke={stroke}
                      strokeWidth={Math.max(0.5, aliasStrokeWidth * pass.widthScale)}
                      opacity={pass.opacityScale}
                      lineCap="round"
                      lineJoin="round"
                      tension={renderPath.tension}
                      globalCompositeOperation={composite}
                      listening={false}
                    />
                  ))}
                </Group>
              );
            }
            const jittered = processPencilPoints(renderPath.points);
            return (
              <Line
                key={index}
                points={jittered}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                lineCap="round"
                lineJoin="round"
                tension={renderPath.tension}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "highlighter" && el.mode !== "eraser") {
            const renderPath = resolveStudioFreehandRenderPath(points, {
              sampleSpacing: el.sampleSpacing,
              legacyMinDistance: renderSampleDistance,
              legacyTension: 0.35,
            });
            return (
              <Line
                key={index}
                points={renderPath.points}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                lineCap="round"
                lineJoin="round"
                tension={renderPath.tension}
                globalCompositeOperation="multiply"
                listening={false}
              />
            );
          }

          if (brushFamily === "neon" && el.mode !== "eraser") {
            const renderPath = resolveStudioFreehandRenderPath(points, {
              sampleSpacing: el.sampleSpacing,
              legacyMinDistance: renderSampleDistance,
              legacyTension: 0.35,
            });
            const passes = planNeonBrushPasses(strokeWidth);
            return (
              <Group key={index} opacity={opacity} listening={false}>
                {passes.map((pass, passIndex) => {
                  const passColor = pass.tone === "white-core" ? "#ffffff" : stroke;
                  const passWidth = Math.max(0.5, strokeWidth * pass.widthScale);
                  return renderPath.points.length === 2 ? (
                    <KCircle
                      key={passIndex}
                      x={renderPath.points[0]}
                      y={renderPath.points[1]}
                      radius={Math.max(0.25, passWidth / 2)}
                      fill={passColor}
                      opacity={pass.opacity}
                      globalCompositeOperation="lighter"
                      listening={false}
                    />
                  ) : (
                    <Line
                      key={passIndex}
                      points={renderPath.points}
                      stroke={passColor}
                      strokeWidth={passWidth}
                      opacity={pass.opacity}
                      lineCap="round"
                      lineJoin="round"
                      tension={renderPath.tension}
                      globalCompositeOperation="lighter"
                      listening={false}
                    />
                  );
                })}
              </Group>
            );
          }

          if (brushFamily === "glow" && el.mode !== "eraser") {
            const renderPath = resolveStudioFreehandRenderPath(points, {
              sampleSpacing: el.sampleSpacing,
              legacyMinDistance: renderSampleDistance,
              legacyTension: 0.35,
            });
            const soft = (el.brush ?? "glow") === "soft-glow";
            const passes = planGlowBrushPasses(strokeWidth, soft);
            return (
              <Group key={index} opacity={opacity} listening={false}>
                {passes.map((pass, passIndex) => (
                  renderPath.points.length === 2 ? (
                    <KCircle
                      key={passIndex}
                      x={renderPath.points[0]}
                      y={renderPath.points[1]}
                      radius={Math.max(0.25, strokeWidth * pass.widthScale * 0.5)}
                      fill={stroke}
                      opacity={pass.opacity}
                      globalCompositeOperation="lighter"
                      listening={false}
                    />
                  ) : (
                    <Line
                      key={passIndex}
                      points={renderPath.points}
                      stroke={stroke}
                      strokeWidth={Math.max(0.5, strokeWidth * pass.widthScale)}
                      opacity={pass.opacity}
                      lineCap="round"
                      lineJoin="round"
                      tension={renderPath.tension}
                      globalCompositeOperation="lighter"
                      listening={false}
                    />
                  )
                ))}
              </Group>
            );
          }

          if (brushFamily === "glitter" && el.mode !== "eraser") {
            const mode = (el.brush ?? "glitter") === "star-dust" ? "star-dust" : "glitter";
            const particles = planGlitterBrushParticles({
              points: processFreehandPoints(points, renderSampleDistance),
              pressures: el.pressures,
              baseWidth: strokeWidth,
              seed: fxBrushSeedFromKey(el.id),
              mode,
              maxParticles: 512,
            });
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  context.save();
                  for (const particle of particles) {
                    context.globalAlpha = Math.min(1, Math.max(0, particle.opacity * opacity));
                    context.fillStyle = stroke;
                    if (particle.kind === 1) {
                      const s = particle.radius * 1.35;
                      context.save();
                      context.translate(particle.x, particle.y);
                      context.rotate(Math.PI / 4);
                      context.fillRect(-s * 0.5, -s * 0.5, s, s);
                      context.restore();
                    } else {
                      context.beginPath();
                      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                      context.fill();
                    }
                  }
                  context.restore();
                }}
                globalCompositeOperation="lighter"
                listening={false}
              />
            );
          }

          if (brushFamily === "oil" && el.mode !== "eraser") {
            const dabs = planOilBrushDabs({
              points: processFreehandPoints(points, renderSampleDistance),
              pressures: el.pressures,
              baseWidth: strokeWidth,
              seed: fxBrushSeedFromKey(el.id),
              maxDabs: 512,
            });
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  for (const dab of dabs) {
                    context.save();
                    context.globalAlpha = Math.min(1, Math.max(0, dab.opacity * opacity));
                    context.translate(dab.x, dab.y);
                    context.rotate(dab.angleRad);
                    const rx = Math.max(0.25, dab.radiusX);
                    const ry = Math.max(0.15, dab.radiusY);
                    context.scale(1, ry / rx);
                    context.beginPath();
                    context.arc(0, 0, rx, 0, Math.PI * 2);
                    context.fillStyle = stroke;
                    context.fill();
                    context.restore();
                  }
                }}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "pastel" && el.mode !== "eraser") {
            const dabs = planPastelBrushDabs({
              points: processFreehandPoints(points, renderSampleDistance),
              pressures: el.pressures,
              baseWidth: strokeWidth,
              seed: fxBrushSeedFromKey(el.id),
              maxDabs: 512,
            });
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  context.save();
                  for (const dab of dabs) {
                    context.globalAlpha = Math.min(1, Math.max(0, dab.opacity * opacity));
                    const gradient = context.createRadialGradient(
                      dab.x,
                      dab.y,
                      0,
                      dab.x,
                      dab.y,
                      dab.radius
                    );
                    gradient.addColorStop(0, stroke);
                    gradient.addColorStop(0.55, stroke);
                    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
                    context.beginPath();
                    context.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
                    context.fillStyle = gradient;
                    context.fill();
                  }
                  context.restore();
                }}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          // Default "pen" or "marker" or "eraser"
          // 라쏘 브러시: fill 이 설정된 프리핸드(라쏘 필)는 궤적을 자동으로 닫아 내부를
          // 현재 색으로 채운다. 라이브 초안도 같은 경로를 지나므로 그리는 동안 채움이 미리 보인다.
          const freehandFill = el.mode !== "eraser" ? el.fill : undefined;
          if ((el.sampleSpacing !== undefined || el.pressureModel !== undefined) && !freehandFill) {
            const causalPressures = el.mode === "eraser"
              ? el.pressures
              : mapStudioBrushAliasPressureSamples(
                  brush,
                  el.pressures,
                  Math.floor(points.length / 2),
                  studioInkFallbackPressure(el.pressureModel),
                );
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  drawStudioCausalInkDabs(
                    context,
                    points,
                    causalPressures,
                    stroke,
                    aliasStrokeWidth,
                    el.sampleSpacing ?? 0,
                    el.pressureModel,
                    isStudioStrokePaintModelCompatible(el) ? el.paintModel : undefined
                  );
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
              />
            );
          }
          const renderPath = resolveStudioFreehandRenderPath(points, {
            sampleSpacing: el.sampleSpacing,
            legacyMinDistance: renderSampleDistance,
            legacyTension: 0.4,
          });
          const smoothed = renderPath.points;
          const pressures = el.pressures;
          if (pressures && pressures.length > 0 && smoothed.length >= 4) {
            const aliasPressures = el.mode === "eraser"
              ? pressures
              : mapStudioBrushAliasPressureSamples(
                  brush,
                  pressures,
                  Math.floor(points.length / 2),
                  0.5,
                );
            const sampledPressures = resampleStrokePressures(
              aliasPressures,
              Math.floor(smoothed.length / 2),
            );
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  if (smoothed.length < 4) return;
                  if (freehandFill && smoothed.length >= 6) {
                    context.beginPath();
                    context.moveTo(smoothed[0]!, smoothed[1]!);
                    for (let i = 2; i < smoothed.length; i += 2) {
                      context.lineTo(smoothed[i]!, smoothed[i + 1]!);
                    }
                    context.closePath();
                    context.fillStyle = freehandFill;
                    context.fill();
                  }
                  // 중점 이차곡선 보간 — 다이렉트 라이브 초안과 같은 래스터라이저를 공유한다.
                  drawFreehandPenSegments(
                    context,
                    smoothed,
                    sampledPressures,
                    stroke,
                    aliasStrokeWidth,
                  );
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
              />
            );
          }

          return (
            <Line
              key={index}
              points={smoothed}
              stroke={stroke}
              strokeWidth={aliasStrokeWidth}
              opacity={opacity}
              lineCap="round"
              lineJoin="round"
              tension={renderPath.tension}
              closed={Boolean(freehandFill) && smoothed.length >= 6}
              fill={freehandFill}
              globalCompositeOperation={composite}
              listening={false}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
            />
          );
        }

        // 직선("line") — 점선/선 끝 스타일 + 시작/끝 화살촉(삼각형·점)을 함께 그린다.
        const lineHeads = lineArrowHeadGeoms(points, strokeStyle, strokeWidth);
        return (
          <Group key={index} opacity={opacity} listening={false}>
            <Line
              points={points}
              stroke={stroke}
              strokeWidth={strokeWidth}
              dash={shapeDash}
              lineCap={strokeStyle.lineCap}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
            {lineHeads.map((head, headIndex) =>
              head.kind === "dot" ? (
                <KCircle
                  key={headIndex}
                  x={head.cx}
                  y={head.cy}
                  radius={head.r}
                  fill={stroke}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              ) : (
                <Line
                  key={headIndex}
                  points={head.points}
                  closed
                  fill={stroke}
                  lineJoin="round"
                  globalCompositeOperation={composite}
                  listening={false}
                />
              )
            )}
          </Group>
        );
      })}
    </Group>
  );
});
