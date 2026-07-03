// 스포이드(색상 추출) — 합성된 캔버스 픽셀에서 정확한 hex 색상을 뽑는 순수 함수.
// CSP/Photoshop/Procreate 전부 기본 제공하는 도구인데 이 스튜디오에는 없었다(이미지 요소
// 하나의 "주요 색상 팔레트" 추출만 있었음 — 캔버스 임의 지점의 정확한 합성 색상과는 다르다).

function toHex(n: number): string {
  return Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * ImageData의 (x, y) 픽셀을 #rrggbb hex로 반환한다. 캔버스 밖 좌표거나 완전 투명(alpha=0)
 * 픽셀이면 null(아무것도 칠해지지 않은 지점에서는 색을 바꾸지 않는 게 자연스럽다).
 * 알파 블렌딩: 배경이 비치는 반투명 픽셀은 이미 합성된(premultiplied 아닌 실제 표시) 색을
 * 그대로 쓴다 — data는 항상 스테이지를 흰 배경 위에 렌더링한 결과이므로 별도 언블렌딩 불필요.
 */
export function pickColorFromImageData(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): string | null {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return null;
  const i = (py * width + px) * 4;
  const a = data[i + 3] ?? 0;
  if (a === 0) return null;
  return `#${toHex(data[i] ?? 0)}${toHex(data[i + 1] ?? 0)}${toHex(data[i + 2] ?? 0)}`;
}
