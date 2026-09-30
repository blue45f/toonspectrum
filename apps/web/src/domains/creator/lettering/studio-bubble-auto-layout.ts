/**
 * Studio Bubble Auto Layout — 말풍선 자동 배치 순수 코어.
 *
 * 논문 기반:
 *  1. Kurlander, Skelly, Salesin, "Comic Chat", SIGGRAPH '96, §5.2.
 *     탐욕적 본체 배치 + 지연된 꼬리(routing channel). 각 말풍선마다 화자 얼굴 중심을
 *     통과하는 수평 구간(routing channel)을 예약하고, 새 말풍선이 들어설 때마다 기존
 *     채널을 최소한으로 다듬어 모든 이전 말풍선이 꼬리를 꽂을 만큼의 너비를 유지한다.
 *     채널들은 서로 겹치지 않는 분할(disjoint partition)을 이룬다.
 *  2. Yang et al., "Automatic Comic Generation with Stylistic Multi-page Layouts and
 *     Emotion-driven Text Balloon Generation", ACM TOMM 2021. 말풍선은 해당 화자
 *     옆에 배치한다(place adjacent to their corresponding speakers).
 *
 * 이 모듈은 Comic Chat의 핵심 아이디어를 웹툰 페이지 좌표계에 맞게 재해석한다:
 *  - 읽기 순서: 위→아래, 같은 높이면 왼쪽→오른쪽 (Comic Chat §5.2 제약 2)
 *  - 각 말풍선은 화자(또는 지정 앵커점)를 겨냥해야 한다 (제약 3)
 *  - 캐릭터 바운즈·다른 말풍선·패널 경계와 겹치지 않는다
 *  - 기계적으로 규칙적이지 않게 약간의 무작위성 (제약 4) — 단, seed를 받아 결정적
 *
 * Comic Chat과 다른 점: 원본은 "모든 말풍선이 가장 큰 캐릭터 머리 위"라는 고정
 * 스타일을 가정하지만, 웹툰 페이지는 자유 배치이므로 말풍선마다 후보 슬롯을 탐색한다.
 *
 * 전부 순수·결정적. DOM/Konva 의존성 없음.
 */

import { clamp, mulberry32 } from "./studio-bubble-math";

export interface AutoLayoutSpeaker {
  /** 화자 식별자. */
  id: string;
  /** 화자 얼굴/입 중심 (페이지 좌표). */
  point: { x: number; y: number };
  /** 화자 바운즈 (페이지 좌표) — 말풍선이 침범하지 말아야 할 영역. */
  bounds: { x: number; y: number; w: number; h: number };
}

export interface AutoLayoutBalloonRequest {
  /** 말풍선 식별자. */
  id: string;
  /** 화자 id (speakers 에서 찾는다). 없으면 자유 배치. */
  speakerId?: string;
  /** 대사 텍스트 — 크기 추정에 사용. */
  text: string;
  /** 폰트 크기(px). 기본 24. */
  fontSize?: number;
  /** 읽기 순서 우선순위 (작을수록 먼저). 기본 0. */
  order?: number;
}

export interface AutoLayoutObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AutoLayoutPanel {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AutoLayoutPlacedBalloon {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 예약된 꼬리 라우팅 채널 (페이지 좌표 x 구간). 꼬리가 이 구간 안에서 화자를 향해 내려간다. */
  tailChannel: { left: number; right: number };
  /** 화자 중심이 채널 안에 들어가는지 (꼬리가 닿을 수 있는지). */
  channelCoversSpeaker: boolean;
  /** 배치 중 압축(squeeze)이 적용됐는지. */
  squeezed: boolean;
}

export interface AutoLayoutResult {
  balloons: AutoLayoutPlacedBalloon[];
  /** 채널 안에 못 들어간 말풍선 id (호출부가 패널 분리 등을 고려). */
  unplaced: string[];
}

/** 말풍선 최소 여백(px). */
export const BUBBLE_AUTO_LAYOUT_MARGIN = 12;
/** 꼬리 라우팅 채널 최소 너비(px) — Comic Chat의 `t`. */
export const BUBBLE_TAIL_CHANNEL_MIN_WIDTH = 48;
/** 텍스트 → 말풍선 크기 추정용: 글자당 평균 폭 비율(폰트 크리 대비). */
const AVG_CHAR_WIDTH_RATIO = 0.62;
/** 한 줄 최대 글자 수 (이보다 길면 줄바꿈). */
const MAX_CHARS_PER_LINE = 14;
/** 패딩 비율 (폰트 크기 대비). */
const PAD_RATIO = 0.9;
/** 화자 위 말풍선 탐색 시 화자 위쪽 오프셋(px). */
const SPEAKER_ABOVE_OFFSET = 60;
/** 화자 옆 말풍선 탐색 시 화자 옆쪽 오프셋(px). */
const SPEAKER_SIDE_OFFSET = 40;
/** 읽기 순서 위배(이전 말풍선보다 위) 페널티. */
const ORDER_VIOLATION_PENALTY = 500;
/** 읽기 순서 역행 위험(너무 아래) 페널티. */
const TOO_LOW_PENALTY = 200;
/** 기계적 규칙성을 피하기 위한 지터 최대치. */
const PLACEMENT_JITTER = 40;

/**
 * 대사 텍스트에서 말풍선 크기를 추정한다.
 * 텍스트 길이 → 줄 수 → (너비, 높이). 실제 측정이 있으면 호출부가 덮어쓴다.
 */
export function estimateBalloonSize(
  text: string,
  fontSize = 24
): { width: number; height: number } {
  const chars = Array.from(text.trim()).length;
  if (chars === 0) {
    return { width: fontSize * 3, height: fontSize * 2.2 };
  }
  const lineHeight = fontSize * 1.35;
  const charW = fontSize * AVG_CHAR_WIDTH_RATIO;
  // 목표: 줄 수를 최소화하되 너무 넓어지지 않게.
  const lines = Math.max(1, Math.ceil(chars / MAX_CHARS_PER_LINE));
  const charsPerLine = Math.ceil(chars / lines);
  const textW = charsPerLine * charW;
  const pad = fontSize * PAD_RATIO;
  return {
    width: Math.ceil(textW + pad * 2),
    height: Math.ceil(lines * lineHeight + pad * 1.6),
  };
}

interface PlacedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rectsOverlap = (a: PlacedRect, b: PlacedRect, margin: number): boolean =>
  a.x - margin < b.x + b.w &&
  a.x + a.w + margin > b.x &&
  a.y - margin < b.y + b.h &&
  a.y + a.h + margin > b.y;

const rectInside = (a: PlacedRect, panel: AutoLayoutPanel): boolean =>
  a.x >= panel.x &&
  a.y >= panel.y &&
  a.x + a.w <= panel.x + panel.w &&
  a.y + a.h <= panel.y + panel.h;

export interface AutoLayoutOptions {
  /** 결정적 무작위성 시드. 기본 1. */
  seed?: number;
  /** 말풍선 간 최소 여백. 기본 BUBBLE_AUTO_LAYOUT_MARGIN. */
  margin?: number;
  /** 꼬리 채널 최소 너비. 기본 BUBBLE_TAIL_CHANNEL_MIN_WIDTH. */
  tailChannelMinWidth?: number;
  /** 후보 슬롯 탐색 그리드 간격(px). 기본 24. */
  gridStep?: number;
}

interface CandidateBlockContext {
  speaker?: AutoLayoutSpeaker;
  obstacles: readonly AutoLayoutObstacle[];
  placed: readonly PlacedRect[];
  margin: number;
}

/**
 * 후보 위치가 배치 가능한지 판정한다.
 * 장애물·화자 바운즈·이미 배치된 말풍선과 겹치면 차단된다.
 * (화자는 꼬리로 연결하므로 본체가 화자 바운즈와 겹치면 안 된다.)
 */
function isCandidateBlocked(
  cand: PlacedRect,
  ctx: CandidateBlockContext
): boolean {
  for (const ob of ctx.obstacles) {
    if (
      rectsOverlap(cand, { x: ob.x, y: ob.y, w: ob.w, h: ob.h }, ctx.margin)
    ) {
      return true;
    }
  }
  if (ctx.speaker) {
    const sb = ctx.speaker.bounds;
    const overlapsSpeaker =
      cand.x < sb.x + sb.w &&
      cand.x + cand.w > sb.x &&
      cand.y < sb.y + sb.h &&
      cand.y + cand.h > sb.y;
    if (overlapsSpeaker) return true;
  }
  for (const p of ctx.placed) {
    if (rectsOverlap(cand, p, ctx.margin)) return true;
  }
  return false;
}

interface CandidateScoreContext {
  panel: AutoLayoutPanel;
  lastPlacedY: number;
  balloonHeight: number;
}

/**
 * 후보 위치의 점수를 계산한다 (높을수록 좋다).
 * 점수 = -(화자/탐색원점과의 거리 + 읽기 순서 페널티) + 결정적 지터.
 */
function scoreCandidate(
  gx: number,
  gy: number,
  origin: { cx: number; cy: number },
  balloonWidth: number,
  balloonHeight: number,
  ctx: CandidateScoreContext,
  jitter: number
): number {
  const dx = gx + balloonWidth / 2 - origin.cx;
  const dy = gy + balloonHeight / 2 - origin.cy;
  const dist = Math.hypot(dx, dy);
  // 읽기 순서 위배 페널티: 이전 말풍선보다 위쪽에 있으면 감점.
  const orderPenalty = gy < ctx.lastPlacedY - balloonHeight ? ORDER_VIOLATION_PENALTY : 0;
  // 너무 아래쪽(읽기 순서 역행 위험)도 약간 감점.
  const lowPenalty =
    gy > ctx.lastPlacedY + ctx.panel.h * 0.6 ? TOO_LOW_PENALTY : 0;
  return -(dist + orderPenalty + lowPenalty) + jitter;
}

interface TailChannel {
  left: number;
  right: number;
}

/**
 * 꼬리 라우팅 채널을 예약한다 (Comic Chat §5.2 재해석).
 *
 *  1. 새 채널 = [화자x - w, 화자x + w]에서 시작.
 *  2. MaxAllowable: 기존 채널들이 최소 너비를 유지하도록 새 채널을 다듬는다.
 *  3. ReduceChannel: 새 말풍선이 차지하는 공간을 기존 채널들에서 제거한다
 *     (disjoint partition 유지).
 *  4. 패널 경계로 클램프한다.
 */
function reserveTailChannel(
  speakerX: number,
  balloonX: number,
  balloonWidth: number,
  channels: TailChannel[],
  panel: AutoLayoutPanel,
  tailChannelMinWidth: number
): TailChannel {
  const channel: TailChannel = {
    left: speakerX - balloonWidth,
    right: speakerX + balloonWidth,
  };
  // MaxAllowable.
  for (const prev of channels) {
    const prevSpeakerX = (prev.left + prev.right) / 2;
    if (prevSpeakerX < speakerX) {
      channel.left = Math.max(prev.left + tailChannelMinWidth, prevSpeakerX);
    } else {
      channel.right = Math.min(prev.right - tailChannelMinWidth, prevSpeakerX);
    }
  }
  // ReduceChannel.
  const newLeft = balloonX;
  const newRight = balloonX + balloonWidth;
  for (let i = 0; i < channels.length; i++) {
    const prev = channels[i];
    if (newLeft < prev.right && newRight > prev.left) {
      // 겹치는 쪽을 잘라낸다 (화자 중심이 남는 쪽 유지).
      const prevMid = (prev.left + prev.right) / 2;
      if (prevMid < newLeft) {
        channels[i] = { left: prev.left, right: Math.min(prev.right, newLeft) };
      } else if (prevMid > newRight) {
        channels[i] = { left: Math.max(prev.left, newRight), right: prev.right };
      }
      // 화자 중심이 새 말풍선 안에 묻히면 채널을 유지할 수 없음 → 그대로 둔다.
    }
  }
  channel.left = clamp(channel.left, panel.x, panel.x + panel.w);
  channel.right = clamp(channel.right, panel.x, panel.x + panel.w);
  return channel;
}

/**
 * 말풍선들을 패널 안에 자동 배치한다.
 *
 * 알고리즘 (Comic Chat §5.2 재해석):
 *  1. 읽기 순서(order, 없으면 입력 순서)로 정렬.
 *  2. 각 말풍선마다 화자 얼굴 중심 x를 지나는 "가장 넓은 채널"에서 시작.
 *  3. 이미 배치된 말풍선들과 겹치지 않는 후보 위치를 그리드 탐색으로 찾는다.
 *     점수 = 화자와의 거리(가까울수록) - 읽기 순서 위배 페널티 + 약간의 무작위 지터.
 *  4. 꼬리 채널을 예약하고, 새 말풍선이 이전 채널을 침범하면 이전 채널을 다듬는다
 *     (disjoint partition 유지).
 *  5. 채널이 너무 좁아지면 말풍선을 압축(squeeze) 시도, 그래도 안 되면 unplaced.
 */
export function autoLayoutBalloons(
  requests: readonly AutoLayoutBalloonRequest[],
  speakers: readonly AutoLayoutSpeaker[],
  panel: AutoLayoutPanel,
  obstacles: readonly AutoLayoutObstacle[] = [],
  options: AutoLayoutOptions = {}
): AutoLayoutResult {
  const {
    seed = 1,
    margin = BUBBLE_AUTO_LAYOUT_MARGIN,
    tailChannelMinWidth = BUBBLE_TAIL_CHANNEL_MIN_WIDTH,
    gridStep = 24,
  } = options;
  const rand = mulberry32(seed);

  const speakerById = new Map(speakers.map((s) => [s.id, s]));
  const sorted = [...requests].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const placed: PlacedRect[] = [];
  const channels: { left: number; right: number }[] = [];
  const result: AutoLayoutPlacedBalloon[] = [];
  const unplaced: string[] = [];
  // 읽기 순서: 이전에 배치된 말풍선보다 위쪽에 있으면 페널티 (위→아래 순서 유지).
  let lastPlacedY = panel.y;

  for (const req of sorted) {
    const fontSize = req.fontSize ?? 24;
    const est = estimateBalloonSize(req.text, fontSize);
    const speaker = req.speakerId ? speakerById.get(req.speakerId) : undefined;

    // 후보 위치 탐색: 화자 근처를 우선하되 패널 전체를 그리드로 훑는다.

    let best: { x: number; y: number; score: number } | null = null;

    // 화자 위쪽 영역을 먼저 탐색 (말풍선은 보통 화자 위/옆에).
    const searchOrigins: Array<{ cx: number; cy: number }> = [];
    if (speaker) {
      searchOrigins.push({
        cx: speaker.point.x,
        cy: speaker.point.y - est.height - SPEAKER_ABOVE_OFFSET,
      });
      searchOrigins.push({
        cx: speaker.point.x - est.width - SPEAKER_SIDE_OFFSET,
        cy: speaker.point.y - est.height / 2,
      });
      searchOrigins.push({
        cx: speaker.point.x + SPEAKER_SIDE_OFFSET,
        cy: speaker.point.y - est.height / 2,
      });
    }
    searchOrigins.push({ cx: panel.x + panel.w / 2, cy: panel.y + 40 });

    const blockCtx: CandidateBlockContext = {
      speaker,
      obstacles,
      placed,
      margin,
    };
    const scoreCtx: CandidateScoreContext = {
      panel,
      lastPlacedY,
      balloonHeight: est.height,
    };

    for (const origin of searchOrigins) {
      for (
        let gy = panel.y;
        gy + est.height <= panel.y + panel.h;
        gy += gridStep
      ) {
        for (
          let gx = panel.x;
          gx + est.width <= panel.x + panel.w;
          gx += gridStep
        ) {
          const cand: PlacedRect = { x: gx, y: gy, w: est.width, h: est.height };
          if (!rectInside(cand, panel)) continue;
          if (isCandidateBlocked(cand, blockCtx)) continue;

          const score = scoreCandidate(
            gx,
            gy,
            origin,
            est.width,
            est.height,
            scoreCtx,
            rand() * PLACEMENT_JITTER
          );
          if (!best || score > best.score) {
            best = { x: gx, y: gy, score };
          }
        }
      }
      // 첫 번째 원점에서 찾았으면 더 탐색하지 않는다 (화자 근처 우선).
      if (best) break;
    }

    if (!best) {
      unplaced.push(req.id);
      continue;
    }
    // null 체크 후 로컬 const에 고정 — 클로저 캡처로 인한 never 추론 방지.
    const found = best;

    // 꼬리 라우팅 채널 예약 (Comic Chat §5.2).
    const speakerX = speaker ? speaker.point.x : found.x + est.width / 2;
    const channel = reserveTailChannel(
      speakerX,
      found.x,
      est.width,
      channels,
      panel,
      tailChannelMinWidth
    );
    channels.push(channel);

    const channelWidth = channel.right - channel.left;
    const squeezed = channelWidth < tailChannelMinWidth;
    const channelCoversSpeaker =
      speakerX >= channel.left && speakerX <= channel.right;

    placed.push({ x: found.x, y: found.y, w: est.width, h: est.height });
    lastPlacedY = Math.max(lastPlacedY, found.y);
    result.push({
      id: req.id,
      x: found.x,
      y: found.y,
      width: est.width,
      height: est.height,
      tailChannel: { ...channel },
      channelCoversSpeaker,
      squeezed,
    });
  }

  // result는 이미 읽기 순서(sorted)대로 쌓여 있다.
  return { balloons: result, unplaced };
}
