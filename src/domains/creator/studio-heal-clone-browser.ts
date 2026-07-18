/** Canvas-factory orchestration for the pure Heal/Clone engine. */
import { type HealCloneBrushSettings, type HealCloneDab, type HealCloneMode } from "./studio-heal-clone";
import { runStudioHealCloneWorker } from "./studio-heal-clone-worker-client";

import type { StudioImageDataLike } from "./studio-filters";
import type { MaskCanvasLike, MaskCtx2DLike, MaskImageSource } from "./studio-selection-tools";

/**
 * studio-selection-tools.ts 의 MaskCtx2DLike 를 확장 — 도장 패치를 읽고 쓰려면 get/putImageData 가
 * 필요하다(MaskCtx2DLike 엔 없음). StudioPage.tsx 의 createPixelEditCanvas 는 이미 진짜
 * CanvasRenderingContext2D 를 반환하므로 **수정 없이 그대로** 이 자리에 넘길 수 있다(구조적 호환,
 * SelectionCanvasFactory 와 동일한 관례 — 메서드 바이베리언스로 컴파일 검증됨).
 */
export type HealCloneCtx2DLike = MaskCtx2DLike & {
  getImageData(sx: number, sy: number, sw: number, sh: number): StudioImageDataLike;
  putImageData(imageData: StudioImageDataLike, dx: number, dy: number): void;
};

/** 오프스크린 캔버스 팩토리 — DOM 의존부를 호출자(StudioPage)가 주입한다. */
export type HealCloneCanvasFactory = (
  width: number,
  height: number
) => { canvas: MaskCanvasLike & MaskImageSource; ctx: HealCloneCtx2DLike } | null;

/**
 * 스트로크 전체를 원본에 구워 결과 캔버스를 만든다. dabs 가 비었으면 null(구울 게 없음 — 호출자는
 * patchEl 을 생략해야 한다는 신호) — 이 경우 캔버스를 아예 만들지 않는다(불필요한 DOM 작업 방지).
 * radiusPx 는 **디바이스(자연) px**여야 한다(호출자가 target.width 기준 배율로 변환해서 넘긴다 —
 * buildSelectionMaskPlan 의 featherScale 관례와 동일).
 *
 * 도장 블렌드 루프(applyHealCloneDabs)는 대형 이미지·긴 스트로크에서 무거운 동기 작업이라
 * Worker로 옮긴다(Worker를 못 만드는 환경에선 클라이언트 내부에서 동일 엔진으로 동기 폴백).
 */
export async function bakeHealCloneStrokeToCanvas(
  source: MaskImageSource,
  width: number,
  height: number,
  dabs: readonly HealCloneDab[],
  brush: HealCloneBrushSettings,
  mode: HealCloneMode,
  createCanvas: HealCloneCanvasFactory
): Promise<(MaskCanvasLike & MaskImageSource) | null> {
  if (dabs.length === 0) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  // frozen — 원본을 한 번 그린 뒤 다시는 건드리지 않는다(같은 스트로크 안의 여러 도장이 서로의
  // 결과가 아니라 항상 스트로크 시작 시점의 원본을 소스로 삼도록 — heal 의 로컬 평균 드리프트
  // 방지와 같은 이유).
  const frozen = createCanvas(w, h);
  if (!frozen) return null;
  frozen.ctx.drawImage(source, 0, 0);

  // work — 원본을 한 번 그린 뒤 도장이 누적되며 실제로 변형되는 결과 버퍼.
  const work = createCanvas(w, h);
  if (!work) return null;
  work.ctx.drawImage(source, 0, 0);

  const frozenData = frozen.ctx.getImageData(0, 0, w, h);
  const workData = work.ctx.getImageData(0, 0, w, h);

  const { dst } = await runStudioHealCloneWorker({
    src: frozenData,
    dst: workData,
    dabs,
    radiusPx: brush.radiusPx,
    hardness: brush.hardness,
    opacity: brush.opacity,
    mode,
  });

  work.ctx.putImageData(dst, 0, 0);
  return work.canvas;
}
