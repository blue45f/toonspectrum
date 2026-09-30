/**
 * studio-3d-billboard-bubble-anchor.ts
 *
 * Toonsquare Tooning-inspired 3D Billboard Speech Bubble & Comic Emote Anchor Engine.
 * Manages 3D camera-facing billboard text balloons (speech, shout, thought, whisper)
 * and manga emotion symbols (sweat, anger, question, exclamation, sparkle, dark-lines, heart)
 * with dynamic tail anchoring to character head/mouth coordinates.
 */

export type BubbleKind = "speech" | "shout" | "thought" | "whisper";

export type EmoteKind =
  | "sweat"
  | "anger"
  | "question"
  | "exclamation"
  | "sparkle"
  | "dark-lines"
  | "heart";

export type CharacterAnchorSocket =
  | "head-top"
  | "head-right"
  | "head-left"
  | "mouth"
  | "shoulder-right"
  | "shoulder-left";

export interface BubbleKindUi {
  readonly labelKo: string;
  readonly labelEn: string;
  readonly tooltipKo: string;
  readonly tooltipEn: string;
}

/** 말풍선 종류 UI 메타데이터(ko/en 라벨+툴팁). */
export const BUBBLE_KIND_UI: Readonly<Record<BubbleKind, BubbleKindUi>> = Object.freeze({
  speech: Object.freeze({
    labelKo: "일반 대사",
    labelEn: "Speech",
    tooltipKo: "일반 대사 — 둥근 말풍선과 꼬리. 기본 대화용.",
    tooltipEn: "Speech — rounded balloon with a tail. Default dialogue.",
  }),
  shout: Object.freeze({
    labelKo: "외침",
    labelEn: "Shout",
    tooltipKo: "외침 — 뾰족한 폭발형 말풍선. 고함·놀람 연출.",
    tooltipEn: "Shout — jagged burst balloon. Yelling and shock.",
  }),
  thought: Object.freeze({
    labelKo: "생각",
    labelEn: "Thought",
    tooltipKo: "생각 — 구름 모양. 속마음·독백 연출.",
    tooltipEn: "Thought — cloud shape. Inner monologue.",
  }),
  whisper: Object.freeze({
    labelKo: "속삭임",
    labelEn: "Whisper",
    tooltipKo: "속삭임 — 점선 테두리. 작은 목소리·비밀 연출.",
    tooltipEn: "Whisper — dashed outline. Quiet, secretive voice.",
  }),
});

export interface EmoteKindUi {
  readonly labelKo: string;
  readonly labelEn: string;
  readonly tooltipKo: string;
  readonly tooltipEn: string;
}

/** 감정 이모트 UI 메타데이터(ko/en 라벨+툴팁). */
export const EMOTE_KIND_UI: Readonly<Record<EmoteKind, EmoteKindUi>> = Object.freeze({
  sweat: Object.freeze({
    labelKo: "땀",
    labelEn: "Sweat",
    tooltipKo: "땀 — 당황·난처함을 나타내는 땀방울.",
    tooltipEn: "Sweat — embarrassment or panic drop.",
  }),
  anger: Object.freeze({
    labelKo: "분노",
    labelEn: "Anger",
    tooltipKo: "분노 — 혈관 핏줄 마크. 화남 연출.",
    tooltipEn: "Anger — vein mark. Rage emphasis.",
  }),
  question: Object.freeze({
    labelKo: "물음표",
    labelEn: "Question",
    tooltipKo: "물음표 — 의문·당황 상황 표시.",
    tooltipEn: "Question — confusion or doubt.",
  }),
  exclamation: Object.freeze({
    labelKo: "느낌표",
    labelEn: "Exclamation",
    tooltipKo: "느낌표 — 놀람·깨달음 강조.",
    tooltipEn: "Exclamation — surprise or realization.",
  }),
  sparkle: Object.freeze({
    labelKo: "반짝임",
    labelEn: "Sparkle",
    tooltipKo: "반짝임 — 설렘·아름다움 강조.",
    tooltipEn: "Sparkle — excitement or beauty.",
  }),
  "dark-lines": Object.freeze({
    labelKo: "어두운 선",
    labelEn: "Dark lines",
    tooltipKo: "어두운 선 — 침울·절망 분위기.",
    tooltipEn: "Dark lines — gloom and despair mood.",
  }),
  heart: Object.freeze({
    labelKo: "하트",
    labelEn: "Heart",
    tooltipKo: "하트 — 호감·사랑 표현.",
    tooltipEn: "Heart — affection and love.",
  }),
});

export interface CharacterAnchorSocketUi {
  readonly labelKo: string;
  readonly labelEn: string;
  readonly tooltipKo: string;
  readonly tooltipEn: string;
}

/** 캐릭터 앵커 소켓 UI 메타데이터(ko/en 라벨+툴팁). */
export const CHARACTER_ANCHOR_SOCKET_UI: Readonly<
  Record<CharacterAnchorSocket, CharacterAnchorSocketUi>
> = Object.freeze({
  "head-top": Object.freeze({
    labelKo: "머리 위",
    labelEn: "Head top",
    tooltipKo: "머리 위 — 말풍선·생각 구름의 기본 위치.",
    tooltipEn: "Head top — default spot for balloons and thoughts.",
  }),
  "head-right": Object.freeze({
    labelKo: "머리 오른쪽",
    labelEn: "Head right",
    tooltipKo: "머리 오른쪽 — 땀·물음표 등 이모트 위치.",
    tooltipEn: "Head right — emote spot like sweat or question marks.",
  }),
  "head-left": Object.freeze({
    labelKo: "머리 왼쪽",
    labelEn: "Head left",
    tooltipKo: "머리 왼쪽 — 땀·물음표 등 이모트 위치.",
    tooltipEn: "Head left — emote spot like sweat or question marks.",
  }),
  mouth: Object.freeze({
    labelKo: "입",
    labelEn: "Mouth",
    tooltipKo: "입 — 말풍선 꼬리가 향하는 발화 지점.",
    tooltipEn: "Mouth — where the balloon tail points.",
  }),
  "shoulder-right": Object.freeze({
    labelKo: "오른쪽 어깨",
    labelEn: "Right shoulder",
    tooltipKo: "오른쪽 어깨 — 대사 보조·나레이션 박스 위치.",
    tooltipEn: "Right shoulder — secondary dialogue spot.",
  }),
  "shoulder-left": Object.freeze({
    labelKo: "왼쪽 어깨",
    labelEn: "Left shoulder",
    tooltipKo: "왼쪽 어깨 — 대사 보조·나레이션 박스 위치.",
    tooltipEn: "Left shoulder — secondary dialogue spot.",
  }),
});

export interface Vector3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SpeechBubbleItem {
  readonly id: string;
  readonly text: string;
  readonly kind: BubbleKind;
  readonly socket: CharacterAnchorSocket;
  readonly offset: Vector3D;
  readonly scale: number;
  readonly billboardFacing: boolean;
  readonly tailTargetOffset: Vector3D;
  readonly bubbleBgColor: string; // #ffffff, #181824, etc.
  readonly textColor: string;
}

export interface EmoteStickerItem {
  readonly id: string;
  readonly kind: EmoteKind;
  readonly socket: CharacterAnchorSocket;
  readonly offset: Vector3D;
  readonly scale: number;
  readonly floatAnimation: boolean;
  readonly tintColor: string;
}

export interface BillboardTransform {
  readonly worldPosition: Vector3D;
  readonly rotationEulerYDeg: number;
  readonly rotationEulerXDeg: number;
  readonly scale: number;
}

export interface ScreenProjectionResult {
  readonly screenX: number;
  readonly screenY: number;
  readonly isInFrontOfCamera: boolean;
  readonly distanceToCamera: number;
}

export const SOCKET_LOCAL_OFFSETS: Record<CharacterAnchorSocket, Vector3D> = {
  "head-top": { x: 0, y: 0.35, z: 0 },
  "head-right": { x: 0.28, y: 0.2, z: 0 },
  "head-left": { x: -0.28, y: 0.2, z: 0 },
  mouth: { x: 0, y: -0.05, z: 0.12 },
  "shoulder-right": { x: 0.45, y: -0.15, z: 0 },
  "shoulder-left": { x: -0.45, y: -0.15, z: 0 },
};

export class Studio3DBillboardBubbleEngine {
  private bubbles: SpeechBubbleItem[] = [];
  private emotes: EmoteStickerItem[] = [];

  constructor() {
    // Initial sample bubble and emote
    this.bubbles = [
      {
        id: "bubble-1",
        text: "너… 정말 그럴 생각이야?",
        kind: "speech",
        socket: "head-top",
        offset: { x: 0.2, y: 0.25, z: 0 },
        scale: 1.0,
        billboardFacing: true,
        tailTargetOffset: { x: -0.2, y: -0.3, z: 0 },
        bubbleBgColor: "#ffffff",
        textColor: "#111115",
      },
    ];
    this.emotes = [
      {
        id: "emote-1",
        kind: "sweat",
        socket: "head-right",
        offset: { x: 0.05, y: 0.05, z: 0.05 },
        scale: 1.2,
        floatAnimation: true,
        tintColor: "#38bdf8",
      },
    ];
  }

  public getBubbles(): readonly SpeechBubbleItem[] {
    return this.bubbles;
  }

  public getEmotes(): readonly EmoteStickerItem[] {
    return this.emotes;
  }

  public addBubble(bubble: Omit<SpeechBubbleItem, "id">): SpeechBubbleItem {
    const item: SpeechBubbleItem = {
      ...bubble,
      id: `bubble-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    this.bubbles = [...this.bubbles, item];
    return item;
  }

  public removeBubble(id: string): void {
    this.bubbles = this.bubbles.filter((b) => b.id !== id);
  }

  public addEmote(emote: Omit<EmoteStickerItem, "id">): EmoteStickerItem {
    const item: EmoteStickerItem = {
      ...emote,
      id: `emote-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    this.emotes = [...this.emotes, item];
    return item;
  }

  public removeEmote(id: string): void {
    this.emotes = this.emotes.filter((e) => e.id !== id);
  }

  /**
   * Calculates world coordinates for an anchored item on a character head.
   */
  public computeAnchorWorldPosition(
    headPosition: Vector3D,
    socket: CharacterAnchorSocket,
    itemOffset: Vector3D,
  ): Vector3D {
    const baseOffset = SOCKET_LOCAL_OFFSETS[socket];
    return {
      x: headPosition.x + baseOffset.x + itemOffset.x,
      y: headPosition.y + baseOffset.y + itemOffset.y,
      z: headPosition.z + baseOffset.z + itemOffset.z,
    };
  }

  /**
   * Computes billboard rotation angles so the bubble plane faces directly towards the camera.
   */
  public computeBillboardRotation(
    itemWorldPos: Vector3D,
    cameraWorldPos: Vector3D,
  ): { rotationEulerYDeg: number; rotationEulerXDeg: number } {
    const dx = cameraWorldPos.x - itemWorldPos.x;
    const dy = cameraWorldPos.y - itemWorldPos.y;
    const dz = cameraWorldPos.z - itemWorldPos.z;

    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    const angleYRad = Math.atan2(dx, dz);
    const angleXRad = Math.atan2(-dy, horizontalDist);

    return {
      rotationEulerYDeg: Number(((angleYRad * 180) / Math.PI).toFixed(1)),
      rotationEulerXDeg: Number(((angleXRad * 180) / Math.PI).toFixed(1)),
    };
  }

  /**
   * Generates SVG path string for speech bubble outlines based on cartoon style.
   */
  public generateBubbleSvgPath(
    kind: BubbleKind,
    width: number,
    height: number,
    tailX: number,
    tailY: number,
  ): string {
    const w = width;
    const h = height;
    const r = Math.min(16, Math.min(w, h) * 0.2);

    if (kind === "speech") {
      // Rounded rectangle with triangular tail
      return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${Math.max(
        r + 20,
        tailX + 15,
      )} ${h} L ${tailX} ${tailY} L ${Math.max(r, tailX - 10)} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
    }

    if (kind === "shout") {
      // Jagged spike star / action shout balloon
      return `M 0 ${h * 0.5} L ${w * 0.15} ${h * 0.15} L ${w * 0.5} 0 L ${w * 0.85} ${h * 0.15} L ${w} ${h * 0.5} L ${w * 0.85} ${h * 0.85} L ${tailX} ${tailY} L ${w * 0.4} ${h * 0.9} L ${w * 0.15} ${h * 0.85} Z`;
    }

    if (kind === "thought") {
      // Cloud thought balloon
      return `M ${r * 2} ${h * 0.5} Q 0 ${h * 0.2} ${w * 0.25} 0 Q ${w * 0.5} 0 ${w * 0.75} ${h * 0.1} Q ${w} ${h * 0.3} ${w * 0.9} ${h * 0.7} Q ${w * 0.7} ${h} ${w * 0.4} ${h * 0.95} L ${tailX} ${tailY} Q ${w * 0.1} ${h} ${r * 2} ${h * 0.5} Z`;
    }

    // "whisper": dashed regular rounded rect
    return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
  }
}
