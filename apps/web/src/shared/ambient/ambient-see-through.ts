/**
 * 배경 캔버스가 비쳐 보이도록 "페이지 바탕을 다시 칠하는 전폭 래퍼"를 표시한다.
 *
 * 배경 캔버스(z-index -1)는 페이지 바탕색을 직접 칠한 뒤 효과를 그린다. 그런데 main과 페이지 루트 래퍼가
 * 같은 바탕색을 다시 불투명하게 칠하면 캔버스가 통째로 가려진다. 그런 래퍼에만 data 속성을 달고
 * CSS(ambient-effects.css)로 바탕색만 투명하게 한다. 아래에는 같은 색의 캔버스가 있으므로 효과를 빼면
 * 화면은 그대로이고, 효과는 글자·카드가 없는 여백에서만 보인다.
 *
 * 건드리지 않는 것:
 * - 바탕색이 페이지 바탕과 다른 띠·섹션·카드(그 안쪽으로도 내려가지 않는다: 안쪽을 비우면 띠 색이 드러난다)
 * - 테두리·둥근 모서리가 있는 표면(카드·입력창), 폼 컨트롤·미디어
 * - sticky·fixed·absolute 요소(스크롤되는 내용을 가리는 바, 덮개)
 * - 기준 요소 폭의 대부분을 차지하지 않는 요소
 */

export const AMBIENT_SEE_THROUGH_ATTRIBUTE = "data-ambient-see-through";

/** 래퍼로 볼 최소 폭(기준 요소 폭 대비). */
const MIN_WIDTH_RATIO = 0.9;
/** DOM·크기·테마가 바뀐 뒤 다시 살피는 최소 간격(ms). */
const RESCAN_DELAY_MS = 250;

const SURFACE_TAGS: ReadonlySet<string> = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "BUTTON",
  "IMG",
  "PICTURE",
  "VIDEO",
  "CANVAS",
  "IFRAME",
  "DIALOG",
]);

const BORDER_SIDES = ["top", "right", "bottom", "left"] as const;
const RADIUS_CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

function isTransparentColor(color: string): boolean {
  if (color === "" || color === "transparent") return true;
  const alpha = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\s*\)$/u.exec(color)?.[1];
  return alpha !== undefined && Number(alpha) === 0;
}

/** 테두리나 둥근 모서리가 보이는 표면(카드·입력창)인지. */
function isFramedSurface(style: CSSStyleDeclaration): boolean {
  const rounded = RADIUS_CORNERS.some(
    (corner) => Number.parseFloat(style.getPropertyValue(`border-${corner}-radius`)) > 0,
  );
  if (rounded) return true;
  return BORDER_SIDES.some((side) => {
    const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
    const lineStyle = style.getPropertyValue(`border-${side}-style`);
    return width > 0
      && lineStyle !== "none"
      && lineStyle !== "hidden"
      && !isTransparentColor(style.getPropertyValue(`border-${side}-color`));
  });
}

type LayerVerdict = "see-through" | "pass" | "stop";

/**
 * 요소 하나를 판정한다.
 * - see-through: 페이지 바탕과 같은 색을 칠하는 래퍼 → 비우고 안쪽도 살핀다.
 * - pass: 바탕이 투명한 래퍼(또는 display: contents) → 안쪽만 살핀다.
 * - stop: 다른 색·표면·고정 요소·좁은 요소 → 그대로 두고 안쪽도 보지 않는다.
 */
function judgeLayer(element: HTMLElement, pageColor: string, minWidth: number): LayerVerdict {
  if (SURFACE_TAGS.has(element.tagName.toUpperCase())) return "stop";
  const { width } = element.getBoundingClientRect();
  if (width < minWidth) {
    return width === 0 && getComputedStyle(element).display === "contents" ? "pass" : "stop";
  }
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return "stop";
  if (style.position === "sticky" || style.position === "fixed" || style.position === "absolute") return "stop";
  const background = style.backgroundColor;
  if (isTransparentColor(background)) return "pass";
  if (background !== pageColor || isFramedSurface(style)) return "stop";
  return "see-through";
}

/**
 * root(보통 main)부터 내려가며 비울 래퍼를 찾는다. 바탕이 투명하거나 비울 래퍼 안쪽으로만 내려간다.
 * 이미 표시된 요소는 표시를 뗀 상태에서 판정해야 한다(markAmbientSeeThroughLayers가 처리).
 */
export function findAmbientSeeThroughLayers(root: HTMLElement, pageColor: string): HTMLElement[] {
  if (isTransparentColor(pageColor)) return [];
  const minWidth = root.getBoundingClientRect().width * MIN_WIDTH_RATIO;
  if (minWidth <= 0) return [];
  const found: HTMLElement[] = [];
  const rootVerdict = judgeLayer(root, pageColor, minWidth);
  if (rootVerdict === "stop") return found;
  if (rootVerdict === "see-through") found.push(root);
  const queue: HTMLElement[] = [root];
  for (let element = queue.shift(); element; element = queue.shift()) {
    for (const child of element.children) {
      if (!(child instanceof HTMLElement)) continue;
      const verdict = judgeLayer(child, pageColor, minWidth);
      if (verdict === "stop") continue;
      if (verdict === "see-through") found.push(child);
      queue.push(child);
    }
  }
  return found;
}

/**
 * 표시를 새로 매긴다. 한 작업(task) 안에서 떼고-판정하고-다시 달므로 중간 상태가 그려지지 않는다.
 * @returns 지금 표시된 요소
 */
export function markAmbientSeeThroughLayers(
  root: HTMLElement,
  pageColor: string,
  previous: Iterable<HTMLElement> = [],
): Set<HTMLElement> {
  for (const element of previous) element.removeAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE);
  const marked = new Set(findAmbientSeeThroughLayers(root, pageColor));
  for (const element of marked) element.setAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE, "");
  return marked;
}

/**
 * root 아래의 래퍼 표시를 유지한다: 처음 한 번, 그리고 DOM·창 크기·테마(html 속성)가 바뀌면
 * 잠시 뒤(최대 RESCAN_DELAY_MS 간격) 다시 살핀다.
 * @param readPageColor 배경 캔버스가 칠하는 페이지 바탕색(계산값)을 읽는다.
 * @returns 정리 함수(관찰을 멈추고 모든 표시를 뗀다)
 */
export function keepAmbientSeeThrough(root: HTMLElement, readPageColor: () => string): () => void {
  let marked = new Set<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const rescan = () => {
    timer = null;
    marked = markAmbientSeeThroughLayers(root, readPageColor(), marked);
  };
  // 변경이 계속 이어져도 굶지 않도록 디바운스가 아니라 간격 제한으로 다시 살핀다.
  const schedule = () => {
    timer ??= setTimeout(rescan, RESCAN_DELAY_MS);
  };
  rescan();
  const observers: MutationObserver[] = [];
  if (typeof MutationObserver !== "undefined") {
    // 표시 속성 자체는 감시하지 않는다(class만): 스스로 다시 살피는 고리를 막는다.
    const content = new MutationObserver(schedule);
    content.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    // 테마 전환은 html 속성(class·data-*·style)으로 들어온다.
    const theme = new MutationObserver(schedule);
    theme.observe(document.documentElement, { attributes: true });
    observers.push(content, theme);
  }
  window.addEventListener("resize", schedule);
  return () => {
    if (timer !== null) clearTimeout(timer);
    for (const observer of observers) observer.disconnect();
    window.removeEventListener("resize", schedule);
    for (const element of marked) element.removeAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE);
    marked.clear();
  };
}
