/**
 * 월드 상호작용 대상의 종류와 동사(게더타운식 "X 주문하기" 프롬프트), 그리고 main 가구 상태 머신 연결.
 *
 * - 종류는 manifest 상호작용 id 규약(HUD spatial-actions 정규식과 같은 단어)과 action으로 정한다.
 *   새 월드가 id 규약을 따르지 않아도 action으로 알맞은 종류를 고른다.
 * - 프롬프트 라벨은 "동사 · 대상"(예: "주문하기 · 카페 카운터")이다. 월드 키캡과 HUD 도크 프롬프트가 같은 함수를 쓴다.
 * - 상태가 있는 가구(커피 머신·의자)는 main interactable-objects 상태 머신 종류로 옮겨 상태에 따라 동사를 바꾼다.
 * - 연출 기준점(anchor)은 캠퍼스 오브젝트 그림의 실제 위치(커피 머신 노즐·화이트보드 면 등)에서 고른다.
 * 모두 순수 함수다(Phaser 의존 없음).
 */
import type { StudioInteractableObjectKind, StudioInteractableStateKey } from "./studio-virtual-space-interactable-objects";
import { interactableStateActionText } from "./studio-virtual-space-interactable-objects";
import type { StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

export type StudioWorldInteractionKind =
  | "desk" | "board" | "archive" | "camera-set" | "cafe-counter" | "cat" | "meeting" | "fountain" | "stage"
  | "arcade" | "gallery" | "waterfall" | "concierge" | "console" | "garden" | "market" | "observatory" | "gong" | "generic";

type InteractionRef = Pick<StudioWorldInteractionDefinition, "id" | "action">;

/** 위에서부터 먼저 맞는 규칙을 쓴다. 고양이·카페·갤러리처럼 다른 단어를 품은 id가 앞에 온다. */
const KIND_RULES: readonly (readonly [RegExp, StudioWorldInteractionKind])[] = Object.freeze([
  [/-cat\b/u, "cat"],
  [/concierge|reception/u, "concierge"],
  [/cafe|coffee|barista/u, "cafe-counter"],
  [/fountain|wish/u, "fountain"],
  [/falls|waterfall/u, "waterfall"],
  [/stage|spotlight/u, "stage"],
  [/arcade|claw/u, "arcade"],
  [/gallery|frame|exhibit/u, "gallery"],
  [/garden|petal/u, "garden"],
  [/market/u, "market"],
  [/observatory|telescope/u, "observatory"],
  [/gong/u, "gong"],
  [/archive|reference|library|treehouse/u, "archive"],
  [/whiteboard|storyboard|board|wall/u, "board"],
  [/green-screen|camera|shoot/u, "camera-set"],
  [/meeting|conference|huddle|table/u, "meeting"],
  [/desk|seat|chair|workstation/u, "desk"],
  [/console|monitor|terminal|control|delivery|release|qc/u, "console"],
] as const);

const ACTION_KINDS: Readonly<Record<StudioWorldInteractionDefinition["action"], StudioWorldInteractionKind>> = Object.freeze({
  assistant: "concierge",
  assets: "archive",
  canvas: "desk",
  community: "generic",
  comic: "board",
  live: "meeting",
  review: "gallery",
  story: "board",
});

/** 상호작용 대상의 종류. id 규약이 먼저이고, 맞는 단어가 없으면 action으로 정한다. */
export function studioWorldInteractionKind(interaction: InteractionRef): StudioWorldInteractionKind {
  const id = interaction.id.toLowerCase();
  for (const [pattern, kind] of KIND_RULES) if (pattern.test(id)) return kind;
  return ACTION_KINDS[interaction.action] ?? "generic";
}

export interface StudioWorldBilingualText {
  readonly ko: string;
  readonly en: string;
}

const verb = (ko: string, en: string): StudioWorldBilingualText => Object.freeze({ ko, en });

const KIND_VERBS: Readonly<Record<StudioWorldInteractionKind, StudioWorldBilingualText>> = Object.freeze({
  desk: verb("앉아서 작업", "Sit & work"),
  board: verb("보드 열기", "Open board"),
  archive: verb("자료 찾기", "Browse"),
  "camera-set": verb("촬영하기", "Start shoot"),
  "cafe-counter": verb("주문하기", "Order"),
  cat: verb("쓰다듬기", "Pet"),
  meeting: verb("회의 참여", "Join"),
  fountain: verb("동전 던지기", "Toss a coin"),
  stage: verb("무대 서기", "Take the stage"),
  arcade: verb("게임하기", "Play"),
  gallery: verb("감상하기", "View"),
  waterfall: verb("물장난", "Splash"),
  concierge: verb("안내 받기", "Ask"),
  console: verb("화면 보기", "Check"),
  garden: verb("꽃잎 날리기", "Petals"),
  market: verb("구경하기", "Browse"),
  observatory: verb("별 보기", "Stargaze"),
  gong: verb("공 울리기", "Ring"),
  generic: verb("살펴보기", "Explore"),
});

/** 종류별 기본 동사. */
export function studioWorldInteractionVerb(kind: StudioWorldInteractionKind): StudioWorldBilingualText {
  return KIND_VERBS[kind];
}

/** 상태를 가진 가구는 main interactable 상태 머신 종류로 옮긴다. 일회성 연출 대상은 null. */
export function studioWorldInteractableKind(kind: StudioWorldInteractionKind): StudioInteractableObjectKind | null {
  if (kind === "cafe-counter") return "coffee-machine";
  if (kind === "desk") return "chair";
  return null;
}

/**
 * 프롬프트 라벨 "동사 · 대상". 상태 가구는 상태에 따른 동사(추출 중…·커피 가져가기·일어서기)를 쓴다.
 * 비어 있는 상태(커피 대기·빈 의자)는 종류 동사(주문하기·앉아서 작업)가 더 분명하다.
 */
export function studioWorldInteractionPromptLabel(
  interaction: Pick<StudioWorldInteractionDefinition, "id" | "action" | "labelKo" | "labelEn">,
  stateKey: StudioInteractableStateKey | null = null,
): StudioWorldBilingualText {
  const kind = studioWorldInteractionKind(interaction);
  const interactable = studioWorldInteractableKind(kind);
  const action = interactable && stateKey && stateKey !== "coffee:idle" && stateKey !== "chair:empty"
    ? interactableStateActionText(interactable, stateKey)
    : studioWorldInteractionVerb(kind);
  return Object.freeze({ ko: `${action.ko} · ${interaction.labelKo}`, en: `${action.en} · ${interaction.labelEn}` });
}

/** NPC 프롬프트 라벨. */
export function studioWorldNpcPromptLabel(name: StudioWorldBilingualText): StudioWorldBilingualText {
  return Object.freeze({ ko: `대화하기 · ${name.ko}`, en: `Talk · ${name.en}` });
}

/** 연출 기준점을 고를 때 보는 오브젝트 그림(캠퍼스 오브젝트와 같은 모양: 발밑 중심 x·y, 크기). */
export interface StudioWorldFxObject {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioWorldFxAnchor {
  /** 연출이 시작되는 지점(커피 머신 노즐, 보드 면, 오락기 화면 등). */
  readonly x: number;
  readonly y: number;
  /** 바닥 기준 y(깊이 정렬). */
  readonly baseY: number;
}

/** 오브젝트 위쪽 이 비율 지점이 화면·보드 면의 가운데다. */
const OBJECT_FACE_RATIO = 0.62;
/** 오브젝트 그림을 찾는 범위: 상호작용 지점 위쪽 이 거리까지, 좌우는 그림 반폭 + 여유. */
const OBJECT_SEARCH_ABOVE = 170;
const OBJECT_SEARCH_BELOW = 12;
const OBJECT_SEARCH_MARGIN = 28;
/** 오브젝트가 없을 때 상호작용 지점 위로 올리는 높이. */
const FALLBACK_LIFT = 54;
/** 캠퍼스 카페 카운터 그림 안 커피 머신 노즐(왼쪽 위에서 48·22px). */
const CAFE_MACHINE_OFFSET = Object.freeze({ x: 48, y: 22 });

/**
 * 상호작용의 연출 기준점. 상호작용 지점 바로 위(뒤)에 있는 오브젝트 그림의 면을 고르고,
 * 카페 카운터는 커피 머신 노즐을 쓴다. 맞는 그림이 없으면 지점 위로 조금 올린다.
 */
export function studioWorldInteractionFxAnchor(
  interaction: Pick<StudioWorldInteractionDefinition, "point">,
  objects: readonly StudioWorldFxObject[],
): StudioWorldFxAnchor {
  const { x, y } = interaction.point;
  let best: StudioWorldFxObject | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const object of objects) {
    if (Math.abs(object.x - x) > object.width / 2 + OBJECT_SEARCH_MARGIN) continue;
    if (object.y < y - OBJECT_SEARCH_ABOVE || object.y > y + OBJECT_SEARCH_BELOW) continue;
    const score = Math.abs(object.x - x) + Math.abs(object.y - y);
    if (score < bestScore) { best = object; bestScore = score; }
  }
  if (!best) return Object.freeze({ x, y: y - FALLBACK_LIFT, baseY: y });
  if (best.kind === "cafe-counter") {
    return Object.freeze({
      x: best.x - best.width / 2 + CAFE_MACHINE_OFFSET.x,
      y: best.y - best.height + CAFE_MACHINE_OFFSET.y,
      baseY: best.y,
    });
  }
  return Object.freeze({ x: best.x, y: best.y - best.height * OBJECT_FACE_RATIO, baseY: best.y });
}

/** 무대 앞 발표 자리(타원). 이 안에 선 사람은 스포트라이트와 "발표 중" 배지를 받는다. */
export interface StudioWorldStageApron {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
}

const APRON_RADIUS_X = 1.45;
const APRON_RADIUS_Y = 0.42;

/** 무대 종류 상호작용마다 발표 자리 하나. 무대가 없는 월드는 빈 배열. */
export function studioWorldStageAprons(interactions: readonly StudioWorldInteractionDefinition[]): readonly StudioWorldStageApron[] {
  const aprons: StudioWorldStageApron[] = [];
  for (const interaction of interactions) {
    if (studioWorldInteractionKind(interaction) !== "stage") continue;
    aprons.push(Object.freeze({
      id: interaction.id,
      x: interaction.point.x,
      y: interaction.point.y,
      radiusX: interaction.radius * APRON_RADIUS_X,
      radiusY: interaction.radius * APRON_RADIUS_Y,
    }));
  }
  return Object.freeze(aprons);
}

/** 바닥 좌표(x, y)가 발표 자리 안인지(타원 안). 매 프레임 부르므로 객체를 받지 않는다. */
export function studioWorldInsideStageApron(apron: StudioWorldStageApron, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || apron.radiusX <= 0 || apron.radiusY <= 0) return false;
  const dx = (x - apron.x) / apron.radiusX;
  const dy = (y - apron.y) / apron.radiusY;
  return dx * dx + dy * dy <= 1;
}
