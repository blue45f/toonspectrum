/**
 * Studio Fit — 요소를 패널에 채우거나 말풍선을 텍스트에 맞추는 순수 기하 헬퍼.
 *
 * 웹툰 작업에서 잦은 두 동작의 수동 리사이즈를 한 번에 끝낸다.
 * - 패널 채우기: 캐릭터/배경 이미지를 컷(프레임)에 꽉 채우거나(cover) 안에 맞춘다(contain).
 * - 말풍선 맞춤: 대사 길이에 맞춰 말풍선 높이를 자동 산정한다.
 *
 * 전부 순수·결정적. DOM/Konva 의존 없음 — StudioPage가 결과 박스로 patchEl 한다.
 */

export interface FitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Sized {
  width: number;
  height: number;
}

/**
 * 요소를 프레임에 "꽉 채우기"(cover) — 비율을 유지한 채 프레임을 덮는다(넘치는 부분은
 * 패널 클립이 가린다). 중앙 정렬한 박스를 돌려준다.
 */
export function coverFitInFrame(el: Sized, frame: FitBox): FitBox {
  if (el.width <= 0 || el.height <= 0) return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  const ratio = Math.max(frame.width / el.width, frame.height / el.height);
  const w = Math.round(el.width * ratio);
  const h = Math.round(el.height * ratio);
  return {
    x: Math.round(frame.x + (frame.width - w) / 2),
    y: Math.round(frame.y + (frame.height - h) / 2),
    width: w,
    height: h,
  };
}

/**
 * 요소를 프레임 "안에 맞추기"(contain) — 비율을 유지하며 잘리지 않게 안에 들어간다. 여백(padding) 가능.
 */
export function containFitInFrame(el: Sized, frame: FitBox, padding = 0): FitBox {
  const fw = Math.max(1, frame.width - padding * 2);
  const fh = Math.max(1, frame.height - padding * 2);
  if (el.width <= 0 || el.height <= 0) return { x: frame.x + padding, y: frame.y + padding, width: fw, height: fh };
  const ratio = Math.min(fw / el.width, fh / el.height);
  const w = Math.round(el.width * ratio);
  const h = Math.round(el.height * ratio);
  return {
    x: Math.round(frame.x + (frame.width - w) / 2),
    y: Math.round(frame.y + (frame.height - h) / 2),
    width: w,
    height: h,
  };
}

/**
 * 말풍선 텍스트가 들어갈 높이 추정(글자 수·폭·크기 기반). 줄바꿈과 자동 줄넘김을 모두 고려하고
 * 말풍선 안쪽 여백을 더한다. 최소 높이를 보장한다.
 */
export function estimateBubbleHeight(
  text: string,
  width: number,
  fontSize: number,
  lineHeight = 1.2,
  padding = 22
): number {
  const usableWidth = Math.max(1, width - padding * 1.4);
  const charsPerLine = Math.max(4, Math.floor(usableWidth / (fontSize * 0.62)));
  const explicitLines = text.split("\n").length;
  const wrapped = Math.ceil(Math.max(1, text.length) / charsPerLine);
  const lines = Math.max(explicitLines, wrapped, 1);
  const minHeight = Math.round(fontSize * lineHeight + padding * 1.6);
  return Math.max(minHeight, Math.round(lines * fontSize * lineHeight + padding * 1.6));
}
