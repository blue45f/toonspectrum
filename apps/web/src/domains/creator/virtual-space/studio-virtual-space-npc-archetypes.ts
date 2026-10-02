/**
 * NPC 아키타입 카탈로그 (Track 4 · NPC 다양화)
 *
 * 공간을 살아있게 만드는 NPC 역할 7종 정의. 각 아키타입은
 * 프로시저럴 스프라이트 스킨 키(`studio-virtual-space-npc-cast.ts`의
 * 절차적 NPC 정의)와 1:1로 연결되며, 역할별 고유 이름·직함·
 * 근접 preset 대사를 함께 제공한다.
 *
 * - 안내원(두리) / 바리스타(모카) / 경비(든든) / 상점주인(보리)
 * - 정리 도우미(반짝) / 멘토(슬기) / 방문객(나그네)
 *
 * 순수 데이터 + 순수 함수. 렌더링·말풍선 표시는 호출 측 담당이다.
 */

export type StudioNpcArchetypeKey =
  | "guide"
  | "barista"
  | "guard"
  | "shopkeeper"
  | "cleaner"
  | "mentor"
  | "visitor";

export const STUDIO_NPC_ARCHETYPE_KEYS: readonly StudioNpcArchetypeKey[] = Object.freeze([
  "guide", "barista", "guard", "shopkeeper", "cleaner", "mentor", "visitor",
]);

export interface StudioNpcArchetype {
  readonly key: StudioNpcArchetypeKey;
  /** npc-cast.ts의 절차적 NPC 스킨 키. */
  readonly proceduralSkinKey: string;
  /** 고유 이름. */
  readonly nameKo: string;
  readonly nameEn: string;
  /** 직함. */
  readonly roleKo: string;
  readonly roleEn: string;
  /** 추천 행동 모드 (npc-behavior.ts의 기본값). */
  readonly preferredBehavior: "idle" | "wander" | "patrol";
  /** 소개 한 줄. */
  readonly taglineKo: string;
  readonly taglineEn: string;
}

function archetype(def: StudioNpcArchetype): StudioNpcArchetype {
  return Object.freeze(def);
}

/** NPC 아키타입 7종. */
export const STUDIO_NPC_ARCHETYPES: readonly StudioNpcArchetype[] = Object.freeze([
  archetype({ key: "guide", proceduralSkinKey: "npc-guide",
    nameKo: "두리", nameEn: "Duri", roleKo: "안내원", roleEn: "Guide",
    preferredBehavior: "patrol", taglineKo: "공간 구석구석을 안내해요.", taglineEn: "Guides you around the space." }),
  archetype({ key: "barista", proceduralSkinKey: "npc-barista",
    nameKo: "모카", nameEn: "Moka", roleKo: "바리스타", roleEn: "Barista",
    preferredBehavior: "idle", taglineKo: "향긋한 커피를 내어줘요.", taglineEn: "Serves fragrant coffee." }),
  archetype({ key: "guard", proceduralSkinKey: "npc-guard",
    nameKo: "든든", nameEn: "Deundeun", roleKo: "경비", roleEn: "Guard",
    preferredBehavior: "patrol", taglineKo: "공간을 든든하게 지켜요.", taglineEn: "Keeps the space safe." }),
  archetype({ key: "shopkeeper", proceduralSkinKey: "npc-shopkeeper",
    nameKo: "보리", nameEn: "Bori", roleKo: "상점주인", roleEn: "Shopkeeper",
    preferredBehavior: "idle", taglineKo: "재미있는 굿즈를 팔아요.", taglineEn: "Sells fun goods." }),
  archetype({ key: "cleaner", proceduralSkinKey: "npc-cleaner",
    nameKo: "반짝", nameEn: "Banjjak", roleKo: "정리 도우미", roleEn: "Helper",
    preferredBehavior: "wander", taglineKo: "공간을 반짝반짝 정리해요.", taglineEn: "Keeps the space sparkling." }),
  archetype({ key: "mentor", proceduralSkinKey: "npc-mentor",
    nameKo: "슬기", nameEn: "Seulgi", roleKo: "멘토", roleEn: "Mentor",
    preferredBehavior: "idle", taglineKo: "창작 팁을 나눠줘요.", taglineEn: "Shares creative tips." }),
  archetype({ key: "visitor", proceduralSkinKey: "npc-visitor",
    nameKo: "나그네", nameEn: "Wanderer", roleKo: "방문객", roleEn: "Visitor",
    preferredBehavior: "wander", taglineKo: "이리저리 구경 중이에요.", taglineEn: "Looking around the space." }),
]);

const ARCHETYPE_BY_KEY = new Map<StudioNpcArchetypeKey, StudioNpcArchetype>(
  STUDIO_NPC_ARCHETYPES.map((item) => [item.key, item]),
);

/** 아키타입 조회. */
export function studioNpcArchetypeByKey(key: string): StudioNpcArchetype | null {
  return ARCHETYPE_BY_KEY.get(key as StudioNpcArchetypeKey) ?? null;
}

/** 아키타입 키 판정. */
export function studioNpcArchetypeHasKey(key: string): boolean {
  return ARCHETYPE_BY_KEY.has(key as StudioNpcArchetypeKey);
}

/* ---------------- 근접 preset 대사 ---------------- */

export interface StudioNpcArchetypeLine {
  readonly ko: string;
  readonly en: string;
}

const line = (ko: string, en: string): StudioNpcArchetypeLine => Object.freeze({ ko, en });

export type StudioNpcArchetypeLineKind = "greet" | "idle";

/**
 * 아키타입별 근접 preset 대사.
 * - greet: 플레이어가 다가왔을 때 말풍선에 뜨는 인사/한 마디
 * - idle: 가만히 있을 때 가끔 띄우는 혼잣말
 * 한국어는 말풍선에 들어가도록 18자 이하로 유지한다.
 */
const DIALOGUES: Readonly<Record<StudioNpcArchetypeKey, {
  readonly greet: readonly StudioNpcArchetypeLine[];
  readonly idle: readonly StudioNpcArchetypeLine[];
}>> = Object.freeze({
  guide: {
    greet: [line("어서 오세요! 안내해 드릴까요?", "Welcome! Need a guide?"),
      line("이쪽으로 오세요!", "This way, please!"),
      line("궁금한 곳이 있나요?", "Anywhere you want to see?")],
    idle: [line("오늘은 몇 분이 오셨나…", "How many visitors today…"),
      line("분수 쪽이 예쁘죠?", "The fountain looks nice, right?")],
  },
  barista: {
    greet: [line("어서 오세요! 커피 어때요?", "Welcome! How about a coffee?"),
      line("오늘의 추천은 라떼예요 ☕", "Today's pick is a latte ☕"),
      line("따뜻한 게 필요하신가요?", "Need something warm?")],
    idle: [line("원두 향이 좋네요~", "The beans smell lovely~"),
      line("컵을 닦아 둘까요", "Let me wipe the cups")],
  },
  guard: {
    greet: [line("안녕하세요! 출입 확인했어요.", "Hello! Entry confirmed."),
      line("조용히 다녀주세요!", "Please keep it quiet!"),
      line("안전하게 즐기세요!", "Enjoy safely!")],
    idle: [line("이상 없음. 순찰 계속.", "All clear. Patrolling on."),
      line("문은 잘 잠겼나…", "Are the doors locked…")],
  },
  shopkeeper: {
    greet: [line("어서 오세요! 구경하세요~", "Welcome! Take a look~"),
      line("오늘 특가가 있어요!", "Today's sale is on!"),
      line("마음에 드는 게 있나요?", "Find anything you like?")],
    idle: [line("물건을 정리해야지…", "Time to restock…"),
      line("이건 인기 상품이에요", "This one's popular")],
  },
  cleaner: {
    greet: [line("안녕하세요! 청소 중이에요 ✨", "Hello! Tidying up ✨"),
      line("조금만 비켜 주세요~", "Excuse me, coming through~"),
      line("깨끗하죠?", "Sparkling, right?")],
    idle: [line("먼지 하나 없이!", "Not a speck of dust!"),
      line("여기도 닦고, 저기도 닦고", "Wipe here, wipe there")],
  },
  mentor: {
    greet: [line("그림 그릴 때 막히면 물어보세요.", "Ask me when you're stuck drawing."),
      line("함께 고민해 봐요!", "Let's think it through!"),
      line("오늘 작업은 어때요?", "How's your work today?")],
    idle: [line("좋은 아이디어가 떠오르길…", "Hoping for a good idea…"),
      line("스케치북을 펼쳐 볼까", "Let me open my sketchbook")],
  },
  visitor: {
    greet: [line("안녕하세요! 구경 중이에요.", "Hello! Just looking around."),
      line("여기 정말 멋지네요!", "This place is amazing!"),
      line("사진 찍어도 될까요?", "May I take a photo?")],
    idle: [line("어디부터 볼까…", "Where to look first…"),
      line("또 오고 싶어요!", "I want to come again!")],
  },
});

function hash01(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

/** 아키타입 preset 대사 조회. 알 수 없는 키는 안내원 대사로 폴백한다. */
export function studioNpcArchetypeDialogue(
  key: string,
  kind: StudioNpcArchetypeLineKind,
  seed: string,
): StudioNpcArchetypeLine {
  const entry = DIALOGUES[key as StudioNpcArchetypeKey] ?? DIALOGUES.guide;
  const lines = entry[kind];
  const index = Math.floor(hash01(`${seed}:${kind}`) * lines.length) % lines.length;
  return lines[index] ?? lines[0] ?? line("안녕하세요!", "Hello!");
}

/** 아키타입의 전체 preset 대사 목록 (편집 UI·미리보기용). */
export function studioNpcArchetypeDialogueLines(
  key: string,
  kind: StudioNpcArchetypeLineKind,
): readonly StudioNpcArchetypeLine[] {
  const entry = DIALOGUES[key as StudioNpcArchetypeKey] ?? DIALOGUES.guide;
  return entry[kind];
}

/** 이름표 라벨 ("두리 · 안내원" / "Duri · Guide"). */
export function studioNpcArchetypeNameLabel(archetype: StudioNpcArchetype): { readonly ko: string; readonly en: string } {
  return Object.freeze({ ko: `${archetype.nameKo} · ${archetype.roleKo}`, en: `${archetype.nameEn} · ${archetype.roleEn}` });
}
