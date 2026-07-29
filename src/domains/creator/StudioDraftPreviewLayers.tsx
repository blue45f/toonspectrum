import { memo, useSyncExternalStore, type RefObject } from "react";
import { Layer } from "react-konva/lib/ReactKonvaCore";

import { resolveStudioBrushDynamicsPresetId } from "./studio-brush-dynamics";
import { StudioDrawNode } from "./StudioDrawNode";

import type { StudioDraftPreviewSource } from "./studio-draft-preview-store";
import type Konva from "konva";

export interface StudioDraftPreviewLayersProps {
  store: StudioDraftPreviewSource;
  normalLayerRef?: RefObject<Konva.Layer | null>;
  dynamicLayerRef?: RefObject<Konva.Layer | null>;
}

/** 비다이렉트 초안 전용 격리 레이어 — 스토어 구독으로 페이지 본문 렌더 없이 프레임을 그린다. */
export const StudioDraftPreviewLayers = memo(function StudioDraftPreviewLayers({
  store,
  normalLayerRef,
  dynamicLayerRef,
}: StudioDraftPreviewLayersProps) {
  const { active } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const settled = store.visibleSettled;
  const isolatedDynamic =
    active?.mode === "pen" && resolveStudioBrushDynamicsPresetId(active.brush) !== null
      ? active
      : null;
  // Non-direct specialty brushes retain their exact accepted coordinates while the pointer is
  // down. The former growing-prefix smoother recalculated already-visible points every frame.
  // Default opaque pens now use the fixed-lag two-surface causal path; specialty brushes prefer a
  // single release-time correction over visibly crawling historical geometry.
  const normalActive = active && !isolatedDynamic && active.mode !== "eraser"
    ? active
    : null;

  return (
    <>
      {settled.length > 0 || normalActive ? (
        <Layer ref={normalLayerRef} listening={false}>
          {settled.map((el) => (
            <StudioDrawNode key={el.id} el={el} />
          ))}
          {normalActive ? <StudioDrawNode el={normalActive} activeDraft /> : null}
        </Layer>
      ) : null}
      {/* 라이브 입자 획은 독립 레이어에서만 다시 그린다 — committed 입자 획이 포인터 RAF마다
          수천 개의 dab 을 재실행하지 않는다. */}
      {isolatedDynamic ? (
        <Layer ref={dynamicLayerRef} listening={false}>
          <StudioDrawNode el={isolatedDynamic} activeDraft />
        </Layer>
      ) : null}
    </>
  );
});
