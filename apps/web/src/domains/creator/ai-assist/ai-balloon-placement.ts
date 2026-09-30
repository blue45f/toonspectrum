/**
 * AI 식자 보조 — 말풍선 위치 자동 추천
 *
 * 대사 텍스트 길이 → 말풍선 크기 추정, 화자 위치 → 꼬리 방향 결정,
 * 기존 말풍선과 겹치지 않게 밀어내는 순수 로직.
 * 렌더링은 호출 측(말풍선 UI)이 담당 — 여기는 "어디에 둘지"만 계산한다.
 */

export interface AiSpeaker {
  /** 화자 머리 위치 (꼬리가 향할 지점) */
  readonly x: number;
  readonly y: number;
}

export interface AiBalloonRequest {
  /** 대사 텍스트 */
  readonly text: string;
  readonly speaker: AiSpeaker;
  /** 캔버스 크기 */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** 이미 배치된 말풍선들 (겹침 회피용) */
  readonly existing: readonly AiBalloonRect[];
  /** 말풍선 타입 */
  readonly kind: AiBalloonKind;
}

export type AiBalloonKind = "speech" | "thought" | "shout" | "whisper" | "narration";

export interface AiBalloonRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AiBalloonPlacement extends AiBalloonRect {
  /** 꼬리 시작점 (말풍선 가장자리) */
  readonly tailBase: { readonly x: number; readonly y: number };
  /** 꼬리 끝점 (화자 방향) */
  readonly tailTip: { readonly x: number; readonly y: number };
  readonly kind: AiBalloonKind;
}

/** 글자 수 기반 말풍선 크기 추정 (한글 기준) */
export function estimateBalloonSize(
  text: string,
  kind: AiBalloonKind,
  fontSize = 15,
): { readonly width: number; readonly height: number } {
  const chars = [...text].length;
  // 한 줄 최대 글자 수 (타입별)
  const maxPerLine = kind === "narration" ? 22 : 14;
  const lines = Math.max(1, Math.ceil(chars / maxPerLine));
  const longestLine = Math.min(chars, maxPerLine);
  // 한글 전각 기준 너비 추정 + 여백
  const width = Math.ceil(longestLine * fontSize * 1.02 + 36);
  const height = Math.ceil(lines * fontSize * 1.65 + 30);
  // 외침은 15% 확대, 속삭임은 10% 축소
  const scale = kind === "shout" ? 1.15 : kind === "whisper" ? 0.9 : 1;
  return {
    width: Math.ceil(width * scale),
    height: Math.ceil(height * scale),
  };
}

function rectsOverlap(a: AiBalloonRect, b: AiBalloonRect, padding = 12): boolean {
  return (
    a.x - padding < b.x + b.width &&
    a.x + a.width + padding > b.x &&
    a.y - padding < b.y + b.height &&
    a.y + a.height + padding > b.y
  );
}

/**
 * 말풍선 위치 자동 추천.
 *
 * 전략:
 * 1. 화자 머리 위쪽을 우선 후보로 (웹툰 관례)
 * 2. 겹치면 시계 방향으로 8방향 탐색
 * 3. 그래도 겹치면 기존 말풍선을 밀어낼 위치 탐색
 * 4. 캔버스 경계 안으로 클램프
 */
export function recommendBalloonPlacement(request: AiBalloonRequest): AiBalloonPlacement {
  const { text, speaker, canvasWidth, canvasHeight, existing, kind } = request;
  const { width, height } = estimateBalloonSize(text, kind);

  const clampToCanvas = (x: number, y: number): { x: number; y: number } => ({
    x: Math.min(Math.max(8, x), Math.max(8, canvasWidth - width - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, canvasHeight - height - 8)),
  });

  // 후보 위치: 화자 기준 8방향 (위 우선)
  const directions: ReadonlyArray<{ dx: number; dy: number }> = [
    { dx: 0, dy: -1 }, // 위
    { dx: 0.7, dy: -0.7 }, // 오른쪽 위
    { dx: -0.7, dy: -0.7 }, // 왼쪽 위
    { dx: 1, dy: 0 }, // 오른쪽
    { dx: -1, dy: 0 }, // 왼쪽
    { dx: 0.7, dy: 0.7 }, // 오른쪽 아래
    { dx: -0.7, dy: 0.7 }, // 왼쪽 아래
    { dx: 0, dy: 1 }, // 아래
  ];

  const gap = 18;
  let placed: AiBalloonRect | null = null;

  const candidateAt = (dir: { dx: number; dy: number }): AiBalloonRect => {
    const cx = speaker.x + dir.dx * (width / 2 + gap + 30);
    const cy = speaker.y + dir.dy * (height / 2 + gap + 40);
    const clamped = clampToCanvas(cx - width / 2, cy - height / 2);
    return { ...clamped, width, height };
  };

  const overlapCount = (rect: AiBalloonRect): number =>
    existing.filter((e) => rectsOverlap(rect, e)).length;

  for (const dir of directions) {
    const rect = candidateAt(dir);
    if (overlapCount(rect) === 0) {
      placed = rect;
      break;
    }
  }

  // 전부 겹치면: 8방향 중 가장 덜 겹치는 위치 선택 (위 방향 우선)
  if (!placed) {
    let best = candidateAt(directions[0]);
    let bestOverlaps = overlapCount(best);
    for (const dir of directions.slice(1)) {
      const rect = candidateAt(dir);
      const overlaps = overlapCount(rect);
      if (overlaps < bestOverlaps) {
        best = rect;
        bestOverlaps = overlaps;
        if (bestOverlaps === 0) break;
      }
    }
    placed = best;
  }

  // 꼬리: 말풍선 중심에서 화자 방향으로
  const centerX = placed.x + width / 2;
  const centerY = placed.y + height / 2;
  const angleToSpeaker = Math.atan2(speaker.y - centerY, speaker.x - centerX);
  const tailBase = {
    x: centerX + Math.cos(angleToSpeaker) * (width / 2),
    y: centerY + Math.sin(angleToSpeaker) * (height / 2),
  };

  return {
    ...placed,
    tailBase,
    tailTip: { x: speaker.x, y: speaker.y },
    kind,
  };
}

/** 대사 톤 키워드로 말풍선 타입 추천 */
export function guessBalloonKind(text: string): AiBalloonKind {
  if (/[!！]{2,}|꺄|악|으악/i.test(text)) return "shout";
  if (/\.\.\.|\(.*\)|속으로|생각/i.test(text)) return "thought";
  if (/속삭|살짝|조용히/i.test(text)) return "whisper";
  if (/^[『「]/u.test(text.trim())) return "narration";
  return "speech";
}
