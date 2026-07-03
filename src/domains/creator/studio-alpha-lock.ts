/**
 * Studio Alpha Lock — 레이어(요소) 투명도 잠금.
 * 켜면 그 레이어에 대한 이후 "칠하기" 계열 편집(현재는 페인트 통)이 레이어가 지금 갖고 있는
 * 알파(불투명 영역) 밖으로 절대 번지지 않는다 — 별도 클리핑 마스크 레이어 없이 셀 위에 바로
 * 음영을 올리는 전형적 워크플로(Procreate Alpha Lock과 동일 개념).
 *
 * 핵심은 compositeAlphaLocked 하나뿐이다: "편집 전" 원본과 "편집 후" 결과 두 장을 같은 캔버스에
 * 원본 → source-atop → 편집후 순서로 그린다. Porter-Duff source-atop은 결과 알파를
 * destination(원본) 알파 그대로 고정하고 색만 source(편집후) 것으로 갈아 끼운다 — 그래서 원래
 * 투명했던 픽셀은 편집후 뭘 칠했든 영원히 투명하고, 원래 불투명했던 픽셀만 새 색으로 바뀐다.
 * ClipMaskGroup.tsx가 렌더 타임에 같은 Porter-Duff 계열(source-in)로 "다른 레이어"의 알파에
 * 맞춰 자르는 것과 발상은 같지만, 여긴 커밋 타임(data URL 확정)에 "같은 레이어의 이전 프레임"
 * 알파에 맞춰 자른다는 점이 다르다 — 그래서 Konva 캐시 트릭이 필요 없고, 오프스크린 2D 캔버스
 * 합성 한 번으로 끝난다.
 *
 * 전부 순수 함수 — 이미지 로드와 캔버스 생성은 호출부(StudioPage)가 주입한다.
 * studio-selection-tools.ts의 MaskImageSource/MaskCanvasLike/SelectionCanvasFactory를 그대로
 * 재사용한다(같은 추상화를 두 벌 만들지 않는다 — createPixelEditCanvas가 이미 그 팩토리를
 * 구현해 두 모듈 모두에 주입되고 있다). DOM 의존 0 — studio-selection-tools.test.ts와 동일한
 * fakeCtx/fakeFactory(호출 기록) 패턴으로 유닛 테스트한다.
 */
import type { MaskCanvasLike, MaskImageSource, SelectionCanvasFactory } from "./studio-selection-tools";

/** StudioPage El의 최소 부분집합(이 모듈은 이 형태만 본다) — studio-layers.ts의 LayerItemLike와 동일한 취지. */
export type AlphaLockLayerLike = { type?: string; alphaLocked?: boolean };

/** 알파 락이 의미를 갖는 레이어인지 — 자체 래스터(src) 픽셀을 가진 "image" 요소만. */
export function canAlphaLock(el: AlphaLockLayerLike): boolean {
  return el.type === "image";
}

/**
 * 유효 알파 락 — el.alphaLocked가 true이고 canAlphaLock(el)도 true일 때만. image가 아닌 요소에
 * 잘못 alphaLocked:true가 붙어 있어도(있을 수 없지만 방어적으로) 무시한다 — 호출부는 항상 이
 * 함수만 확인하면 되고, "type === image"와 "alphaLocked" 두 조건을 따로 조합할 필요가 없다.
 */
export function shouldClipToExistingAlpha(el: AlphaLockLayerLike): boolean {
  return canAlphaLock(el) && !!el.alphaLocked;
}

/**
 * 알파 락 합성 — edited(편집 결과)를 original(편집 전 알파 모양) 밖으로 나가지 않게 오려낸다.
 * Porter-Duff "source-atop": 결과 알파 = original 알파 그대로(확장·축소 없음) — 이건 항상 정확히
 * 성립한다(Ao = Ab, source의 알파와 무관). 색상은 "항상 edited로 완전히 바뀐다"가 아니라
 * Co = Cs·Ab + Cb·(1-As) 로 프리멀티플라이드 알파 가중 블렌드된다 — original이 완전 불투명
 * (α=1)했던 자리는 edited 색으로 완전히 스왑되고 완전 투명(α=0)했던 자리는 항상 투명하게
 * 남지만, 그 사이(안티앨리어싱 가장자리 등 부분 투명 픽셀)는 edited·이전(original) 색이 알파
 * 비율로 섞인다(완전 스왑 아님). floodFillImage처럼 edited가 original의 알파를 그대로 물려받는
 * 호출부(As≡Ab)에서는 가장자리로 갈수록 새 색 반영 비율이 낮아지는 형태가 되어 halo 억제에는
 * 오히려 유리하지만, "부분 투명 픽셀도 완전히 새 색이 된다"고 가정하는 호출부가 있다면 이 함수는
 * 그 기대를 만족시키지 않는다 — 픽셀 단위로 정확히 색은 edited·알파는 original을 강제하려면
 * drawImage 합성이 아니라 getImageData/putImageData 기반 재작성이 필요하다(현재 미구현).
 * width/height는 두 이미지가 공유하는 자연 픽셀 크기(가공 없이 "같은 캔버스 크기의 이전/이후
 * 프레임"이라는 전제 — 크롭처럼 크기 자체가 바뀌는 편집에는 쓰지 않는다). 팩토리가 null(2D
 * 컨텍스트 획득 실패)이면 null.
 */
export function compositeAlphaLocked(
  original: MaskImageSource,
  edited: MaskImageSource,
  width: number,
  height: number,
  createCanvas: SelectionCanvasFactory
): (MaskCanvasLike & MaskImageSource) | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const out = createCanvas(w, h);
  if (!out) return null;
  out.ctx.drawImage(original, 0, 0);
  out.ctx.globalCompositeOperation = "source-atop";
  out.ctx.drawImage(edited, 0, 0);
  out.ctx.globalCompositeOperation = "source-over"; // 관례상 원복(팩토리가 캔버스를 재사용할 수도 있으니).
  return out.canvas;
}
