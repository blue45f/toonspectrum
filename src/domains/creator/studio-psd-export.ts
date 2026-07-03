/**
 * Studio PSD Layer Export — 레이어별 PSD(.psd) 내보내기.
 *
 * 래스터 내보내기(studio-export, png/jpg/webp)는 스테이지를 한 장으로 평탄화하고,
 * SVG 내보내기(studio-svg-export)는 요소를 벡터로 재직렬화한다. 이 모듈은 그 중간 —
 * "포토샵에서 요소별로 다시 만질 수 있는" 결과가 목표라, 각 요소를 Konva 가 실제로 그린
 * 픽셀 그대로 **개별 래스터 레이어**로 캡처해 ag-psd 로 조립한다(요소를 재직렬화하지 않으므로
 * 화면과 100% 동일 출력이 보장된다). 대가로 텍스트를 포함해 전부 편집 불가 픽셀 레이어가
 * 된다 — ag-psd 자체가 "다시 열어도 편집 가능한" 텍스트 레이어 기록을 신뢰성 있게 지원하지
 * 않는다고 README 가 명시하므로, 전부 래스터화하는 편이 유일하게 안전한 경로다.
 *
 * 좌표계 규약(중요): 캡처는 Stage 의 **현재 화면 줌**(effScale)과 무관해야 한다 — 그렇지
 * 않으면 사용자가 줌인/줌아웃한 상태에서 내보내기 결과가 매번 달라진다.
 *  - `node.getClientRect({ relativeTo: stage })` 로 줌·팬에이 반영되지 않은 문서 좌표를 얻어
 *    레이어의 left/top 을 정한다.
 *  - `pixelRatio: scale / effScale` 로 Stage 자체 스케일(현재 줌)을 상쇄해, 항상 논리적
 *    "출력 배율(scale)" 기준 픽셀 크기가 나오게 한다(기존 PNG 내보내기와 동일한 트릭).
 *
 * z-order 규약: Studio 는 `elements[0]`=맨 뒤 → `elements[last]`=맨 앞(z-order 오름차순)이지만
 * ag-psd 의 `Psd.children` 은 그 반대(0번째=포토샵 레이어 패널의 맨 위) — 뒤집어 넣지 않으면
 * 스택 순서가 통째로 반전된다.
 *
 * 회전: PSD 클래식 레이어엔 회전 필드가 없다. `toCanvas()` 는 노드의 절대(회전 포함) 변환으로
 * 그리므로 회전된 요소도 이미 "회전이 픽셀에 구워진" 래스터로 캡처된다 — 별도 처리가 필요 없다
 * (다만 포토샵에서 회전 값 자체를 다시 되돌릴 순 없다).
 *
 * 숨김 레이어: `isEffectivelyHidden` 인 요소는 렌더 시점에 Konva 노드 자체가 만들어지지 않는다
 * (StudioPage 렌더 루프가 `return null`) — 캡처할 대상이 없으므로 **호출부가 이미 걸러서** 넘긴
 * `elements` 를 받는다는 게 이 모듈의 전제다(studio-svg-export/studio-page-thumbs 와 같은
 * skip-hidden 관례). "숨겼지만 PSD엔 포함"은 화면에 없는 걸 다시 그려야 해 v1 범위 밖이다.
 *
 * 그 외 재현 불가/근사 항목은 SVG 내보내기와 같은 정직성 규약으로 `skipped` 문자열 목록에
 * 모아 반환한다(콜러가 사용자에게 고지).
 */

import { writePsd, type BlendMode, type Layer, type Psd } from "ag-psd";

import type Konva from "konva";

// ---------------------------------------------------------------------------
// 요소 구조 타입 — StudioPage 의 El 유니온과 구조 호환(필요한 필드만). studio-svg-export.ts 와
// 같은 순수 모듈 규약 — StudioPage 를 임포트하지 않고 구조 타이핑으로 받는다.
// ---------------------------------------------------------------------------

/** 모든 요소가 공유하는 레이어 메타(El 인터섹션과 동일 필드 중 이 모듈이 쓰는 것만). */
interface PsdElMeta {
  id: string;
  name?: string;
  opacity?: number;
  blendMode?: string;
  clipBelow?: boolean;
  noClip?: boolean;
}

export interface PsdImageElLike extends PsdElMeta {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PsdBubbleElLike extends PsdElMeta {
  type: "bubble";
  x: number;
  y: number;
  width: number;
  height: number;
  // 말풍선은 <Group> 자체에 그림자가 걸린다(Container.getClientRect 는 자식 bbox만 합쳐
  // 컨테이너 자신의 그림자를 패딩하지 않음) — 캡처 사각형을 수동으로 넓힐 때만 쓴다.
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface PsdTextElLike extends PsdElMeta {
  type: "text";
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

export interface PsdStickerElLike extends PsdElMeta {
  type: "sticker";
  x: number;
  y: number;
  fontSize: number;
}

export interface PsdDrawElLike extends PsdElMeta {
  type: "draw";
  points: number[];
}

export interface PsdFrameElLike extends PsdElMeta {
  type: "frame";
  x: number;
  y: number;
  width: number;
  height: number;
  hidden?: boolean;
}

export interface PsdFocusLinesElLike extends PsdElMeta {
  type: "focusLines";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PsdSpeedLinesElLike extends PsdElMeta {
  type: "speedLines";
  x: number;
  y: number;
  width: number;
  height: number;
}

/** StudioPage El 유니온과 구조 호환하는 내보내기 입력 요소. */
export type PsdExportEl =
  | PsdImageElLike
  | PsdTextElLike
  | PsdBubbleElLike
  | PsdFrameElLike
  | PsdStickerElLike
  | PsdDrawElLike
  | PsdFocusLinesElLike
  | PsdSpeedLinesElLike;

// ---------------------------------------------------------------------------
// 입출력 타입
// ---------------------------------------------------------------------------

export interface PsdExportOptions {
  /** 출력 배율 — 래스터 크기·left/top 좌표에 곱한다. 기본 1(캔버스 원본 크기). */
  scale?: number;
  /** 배경(단색/그라데이션) 레이어를 맨 아래에 추가할지. `background` 가 없으면 무의미. 기본 true. */
  includeBackground?: boolean;
  /** 페이지 배경 — StudioPage 의 bg/bgGrad 를 그대로 전달(모듈 스스로는 페이지 상태를 모름). */
  background?: { color: string; gradient?: string[] | null };
}

export interface PsdExportResult {
  /** 완성된 .psd 파일(다운로드용 Blob, MIME=PSD_EXPORT_MIME). */
  blob: Blob;
  /** 재현 불가/근사·건너뜀 안내(비어 있으면 전부 온전히 레이어로 캡처됨). */
  skipped: string[];
  /** 실제로 PSD 레이어가 된 요소 수(배경 레이어 제외). */
  layerCount: number;
}

/** 콜러가 Blob 생성·다운로드에 쓸 MIME 타입. */
export const PSD_EXPORT_MIME = "image/vnd.adobe.photoshop";

/** 단일 페이지 PSD 파일명 — 다른 내보내기 형식(svgExportFileName 등)과 같은 제목 규칙. */
export function psdExportFileName(title: string): string {
  return `${title.trim() || "toonspectrum-comic"}.psd`;
}

/** 내보내기 결과 요약 문구(패널 상태 배너용) — svgExportResultMessage 와 같은 톤. */
export function psdExportResultMessage(result: PsdExportResult): string {
  const parts = [`PSD 저장 완료 — 레이어 ${result.layerCount}개`];
  if (result.skipped.length > 0) parts.push(`알림 ${result.skipped.length}건`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// blendMode 매핑 — Studio 는 CSS/Canvas globalCompositeOperation 값을 그대로 쓰고,
// ag-psd 는 스페이스로 구분된 포토샵 이름을 쓴다(StudioPage.tsx 의 blendMode <select> 옵션 기준).
// ---------------------------------------------------------------------------

const BLEND_MODE_MAP: Record<string, BlendMode> = {
  "source-over": "normal",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "color dodge",
  "color-burn": "color burn",
  "hard-light": "hard light",
  "soft-light": "soft light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

function mapBlendMode(mode: string | undefined): BlendMode {
  if (!mode) return "normal";
  return BLEND_MODE_MAP[mode] ?? "normal";
}

/** opacity 는 Studio·ag-psd 둘 다 0~1 실수라 직접 대응(범위만 방어적으로 clamp). */
function clampOpacity(opacity: number | undefined): number {
  if (opacity === undefined || Number.isNaN(opacity)) return 1;
  return Math.min(1, Math.max(0, opacity));
}

// ---------------------------------------------------------------------------
// 레이어 이름 — name 필드가 있으면 그대로, 없으면 "타입 + 순번"(과제 스펙의 sensible fallback).
// ---------------------------------------------------------------------------

const EL_TYPE_LABELS: Record<PsdExportEl["type"], string> = {
  image: "이미지",
  text: "텍스트",
  bubble: "말풍선",
  frame: "패널",
  sticker: "스티커",
  draw: "그림",
  focusLines: "집중선",
  speedLines: "속도선",
};

function elementLabel(el: PsdExportEl, index: number): string {
  const trimmed = el.name?.trim();
  return trimmed ? trimmed : `${EL_TYPE_LABELS[el.type]} ${index + 1}`;
}

// ---------------------------------------------------------------------------
// 패널 클리핑 — StudioPage elBounds/containingPanel 포트(studio-svg-export.ts 와 동일 포트).
// wrapClip 이 패널 안에 든 요소를 clipX/Y/Width/Height 로 자르는 것과 같은 조건을 재현해,
// 태그된 노드를 직접 toCanvas() 하면서 사라지는 "패널 밖으로 넘친 부분 잘림"을 복원한다.
// ---------------------------------------------------------------------------

function elBounds(el: PsdExportEl): { x: number; y: number; w: number; h: number } {
  if (el.type === "draw") {
    let minX = el.points[0] ?? 0;
    let minY = el.points[1] ?? 0;
    let maxX = minX;
    let maxY = minY;
    for (let i = 2; i + 1 < el.points.length; i += 2) {
      const x = el.points[i];
      const y = el.points[i + 1];
      if (x < minX) minX = x;
      else if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      else if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (el.type === "text") return { x: el.x, y: el.y, w: el.width, h: el.fontSize * 1.4 };
  if (el.type === "sticker") return { x: el.x, y: el.y, w: el.fontSize, h: el.fontSize };
  return { x: el.x, y: el.y, w: el.width, h: el.height };
}

function containingPanel(el: PsdExportEl, all: readonly PsdExportEl[]): PsdFrameElLike | null {
  if (el.type === "frame") return null;
  const b = elBounds(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let best: PsdFrameElLike | null = null;
  let bestArea = Infinity;
  for (const f of all) {
    if (f.type !== "frame" || f.hidden) continue;
    if (cx < f.x || cx > f.x + f.width || cy < f.y || cy > f.y + f.height) continue;
    if (b.w > f.width * 1.4 || b.h > f.height * 1.4) continue;
    const area = f.width * f.height;
    if (area < bestArea) {
      bestArea = area;
      best = f;
    }
  }
  return best;
}

/**
 * 캡처된 레이어 캔버스를 패널 사각형(문서 좌표)에 맞춰 자른다. `originDocX/Y` 는 캔버스의
 * (0,0)이 위치한 문서 좌표(패딩 반영 후), `scale` 은 출력 배율 — 문서 좌표 1단위가 캔버스
 * 픽셀 `scale` 개에 대응한다(§좌표계 규약 참고). 패널과 실질적으로 안 겹치면(패딩 등으로
 * 인한 경계 오차) 원본을 그대로 두도록 null 을 반환한다 — 레이어를 통째로 지우지 않는다.
 */
function cropToPanel(
  canvas: HTMLCanvasElement,
  originDocX: number,
  originDocY: number,
  scale: number,
  panel: PsdFrameElLike
): { canvas: HTMLCanvasElement; dx: number; dy: number } | null {
  const x0 = Math.round(Math.max(0, (panel.x - originDocX) * scale));
  const y0 = Math.round(Math.max(0, (panel.y - originDocY) * scale));
  const x1 = Math.round(Math.min(canvas.width, (panel.x + panel.width - originDocX) * scale));
  const y1 = Math.round(Math.min(canvas.height, (panel.y + panel.height - originDocY) * scale));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 1 || h < 1) return null; // 겹치는 영역이 없음 — 자르지 않고 원본 유지(드문 경계 케이스)
  if (x0 === 0 && y0 === 0 && w === canvas.width && h === canvas.height) return { canvas, dx: 0, dy: 0 };
  const cropped = document.createElement("canvas");
  cropped.width = w;
  cropped.height = h;
  const ctx = cropped.getContext("2d");
  if (!ctx) return { canvas, dx: 0, dy: 0 };
  ctx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
  return { canvas: cropped, dx: x0, dy: y0 };
}

/** 말풍선(Group) 자체 그림자를 캡처 사각형에 반영할 여유(문서 좌표 단위). 그 외 타입은 0. */
function shadowPaddingLogical(el: PsdExportEl): number {
  if (el.type !== "bubble") return 0;
  const blur = el.shadowBlur ?? 5;
  const offX = Math.abs(el.shadowOffsetX ?? 1);
  const offY = Math.abs(el.shadowOffsetY ?? 2);
  return blur + Math.max(offX, offY);
}

function findElementNode(stage: Konva.Stage, elementId: string): Konva.Node | undefined {
  return stage.findOne<Konva.Node>((node: Konva.Node) => {
    const id = node.getAttr("studioElementId");
    return typeof id === "string" && id === elementId;
  });
}

/** 배경(단색 또는 세로 2색 그라데이션) 래스터 레이어 — studio-svg-export 의 배경 rect와 동일 규칙. */
function makeBackgroundLayer(width: number, height: number, background: { color: string; gradient?: string[] | null }): Layer {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = background.gradient;
    if (grad && grad.length >= 2) {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, grad[0]);
      gradient.addColorStop(1, grad[grad.length - 1]);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = background.color;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return { name: "배경", left: 0, top: 0, canvas };
}

// ---------------------------------------------------------------------------
// 메인 — 페이지 → 레이어별 PSD
// ---------------------------------------------------------------------------

/**
 * 현재 페이지를 요소별 레이어를 가진 .psd 파일로 조립한다.
 *
 * @param stage 캡처 대상 Konva Stage(현재 페이지가 렌더된 상태여야 함).
 * @param elements z-order 로 정렬된(인덱스 0=맨 뒤) 페이지 요소 배열 — **호출부가 이미
 *   `isEffectivelyHidden` 기준으로 걸러 넘긴 것**이어야 한다(숨긴 요소는 Konva 노드 자체가
 *   없어 캡처가 불가능 — StudioPage 렌더 루프와 동일 전제).
 * @param canvasW 페이지 논리 폭(px, 줌 무관 — 예: StudioPage 의 CANVAS_W).
 * @param canvasH 페이지 논리 높이(px, 줌 무관).
 * @param effScale Stage 의 현재 화면 줌 배율(scaleX/scaleY) — 캡처 크기·위치에서 상쇄해야
 *   출력이 줌 레벨과 무관해진다. 0 이하로 들어오면 1 로 방어한다.
 * @param opts 배율(scale)·배경 포함 여부.
 *
 * 빈 페이지(요소 0개)는 에러 대신 레이어 없는 빈 캔버스 PSD 를 만들고 skipped 에 안내를
 * 남긴다 — 사용자가 "실패"보다 "빈 파일이라도 받는" 편이 낫다는 판단(문서화된 설계 선택).
 */
export async function exportPagePsd(
  stage: Konva.Stage,
  elements: readonly PsdExportEl[],
  canvasW: number,
  canvasH: number,
  effScale: number,
  opts: PsdExportOptions = {}
): Promise<PsdExportResult> {
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  const safeEffScale = effScale > 0 ? effScale : 1;
  const psdWidth = Math.max(1, Math.round(canvasW * scale));
  const psdHeight = Math.max(1, Math.round(canvasH * scale));
  const skipped: string[] = [];

  if (elements.length === 0) {
    skipped.push("페이지에 요소가 없어 빈 캔버스로 저장했어요.");
    const psd: Psd = { width: psdWidth, height: psdHeight };
    const blob = new Blob([writePsd(psd)], { type: PSD_EXPORT_MIME });
    return { blob, skipped, layerCount: 0 };
  }

  const layers: Layer[] = [];

  for (let i = 0; i < elements.length; i++) {
    // 요소별 toCanvas() 래스터화 + writePsd() 압축은 전부 동기(CPU 바운드)라, 요소가 많은 페이지를
    // 멈추지 않고 통짜로 돌리면 브라우저가 그 사이 리페인트·입력을 전혀 처리하지 못해 "먹통"으로
    // 보이거나(실측: 실제 탭이 응답불능이 됨) 최악엔 강제 종료된다. 매 요소마다 매크로태스크로
    // 한 번씩 양보해 메인스레드를 숨 쉬게 한다(작업량 자체는 그대로라 총 소요시간은 안 줄지만,
    // 브라우저가 죽었다고 오인하지 않게 하는 게 목적).
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

    const el = elements[i];
    const label = elementLabel(el, i);
    const node = findElementNode(stage, el.id);
    if (!node) {
      skipped.push(`${label}: 캔버스에서 찾지 못해 건너뜀`);
      continue;
    }

    // 뷰(화면 줌 반영) 공간 사각형 — toCanvas() 캡처 좌표계와 동일해야 한다.
    const rawAbs = node.getClientRect();
    // 문서(줌·팬 무관) 공간 사각형 — PSD left/top 좌표계.
    const rawDoc = node.getClientRect({ relativeTo: stage });
    if (rawAbs.width < 1 || rawAbs.height < 1) {
      skipped.push(`${label}: 캡처 영역이 비어 있어 건너뜀`);
      continue;
    }

    // 말풍선 그림자는 Container.getClientRect 가 패딩하지 않으므로 수동으로 여유를 준다.
    const padLogical = shadowPaddingLogical(el);
    const padView = padLogical * safeEffScale;

    const captureX = rawAbs.x - padView;
    const captureY = rawAbs.y - padView;
    const captureW = Math.max(1, Math.ceil(rawAbs.width + padView * 2));
    const captureH = Math.max(1, Math.ceil(rawAbs.height + padView * 2));
    const pixelRatio = scale / safeEffScale;

    let canvas: HTMLCanvasElement;
    try {
      canvas = node.toCanvas({ x: captureX, y: captureY, width: captureW, height: captureH, pixelRatio });
    } catch {
      skipped.push(`${label}: 래스터화 실패로 건너뜀`);
      continue;
    }

    // 캡처 캔버스의 (0,0)이 위치한 문서 좌표 — left/top·패널 크롭 계산에 공용으로 쓴다.
    const originDocX = rawDoc.x - padLogical;
    const originDocY = rawDoc.y - padLogical;
    let left = Math.round(originDocX * scale);
    let top = Math.round(originDocY * scale);

    // 태그된 노드를 직접 캡처하면 wrapClip 의 "패널 안으로 클리핑"이 반영되지 않는다 —
    // 같은 조건으로 패널을 찾아 캡처 캔버스를 사후에 잘라 복원한다.
    const panel = !el.noClip ? containingPanel(el, elements) : null;
    if (panel) {
      const cropped = cropToPanel(canvas, originDocX, originDocY, scale, panel);
      if (cropped) {
        canvas = cropped.canvas;
        left += cropped.dx;
        top += cropped.dy;
      }
    }

    layers.push({
      name: label,
      left,
      top,
      canvas,
      opacity: clampOpacity(el.opacity),
      blendMode: mapBlendMode(el.blendMode),
      clipping: !!el.clipBelow,
    });

    if (el.clipBelow && layers.length < 2) {
      // 맨 뒤 요소가 clipBelow 인 경우 클리핑할 "아래 레이어"가 없다 — ag-psd 는 이를 그대로
      // 기록하지만 포토샵에서 시각 효과가 없다(정직하게 고지).
      skipped.push(`${label}: 가장 아래 레이어라 "아래로 클리핑"이 적용될 대상이 없어요.`);
    }
  }

  if (layers.length === 0) {
    skipped.push("캡처 가능한 레이어가 없어 빈 캔버스로 저장했어요.");
  }

  // Studio: 뒤→앞(elements[0]=BACK) → ag-psd: 위→아래(children[0]=TOP) — 반드시 뒤집는다.
  const children = [...layers].reverse();

  const includeBg = opts.includeBackground ?? true;
  if (includeBg && opts.background) {
    children.push(makeBackgroundLayer(psdWidth, psdHeight, opts.background));
  }

  const psd: Psd = { width: psdWidth, height: psdHeight, children };

  // 합성 썸네일(파일탐색기 미리보기용, 순수 장식)은 만들지 않는다 — 실측 결과 요소 2개짜리 거의
  // 빈 페이지에서도 전체 합성 캔버스를 한 번 더 렌더링+압축하는 이 단계 때문에 내보내기가 90초
  // 넘게 걸리며 끝나지 않았다(개별 레이어 캡처는 3초 안에 끝남 — 병목은 여기). 레이어는 이미
  // 각자 온전히 캡처돼 있어 포토샵에서 여는 데 썸네일이 필요 없으므로, 있으면 좋지만 없어도 되는
  // 이 단계를 완전히 생략해 실사용 가능한 시간 안에 끝나게 한다.
  let buffer: ArrayBuffer;
  try {
    // noBackground: 배경 레이어가 완전 불투명해도 ag-psd 가 "Background"(잠김, 이름 없음)로
    // 강제 전환하지 않게 한다 — 이 파일의 모든 레이어는 이름이 있고 편집 가능해야 한다.
    buffer = writePsd(psd, { noBackground: true });
  } catch (err) {
    throw new Error(`PSD 파일을 만들지 못했어요: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  return { blob: new Blob([buffer], { type: PSD_EXPORT_MIME }), skipped, layerCount: layers.length };
}
