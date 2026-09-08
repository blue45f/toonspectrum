export interface DailyTheme {
  id: string;
  title: string;
  tagline: string;
  object: string;
  place: string;
  light: string;
  sound: readonly string[];
  mission: string;
  assetQuery: string;
  bookQuery: string;
  moods: readonly string[];
}

export interface KstDay {
  iso: string;
  label: string;
  shortLabel: string;
  index: number;
}

export interface DirectingMode {
  id: "balanced" | "emotion" | "mystery" | "visual";
  label: string;
  tagline: string;
  lens: string;
  palette: string;
  pacing: string;
  note: string;
  beatDirectives: readonly [string, string, string, string, string];
}

export interface StoryBeat {
  id: string;
  label: string;
  title: string;
  body: string;
}

export const DAILY_THEMES = [
  {
    id: "rainy-theater",
    title: "비 오는 오래된 극장",
    tagline: "빈 객석에는 떠난 사람의 흔적만 남아 있습니다.",
    object: "낡은 극장 입장권",
    place: "목재 좌석과 좁은 통로가 있는 소극장",
    light: "흐린 저녁의 푸른 외광과 따뜻한 실내등",
    sound: ["빗물이 처마를 치는 소리", "젖은 발걸음", "나무 좌석이 접히는 소리"],
    mission: "대사를 쓰지 않고 다섯 컷만으로 누군가 이미 떠났다는 사실을 표현하세요.",
    assetQuery: "theater ticket interior rain",
    bookQuery: "theater graphic novel",
    moods: ["기다림", "그리움", "저녁"],
  },
  {
    id: "midnight-laundromat",
    title: "자정의 무인 세탁소",
    tagline: "돌아가는 드럼 안에서 낯선 물건이 발견됩니다.",
    object: "주인 없는 빨간 장갑",
    place: "형광등이 깜빡이는 작은 세탁소",
    light: "차가운 형광등과 유리창의 네온 반사",
    sound: ["세탁기 회전음", "동전이 떨어지는 소리", "멀리 지나가는 버스"],
    mission: "한 인물이 장갑의 주인을 추리하는 과정을 세 개의 시선 컷으로 구성하세요.",
    assetQuery: "laundry glove neon",
    bookQuery: "laundromat mystery comic",
    moods: ["호기심", "고독", "긴장"],
  },
  {
    id: "winter-station",
    title: "눈이 멈춘 작은 역",
    tagline: "막차가 떠난 뒤에도 한 사람은 승강장에 남아 있습니다.",
    object: "시간이 멈춘 손목시계",
    place: "눈 쌓인 시골 간이역",
    light: "가로등 아래 퍼지는 눈의 난반사",
    sound: ["전선이 바람에 흔들리는 소리", "멀어지는 열차", "눈을 밟는 발소리"],
    mission: "같은 구도를 세 번 반복하되 매 컷에서 시간의 이상을 하나씩 추가하세요.",
    assetQuery: "winter train station watch",
    bookQuery: "train station time comic",
    moods: ["정적", "이별", "초현실"],
  },
  {
    id: "greenhouse-letter",
    title: "폐온실의 마지막 편지",
    tagline: "식물은 시들었지만 편지의 잉크는 아직 마르지 않았습니다.",
    object: "식물 표본 사이의 봉투",
    place: "깨진 유리와 덩굴이 뒤엉킨 온실",
    light: "구름 사이로 잠깐 들어오는 확산광",
    sound: ["유리 조각이 흔들리는 소리", "잎에 떨어지는 물방울", "멀리서 우는 새"],
    mission: "편지의 내용을 보여주지 않고 인물의 반응과 주변 사물만으로 내용을 짐작하게 하세요.",
    assetQuery: "abandoned greenhouse letter botanical",
    bookQuery: "greenhouse graphic novel",
    moods: ["비밀", "상실", "새로운 시작"],
  },
  {
    id: "old-market",
    title: "해 질 무렵의 오래된 시장",
    tagline: "모든 가게가 문을 닫는데 한 상점만 불이 켜집니다.",
    object: "나무 저울추와 손때 묻은 장부",
    place: "좁은 골목형 전통시장",
    light: "낮은 태양과 점포 안 백열등의 대비",
    sound: ["철제 셔터가 내려오는 소리", "상인이 상자를 옮기는 소리", "시장 끝의 라디오"],
    mission: "독자가 들어가고 싶지만 동시에 불안해지는 상점 입구를 한 컷에 설계하세요.",
    assetQuery: "old market scale ledger",
    bookQuery: "market historical comic",
    moods: ["생활감", "수상함", "황혼"],
  },
  {
    id: "school-rooftop",
    title: "방학 마지막 날의 옥상",
    tagline: "아무도 없는 학교에 두 개의 의자만 마주 보고 있습니다.",
    object: "이름이 지워진 학생증",
    place: "낡은 학교 옥상과 급수탑",
    light: "여름 오후의 강한 역광",
    sound: ["매미 소리", "운동장 깃대 줄이 부딪히는 소리", "멀리서 들리는 방송"],
    mission: "두 인물을 직접 보여주지 않고 그들의 관계를 암시하는 소품 다섯 개를 배치하세요.",
    assetQuery: "school rooftop student card summer",
    bookQuery: "school rooftop manga",
    moods: ["청춘", "부재", "약속"],
  },
  {
    id: "night-library",
    title: "불이 꺼지지 않는 도서관",
    tagline: "반납된 적 없는 책이 매일 다른 책상에 놓입니다.",
    object: "대출 도장이 없는 낡은 책",
    place: "높은 서가와 나선형 계단이 있는 도서관",
    light: "초록색 스탠드 조명과 어두운 서가",
    sound: ["책장이 넘어가는 소리", "시계 초침", "카트 바퀴의 마찰음"],
    mission: "책이 스스로 이동했다는 사실을 정지된 사물의 차이만으로 보여주세요.",
    assetQuery: "old library book spiral staircase",
    bookQuery: "library mystery graphic novel",
    moods: ["지식", "수수께끼", "밤"],
  },
  {
    id: "harbor-dawn",
    title: "안개 낀 항구의 새벽",
    tagline: "도착한 배의 명부에는 존재하지 않는 승객이 적혀 있습니다.",
    object: "젖은 승선 명부",
    place: "창고와 크레인이 보이는 작은 항구",
    light: "안개에 퍼지는 주황색 작업등",
    sound: ["부표 종소리", "밧줄이 당겨지는 소리", "갈매기와 낮은 엔진음"],
    mission: "안개를 단순한 흰색 면이 아니라 거리와 정보를 숨기는 연출 장치로 사용하세요.",
    assetQuery: "fog harbor manifest rope",
    bookQuery: "harbor mystery comic",
    moods: ["안개", "도착", "불길함"],
  },
  {
    id: "attic-clock",
    title: "다락방의 두 번째 시계",
    tagline: "집 안의 모든 시계와 정확히 열세 분 차이가 납니다.",
    object: "열세 분 느린 탁상시계",
    place: "상자와 천으로 가득한 다락방",
    light: "작은 환기창을 통과하는 먼지 낀 빛",
    sound: ["나무가 수축하는 소리", "서로 다른 두 초침", "지붕 위의 빗방울"],
    mission: "독자가 두 시계의 차이를 스스로 발견하도록 정보의 노출 순서를 설계하세요.",
    assetQuery: "attic clock dust boxes",
    bookQuery: "clock time graphic novel",
    moods: ["기억", "시간", "발견"],
  },
  {
    id: "desert-observatory",
    title: "사막의 버려진 관측소",
    tagline: "밤하늘에는 지도에 없는 별이 하나 더 있습니다.",
    object: "금이 간 황동 망원경",
    place: "모래에 반쯤 묻힌 천문 관측소",
    light: "푸른 달빛과 붉은 비상등",
    sound: ["모래바람", "금속 구조물이 우는 소리", "낡은 모터의 짧은 작동음"],
    mission: "인물보다 하늘의 비중을 크게 잡아 경외감과 위험을 동시에 표현하세요.",
    assetQuery: "desert observatory telescope night",
    bookQuery: "observatory science fiction comic",
    moods: ["우주", "고립", "경외"],
  },
  {
    id: "museum-after-hours",
    title: "폐관 후의 작은 박물관",
    tagline: "전시된 물건 하나가 어제와 다른 방향을 보고 있습니다.",
    object: "방향이 바뀐 작은 조각상",
    place: "목재 진열장과 좁은 전시실",
    light: "비상구 표시등과 손전등의 국부광",
    sound: ["공조기 저음", "유리 진열장의 미세한 진동", "경비원의 열쇠"],
    mission: "첫 컷과 마지막 컷의 구도는 같게 두고 단 하나의 차이로 사건을 만드세요.",
    assetQuery: "museum cabinet statue night",
    bookQuery: "museum mystery comic",
    moods: ["관찰", "이상", "정적"],
  },
  {
    id: "river-cafe",
    title: "홍수 뒤 다시 연 강변 카페",
    tagline: "물에 젖은 벽에는 지워지지 않은 키 표시가 남아 있습니다.",
    object: "물에 번진 메뉴판",
    place: "창문이 큰 작은 강변 카페",
    light: "비가 갠 뒤 흐린 자연광",
    sound: ["강물 소리", "젖은 의자를 닦는 소리", "에스프레소 머신의 첫 작동"],
    mission: "공간의 피해와 다시 시작하려는 의지를 같은 장면 안에 균형 있게 배치하세요.",
    assetQuery: "river cafe flood menu",
    bookQuery: "cafe recovery graphic novel",
    moods: ["회복", "흔적", "희망"],
  },
  {
    id: "mountain-clinic",
    title: "산속 진료소의 마지막 환자",
    tagline: "진료 기록에는 오늘보다 하루 뒤의 날짜가 적혀 있습니다.",
    object: "미래 날짜가 찍힌 진료 카드",
    place: "눈 덮인 산길 끝의 작은 진료소",
    light: "흰 눈의 반사광과 따뜻한 진료실 조명",
    sound: ["난로 소리", "유리창을 긁는 나뭇가지", "멀리서 들리는 무전기"],
    mission: "의료 장면의 긴장을 과장된 표정 대신 손과 도구의 움직임으로 표현하세요.",
    assetQuery: "mountain clinic medical card snow",
    bookQuery: "rural clinic mystery manga",
    moods: ["고립", "돌봄", "예고"],
  },
  {
    id: "city-archive",
    title: "지하 기록보관소의 지도",
    tagline: "현재 도시에는 없는 골목이 지도 위에서 계속 길어집니다.",
    object: "잉크가 번지는 오래된 도시 지도",
    place: "금속 서가가 늘어선 지하 기록실",
    light: "천장 형광등과 휴대용 스캐너 빛",
    sound: ["환풍기", "종이가 펼쳐지는 소리", "멀리서 닫히는 방화문"],
    mission: "평면 지도와 실제 공간을 교차 편집해 두 세계가 연결되는 순간을 만드세요.",
    assetQuery: "archive old city map",
    bookQuery: "city map fantasy comic",
    moods: ["기록", "도시", "미지"],
  },
] satisfies readonly DailyTheme[];

export const NOW_MODES = [
  {
    id: "balanced",
    label: "균형 연출",
    tagline: "정보와 감정을 고르게 배치합니다.",
    lens: "35mm 시선 높이",
    palette: "차가운 배경 + 따뜻한 단서",
    pacing: "도입 1 · 전개 3 · 여운 1",
    note: "처음 보는 독자도 공간, 사건, 감정선을 한 번에 읽을 수 있는 기본 모드입니다.",
    beatDirectives: [
      "넓은 화면으로 공간의 규칙을 먼저 약속하세요.",
      "사건의 단서는 또렷하게, 의미는 아직 숨겨두세요.",
      "빛과 소리를 함께 써서 변화의 순간을 표시하세요.",
      "인물의 선택이 공간을 어떻게 바꾸는지 보여주세요.",
      "첫 컷의 정보를 되돌려 주되 감정은 달라지게 마무리하세요.",
    ],
  },
  {
    id: "emotion",
    label: "감정선",
    tagline: "표정 대신 몸과 사물의 반응을 좇습니다.",
    lens: "50–85mm 근접 시선",
    palette: "저채도 + 피부·소품 한 색",
    pacing: "머무름 2 · 전환 1 · 반응 2",
    note: "손, 시선, 호흡, 거리의 변화를 중심으로 독자가 인물의 감정을 추론하게 합니다.",
    beatDirectives: [
      "사람보다 먼저 그가 머문 흔적을 가까이 보여주세요.",
      "손이나 시선이 사물에 닿기 직전의 망설임을 붙잡으세요.",
      "주변 소리를 줄이고 작은 반응 하나를 크게 들리게 하세요.",
      "표정 대신 자세와 인물 사이의 거리로 선택을 드러내세요.",
      "해결보다 감정의 잔상을 남기는 정지 화면으로 끝내세요.",
    ],
  },
  {
    id: "mystery",
    label: "미스터리",
    tagline: "단서를 공정하게 보여주고 해석은 지연합니다.",
    lens: "부분 차폐와 비대칭 구도",
    palette: "명암 대비 + 경고색 한 점",
    pacing: "단서 2 · 오해 1 · 재해석 2",
    note: "독자가 다시 첫 컷을 확인하고 싶도록 같은 사물의 의미를 단계적으로 뒤집습니다.",
    beatDirectives: [
      "핵심 공간을 일부 가리고 설명되지 않은 빈자리를 남기세요.",
      "사물을 한 번은 평범한 배경처럼 지나가게 배치하세요.",
      "빛이나 소리의 불일치로 첫 번째 가설을 흔드세요.",
      "같은 단서를 다른 거리에서 다시 보여 의미를 바꾸세요.",
      "답을 전부 말하지 말고 검증 가능한 마지막 단서만 남기세요.",
    ],
  },
  {
    id: "visual",
    label: "형식 실험",
    tagline: "반복, 여백, 크기 차이로 리듬을 만듭니다.",
    lens: "극단적 원경 ↔ 디테일",
    palette: "2색 기반 + 질감 대비",
    pacing: "반복 3 · 파열 1 · 잔상 1",
    note: "대사와 설명을 줄이고 패널의 크기, 반복, 방향 자체를 이야기 문법으로 사용합니다.",
    beatDirectives: [
      "인물보다 공간이 압도적으로 크게 보이도록 시작하세요.",
      "같은 구도 안에서 사물 하나만 이동시키세요.",
      "빛과 소리를 도형 또는 반복 패턴처럼 다루세요.",
      "앞선 패널의 규칙을 한 번만 과감하게 깨뜨리세요.",
      "가장 단순한 이미지로 축소해 독자가 빈칸을 채우게 하세요.",
    ],
  },
] as const satisfies readonly DirectingMode[];

export type NowModeId = (typeof NOW_MODES)[number]["id"];

export const NOW_PROGRESS_STEPS = [
  { id: "hook", label: "한 문장 훅", detail: "사건과 감정의 약속을 한 문장으로 적습니다." },
  { id: "reference", label: "레퍼런스 3개", detail: "공간·사물·빛 자료를 각각 하나 이상 확인합니다." },
  { id: "thumbnail", label: "5컷 썸네일", detail: "작게 그려 읽기 흐름과 정보 순서를 점검합니다." },
  { id: "draft", label: "첫 장면 초안", detail: "완성도보다 시작과 끝의 대비를 먼저 만듭니다." },
  { id: "review", label: "10초 독해 점검", detail: "설명 없이도 핵심 변화가 읽히는지 확인합니다." },
] as const;

export type NowProgressStepId = (typeof NOW_PROGRESS_STEPS)[number]["id"];

export interface NowState {
  version: 2;
  mode: NowModeId;
  progressByDate: Record<string, NowProgressStepId[]>;
  completedDates: string[];
  savedDates: string[];
}

export const NOW_STORAGE_KEY = "toonstudio:daily-inspiration:v2";
export const NOW_TIMER_SECONDS = 20 * 60;
export const NOW_ARCHIVE_DAYS = 7;

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_STORAGE_BYTES = 200_000;
const MAX_PROGRESS_DATES = 120;
const MAX_COMPLETED_DATES = 400;
const MAX_SAVED_DATES = 60;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const MODE_IDS = new Set<string>(NOW_MODES.map((mode) => mode.id));
const PROGRESS_IDS = new Set<string>(NOW_PROGRESS_STEPS.map((step) => step.id));

const fullDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
  timeZone: "Asia/Seoul",
});

const shortDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  weekday: "short",
  timeZone: "Asia/Seoul",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function isModeId(value: unknown): value is NowModeId {
  return typeof value === "string" && MODE_IDS.has(value);
}

function isProgressStepId(value: unknown): value is NowProgressStepId {
  return typeof value === "string" && PROGRESS_IDS.has(value);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function sanitizeDateList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return unique(value.filter(isIsoDate)).slice(-limit);
}

export function createEmptyNowState(): NowState {
  return {
    version: 2,
    mode: "balanced",
    progressByDate: {},
    completedDates: [],
    savedDates: [],
  };
}

export function parseNowState(raw: string | null): NowState {
  if (!raw || raw.length > MAX_STORAGE_BYTES) return createEmptyNowState();

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return createEmptyNowState();

    const progressByDate: Record<string, NowProgressStepId[]> = {};
    if (isRecord(value.progressByDate)) {
      const validEntries = Object.entries(value.progressByDate)
        .filter(([date, steps]) => isIsoDate(date) && Array.isArray(steps))
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(-MAX_PROGRESS_DATES);

      for (const [date, steps] of validEntries) {
        const sanitized = unique((steps as unknown[]).filter(isProgressStepId)).slice(0, NOW_PROGRESS_STEPS.length);
        if (sanitized.length > 0) progressByDate[date] = sanitized;
      }
    }

    return {
      version: 2,
      mode: isModeId(value.mode) ? value.mode : "balanced",
      progressByDate,
      completedDates: sanitizeDateList(value.completedDates, MAX_COMPLETED_DATES),
      savedDates: sanitizeDateList(value.savedDates, MAX_SAVED_DATES),
    };
  } catch {
    return createEmptyNowState();
  }
}

export function serializeNowState(state: NowState): string {
  return JSON.stringify(state);
}

export function shiftIsoDate(iso: string, deltaDays: number): string {
  if (!isIsoDate(iso)) throw new Error("Invalid ISO date");
  const safeDelta = Number.isFinite(deltaDays) ? Math.trunc(deltaDays) : 0;
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + safeDelta * DAY_MS).toISOString().slice(0, 10);
}

export function getKstDay(now = new Date(), offsetDays = 0): KstDay {
  const safeOffset = Number.isFinite(offsetDays) ? Math.max(0, Math.trunc(offsetDays)) : 0;
  const shifted = new Date(now.getTime() + KST_OFFSET_MS - safeOffset * DAY_MS);
  const iso = shifted.toISOString().slice(0, 10);
  const serial = Math.floor(Date.parse(`${iso}T00:00:00.000Z`) / DAY_MS);
  const labelDate = new Date(`${iso}T03:00:00.000Z`);

  return {
    iso,
    label: fullDateFormatter.format(labelDate),
    shortLabel: shortDateFormatter.format(labelDate),
    index: Math.abs(serial) % DAILY_THEMES.length,
  };
}

export function getThemeForDay(day: KstDay): DailyTheme {
  return DAILY_THEMES[day.index] ?? DAILY_THEMES[0]!;
}

export function getMode(modeId: NowModeId): DirectingMode {
  return NOW_MODES.find((mode) => mode.id === modeId) ?? NOW_MODES[0];
}

export function buildStoryBeats(theme: DailyTheme, mode: DirectingMode): StoryBeat[] {
  const [firstSound = "주변의 정적", secondSound = firstSound, thirdSound = secondSound] = theme.sound;
  return [
    {
      id: "establish",
      label: "1컷",
      title: "공간의 규칙",
      body: `${theme.place}. ${mode.beatDirectives[0]}`,
    },
    {
      id: "clue",
      label: "2컷",
      title: "평범해 보이는 단서",
      body: `${theme.object}을(를) 장면 안에 놓습니다. ${mode.beatDirectives[1]}`,
    },
    {
      id: "shift",
      label: "3컷",
      title: "감각의 변화",
      body: `${theme.light}, 그리고 ‘${firstSound}’. ${mode.beatDirectives[2]}`,
    },
    {
      id: "choice",
      label: "4컷",
      title: "선택과 재해석",
      body: `‘${secondSound}’ 뒤에 인물의 행동을 배치합니다. ${mode.beatDirectives[3]}`,
    },
    {
      id: "afterimage",
      label: "5컷",
      title: "남는 이미지",
      body: `‘${thirdSound}’만 남은 뒤, ${mode.beatDirectives[4]}`,
    },
  ];
}

export function calculateStreak(completedDates: readonly string[], todayIso: string): number {
  if (!isIsoDate(todayIso)) return 0;
  const completed = new Set(completedDates.filter(isIsoDate));
  let cursor = completed.has(todayIso) ? todayIso : shiftIsoDate(todayIso, -1);
  let streak = 0;

  while (completed.has(cursor) && streak < MAX_COMPLETED_DATES) {
    streak += 1;
    cursor = shiftIsoDate(cursor, -1);
  }

  return streak;
}

export function formatTimer(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function makeBriefText(day: KstDay, theme: DailyTheme, mode: DirectingMode): string {
  const beats = buildStoryBeats(theme, mode)
    .map((beat) => `${beat.label} ${beat.title}: ${beat.body}`)
    .join("\n");

  return [
    `ToonStudio 오늘의 영감 · ${day.label}`,
    "",
    theme.title,
    theme.tagline,
    "",
    `사물: ${theme.object}`,
    `공간: ${theme.place}`,
    `빛: ${theme.light}`,
    `소리: ${theme.sound.join(" · ")}`,
    `무드: ${theme.moods.map((mood) => `#${mood}`).join(" ")}`,
    "",
    `5컷 미션: ${theme.mission}`,
    `연출 모드: ${mode.label} — ${mode.note}`,
    "",
    beats,
    "",
    "https://www.toonstudio.cloud/now",
  ].join("\n");
}
