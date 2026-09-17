export const WEBTOON_STARTING_POINTS = [
  {
    id: "idea",
    labelKo: "아이디어만 있어요",
    labelEn: "I only have an idea",
    descriptionKo: "로그라인과 작품 콘셉트부터 정리합니다.",
    descriptionEn: "Start with a logline and series concept.",
  },
  {
    id: "synopsis",
    labelKo: "시놉시스가 있어요",
    labelEn: "I have a synopsis",
    descriptionKo: "시리즈 바이블과 시즌 구조로 발전시킵니다.",
    descriptionEn: "Turn it into a series bible and season map.",
  },
  {
    id: "source-ip",
    labelKo: "원작을 각색해요",
    labelEn: "I am adapting existing IP",
    descriptionKo: "권리 확인과 각색 방향부터 시작합니다.",
    descriptionEn: "Begin with rights and adaptation scope.",
  },
  {
    id: "script",
    labelKo: "대본·글콘티가 있어요",
    labelEn: "I have a script",
    descriptionKo: "대본 잠금과 그림콘티 준비부터 이어갑니다.",
    descriptionEn: "Continue with script lock and storyboard prep.",
  },
  {
    id: "storyboard",
    labelKo: "그림콘티가 있어요",
    labelEn: "I have a storyboard",
    descriptionKo: "공정 분해와 작화 배정부터 시작합니다.",
    descriptionEn: "Start with production breakdown and assignments.",
  },
  {
    id: "finished-art",
    labelKo: "완성 원고가 있어요",
    labelEn: "I have finished artwork",
    descriptionKo: "모바일 검수와 플랫폼 출력부터 진행합니다.",
    descriptionEn: "Begin with mobile QA and delivery preflight.",
  },
  {
    id: "serializing",
    labelKo: "이미 연재 중이에요",
    labelEn: "The series is already publishing",
    descriptionKo: "기존 회차·버퍼·팀 일정을 가져와 운영합니다.",
    descriptionEn: "Migrate episodes, buffer and the live schedule.",
  },
] as const;

export const WEBTOON_ONBOARDING_GOALS = [
  { id: "independent", labelKo: "독립 연재", labelEn: "Independent publishing" },
  { id: "pitch", labelKo: "공모전·플랫폼 피칭", labelEn: "Contest or platform pitch" },
  { id: "contracted", labelKo: "계약 작품 제작", labelEn: "Contracted production" },
  { id: "team", labelKo: "팀 제작 운영", labelEn: "Team production" },
  { id: "migration", labelKo: "기존 연재 이전", labelEn: "Migrate a live series" },
] as const;

export const WEBTOON_TEAM_MODELS = [
  { id: "solo", labelKo: "혼자 제작", labelEn: "Solo creator" },
  { id: "assistant", labelKo: "작가 + 어시스턴트", labelEn: "Creator + assistants" },
  { id: "small-team", labelKo: "3~5명 제작팀", labelEn: "3–5 person team" },
  { id: "studio", labelKo: "공정별 스튜디오", labelEn: "Studio pipeline" },
] as const;

export const WEBTOON_CADENCES = [
  { id: "weekly", labelKo: "주간", labelEn: "Weekly" },
  { id: "biweekly", labelKo: "격주", labelEn: "Biweekly" },
  { id: "monthly", labelKo: "월간", labelEn: "Monthly" },
  { id: "undecided", labelKo: "아직 미정", labelEn: "Not decided" },
] as const;

export type WebtoonStartingPointId = (typeof WEBTOON_STARTING_POINTS)[number]["id"];
export type WebtoonOnboardingGoalId = (typeof WEBTOON_ONBOARDING_GOALS)[number]["id"];
export type WebtoonTeamModelId = (typeof WEBTOON_TEAM_MODELS)[number]["id"];
export type WebtoonCadenceId = (typeof WEBTOON_CADENCES)[number]["id"];

export interface WebtoonOnboardingSelection {
  readonly startingPoint: WebtoonStartingPointId;
  readonly goal: WebtoonOnboardingGoalId;
  readonly teamModel: WebtoonTeamModelId;
  readonly cadence: WebtoonCadenceId;
}

export interface WebtoonOnboardingPlan {
  readonly titleKo: string;
  readonly titleEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly milestoneKo: string;
  readonly milestoneEn: string;
  readonly section: "story" | "production" | "export";
  readonly view: "overview" | "episodes" | "script" | "board" | "pipeline" | "preflight";
  readonly tasksKo: readonly string[];
  readonly tasksEn: readonly string[];
}

export interface StudioWebtoonOnboardingProfile extends WebtoonOnboardingSelection {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedTaskIds: readonly string[];
  readonly completedAt: string | null;
}

export interface WebtoonOnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const DEFAULT_WEBTOON_ONBOARDING_SELECTION: WebtoonOnboardingSelection = Object.freeze({
  startingPoint: "idea",
  goal: "independent",
  teamModel: "solo",
  cadence: "undecided",
});

const STARTING_POINT_IDS = new Set<string>(WEBTOON_STARTING_POINTS.map((item) => item.id));
const GOAL_IDS = new Set<string>(WEBTOON_ONBOARDING_GOALS.map((item) => item.id));
const TEAM_IDS = new Set<string>(WEBTOON_TEAM_MODELS.map((item) => item.id));
const CADENCE_IDS = new Set<string>(WEBTOON_CADENCES.map((item) => item.id));
const PROFILE_PREFIX = "toonstudio:webtoon-onboarding:v1:";

function oneOf<T extends string>(value: string | null, allowed: ReadonlySet<string>, fallback: T): T {
  return allowed.has(value ?? "") ? value as T : fallback;
}

function validProjectId(value: string): boolean {
  return value.trim() === value && value.length > 0 && value.length <= 160 && !/[\\/?#]/u.test(value);
}

function dedupe(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

export function hasWebtoonOnboardingIntent(params: URLSearchParams): boolean {
  return params.get("onboarding") === "production"
    || ["start", "goal", "team", "cadence"].some((key) => params.has(key));
}

export function webtoonOnboardingSelectionFromSearchParams(
  params: URLSearchParams,
): WebtoonOnboardingSelection | null {
  if (!hasWebtoonOnboardingIntent(params)) return null;
  return Object.freeze({
    startingPoint: oneOf(params.get("start"), STARTING_POINT_IDS, "idea"),
    goal: oneOf(params.get("goal"), GOAL_IDS, "independent"),
    teamModel: oneOf(params.get("team"), TEAM_IDS, "solo"),
    cadence: oneOf(params.get("cadence"), CADENCE_IDS, "undecided"),
  });
}

export function webtoonOnboardingStartHref(selection: WebtoonOnboardingSelection): string {
  const params = new URLSearchParams({
    cadence: selection.cadence,
    goal: selection.goal,
    kind: "webtoon",
    onboarding: "production",
    start: selection.startingPoint,
    team: selection.teamModel,
  });
  params.sort();
  return `/studio/new?${params.toString()}`;
}

export function buildWebtoonOnboardingPlan(selection: WebtoonOnboardingSelection): WebtoonOnboardingPlan {
  const byStartingPoint: Record<WebtoonStartingPointId, Omit<WebtoonOnboardingPlan, "tasksKo" | "tasksEn"> & {
    tasksKo: readonly string[];
    tasksEn: readonly string[];
  }> = {
    idea: {
      titleKo: "콘셉트 개발 트랙",
      titleEn: "Concept development track",
      summaryKo: "아이디어를 연재 가능한 작품 구조로 구체화합니다.",
      summaryEn: "Turn the idea into a serial-ready structure.",
      milestoneKo: "로그라인과 작품 콘셉트 승인",
      milestoneEn: "Approve the logline and series concept",
      section: "story",
      view: "overview",
      tasksKo: ["로그라인 작성", "핵심 독자·장르 정의", "주인공 목표와 갈등 정리", "비교 작품과 차별점 기록"],
      tasksEn: ["Write a logline", "Define audience and genre", "Define the lead goal and conflict", "Record comparable titles and differentiation"],
    },
    synopsis: {
      titleKo: "시리즈 개발 트랙",
      titleEn: "Series development track",
      summaryKo: "시놉시스를 시리즈 바이블과 시즌 구조로 확장합니다.",
      summaryEn: "Expand the synopsis into a series bible and season map.",
      milestoneKo: "시리즈 바이블과 시즌 맵 승인",
      milestoneEn: "Approve the series bible and season map",
      section: "story",
      view: "episodes",
      tasksKo: ["시놉시스 구조 점검", "캐릭터·세계관 기준 작성", "시즌 전환점 배치", "초기 3화 목표와 훅 정리"],
      tasksEn: ["Review synopsis structure", "Create character and world rules", "Place season turning points", "Plan goals and hooks for the first three episodes"],
    },
    "source-ip": {
      titleKo: "원작 각색 트랙",
      titleEn: "IP adaptation track",
      summaryKo: "권리 범위와 각색 기준을 확인한 뒤 회차 구조를 다시 설계합니다.",
      summaryEn: "Confirm rights and adaptation rules before rebuilding the episode structure.",
      milestoneKo: "권리 확인과 각색 방향 승인",
      milestoneEn: "Approve rights and adaptation direction",
      section: "story",
      view: "overview",
      tasksKo: ["원작·웹툰화 권리 확인", "각색 가능 범위 기록", "원작 사건을 시즌·회차로 재배열", "변경·삭제·추가 설정 합의"],
      tasksEn: ["Confirm source and adaptation rights", "Record adaptation scope", "Remap source events into seasons and episodes", "Agree on changed, removed and added elements"],
    },
    script: {
      titleKo: "대본 잠금 트랙",
      titleEn: "Script lock track",
      summaryKo: "회차 목적과 제작량을 검토하고 그림콘티로 넘길 기준을 확정합니다.",
      summaryEn: "Validate episode purpose and scope, then prepare a storyboard-ready script.",
      milestoneKo: "첫 회차 대본 잠금",
      milestoneEn: "Lock the first episode script",
      section: "story",
      view: "script",
      tasksKo: ["회차 목표·감정 변화 확인", "장면·대사 편집", "예상 컷과 고난도 장면 표시", "대본 검토자와 잠금 기준 지정"],
      tasksEn: ["Confirm episode goal and emotional change", "Edit scenes and dialogue", "Mark panel count and costly scenes", "Assign reviewer and script-lock criteria"],
    },
    storyboard: {
      titleKo: "작화 준비 트랙",
      titleEn: "Art production setup track",
      summaryKo: "콘티를 공정과 담당자 단위로 분해해 제작을 시작합니다.",
      summaryEn: "Break the storyboard into stages and assignments for production.",
      milestoneKo: "콘티 잠금과 공정 배정",
      milestoneEn: "Lock the storyboard and assign production",
      section: "production",
      view: "board",
      tasksKo: ["모바일 시선 흐름 검수", "신규 배경·소품 목록 작성", "컷별 공정과 담당자 배정", "콘티 잠금 이후 변경 규칙 합의"],
      tasksEn: ["Review mobile reading flow", "List new backgrounds and props", "Assign stages and owners per panel", "Agree on post-lock change rules"],
    },
    "finished-art": {
      titleKo: "출판 준비 트랙",
      titleEn: "Publishing readiness track",
      summaryKo: "완성 원고를 모바일·기술·권리 기준으로 검수해 납품 패키지를 만듭니다.",
      summaryEn: "Audit finished pages for mobile, technical and rights readiness.",
      milestoneKo: "플랫폼 사전검사 통과",
      milestoneEn: "Pass platform preflight",
      section: "export",
      view: "preflight",
      tasksKo: ["모바일 전체 스크롤 검수", "오탈자·식자·이미지 누락 점검", "출력 규격·용량 확인", "썸네일·회차 정보 준비"],
      tasksEn: ["Review the full mobile scroll", "Check lettering and missing images", "Validate output dimensions and size", "Prepare thumbnail and episode metadata"],
    },
    serializing: {
      titleKo: "연재 운영 이전 트랙",
      titleEn: "Live-series migration track",
      summaryKo: "공개·예약·제작 중 회차와 버퍼를 한 롤링 파이프라인으로 옮깁니다.",
      summaryEn: "Move published, scheduled and in-production episodes into one rolling pipeline.",
      milestoneKo: "연재 현황과 버퍼 기준선 확정",
      milestoneEn: "Establish the live schedule and buffer baseline",
      section: "production",
      view: "pipeline",
      tasksKo: ["기존 회차 상태 가져오기", "공정별 담당자·처리량 등록", "버퍼와 마감 위험 계산", "휴재·긴급 수정 대응 규칙 작성"],
      tasksEn: ["Import current episode states", "Register owners and stage capacity", "Calculate buffer and deadline risk", "Define hiatus and emergency-fix rules"],
    },
  };

  const base = byStartingPoint[selection.startingPoint];
  const extraKo = [
    selection.goal === "pitch" ? "피치 패키지 필수 산출물 확인" : null,
    selection.goal === "contracted" ? "계약상 납품·검수 기준 등록" : null,
    selection.goal === "team" ? "역할·승인자·파일 규칙 합의" : null,
    selection.goal === "migration" ? "기존 일정·파일·버전 이관" : null,
    selection.teamModel !== "solo" ? "팀 초대와 역할별 권한 설정" : null,
    selection.cadence !== "undecided" ? `${WEBTOON_CADENCES.find((item) => item.id === selection.cadence)?.labelKo ?? "연재"} 마감 역산` : "지속 가능한 연재 주기 계산",
  ].filter((value): value is string => Boolean(value));
  const extraEn = [
    selection.goal === "pitch" ? "Verify pitch-package deliverables" : null,
    selection.goal === "contracted" ? "Register contractual delivery and review rules" : null,
    selection.goal === "team" ? "Agree on roles, approvers and file rules" : null,
    selection.goal === "migration" ? "Migrate schedules, files and versions" : null,
    selection.teamModel !== "solo" ? "Invite the team and set role permissions" : null,
    selection.cadence !== "undecided" ? `Back-plan the ${WEBTOON_CADENCES.find((item) => item.id === selection.cadence)?.labelEn ?? "publishing"} deadline` : "Calculate a sustainable publishing cadence",
  ].filter((value): value is string => Boolean(value));

  return Object.freeze({
    ...base,
    tasksKo: dedupe([...base.tasksKo, ...extraKo]).slice(0, 8),
    tasksEn: dedupe([...base.tasksEn, ...extraEn]).slice(0, 8),
  });
}

export function webtoonOnboardingProjectHref(
  projectId: string,
  selection: WebtoonOnboardingSelection,
): string {
  if (!validProjectId(projectId)) throw new Error("A valid project id is required.");
  const plan = buildWebtoonOnboardingPlan(selection);
  const params = new URLSearchParams({ view: plan.view });
  return `/studio/p/${encodeURIComponent(projectId)}/${plan.section}?${params.toString()}`;
}

export function createStudioWebtoonOnboardingProfile(
  projectId: string,
  selection: WebtoonOnboardingSelection,
  createdAt = new Date().toISOString(),
): StudioWebtoonOnboardingProfile {
  if (!validProjectId(projectId)) throw new Error("A valid project id is required.");
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("A valid onboarding timestamp is required.");
  return Object.freeze({
    schemaVersion: 1,
    projectId,
    ...selection,
    createdAt,
    updatedAt: createdAt,
    completedTaskIds: Object.freeze([]),
    completedAt: null,
  });
}

function profileKey(projectId: string): string {
  if (!validProjectId(projectId)) throw new Error("A valid project id is required.");
  return `${PROFILE_PREFIX}${projectId}`;
}

function isProfile(value: unknown, projectId: string): value is StudioWebtoonOnboardingProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<StudioWebtoonOnboardingProfile>;
  return profile.schemaVersion === 1
    && profile.projectId === projectId
    && STARTING_POINT_IDS.has(profile.startingPoint ?? "")
    && GOAL_IDS.has(profile.goal ?? "")
    && TEAM_IDS.has(profile.teamModel ?? "")
    && CADENCE_IDS.has(profile.cadence ?? "")
    && typeof profile.createdAt === "string"
    && Number.isFinite(Date.parse(profile.createdAt))
    && typeof profile.updatedAt === "string"
    && Number.isFinite(Date.parse(profile.updatedAt))
    && Array.isArray(profile.completedTaskIds)
    && profile.completedTaskIds.every((id) => typeof id === "string")
    && (profile.completedAt === null || (typeof profile.completedAt === "string" && Number.isFinite(Date.parse(profile.completedAt))));
}

export function readStudioWebtoonOnboardingProfile(
  storage: WebtoonOnboardingStorage,
  projectId: string,
): StudioWebtoonOnboardingProfile | null {
  try {
    const raw = storage.getItem(profileKey(projectId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isProfile(parsed, projectId)) return null;
    return Object.freeze({
      ...parsed,
      completedTaskIds: Object.freeze(dedupe(parsed.completedTaskIds)),
    });
  } catch {
    return null;
  }
}

export function writeStudioWebtoonOnboardingProfile(
  storage: WebtoonOnboardingStorage,
  profile: StudioWebtoonOnboardingProfile,
): StudioWebtoonOnboardingProfile {
  if (!isProfile(profile, profile.projectId)) throw new Error("A valid webtoon onboarding profile is required.");
  storage.setItem(profileKey(profile.projectId), JSON.stringify(profile));
  return profile;
}

export function toggleStudioWebtoonOnboardingTask(
  profile: StudioWebtoonOnboardingProfile,
  taskId: string,
  updatedAt = new Date().toISOString(),
): StudioWebtoonOnboardingProfile {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) throw new Error("A valid onboarding task id is required.");
  const selected = new Set(profile.completedTaskIds);
  if (selected.has(normalizedTaskId)) selected.delete(normalizedTaskId);
  else selected.add(normalizedTaskId);
  return Object.freeze({
    ...profile,
    completedTaskIds: Object.freeze([...selected]),
    completedAt: null,
    updatedAt,
  });
}

export function completeStudioWebtoonOnboarding(
  profile: StudioWebtoonOnboardingProfile,
  completedAt = new Date().toISOString(),
): StudioWebtoonOnboardingProfile {
  return Object.freeze({ ...profile, completedAt, updatedAt: completedAt });
}
