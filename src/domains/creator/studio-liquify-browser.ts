/** Canvas-factory orchestration for the pure Liquify engine. */
import { buildLiquifyDisplacementField, type LiquifyPixelPoint } from "./studio-liquify";
import { runStudioLiquifyWorker } from "./studio-liquify-worker-client";
import { flipNormalizedPoint } from "./studio-magic-wand";

import type { StudioImageDataLike } from "./studio-filters";
import type { MaskCanvasLike, MaskCtx2DLike, MaskImageSource } from "./studio-selection-tools";

/**
 * studio-selection-tools.ts의 MaskCtx2DLike를 확장 — 픽셀을 읽고 쓰려면 get/putImageData가
 * 필요하다(heal-clone의 HealCloneCtx2DLike와 동일한 이유로 별도 정의 — 브러시 도구마다 이
 * 확장을 독립적으로 선언하는 게 이 세션의 선례다). StudioPage.tsx의 createPixelEditCanvas는
 * 이미 진짜 CanvasRenderingContext2D를 반환하므로 **수정 없이 그대로** 이 자리에 넘길 수 있다.
 */
export type LiquifyCtx2DLike = MaskCtx2DLike & {
  getImageData(sx: number, sy: number, sw: number, sh: number): StudioImageDataLike;
  putImageData(imageData: StudioImageDataLike, dx: number, dy: number): void;
};

/** 오프스크린 캔버스 팩토리 — DOM 의존부를 호출자(StudioPage)가 주입한다. */
export type LiquifyCanvasFactory = (
  width: number,
  height: number
) => { canvas: MaskCanvasLike & MaskImageSource; ctx: LiquifyCtx2DLike } | null;

/**
 * 스트로크 전체를 원본에 구워 결과 캔버스를 만든다. 변위 필드가 null이면(스트로크가 너무 짧거나
 * 반경/강도가 0) null — 이 경우 캔버스를 아예 만들지 않는다(불필요한 DOM 작업 방지, 호출자는
 * patchEl을 생략해야 한다는 신호). radiusPx는 **디바이스(자연) px**여야 한다(호출자가 target.width
 * 기준 배율로 변환해서 넘긴다 — heal-clone의 관례와 동일).
 * points는 화면에 표시된 상태의 디바이스 px 좌표다. opts.flipX/flipY가 켜져 있으면 정규화한 뒤
 * flipNormalizedPoint로 원본(비반전) 좌표계에 되돌리고, 다시 자연 px로 스케일해 순수 코어에 넘긴다.
 *
 * 변위 적용(applyLiquifyDisplacement)은 대형 이미지에서 무거운 bilinear 리샘플링 루프라
 * Worker로 옮긴다(Worker를 못 만드는 환경에선 클라이언트 내부에서 동일 엔진으로 동기 폴백).
 */
export async function bakeLiquifyStrokeToCanvas(
  source: MaskImageSource,
  width: number,
  height: number,
  points: readonly LiquifyPixelPoint[],
  radiusPx: number,
  strength: number,
  createCanvas: LiquifyCanvasFactory,
  opts?: { flipX?: boolean; flipY?: boolean }
): Promise<(MaskCanvasLike & MaskImageSource) | null> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const flipX = opts?.flipX ?? false;
  const flipY = opts?.flipY ?? false;
  const sourcePoints: readonly LiquifyPixelPoint[] =
    flipX || flipY
      ? points.map((point) => {
          const unflipped = flipNormalizedPoint({ x: point.x / w, y: point.y / h }, flipX, flipY);
          return { x: unflipped.x * w, y: unflipped.y * h };
        })
      : points;

  const field = buildLiquifyDisplacementField(sourcePoints, radiusPx, strength, w, h);
  if (!field) return null;

  // frozen — 변위 계산의 유일한 색 소스, 다시는 건드리지 않는다(원본을 한 번 그린 뒤 고정).
  const frozen = createCanvas(w, h);
  if (!frozen) return null;
  frozen.ctx.drawImage(source, 0, 0);

  // work — 원본을 한 번 그린 뒤 변위 필드가 실제로 반영되는 결과 버퍼.
  const work = createCanvas(w, h);
  if (!work) return null;
  work.ctx.drawImage(source, 0, 0);

  const frozenData = frozen.ctx.getImageData(0, 0, w, h);
  const workData = work.ctx.getImageData(0, 0, w, h);

  const { dst } = await runStudioLiquifyWorker({ src: frozenData, dst: workData, field });

  work.ctx.putImageData(dst, 0, 0);
  return work.canvas;
}
