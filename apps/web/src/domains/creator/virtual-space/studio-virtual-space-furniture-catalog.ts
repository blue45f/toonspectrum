/**
 * 상호작용 가구 카탈로그 (Track D).
 *
 * 오피스 월드에 배치하는 가구의 정의 모음. 순수 데이터 + 배치 헬퍼만 두며,
 * 렌더링·충돌 판정·상호작용 실행은 호출자(월드 로더·C 트랙 이벤트 로직)가 수행한다.
 *
 * 좌표계: 가구 원점(x, y)은 바닥 기준 중앙 하단(발이 닿는 지점)이다.
 * collider는 원점 기준 상대 좌표이며, placeFurniture가 절대 좌표로 변환해 준다.
 * C 트랙은 STUDIO_FURNITURE_CATALOG / furnitureById / placeFurniture를 읽기만 하면 된다.
 */

export type StudioFurnitureKind =
  | "chair"           // 의자
  | "desk"            // 책상
  | "meeting-table"   // 회의 테이블
  | "whiteboard"      // 화이트보드
  | "sofa"            // 소파
  | "plant"           // 화분
  | "floor-lamp"      // 플로어 램프
  | "bookshelf"       // 책장
  | "display-screen"  // 대형 스크린
  | "rug"             // 러그
  | "coffee-machine"  // 커피 머신
  | "partition"       // 파티션
  | "locker"          // 사물함
  | "phone-pod"       // 1인 통화 부스
  | "desk-monitor"    // 모니터 달린 책상
  | "vending-machine" // 자판기
  | "water-cooler"    // 정수기
  | "wall-clock"      // 벽시계
  | "wall-art"        // 벽 그림·포스터
  | "neon-sign";      // 네온 사인

export const STUDIO_FURNITURE_KINDS: readonly StudioFurnitureKind[] = Object.freeze([
  "chair", "desk", "meeting-table", "whiteboard", "sofa", "plant", "floor-lamp",
  "bookshelf", "display-screen", "rug", "coffee-machine", "partition", "locker", "phone-pod",
  "desk-monitor", "vending-machine", "water-cooler", "wall-clock", "wall-art", "neon-sign",
]);

export type StudioFurnitureDepth = "fixed" | "y-sort" | "foreground";

export interface StudioFurnitureCollider {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioFurnitureSpec {
  readonly id: string;
  readonly kind: StudioFurnitureKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 바닥 점유 크기(px). */
  readonly width: number;
  readonly height: number;
  /** 원점 기준 상대 충돌 박스. 없으면 통과 가능한 장식. */
  readonly collider?: StudioFurnitureCollider;
  readonly depth: StudioFurnitureDepth;
  /** 상호작용 가능 여부 (앉기·사용·열기 등). */
  readonly interactable: boolean;
  readonly interactionHintKo?: string;
  readonly interactionHintEn?: string;
  readonly interactionRadius?: number;
  /** 앉을 수 있는 자리 수. */
  readonly seats?: number;
  readonly tags: readonly string[];
}

function spec(def: StudioFurnitureSpec): StudioFurnitureSpec {
  return Object.freeze({ ...def, tags: Object.freeze(def.tags) });
}

/** 상호작용 가구 34종. C 트랙 이벤트가 소비하는 카탈로그. */
export const STUDIO_FURNITURE_CATALOG: readonly StudioFurnitureSpec[] = Object.freeze([
  spec({
    id: "chair-basic", kind: "chair", labelKo: "기본 의자", labelEn: "Basic chair",
    descriptionKo: "어디에나 두는 가벼운 의자예요.", descriptionEn: "A light chair for anywhere.",
    width: 36, height: 28, collider: { x: -14, y: -14, width: 28, height: 14 }, depth: "y-sort",
    interactable: true, interactionHintKo: "앉기", interactionHintEn: "Sit",
    interactionRadius: 46, seats: 1, tags: ["seat"],
  }),
  spec({
    id: "desk-standard", kind: "desk", labelKo: "표준 책상", labelEn: "Standard desk",
    descriptionKo: "1인 작업용 책상이에요.", descriptionEn: "A single work desk.",
    width: 120, height: 56, collider: { x: -60, y: -28, width: 120, height: 28 }, depth: "y-sort",
    interactable: true, interactionHintKo: "작업 시작", interactionHintEn: "Start working",
    interactionRadius: 70, seats: 1, tags: ["work"],
  }),
  spec({
    id: "meeting-table", kind: "meeting-table", labelKo: "회의 테이블", labelEn: "Meeting table",
    descriptionKo: "6인이 둘러앉는 회의 테이블이에요.", descriptionEn: "A meeting table for six.",
    width: 180, height: 80, collider: { x: -90, y: -40, width: 180, height: 40 }, depth: "y-sort",
    interactable: true, interactionHintKo: "회의 참여", interactionHintEn: "Join meeting",
    interactionRadius: 96, seats: 6, tags: ["seat", "meeting"],
  }),
  spec({
    id: "whiteboard", kind: "whiteboard", labelKo: "화이트보드", labelEn: "Whiteboard",
    descriptionKo: "아이디어를 함께 그리는 보드예요.", descriptionEn: "A board for sketching ideas together.",
    width: 140, height: 36, collider: { x: -60, y: -18, width: 120, height: 18 }, depth: "fixed",
    interactable: true, interactionHintKo: "보드에 그리기", interactionHintEn: "Draw on board",
    interactionRadius: 90, tags: ["collaboration", "canvas"],
  }),
  spec({
    id: "sofa-two", kind: "sofa", labelKo: "2인 소파", labelEn: "Two-seat sofa",
    descriptionKo: "푹신하게 쉬어가는 소파예요.", descriptionEn: "A cozy sofa to rest on.",
    width: 120, height: 52, collider: { x: -54, y: -26, width: 108, height: 26 }, depth: "y-sort",
    interactable: true, interactionHintKo: "앉아 쉬기", interactionHintEn: "Sit and rest",
    interactionRadius: 72, seats: 2, tags: ["seat", "rest"],
  }),
  spec({
    id: "plant-pot", kind: "plant", labelKo: "화분", labelEn: "Potted plant",
    descriptionKo: "공간에 생기를 더하는 화분이에요.", descriptionEn: "A plant that livens up the space.",
    width: 40, height: 40, collider: { x: -10, y: -16, width: 20, height: 16 }, depth: "y-sort",
    interactable: false, tags: ["decor", "greenery"],
  }),
  spec({
    id: "floor-lamp", kind: "floor-lamp", labelKo: "플로어 램프", labelEn: "Floor lamp",
    descriptionKo: "밤에도 공간을 밝혀 주는 스탠드예요.", descriptionEn: "A stand lamp that lights the space at night.",
    width: 36, height: 36, collider: { x: -8, y: -14, width: 16, height: 14 }, depth: "y-sort",
    interactable: true, interactionHintKo: "조명 켜기/끄기", interactionHintEn: "Toggle light",
    interactionRadius: 52, tags: ["decor", "light"],
  }),
  spec({
    id: "bookshelf", kind: "bookshelf", labelKo: "책장", labelEn: "Bookshelf",
    descriptionKo: "레퍼런스 북을 꽂아 두는 책장이에요.", descriptionEn: "A shelf for reference books.",
    width: 120, height: 40, collider: { x: -60, y: -20, width: 120, height: 20 }, depth: "fixed",
    interactable: true, interactionHintKo: "자료 찾기", interactionHintEn: "Browse materials",
    interactionRadius: 78, tags: ["storage", "reference"],
  }),
  spec({
    id: "display-screen", kind: "display-screen", labelKo: "대형 스크린", labelEn: "Large display",
    descriptionKo: "화면 공유·발표용 대형 스크린이에요.", descriptionEn: "A large screen for sharing and talks.",
    width: 160, height: 40, collider: { x: -70, y: -20, width: 140, height: 20 }, depth: "fixed",
    interactable: true, interactionHintKo: "화면 공유", interactionHintEn: "Share screen",
    interactionRadius: 96, tags: ["presentation", "live"],
  }),
  spec({
    id: "rug-round", kind: "rug", labelKo: "원형 러그", labelEn: "Round rug",
    descriptionKo: "밟고 지나갈 수 있는 장식 러그예요.", descriptionEn: "A decorative rug you can walk over.",
    width: 140, height: 80, depth: "fixed",
    interactable: false, tags: ["decor", "floor"],
  }),
  spec({
    id: "coffee-machine", kind: "coffee-machine", labelKo: "커피 머신", labelEn: "Coffee machine",
    descriptionKo: "음료를 골라 마시는 커피 머신이에요.", descriptionEn: "A machine to pick your drink.",
    width: 48, height: 40, collider: { x: -20, y: -20, width: 40, height: 20 }, depth: "y-sort",
    interactable: true, interactionHintKo: "음료 고르기", interactionHintEn: "Pick a drink",
    interactionRadius: 64, tags: ["cafe", "rest"],
  }),
  spec({
    id: "partition", kind: "partition", labelKo: "파티션", labelEn: "Partition",
    descriptionKo: "시선을 가리는 이동식 칸막이예요.", descriptionEn: "A movable divider that blocks sightlines.",
    width: 100, height: 24, collider: { x: -50, y: -8, width: 100, height: 16 }, depth: "y-sort",
    interactable: false, tags: ["divider", "privacy"],
  }),
  spec({
    id: "locker", kind: "locker", labelKo: "사물함", labelEn: "Locker",
    descriptionKo: "개인 물품을 보관하는 사물함이에요.", descriptionEn: "A locker for personal items.",
    width: 90, height: 44, collider: { x: -45, y: -22, width: 90, height: 22 }, depth: "fixed",
    interactable: true, interactionHintKo: "사물함 열기", interactionHintEn: "Open locker",
    interactionRadius: 60, tags: ["storage"],
  }),
  spec({
    id: "phone-pod", kind: "phone-pod", labelKo: "1인 통화 부스", labelEn: "Solo call pod",
    descriptionKo: "소리를 막아 주는 1인 통화 부스예요.", descriptionEn: "A sound-dampened solo call booth.",
    width: 90, height: 90, collider: { x: -45, y: -45, width: 90, height: 45 }, depth: "y-sort",
    interactable: true, interactionHintKo: "부스 들어가기", interactionHintEn: "Enter booth",
    interactionRadius: 70, seats: 1, tags: ["seat", "privacy", "call"],
  }),
  spec({
    id: "beanbag-choco", kind: "sofa", labelKo: "초코 빈백", labelEn: "Choco beanbag",
    descriptionKo: "초콜릿색 빈백 소파예요. 구석에 두면 휴식 공간이 돼요.", descriptionEn: "A chocolate beanbag for a cozy corner.",
    width: 56, height: 44, collider: { x: -24, y: -22, width: 48, height: 22 }, depth: "y-sort",
    interactable: true, interactionHintKo: "앉기", interactionHintEn: "Sit",
    interactionRadius: 52, seats: 1, tags: ["seat", "lounge", "cozy"],
  }),
  spec({
    id: "planter-succulent", kind: "plant", labelKo: "다육이 화분", labelEn: "Succulent planter",
    descriptionKo: "책상 위에 두기 좋은 작은 다육이예요.", descriptionEn: "A small succulent for the desk.",
    width: 24, height: 30, collider: { x: -10, y: -10, width: 20, height: 10 }, depth: "y-sort",
    interactable: false, tags: ["plant", "desktop"],
  }),
  spec({
    id: "rug-round-warm", kind: "rug", labelKo: "따뜻한 원형 러그", labelEn: "Warm round rug",
    descriptionKo: "모임 공간 중앙에 깔면 분위기가 따뜻해져요.", descriptionEn: "A warm round rug for gathering spaces.",
    width: 220, height: 220, depth: "fixed",
    interactable: false, tags: ["rug", "cozy", "gathering"],
  }),
  spec({
    id: "bookshelf-comic", kind: "bookshelf", labelKo: "만화책장", labelEn: "Comic bookshelf",
    descriptionKo: "만화책으로 가득한 책장이에요. 구경해 보세요.", descriptionEn: "A bookshelf full of comics to browse.",
    width: 110, height: 150, collider: { x: -55, y: -75, width: 110, height: 75 }, depth: "y-sort",
    interactable: true, interactionHintKo: "만화 보기", interactionHintEn: "Browse comics",
    interactionRadius: 80, tags: ["browse", "fun"],
  }),
  spec({
    id: "arcade-cabinet", kind: "display-screen", labelKo: "아케이드 게임기", labelEn: "Arcade cabinet",
    descriptionKo: "추억의 아케이드 게임기예요. 동전을 넣어 보세요.", descriptionEn: "A retro arcade cabinet. Insert coin!",
    width: 70, height: 120, collider: { x: -35, y: -60, width: 70, height: 60 }, depth: "y-sort",
    interactable: true, interactionHintKo: "게임 시작", interactionHintEn: "Start game",
    interactionRadius: 70, tags: ["game", "fun", "screen"],
  }),
  spec({
    id: "coffee-cart", kind: "coffee-machine", labelKo: "커피 카트", labelEn: "Coffee cart",
    descriptionKo: "이동식 커피 카트예요. 파티에 갖다 놓으면 인기 만점이에요.", descriptionEn: "A mobile coffee cart, perfect for parties.",
    width: 90, height: 100, collider: { x: -45, y: -50, width: 90, height: 50 }, depth: "y-sort",
    interactable: true, interactionHintKo: "커피 받기", interactionHintEn: "Grab coffee",
    interactionRadius: 75, tags: ["coffee", "party", "refreshment"],
  }),
  spec({
    id: "desk-dual-monitor", kind: "desk-monitor", labelKo: "듀얼 모니터 책상", labelEn: "Dual monitor desk",
    descriptionKo: "모니터 두 대가 올라간 집중 작업 책상이에요.", descriptionEn: "A focus desk with two glowing monitors.",
    width: 128, height: 64, collider: { x: -64, y: -30, width: 128, height: 30 }, depth: "y-sort",
    interactable: true, interactionHintKo: "작업 시작", interactionHintEn: "Start working",
    interactionRadius: 74, seats: 1, tags: ["work", "screen", "focus"],
  }),
  spec({
    id: "desk-standing-monitor", kind: "desk-monitor", labelKo: "스탠딩 모니터 데스크", labelEn: "Standing monitor desk",
    descriptionKo: "서서 일할 수 있는 높이 조절 책상이에요.", descriptionEn: "A height-adjustable desk for standing work.",
    width: 100, height: 56, collider: { x: -50, y: -26, width: 100, height: 26 }, depth: "y-sort",
    interactable: true, interactionHintKo: "서서 작업", interactionHintEn: "Work standing",
    interactionRadius: 66, seats: 1, tags: ["work", "screen"],
  }),
  spec({
    id: "vending-snack", kind: "vending-machine", labelKo: "간식 자판기", labelEn: "Snack vending machine",
    descriptionKo: "출출할 때 간식을 뽑아 먹는 자판기예요.", descriptionEn: "A vending machine full of snacks.",
    width: 64, height: 48, collider: { x: -30, y: -24, width: 60, height: 24 }, depth: "fixed",
    interactable: true, interactionHintKo: "간식 고르기", interactionHintEn: "Pick a snack",
    interactionRadius: 62, tags: ["cafe", "rest", "snack"],
  }),
  spec({
    id: "vending-drink", kind: "vending-machine", labelKo: "음료 자판기", labelEn: "Drink vending machine",
    descriptionKo: "시원한 음료가 가득한 자판기예요.", descriptionEn: "A vending machine full of cold drinks.",
    width: 64, height: 48, collider: { x: -30, y: -24, width: 60, height: 24 }, depth: "fixed",
    interactable: true, interactionHintKo: "음료 고르기", interactionHintEn: "Pick a drink",
    interactionRadius: 62, tags: ["cafe", "rest", "drink"],
  }),
  spec({
    id: "water-cooler", kind: "water-cooler", labelKo: "정수기", labelEn: "Water cooler",
    descriptionKo: "잠깐 쉬면서 물 한 잔 마시는 정수기예요.", descriptionEn: "A water cooler for a short break.",
    width: 40, height: 40, collider: { x: -16, y: -18, width: 32, height: 18 }, depth: "y-sort",
    interactable: true, interactionHintKo: "물 마시기", interactionHintEn: "Drink water",
    interactionRadius: 56, tags: ["cafe", "rest", "health"],
  }),
  spec({
    id: "wall-clock-round", kind: "wall-clock", labelKo: "둥근 벽시계", labelEn: "Round wall clock",
    descriptionKo: "바늘이 실제로 움직이는 벽시계예요.", descriptionEn: "A wall clock with moving hands.",
    width: 44, height: 44, depth: "fixed",
    interactable: true, interactionHintKo: "현재 시각 확인", interactionHintEn: "Check the time",
    interactionRadius: 64, tags: ["decor", "wall", "time"],
  }),
  spec({
    id: "wall-poster-toon", kind: "wall-art", labelKo: "웹툰 포스터", labelEn: "Webtoon poster",
    descriptionKo: "인기 웹툰 포스터가 붙은 벽이에요.", descriptionEn: "A wall with a popular webtoon poster.",
    width: 56, height: 72, depth: "fixed",
    interactable: false, tags: ["decor", "wall", "poster"],
  }),
  spec({
    id: "wall-art-landscape", kind: "wall-art", labelKo: "풍경 액자", labelEn: "Landscape frame",
    descriptionKo: "스튜디오 풍경을 담은 액자 그림이에요.", descriptionEn: "A framed picture of the studio landscape.",
    width: 84, height: 56, depth: "fixed",
    interactable: true, interactionHintKo: "그림 감상", interactionHintEn: "View artwork",
    interactionRadius: 70, tags: ["decor", "wall", "art"],
  }),
  spec({
    id: "neon-sign-open", kind: "neon-sign", labelKo: "네온 사인", labelEn: "Neon sign",
    descriptionKo: "벽에 은은하게 빛나는 네온 간판이에요.", descriptionEn: "A neon sign glowing softly on the wall.",
    width: 120, height: 48, depth: "fixed",
    interactable: true, interactionHintKo: "네온 켜기/끄기", interactionHintEn: "Toggle neon",
    interactionRadius: 72, tags: ["decor", "wall", "light", "sign"],
  }),
  spec({
    id: "sofa-three", kind: "sofa", labelKo: "3인 소파", labelEn: "Three-seat sofa",
    descriptionKo: "라운지에서 다 같이 쉬는 넓은 소파예요.", descriptionEn: "A wide lounge sofa for the whole crew.",
    width: 172, height: 56, collider: { x: -80, y: -28, width: 160, height: 28 }, depth: "y-sort",
    interactable: true, interactionHintKo: "앉아 쉬기", interactionHintEn: "Sit and rest",
    interactionRadius: 80, seats: 3, tags: ["seat", "rest", "lounge"],
  }),
  spec({
    id: "armchair-lounge", kind: "chair", labelKo: "라운지 안락의자", labelEn: "Lounge armchair",
    descriptionKo: "혼자 푹 기대어 쉬는 안락의자예요.", descriptionEn: "An armchair to sink into alone.",
    width: 52, height: 48, collider: { x: -22, y: -22, width: 44, height: 22 }, depth: "y-sort",
    interactable: true, interactionHintKo: "앉기", interactionHintEn: "Sit",
    interactionRadius: 56, seats: 1, tags: ["seat", "rest", "lounge"],
  }),
  spec({
    id: "plant-monstera", kind: "plant", labelKo: "몬스테라 화분", labelEn: "Monstera plant",
    descriptionKo: "잎이 바람에 살랑이는 큰 화분이에요.", descriptionEn: "A large plant whose leaves sway gently.",
    width: 56, height: 64, collider: { x: -14, y: -20, width: 28, height: 20 }, depth: "y-sort",
    interactable: false, tags: ["decor", "greenery"],
  }),
  spec({
    id: "rug-rect-lounge", kind: "rug", labelKo: "라운지 사각 러그", labelEn: "Lounge rectangle rug",
    descriptionKo: "소파 앞에 깔아 라운지 구역을 나누는 러그예요.", descriptionEn: "A rug that marks out the lounge corner.",
    width: 200, height: 120, depth: "fixed",
    interactable: false, tags: ["decor", "floor", "lounge"],
  }),
  spec({
    id: "bookshelf-low-archive", kind: "bookshelf", labelKo: "자료실 낮은 책장", labelEn: "Archive low shelf",
    descriptionKo: "설정 자료와 원고를 정리해 두는 낮은 책장이에요.", descriptionEn: "A low shelf for references and manuscripts.",
    width: 110, height: 36, collider: { x: -55, y: -18, width: 110, height: 18 }, depth: "fixed",
    interactable: true, interactionHintKo: "자료 찾기", interactionHintEn: "Browse materials",
    interactionRadius: 72, tags: ["storage", "reference", "archive"],
  }),
]);

/** id로 가구 스펙 조회. */
export function furnitureById(id: string): StudioFurnitureSpec | null {
  return STUDIO_FURNITURE_CATALOG.find((item) => item.id === id) ?? null;
}

/** 종류별 가구 스펙 조회. */
export function furnitureByKind(kind: StudioFurnitureKind): readonly StudioFurnitureSpec[] {
  return Object.freeze(STUDIO_FURNITURE_CATALOG.filter((item) => item.kind === kind));
}

/** 태그로 가구 스펙 조회 (예: "seat" → 앉을 수 있는 가구). */
export function furnitureByTag(tag: string): readonly StudioFurnitureSpec[] {
  return Object.freeze(STUDIO_FURNITURE_CATALOG.filter((item) => item.tags.includes(tag)));
}

export interface StudioFurniturePlacement {
  readonly specId: string;
  readonly kind: StudioFurnitureKind;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 배치 원점 (바닥 기준 중앙 하단). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 절대 좌표 충돌 박스. 통과형 장식(rug)은 null. */
  readonly collider: StudioFurnitureCollider | null;
  readonly depth: StudioFurnitureDepth;
  readonly interactable: boolean;
  readonly interactionHintKo: string | null;
  readonly interactionHintEn: string | null;
  readonly interactionRadius: number | null;
  readonly seats: number;
}

/**
 * 카탈로그 가구를 월드 좌표에 배치한다. 상대 collider를 절대 좌표로 변환해 준다.
 * 스펙 id가 없거나 좌표가 무효하면 null.
 */
export function placeFurniture(
  specId: string,
  x: number,
  y: number,
): StudioFurniturePlacement | null {
  const specItem = furnitureById(specId);
  if (!specItem || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Object.freeze({
    specId: specItem.id,
    kind: specItem.kind,
    labelKo: specItem.labelKo,
    labelEn: specItem.labelEn,
    x, y,
    width: specItem.width,
    height: specItem.height,
    collider: specItem.collider
      ? Object.freeze({
        x: Math.round((x + specItem.collider.x) * 100) / 100,
        y: Math.round((y + specItem.collider.y) * 100) / 100,
        width: specItem.collider.width,
        height: specItem.collider.height,
      })
      : null,
    depth: specItem.depth,
    interactable: specItem.interactable,
    interactionHintKo: specItem.interactionHintKo ?? null,
    interactionHintEn: specItem.interactionHintEn ?? null,
    interactionRadius: specItem.interactionRadius ?? null,
    seats: specItem.seats ?? 0,
  });
}

/** 카탈로그 구조 검증. */
export function validateFurnitureCatalog(
  catalog: readonly StudioFurnitureSpec[] = STUDIO_FURNITURE_CATALOG,
): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  for (const item of catalog) {
    if (!item || typeof item !== "object") { errors.push("furniture spec is invalid"); continue; }
    if (typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)) errors.push(`invalid furniture id: ${String(item.id)}`);
    ids.add(item.id);
    if (!(STUDIO_FURNITURE_KINDS as readonly string[]).includes(item.kind)) errors.push(`unknown furniture kind: ${item.id}`);
    if (!item.labelKo?.trim() || !item.labelEn?.trim()) errors.push(`missing furniture label: ${item.id}`);
    if (!finite(item.width) || item.width <= 0 || !finite(item.height) || item.height <= 0) errors.push(`invalid furniture size: ${item.id}`);
    if (item.collider !== undefined) {
      const collider = item.collider;
      if (!finite(collider.x) || !finite(collider.y) || !finite(collider.width) || collider.width <= 0
        || !finite(collider.height) || collider.height <= 0) errors.push(`invalid furniture collider: ${item.id}`);
    }
    if (item.interactable) {
      if (!item.interactionHintKo?.trim() || !item.interactionHintEn?.trim()) errors.push(`missing interaction hint: ${item.id}`);
      if (item.interactionRadius !== undefined && (!finite(item.interactionRadius) || item.interactionRadius <= 0)) {
        errors.push(`invalid interaction radius: ${item.id}`);
      }
    }
    if (item.seats !== undefined && (!Number.isInteger(item.seats) || item.seats < 0)) errors.push(`invalid seat count: ${item.id}`);
  }
  return Object.freeze(errors);
}
