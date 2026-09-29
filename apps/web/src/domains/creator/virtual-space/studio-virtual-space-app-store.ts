/**
 * 가상공간 앱 스토어(D-5) 순수 도메인 로직.
 *
 * ZEP식 앱 스토어 아이디어를 참고한 미니 앱 카탈로그: 공간에 설치해 실행하는
 * 작은 앱들의 레지스트리, 설치/제거, 세션 생성, 앱별 미니 로직을 제공한다.
 * 실제 iframe 샌드박스 임베드는 후속 티켓(E-4) 범위이며, 1차는 로컬 상태만 다룬다.
 *
 * 모든 텍스트는 readonly [ko, en] 튜플로 보관하고, 화면 표시는 컴포넌트에서
 * useBilingual()의 bt(...tuple)로 해결한다.
 */

export type StudioVirtualSpaceAppId = "conte-template-pack" | "drawing-quiz" | "pose-challenge";

export type StudioVirtualSpaceAppCategory = "template" | "quiz" | "challenge";

export interface StudioVirtualSpaceApp {
  readonly id: StudioVirtualSpaceAppId;
  readonly name: readonly [ko: string, en: string];
  readonly description: readonly [ko: string, en: string];
  readonly icon: "conte" | "quiz" | "pose";
  readonly category: StudioVirtualSpaceAppCategory;
}

export const STUDIO_VIRTUAL_SPACE_APP_CATEGORY_LABELS: Readonly<
  Record<StudioVirtualSpaceAppCategory, readonly [ko: string, en: string]>
> = {
  template: ["템플릿", "Templates"],
  quiz: ["퀴즈", "Quiz"],
  challenge: ["챌린지", "Challenge"],
};

const STUDIO_VIRTUAL_SPACE_APP_REGISTRY: readonly StudioVirtualSpaceApp[] = [
  {
    id: "conte-template-pack",
    name: ["콘티 템플릿 팩", "Storyboard Template Pack"],
    description: [
      "콘티 컷 구성 템플릿 목록을 제공합니다. 컷 분할 전 빠르게 골라 쓰세요.",
      "Provides storyboard panel layout templates. Pick one before splitting your cuts.",
    ],
    icon: "conte",
    category: "template",
  },
  {
    id: "drawing-quiz",
    name: ["작화 퀴즈", "Drawing Quiz"],
    description: [
      "작화 기초 객관식 퀴즈를 출제하고 바로 채점합니다.",
      "Serves drawing-fundamentals multiple-choice quizzes and grades them instantly.",
    ],
    icon: "quiz",
    category: "quiz",
  },
  {
    id: "pose-challenge",
    name: ["포즈 챌린지", "Pose Challenge"],
    description: [
      "포즈 주제를 뽑고 제한 시간 안에 그려보는 챌린지입니다.",
      "Draw a random pose prompt against the clock.",
    ],
    icon: "pose",
    category: "challenge",
  },
];

/** 스토어에 진열된 앱 전체를 반환한다. */
export function listStoreApps(): readonly StudioVirtualSpaceApp[] {
  return STUDIO_VIRTUAL_SPACE_APP_REGISTRY;
}

export function findStoreApp(appId: string): StudioVirtualSpaceApp | null {
  return STUDIO_VIRTUAL_SPACE_APP_REGISTRY.find((app) => app.id === appId) ?? null;
}

export type StudioVirtualSpaceInstallError = "unknown-app" | "already-installed";

export type StudioVirtualSpaceInstallResult =
  | { readonly ok: true; readonly installedAppIds: readonly string[] }
  | { readonly ok: false; readonly reason: StudioVirtualSpaceInstallError };

/**
 * 앱을 설치한다. 이미 설치된 앱은 거부한다(중복 설치 불가).
 * 입력 배열은 변경하지 않고 새 배열을 반환한다.
 */
export function installApp(
  installedAppIds: readonly string[],
  appId: string,
): StudioVirtualSpaceInstallResult {
  if (!findStoreApp(appId)) return { ok: false, reason: "unknown-app" };
  if (installedAppIds.includes(appId)) return { ok: false, reason: "already-installed" };
  return { ok: true, installedAppIds: [...installedAppIds, appId] };
}

export type StudioVirtualSpaceUninstallResult =
  | { readonly ok: true; readonly installedAppIds: readonly string[] }
  | { readonly ok: false; readonly reason: "unknown-app" | "not-installed" };

/** 앱을 제거한다. 설치되지 않은 앱의 제거는 거부한다. */
export function uninstallApp(
  installedAppIds: readonly string[],
  appId: string,
): StudioVirtualSpaceUninstallResult {
  if (!findStoreApp(appId)) return { ok: false, reason: "unknown-app" };
  if (!installedAppIds.includes(appId)) return { ok: false, reason: "not-installed" };
  return { ok: true, installedAppIds: installedAppIds.filter((id) => id !== appId) };
}

export interface StudioVirtualSpaceAppSession {
  readonly sessionId: string;
  readonly appId: StudioVirtualSpaceAppId;
  readonly startedAt: string;
}

export type StudioVirtualSpaceLaunchResult =
  | { readonly ok: true; readonly session: StudioVirtualSpaceAppSession }
  | { readonly ok: false; readonly reason: "unknown-app" | "not-installed" };

export interface StudioVirtualSpaceSessionIssue {
  readonly sessionId?: string;
  readonly startedAt?: string;
}

/**
 * 설치된 앱의 실행 세션을 생성한다. sessionId/startedAt를 주입하면
 * 테스트에서 결정적으로 검증할 수 있다.
 */
export function launchAppSession(
  installedAppIds: readonly string[],
  appId: string,
  issued?: StudioVirtualSpaceSessionIssue,
): StudioVirtualSpaceLaunchResult {
  const app = findStoreApp(appId);
  if (!app) return { ok: false, reason: "unknown-app" };
  if (!installedAppIds.includes(appId)) return { ok: false, reason: "not-installed" };
  return {
    ok: true,
    session: {
      sessionId:
        issued?.sessionId ??
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `session-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`),
      appId: app.id,
      startedAt: issued?.startedAt ?? new Date().toISOString(),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 콘티 템플릿 팩                                                       */
/* ------------------------------------------------------------------ */

export interface StudioVirtualSpaceConteTemplate {
  readonly id: string;
  readonly name: readonly [ko: string, en: string];
  readonly description: readonly [ko: string, en: string];
  readonly panelCount: number;
}

const STUDIO_VIRTUAL_SPACE_CONTE_TEMPLATES: readonly StudioVirtualSpaceConteTemplate[] = [
  {
    id: "conte-basic-4",
    name: ["기본 4컷", "Basic 4 panels"],
    description: ["기승전결이 또렷한 표준 4컷 구성.", "A classic 4-panel setup with a clear story arc."],
    panelCount: 4,
  },
  {
    id: "conte-impact-splash",
    name: ["임팩트 스플래시", "Impact splash"],
    description: ["전면 컷 하나로 감정을 폭발시키는 구성.", "One full-page splash cut for maximum impact."],
    panelCount: 1,
  },
  {
    id: "conte-dialogue-duo",
    name: ["대화 2인 샷", "Dialogue two-shot"],
    description: ["두 인물의 대화를 주고받는 3컷 구성.", "Three cuts trading dialogue between two characters."],
    panelCount: 3,
  },
  {
    id: "conte-action-sequence",
    name: ["액션 시퀀스", "Action sequence"],
    description: ["동작의 흐름을 잇는 6컷 액션 구성.", "Six linked cuts tracing a full action sequence."],
    panelCount: 6,
  },
  {
    id: "conte-montage-strip",
    name: ["몽타주 스트립", "Montage strip"],
    description: ["시간 경과를 압축하는 가로 스트립 5컷.", "A five-cut horizontal strip compressing elapsed time."],
    panelCount: 5,
  },
];

/** 콘티 템플릿 팩이 제공하는 컷 템플릿 목록. */
export function listConteTemplates(): readonly StudioVirtualSpaceConteTemplate[] {
  return STUDIO_VIRTUAL_SPACE_CONTE_TEMPLATES;
}

/* ------------------------------------------------------------------ */
/* 작화 퀴즈                                                            */
/* ------------------------------------------------------------------ */

export interface StudioVirtualSpaceQuizQuestion {
  readonly id: string;
  readonly prompt: readonly [ko: string, en: string];
  readonly choices: readonly (readonly [ko: string, en: string])[];
  readonly answerIndex: number;
}

const STUDIO_VIRTUAL_SPACE_QUIZ_QUESTIONS: readonly StudioVirtualSpaceQuizQuestion[] = [
  {
    id: "quiz-line-weight",
    prompt: ["인물의 윤곽선을 그릴 때 가장 기본이 되는 선의 굵기 조절 원칙은?", "What is the basic principle of line weight when drawing a character's outline?"],
    choices: [
      ["모든 선을 같은 굵기로 그린다", "Draw every line with the same weight"],
      ["빛 받는 면은 얇게, 그림자 면은 굵게", "Thin lines on lit sides, thick lines on shadow sides"],
      ["배경만 굵게 그린다", "Only draw the background thick"],
      ["선 굵기는 의미가 없다", "Line weight does not matter"],
    ],
    answerIndex: 1,
  },
  {
    id: "quiz-perspective",
    prompt: ["1점 투시에서 소실점은 어디에 위치하는가?", "Where is the vanishing point in one-point perspective?"],
    choices: [
      ["화면의 정중앙 고정", "Always fixed at the center of the frame"],
      ["수평선 위의 한 점", "A single point on the horizon line"],
      ["화면 바깥에만 존재", "Only exists outside the frame"],
      ["인물의 눈 위치", "At the character's eye level"],
    ],
    answerIndex: 1,
  },
  {
    id: "quiz-face-ratio",
    prompt: ["정면 얼굴을 그릴 때 눈의 위치로 적절한 것은?", "Where should the eyes sit when drawing a front-facing head?"],
    choices: [
      ["얼굴 세로 길이의 약 1/2 지점", "About halfway down the head's height"],
      ["이마 바로 아래", "Right below the forehead"],
      ["코와 같은 높이", "Level with the nose"],
      ["턱 바로 위", "Right above the chin"],
    ],
    answerIndex: 0,
  },
  {
    id: "quiz-screentone",
    prompt: ["스크린톤을 붙일 때 가장 먼저 정해야 하는 것은?", "What should you decide first when applying screentones?"],
    choices: [
      ["톤의 번호", "The tone number"],
      ["광원의 방향", "The direction of the light source"],
      ["종이의 질감", "The paper texture"],
      ["펜의 종류", "The type of pen"],
    ],
    answerIndex: 1,
  },
  {
    id: "quiz-foreshortening",
    prompt: ["팔을 화면 정면으로 뻗은 포즈에서 팔이 짧아 보이는 현상은?", "What is the phenomenon where an arm reaching toward the viewer looks shorter?"],
    choices: [
      ["원근 단축", "Foreshortening"],
      ["어안 왜곡", "Fisheye distortion"],
      ["모션 블러", "Motion blur"],
      ["색수차", "Chromatic aberration"],
    ],
    answerIndex: 0,
  },
];

/** 작화 퀴즈 문항 목록. */
export function listQuizQuestions(): readonly StudioVirtualSpaceQuizQuestion[] {
  return STUDIO_VIRTUAL_SPACE_QUIZ_QUESTIONS;
}

export interface StudioVirtualSpaceQuizGrade {
  readonly score: number;
  readonly total: number;
  readonly correctQuestionIds: readonly string[];
}

/**
 * 객관식 답안을 채점한다. answers[i]는 i번째 문항에 고른 선택지 인덱스이며,
 * 길이가 문항 수와 다르면 부족한 답은 오답, 남는 답은 무시한다.
 */
export function gradeQuiz(answers: readonly number[]): StudioVirtualSpaceQuizGrade {
  const questions = STUDIO_VIRTUAL_SPACE_QUIZ_QUESTIONS;
  const correctQuestionIds = questions
    .filter((question, index) => answers[index] === question.answerIndex)
    .map((question) => question.id);
  return { score: correctQuestionIds.length, total: questions.length, correctQuestionIds };
}

/* ------------------------------------------------------------------ */
/* 포즈 챌린지                                                           */
/* ------------------------------------------------------------------ */

export interface StudioVirtualSpacePosePrompt {
  readonly id: string;
  readonly prompt: readonly [ko: string, en: string];
  readonly durationSec: number;
}

const STUDIO_VIRTUAL_SPACE_POSE_PROMPTS: readonly StudioVirtualSpacePosePrompt[] = [
  { id: "pose-run", prompt: ["전력 질주하는 러너", "Sprinter at full speed"], durationSec: 60 },
  { id: "pose-sit-think", prompt: ["턱을 괴고 생각에 잠긴 채 앉기", "Sitting deep in thought, chin in hand"], durationSec: 90 },
  { id: "pose-jump", prompt: ["하늘 높이 점프하며 팔 벌리기", "Jumping high with arms spread wide"], durationSec: 60 },
  { id: "pose-sword", prompt: ["검을 뽑아 드는 결투 자세", "Drawing a sword in a duelist stance"], durationSec: 120 },
  { id: "pose-dance", prompt: ["한 발로 서서 턴하는 댄서", "Dancer turning on one foot"], durationSec: 90 },
  { id: "pose-carry", prompt: ["무거운 상자를 들고 비틀거리기", "Staggering under a heavy box"], durationSec: 90 },
  { id: "pose-bow", prompt: ["깊이 허리 숙여 인사하기", "Bowing deeply at the waist"], durationSec: 60 },
  { id: "pose-climb", prompt: ["벽을 기어오르는 클라이머", "Climber scaling a wall"], durationSec: 120 },
];

/** 포즈 주제 목록. */
export function listPosePrompts(): readonly StudioVirtualSpacePosePrompt[] {
  return STUDIO_VIRTUAL_SPACE_POSE_PROMPTS;
}

/** 결정적 시드 기반 난수 생성기(mulberry32). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), state | 1) + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 7), state | 61) ^ state;
    mixed ^= mixed >>> 14;
    return (mixed >>> 0) / 4294967296;
  };
}

/**
 * 시드로 포즈 주제를 하나 뽑는다. 같은 시드는 항상 같은 주제를 반환한다.
 * 시드를 생략하면 현재 시각 기반 시드를 사용한다.
 */
export function drawPosePrompt(seed: number = Date.now()): StudioVirtualSpacePosePrompt {
  const prompts = STUDIO_VIRTUAL_SPACE_POSE_PROMPTS;
  const random = mulberry32(seed);
  const index = Math.min(Math.floor(random() * prompts.length), prompts.length - 1);
  const picked = prompts[index];
  if (!picked) throw new Error("포즈 주제 목록이 비어 있습니다.");
  return picked;
}
