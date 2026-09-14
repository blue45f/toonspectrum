/** Conservative white/transparent gutter detection. No OCR, network or inferred artwork. */
export function promoGutterCuts(image: { width: number; height: number; data: ArrayLike<number> }, sourceHeight: number, maxParts = 12): number[] {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 2_000_000 || data.length !== width * height * 4 || !Number.isInteger(sourceHeight) || sourceHeight < height || !Number.isInteger(maxParts) || maxParts < 1 || maxParts > 12) throw new Error("분할 분석 이미지가 올바르지 않아요.");
  const whitespace: boolean[] = [];
  for (let y = 0; y < height; y += 1) {
    let white = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if ((data[offset + 3] ?? 255) <= 16 || ((data[offset] ?? 0) >= 246 && (data[offset + 1] ?? 0) >= 246 && (data[offset + 2] ?? 0) >= 246)) white += 1;
    }
    whitespace.push(white / width >= 0.985);
  }
  const firstInk = whitespace.indexOf(false);
  const lastInk = whitespace.lastIndexOf(false);
  const minGap = Math.max(2, Math.ceil(width * 0.025));
  const minScene = Math.max(8, Math.ceil(width * 0.24));
  const boundaries = [0];
  let previous = firstInk;
  for (let row = 0; row < height; row += 1) {
    if (!whitespace[row]) continue;
    const start = row;
    while (row < height && whitespace[row]) row += 1;
    const end = row;
    if (end - start < minGap || start - previous < minScene || lastInk - end < minScene) continue;
    const middle = Math.floor((start + end) / 2);
    boundaries.push(Math.floor(middle * sourceHeight / height));
    previous = end;
  }
  if (boundaries.length > maxParts) throw new Error(`여백에서 ${boundaries.length}컷을 찾았지만 남은 공간은 ${maxParts}컷이에요. 원고를 나누거나 기존 컷을 줄여 주세요. 원본을 임의로 잘라 버리지 않습니다.`);  // Retain margins and every source row exactly once, including ambiguous/no-gutter pages.
  return [...boundaries, sourceHeight];
}
