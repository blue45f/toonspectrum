/**
 * Studio 3D Advanced Pose & Hand Expression Library (VRoid / Mixamo / Posemaniacs Benchmark).
 * 12 full-body webtoon dramatic poses, 16 expressive hand presets, and prop socket solvers.
 *
 * 각 전신 포즈는 탐색 UX용 메타데이터(카테고리·성별·인원수·태그)를 함께 가진다.
 * - 성별 "any"는 남/여 모델 모두에 어울리는 공용 포즈다(성별 필터는 any를 항상 포함한다).
 * - 인원수 2는 상대역이 함께 필요한 연출 포즈(포옹·벽치기 등)를 뜻한다.
 */

export type CharacterPoseCategory = "action" | "daily" | "dramatic" | "emotion";

/** 포즈가 어울리는 성별. "any"는 남/여 공용이다. */
export type WebtoonPoseGender = "any" | "male" | "female";

/** 포즈 연출에 필요한 인원수. */
export type WebtoonPoseFigureCount = 1 | 2;

export interface HumanoidJointRotation {
  readonly joint: string;
  readonly rotationEulerDeg: readonly [number, number, number];
}

export interface CharacterFullBodyPosePreset {
  readonly id: string;
  readonly name: string;
  readonly category: CharacterPoseCategory;
  /** 성별 메타데이터 — "any"는 남/여 공용. */
  readonly gender: WebtoonPoseGender;
  /** 연출에 필요한 인원수 (1인 / 2인). */
  readonly figures: WebtoonPoseFigureCount;
  /** 검색·탐색용 한글 태그. */
  readonly tags: readonly string[];
  readonly description: string;
  readonly iconHint: string;
  readonly jointRotations: readonly HumanoidJointRotation[];
}

/** 카테고리 탐색용 한글 라벨 메타. */
export const WEBTOON_POSE_CATEGORY_META: readonly {
  readonly id: CharacterPoseCategory;
  readonly label: string;
}[] = Object.freeze([
  { id: "action", label: "액션" },
  { id: "daily", label: "일상" },
  { id: "dramatic", label: "드라마틱" },
  { id: "emotion", label: "감정" },
]);

/** 성별 필터 옵션. "any" 데이터는 남/여 필터에 항상 포함된다. */
export const WEBTOON_POSE_GENDER_META: readonly {
  readonly id: WebtoonPoseGender | "all";
  readonly label: string;
}[] = Object.freeze([
  { id: "all", label: "전체" },
  { id: "any", label: "공용" },
  { id: "male", label: "남성" },
  { id: "female", label: "여성" },
]);

export const WEBTOON_POSE_FIGURE_META: readonly {
  readonly id: "all" | WebtoonPoseFigureCount;
  readonly label: string;
}[] = Object.freeze([
  { id: "all", label: "전체" },
  { id: 1, label: "1인" },
  { id: 2, label: "2인" },
]);

export const ADVANCED_WEBTOON_POSES: readonly CharacterFullBodyPosePreset[] = Object.freeze([
  // Action
  {
    id: "action-hero-landing",
    name: "히어로 3점 착지 (Superhero Landing)",
    category: "action",
    gender: "any",
    figures: 1,
    tags: ["히어로", "착지", "전투", "클라이맥스", "슈퍼히어로"],
    description: "한 손과 무릎을 바닥에 짚으며 착지하는 강렬한 클라이맥스 포즈",
    iconHint: "Zap",
    jointRotations: [
      { joint: "hips", rotationEulerDeg: [35, 0, 0] },
      { joint: "spine", rotationEulerDeg: [20, 0, 0] },
      { joint: "leftUpperLeg", rotationEulerDeg: [-60, 15, 0] },
      { joint: "leftLowerLeg", rotationEulerDeg: [110, 0, 0] },
      { joint: "rightUpperLeg", rotationEulerDeg: [20, -30, 0] },
      { joint: "rightLowerLeg", rotationEulerDeg: [45, 0, 0] },
      { joint: "rightUpperArm", rotationEulerDeg: [-40, -20, -10] },
      { joint: "leftUpperArm", rotationEulerDeg: [20, 40, 20] },
    ],
  },
  {
    id: "action-sword-slash",
    name: "일도양단 발도세 (Sword Draw Slash)",
    category: "action",
    gender: "any",
    figures: 1,
    tags: ["검", "발도", "베기", "무사", "전투", "무협"],
    description: "검을 대각선으로 크게 휘두르는 역동적인 액션 동작",
    iconHint: "Sword",
    jointRotations: [
      { joint: "hips", rotationEulerDeg: [10, -25, 0] },
      { joint: "spine", rotationEulerDeg: [-15, -15, 0] },
      { joint: "rightUpperArm", rotationEulerDeg: [-75, 45, 30] },
      { joint: "rightLowerArm", rotationEulerDeg: [20, 0, 0] },
      { joint: "leftUpperArm", rotationEulerDeg: [15, -45, -20] },
      { joint: "leftUpperLeg", rotationEulerDeg: [-40, -10, 0] },
      { joint: "rightUpperLeg", rotationEulerDeg: [30, 10, 0] },
    ],
  },
  {
    id: "action-dynamic-jump-kick",
    name: "공중 도약 하이킥 (Flying Jump Kick)",
    category: "action",
    gender: "any",
    figures: 1,
    tags: ["발차기", "점프", "공중", "격투", "킥"],
    description: "공중에서 몸을 비틀며 날리는 호쾌한 발차기",
    iconHint: "Footprints",
    jointRotations: [
      { joint: "hips", rotationEulerDeg: [-20, 45, 15] },
      { joint: "rightUpperLeg", rotationEulerDeg: [-85, -10, 0] },
      { joint: "rightLowerLeg", rotationEulerDeg: [10, 0, 0] },
      { joint: "leftUpperLeg", rotationEulerDeg: [35, 20, 0] },
      { joint: "leftLowerLeg", rotationEulerDeg: [80, 0, 0] },
      { joint: "leftUpperArm", rotationEulerDeg: [-60, -30, 0] },
      { joint: "rightUpperArm", rotationEulerDeg: [40, 20, 0] },
    ],
  },
  {
    id: "action-magic-burst",
    name: "양손 마력 집중 (Magic Invocation)",
    category: "action",
    gender: "any",
    figures: 1,
    tags: ["마법", "영창", "양손", "판타지", "결계"],
    description: "양손을 전방으로 뻗으며 결계를 치거나 마법을 영창하는 포즈",
    iconHint: "Sparkles",
    jointRotations: [
      { joint: "spine", rotationEulerDeg: [-10, 0, 0] },
      { joint: "rightUpperArm", rotationEulerDeg: [-80, -20, 0] },
      { joint: "leftUpperArm", rotationEulerDeg: [-80, 20, 0] },
      { joint: "rightLowerArm", rotationEulerDeg: [30, 0, 0] },
      { joint: "leftLowerArm", rotationEulerDeg: [30, 0, 0] },
    ],
  },

  // Daily
  {
    id: "daily-standing-casual",
    name: "주머니 손 넣고 대기 (Hands in Pockets)",
    category: "daily",
    gender: "any",
    figures: 1,
    tags: ["서있기", "대기", "주머니", "일상", "짝다리"],
    description: "짝다리를 짚고 자연스럽게 서 있는 일상적인 전신 포즈",
    iconHint: "User",
    jointRotations: [
      { joint: "hips", rotationEulerDeg: [0, 5, -8] },
      { joint: "spine", rotationEulerDeg: [0, -3, 6] },
      { joint: "rightUpperLeg", rotationEulerDeg: [-5, 0, 0] },
      { joint: "leftUpperLeg", rotationEulerDeg: [10, 5, 5] },
      { joint: "rightUpperArm", rotationEulerDeg: [15, 10, -5] },
      { joint: "leftUpperArm", rotationEulerDeg: [15, -10, 5] },
    ],
  },
  {
    id: "daily-sitting-chair",
    name: "의자에 턱 괴고 앉기 (Chin on Hand)",
    category: "daily",
    gender: "any",
    figures: 1,
    tags: ["앉기", "의자", "카페", "생각", "휴식"],
    description: "책상/카페 의자에 앉아 한 손으로 턱을 괸 채 생각에 잠긴 자세",
    iconHint: "Armchair",
    jointRotations: [
      { joint: "hips", rotationEulerDeg: [80, 0, 0] },
      { joint: "leftUpperLeg", rotationEulerDeg: [-80, 0, 0] },
      { joint: "leftLowerLeg", rotationEulerDeg: [80, 0, 0] },
      { joint: "rightUpperLeg", rotationEulerDeg: [-80, 0, 0] },
      { joint: "rightLowerLeg", rotationEulerDeg: [80, 0, 0] },
      { joint: "rightUpperArm", rotationEulerDeg: [-60, -20, 0] },
      { joint: "rightLowerArm", rotationEulerDeg: [110, 0, 0] },
    ],
  },
  {
    id: "daily-phone-call",
    name: "스마트폰 통화하며 걷기 (Phone Walk)",
    category: "daily",
    gender: "any",
    figures: 1,
    tags: ["전화", "걷기", "스마트폰", "통화", "일상"],
    description: "한 손으로 전화를 귀에 대고 걸어가는 포즈",
    iconHint: "Phone",
    jointRotations: [
      { joint: "head", rotationEulerDeg: [5, 15, -10] },
      { joint: "rightUpperArm", rotationEulerDeg: [-30, -35, 0] },
      { joint: "rightLowerArm", rotationEulerDeg: [135, 0, 0] },
      { joint: "leftUpperLeg", rotationEulerDeg: [-25, 0, 0] },
      { joint: "rightUpperLeg", rotationEulerDeg: [20, 0, 0] },
    ],
  },
  {
    id: "daily-coffee-sip",
    name: "머그잔 마시기 (Coffee Sip)",
    category: "daily",
    gender: "any",
    figures: 1,
    tags: ["커피", "차", "마시기", "휴식", "머그잔"],
    description: "양손으로 따뜻한 찻잔을 들고 마시는 차분한 일상 자세",
    iconHint: "Coffee",
    jointRotations: [
      { joint: "head", rotationEulerDeg: [10, 0, 0] },
      { joint: "rightUpperArm", rotationEulerDeg: [-45, -30, 0] },
      { joint: "rightLowerArm", rotationEulerDeg: [120, 0, 0] },
      { joint: "leftUpperArm", rotationEulerDeg: [-45, 30, 0] },
      { joint: "leftLowerArm", rotationEulerDeg: [120, 0, 0] },
    ],
  },

  // Dramatic & Emotion
  {
    id: "dramatic-shock-stepback",
    name: "경악하며 뒷걸음질 (Shock & Recoil)",
    category: "dramatic",
    gender: "any",
    figures: 1,
    tags: ["놀람", "충격", "뒷걸음", "반전", "경악"],
    description: "충격적인 진실을 마주하고 몸을 뒤로 빼며 놀라는 드라마틱 컷",
    iconHint: "AlertTriangle",
    jointRotations: [
      { joint: "hips", rotationEulerDeg: [-25, 0, 0] },
      { joint: "spine", rotationEulerDeg: [-20, 0, 0] },
      { joint: "head", rotationEulerDeg: [15, 0, 0] },
      { joint: "rightUpperArm", rotationEulerDeg: [-45, -30, -20] },
      { joint: "leftUpperArm", rotationEulerDeg: [-45, 30, 20] },
    ],
  },
  {
    id: "dramatic-kneeling-despair",
    name: "무릎 꿇고 절망 (Kneeling Despair)",
    category: "emotion",
    gender: "any",
    figures: 1,
    tags: ["절망", "무릎", "좌절", "슬픔", "고개숙임"],
    description: "무릎을 꿇고 고개를 떨군 채 좌절하는 감정 씬",
    iconHint: "HeartCrack",
    jointRotations: [
      { joint: "hips", rotationEulerDeg: [90, 0, 0] },
      { joint: "leftUpperLeg", rotationEulerDeg: [-90, 0, 0] },
      { joint: "leftLowerLeg", rotationEulerDeg: [140, 0, 0] },
      { joint: "rightUpperLeg", rotationEulerDeg: [-90, 0, 0] },
      { joint: "rightLowerLeg", rotationEulerDeg: [140, 0, 0] },
      { joint: "spine", rotationEulerDeg: [40, 0, 0] },
      { joint: "head", rotationEulerDeg: [35, 0, 0] },
    ],
  },
  {
    id: "dramatic-romantic-hug",
    name: "로맨스 포옹 (Romantic Embrace)",
    category: "emotion",
    gender: "any",
    figures: 2,
    tags: ["포옹", "로맨스", "연인", "하이라이트", "끌어안기"],
    description: "상대방을 다정하게 끌어안는 웹툰 로맨스 하이라이트 자세",
    iconHint: "Heart",
    jointRotations: [
      { joint: "spine", rotationEulerDeg: [10, 0, 0] },
      { joint: "rightUpperArm", rotationEulerDeg: [-50, -40, -10] },
      { joint: "rightLowerArm", rotationEulerDeg: [80, 0, 0] },
      { joint: "leftUpperArm", rotationEulerDeg: [-50, 40, 10] },
      { joint: "leftLowerArm", rotationEulerDeg: [80, 0, 0] },
    ],
  },
  {
    id: "dramatic-wall-slam-kabe-don",
    name: "벽치기 카베동 (Kabe-Don)",
    category: "dramatic",
    gender: "any",
    figures: 2,
    tags: ["벽치기", "카베동", "설렘", "로맨스", "클리셰"],
    description: "한 손으로 벽을 짚고 상대를 응시하는 설레는 클리셰 연출",
    iconHint: "Hand",
    jointRotations: [
      { joint: "spine", rotationEulerDeg: [5, 10, 0] },
      { joint: "rightUpperArm", rotationEulerDeg: [-90, 0, 0] },
      { joint: "rightLowerArm", rotationEulerDeg: [10, 0, 0] },
      { joint: "leftUpperArm", rotationEulerDeg: [10, -10, 0] },
    ],
  },
]);

/** id 로 포즈 프리셋을 찾는다. */
export function getWebtoonPosePresetById(id: string): CharacterFullBodyPosePreset | undefined {
  return ADVANCED_WEBTOON_POSES.find((preset) => preset.id === id);
}

export interface WebtoonPosePresetFilter {
  /** "all"이면 카테고리 무관. */
  readonly category?: CharacterPoseCategory | "all";
  /**
   * 성별 필터. "any"(공용) 포즈는 남/여 필터에 항상 포함된다.
   * "all"이면 성별 무관.
   */
  readonly gender?: WebtoonPoseGender | "all";
  /** "all"이면 인원수 무관. */
  readonly figures?: WebtoonPoseFigureCount | "all";
  /** 이름·설명·태그 부분 일치 검색어. */
  readonly query?: string;
}

function normalizeWebtoonPoseQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Shaper식 프리셋 탐색용 필터. 카테고리 × 성별 × 인원수 × 검색어를 AND 로 적용한다.
 */
export function filterWebtoonPosePresets(
  filter: WebtoonPosePresetFilter,
): CharacterFullBodyPosePreset[] {
  const category = filter.category ?? "all";
  const gender = filter.gender ?? "all";
  const figures = filter.figures ?? "all";
  const query = normalizeWebtoonPoseQuery(filter.query ?? "");
  return ADVANCED_WEBTOON_POSES.filter((preset) => {
    if (category !== "all" && preset.category !== category) return false;
    if (gender !== "all" && preset.gender !== "any" && preset.gender !== gender) return false;
    if (figures !== "all" && preset.figures !== figures) return false;
    if (query) {
      const haystack = `${preset.name} ${preset.description} ${preset.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export interface HandPosePreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly fingerCurls: {
    readonly thumb: number; // 0.0 (open) to 1.0 (fully curled)
    readonly index: number;
    readonly middle: number;
    readonly ring: number;
    readonly pinky: number;
  };
}

export const EXPRESSIVE_HAND_PRESETS: readonly HandPosePreset[] = Object.freeze([
  { id: "hand-fist", name: "꽉 쥔 주먹 (Fist)", description: "전투 및 의지를 나타내는 주먹", fingerCurls: { thumb: 1.0, index: 1.0, middle: 1.0, ring: 1.0, pinky: 1.0 } },
  { id: "hand-relaxed", name: "자연스러운 손 (Relaxed)", description: "힘을 뺀 편안한 기본 손 모양", fingerCurls: { thumb: 0.2, index: 0.25, middle: 0.3, ring: 0.35, pinky: 0.4 } },
  { id: "hand-open-palm", name: "활짝 편 손바닥 (Open Palm)", description: "손바닥을 펼쳐 보이며 정지나 방어", fingerCurls: { thumb: 0.0, index: 0.0, middle: 0.0, ring: 0.0, pinky: 0.0 } },
  { id: "hand-point-index", name: "검지 가리키기 (Point Index)", description: "지목하거나 방향을 가리키는 손", fingerCurls: { thumb: 0.8, index: 0.0, middle: 1.0, ring: 1.0, pinky: 1.0 } },
  { id: "hand-peace-v", name: "브이 사인 (Peace / V)", description: "검지와 중지를 편 승리/애교 포즈", fingerCurls: { thumb: 0.9, index: 0.0, middle: 0.0, ring: 1.0, pinky: 1.0 } },
  { id: "hand-thumbs-up", name: "엄지 척 (Thumbs Up)", description: "엄지손가락을 치켜든 긍정 제스처", fingerCurls: { thumb: 0.0, index: 0.0, middle: 1.0, ring: 1.0, pinky: 1.0 } },
  { id: "hand-phone-hold", name: "스마트폰 잡기 (Phone Hold)", description: "스마트폰을 쥐고 있는 손 모양", fingerCurls: { thumb: 0.3, index: 0.4, middle: 0.5, ring: 0.6, pinky: 0.5 } },
  { id: "hand-sword-grip", name: "검 손잡이 그립 (Sword Grip)", description: "칼이나 봉을 단단하게 감싸 쥔 손", fingerCurls: { thumb: 0.85, index: 0.9, middle: 0.95, ring: 0.95, pinky: 0.9 } },
  { id: "hand-gun-trigger", name: "권총 방아쇠 (Gun Trigger)", description: "방아쇠에 검지를 걸친 사격 포즈", fingerCurls: { thumb: 0.7, index: 0.3, middle: 1.0, ring: 1.0, pinky: 1.0 } },
  { id: "hand-pen-tripod", name: "펜 삼점 그립 (Pen Tripod)", description: "펜이나 브러시를 쥐고 필기하는 손", fingerCurls: { thumb: 0.4, index: 0.5, middle: 0.6, ring: 0.9, pinky: 0.9 } },
  { id: "hand-pinch", name: "꼬집기 / 핀치 (Pinch)", description: "엄지와 검지로 작은 물건을 집는 손", fingerCurls: { thumb: 0.5, index: 0.6, middle: 0.8, ring: 0.9, pinky: 0.9 } },
  { id: "hand-grasp-mug", name: "머그잔 손잡이 잡기 (Mug Grasp)", description: "컵 손잡이에 손가락을 건 형태", fingerCurls: { thumb: 0.3, index: 0.7, middle: 0.75, ring: 0.8, pinky: 0.8 } },
  { id: "hand-rock-on", name: "락앤롤 (Rock On)", description: "검지와 새끼를 편 록 제스처", fingerCurls: { thumb: 0.8, index: 0.0, middle: 1.0, ring: 1.0, pinky: 0.0 } },
  { id: "hand-finger-snap", name: "핑거 스냅 (Finger Snap)", description: "엄지와 중지를 튕기기 직전의 긴장감", fingerCurls: { thumb: 0.6, index: 0.1, middle: 0.6, ring: 0.9, pinky: 0.9 } },
  { id: "hand-magic-claw", name: "마력 방출 갈퀴손 (Magic Claw)", description: "마법 시전 시 힘이 들어간 꺾인 손가락", fingerCurls: { thumb: 0.4, index: 0.4, middle: 0.45, ring: 0.45, pinky: 0.4 } },
  { id: "hand-shaka", name: "샤카 / 전화 제스처 (Call Me)", description: "엄지와 새끼손가락만 편 제스처", fingerCurls: { thumb: 0.0, index: 1.0, middle: 1.0, ring: 1.0, pinky: 0.0 } },
]);

export type SocketAttachmentTarget = "hand-right" | "hand-left" | "head" | "back" | "hip-right" | "hip-left";

export interface PropSocketTransform {
  readonly socket: SocketAttachmentTarget;
  readonly localOffset: readonly [number, number, number];
  readonly localRotationDeg: readonly [number, number, number];
}

export const PROP_SOCKET_DEFAULTS: Record<SocketAttachmentTarget, PropSocketTransform> = {
  "hand-right": {
    socket: "hand-right",
    localOffset: [0, -0.05, 0.08],
    localRotationDeg: [0, 0, 90],
  },
  "hand-left": {
    socket: "hand-left",
    localOffset: [0, -0.05, 0.08],
    localRotationDeg: [0, 0, -90],
  },
  head: {
    socket: "head",
    localOffset: [0, 0.15, 0],
    localRotationDeg: [0, 0, 0],
  },
  back: {
    socket: "back",
    localOffset: [0, 0, -0.15],
    localRotationDeg: [0, 0, 45], // diagonal scabbard
  },
  "hip-right": {
    socket: "hip-right",
    localOffset: [0.18, -0.05, 0],
    localRotationDeg: [15, 0, 0],
  },
  "hip-left": {
    socket: "hip-left",
    localOffset: [-0.18, -0.05, 0],
    localRotationDeg: [15, 0, 0],
  },
};
