// 페인트 통(flood-fill) 채색 — 100% 브라우저(클라이언트) 실행, 서버·토큰 비용 0원.
// 클릭 지점과 같은 색으로 이어진 영역을 스택 기반(비재귀) BFS/DFS 로 찾아 지정 색으로 칠한다.
// 웹툰 컷의 셀 채색(flat color 영역 일괄 칠하기)에 특화 — 브러시로 한 픽셀씩 칠하는 것보다 빠르다.
import { hexToRgb } from "./studio-filters";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

/**
 * 페인트 통 채색 — src(데이터 URL 등)에서 (startXRatio, startYRatio) 지점과 같은 색으로 이어진
 * 영역을 fillColorHex 로 칠한 PNG data URL 을 반환한다.
 * @param startXRatio 시작점 x 비율(0..1) — 호출부의 축소 미리보기 캔버스 좌표를 원본 해상도와
 *   무관하게 넘길 수 있도록 절대 픽셀이 아닌 비율로 받는다.
 * @param startYRatio 시작점 y 비율(0..1)
 * @param tolerance 시작 픽셀과의 색 허용 오차(0-255 채널 스케일). 클수록 더 넓게 번진다.
 */
export async function floodFillImage(
  src: string,
  startXRatio: number,
  startYRatio: number,
  fillColorHex: string,
  tolerance = 32,
): Promise<string> {
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("이미지 크기를 확인할 수 없습니다.");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 만들 수 없습니다.");
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const startX = Math.min(w - 1, Math.max(0, Math.round(startXRatio * w)));
  const startY = Math.min(h - 1, Math.max(0, Math.round(startYRatio * h)));

  const { r: fr, g: fg, b: fb } = hexToRgb(fillColorHex);
  const startIdx = (startY * w + startX) * 4;
  const sr = data[startIdx]!;
  const sg = data[startIdx + 1]!;
  const sb = data[startIdx + 2]!;
  const sa = data[startIdx + 3]!;

  // 이미 채우려는 색과 사실상 동일하면(반올림 오차 수준) 전체 스캔·재인코딩을 생략한다.
  // tolerance(사용자가 고른 "얼마나 비슷하면 같은 영역으로 볼지")가 아니라 훨씬 좁은 고정 임계값을
  // 쓴다 — tolerance 를 그대로 쓰면 "비슷하지만 다른 색으로 다시 칠하기" 같은 유효한 요청까지
  // no-op 으로 건너뛰게 된다.
  const NEAR_IDENTICAL2 = 3; // 채널당 오차 1 이내(3채널 제곱합 ≤ 3)만 "사실상 동일"로 본다.
  if ((fr - sr) ** 2 + (fg - sg) ** 2 + (fb - sb) ** 2 <= NEAR_IDENTICAL2) {
    return src; // 픽셀이 바뀌지 않으므로 putImageData/toDataURL 재인코딩도 필요 없다.
  }

  const tol2 = tolerance * tolerance * 3; // 채널별 제곱합(=유클리드 거리 제곱)과 비교하는 임계값.
  const matches = (i: number): boolean => {
    const dr = data[i]! - sr;
    const dg = data[i + 1]! - sg;
    const db = data[i + 2]! - sb;
    const da = data[i + 3]! - sa;
    return dr * dr + dg * dg + db * db + da * da <= tol2;
  };

  // 방문 여부는 "x,y" 문자열 Set 대신 픽셀당 1바이트 typed array 로 — 큰 이미지에서도 빠르고 가볍다.
  const visited = new Uint8Array(w * h);
  // 재귀는 큰 이미지에서 스택 오버플로우가 나므로 배열을 스택처럼 쓰는 반복(iterative) 구현.
  const stack: number[] = [startY * w + startX];
  visited[startY * w + startX] = 1;

  const maxPixels = w * h;
  let processed = 0;
  while (stack.length > 0) {
    // 방어적 상한 — visited 비트맵이 자연히 이 한계를 보장하지만, 혹시 모를 버그로도
    // 무한 루프/타임아웃이 나지 않도록 이중으로 막는다.
    if (processed > maxPixels) break;
    processed++;

    const pos = stack.pop()!;
    const px = pos % w;
    const py = (pos / w) | 0;
    const idx = pos * 4;
    if (!matches(idx)) continue;

    // 원본 알파는 유지하고 색만 바꾼다 — 배경 제거로 투명해진 이미지 위에 칠해도 자연스럽게.
    data[idx] = fr;
    data[idx + 1] = fg;
    data[idx + 2] = fb;

    if (px > 0) {
      const n = pos - 1;
      if (!visited[n]) {
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (px < w - 1) {
      const n = pos + 1;
      if (!visited[n]) {
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (py > 0) {
      const n = pos - w;
      if (!visited[n]) {
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (py < h - 1) {
      const n = pos + w;
      if (!visited[n]) {
        visited[n] = 1;
        stack.push(n);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
