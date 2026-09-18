export const CREATOR_ROLE_PROFILE_VERSION = 1 as const;
export const CREATOR_ROLE_MAX_SECONDARY = 5;
export const CREATOR_ROLE_MAX_SPECIALTIES = 12;

export const CREATOR_ROLE_IDS = [
  "creator",
  "story",
  "planner",
  "storyboard",
  "line-art",
  "background",
  "color",
  "lettering",
  "character",
  "three-d",
  "educator",
  "assistant",
  "editor",
  "producer",
  "localization",
  "reviewer",
] as const;

export type CreatorRoleId = (typeof CREATOR_ROLE_IDS)[number];
export type CreatorRoleGroup = "story" | "art" | "support" | "production";
export type CreatorRoleLens = "story" | "art" | "producer";
export type CreatorRoleLocale = "ko" | "en";

export const CREATOR_STAGE_IDS = [
  "student",
  "hobbyist",
  "aspiring",
  "professional",
  "studio",
  "educator",
  "other",
] as const;
export type CreatorStage = (typeof CREATOR_STAGE_IDS)[number];

export const CREATOR_EXPERIENCE_LEVELS = ["beginner", "experienced", "professional"] as const;
export type CreatorExperienceLevel = (typeof CREATOR_EXPERIENCE_LEVELS)[number];

export const CREATOR_COLLABORATION_STATUSES = ["available", "limited", "unavailable"] as const;
export type CreatorCollaborationStatus = (typeof CREATOR_COLLABORATION_STATUSES)[number];

export const CREATOR_SPECIALTY_IDS = [
  "world-building",
  "plot",
  "dialogue",
  "adaptation",
  "episode-planning",
  "storyboard",
  "scroll-direction",
  "composition",
  "character-design",
  "line-art",
  "inking",
  "background-2d",
  "background-3d",
  "prop-design",
  "flat-color",
  "rendering",
  "effects",
  "retouching",
  "lettering",
  "balloon",
  "sound-effects",
  "production-schedule",
  "budget",
  "quality-control",
  "editing",
  "proofing",
  "localization",
  "file-cleanup",
] as const;

export type CreatorSpecialtyId = (typeof CREATOR_SPECIALTY_IDS)[number];

export interface LocalizedCreatorText {
  readonly ko: string;
  readonly en: string;
}

export interface CreatorWorkspaceAction {
  readonly href: string;
  readonly label: LocalizedCreatorText;
  readonly description: LocalizedCreatorText;
}

export interface CreatorRoleDefinition {
  readonly id: CreatorRoleId;
  readonly group: CreatorRoleGroup;
  readonly lens: CreatorRoleLens;
  readonly label: LocalizedCreatorText;
  readonly shortLabel: LocalizedCreatorText;
  readonly description: LocalizedCreatorText;
  readonly workspaceTitle: LocalizedCreatorText;
  readonly workspaceSummary: LocalizedCreatorText;
  readonly recommendedSpecialties: readonly CreatorSpecialtyId[];
  readonly actions: readonly CreatorWorkspaceAction[];
}

export interface CreatorSpecialtyDefinition {
  readonly id: CreatorSpecialtyId;
  readonly label: LocalizedCreatorText;
}

export interface CreatorRoleProfile {
  readonly version: typeof CREATOR_ROLE_PROFILE_VERSION;
  readonly primaryRole: CreatorRoleId | null;
  readonly secondaryRoles: readonly CreatorRoleId[];
  readonly specialties: readonly CreatorSpecialtyId[];
  readonly creatorStage: CreatorStage | null;
  readonly experienceLevel: CreatorExperienceLevel | null;
  readonly collaborationStatus: CreatorCollaborationStatus | null;
  readonly roleVisibility: boolean;
  readonly activeRole: CreatorRoleId | null;
}

/** Public projection intentionally excludes private workspace preferences. */
export interface PublicCreatorRoleProfile {
  readonly version: typeof CREATOR_ROLE_PROFILE_VERSION;
  readonly primaryRole: CreatorRoleId;
  readonly secondaryRoles: readonly CreatorRoleId[];
  readonly specialties: readonly CreatorSpecialtyId[];
  readonly experienceLevel: CreatorExperienceLevel | null;
  readonly collaborationStatus: CreatorCollaborationStatus | null;
}

const text = (ko: string, en: string): LocalizedCreatorText => ({ ko, en });
const action = (
  href: string,
  labelKo: string,
  labelEn: string,
  descriptionKo: string,
  descriptionEn: string,
): CreatorWorkspaceAction => ({
  href,
  label: text(labelKo, labelEn),
  description: text(descriptionKo, descriptionEn),
});

export const CREATOR_STAGE_LABELS: Readonly<Record<CreatorStage, LocalizedCreatorText>> = {
  student: text("학생 · 교육생", "Student · learner"),
  hobbyist: text("취미 · 아마추어", "Hobbyist · amateur"),
  aspiring: text("데뷔 준비", "Preparing to debut"),
  professional: text("프로 · 현업 창작자", "Professional creator"),
  studio: text("스튜디오 · 제작사", "Studio · production company"),
  educator: text("강사 · 교육기관", "Instructor · education"),
  other: text("기타", "Other"),
};

export const CREATOR_ROLE_DEFINITIONS = [
  {
    id: "creator",
    group: "art",
    lens: "art",
    label: text("1인 웹툰 작가", "Solo webtoon creator"),
    shortLabel: text("1인 작가", "Solo creator"),
    description: text("기획·스토리·그림·연재를 한 사람이 연결합니다.", "Connect planning, story, art and publishing in one workflow."),
    workspaceTitle: text("혼자서도 전체 제작 흐름을 놓치지 않게", "Keep the full production flow visible while working solo"),
    workspaceSummary: text("다음 회차, 원고 작업, 검수와 게시 준비를 한 화면에서 이어갑니다.", "Continue the next episode, artwork, review and publishing preparation from one place."),
    recommendedSpecialties: ["episode-planning", "storyboard", "line-art", "quality-control"],
    actions: [
      action("/studio/new?kind=webtoon&template=webtoon-vertical", "새 회차 시작", "Start an episode", "기획부터 세로 원고까지 연결합니다.", "Move from planning to a vertical manuscript."),
      action("/story-lab", "스토리 정리", "Open Story Lab", "설정·대본·장면을 먼저 정리합니다.", "Organize canon, scripts and scenes first."),
      action("/studio?view=publications", "연재 준비", "Prepare publishing", "규격·내보내기·게시 상태를 확인합니다.", "Check specs, export and publishing status."),
    ],
  },
  {
    id: "story",
    group: "story",
    lens: "story",
    label: text("글작가", "Story writer"),
    shortLabel: text("글작가", "Writer"),
    description: text("세계관, 플롯, 장면과 대사를 설계합니다.", "Design worldbuilding, plot, scenes and dialogue."),
    workspaceTitle: text("대본과 설정의 연결을 중심으로", "Center the workspace on scripts and canon"),
    workspaceSummary: text("미완성 장면, 설정 충돌, 피드백과 다음 회차 기획을 먼저 보여줍니다.", "Prioritize unfinished scenes, canon conflicts, feedback and next-episode planning."),
    recommendedSpecialties: ["world-building", "plot", "dialogue", "adaptation"],
    actions: [
      action("/story-lab", "대본·설정 열기", "Open scripts & canon", "캐릭터, 장면, 대사와 설정을 관리합니다.", "Manage characters, scenes, dialogue and canon."),
      action("/production", "회차 기획 확인", "Review episode plans", "스토리 공정과 다음 인수인계를 확인합니다.", "Review the story lane and the next handoff."),
      action("/studio/projects", "프로젝트 이어가기", "Continue a project", "담당 회차와 최근 작업을 엽니다.", "Open assigned episodes and recent work."),
    ],
  },
  {
    id: "planner",
    group: "story",
    lens: "story",
    label: text("기획자", "Planner"),
    shortLabel: text("기획", "Planning"),
    description: text("작품 콘셉트, 타깃, 세계관과 시즌 구조를 설계합니다.", "Define concept, audience, canon and season structure."),
    workspaceTitle: text("작품의 기준과 결정 이력을 먼저", "Put creative foundations and decisions first"),
    workspaceSummary: text("기획 기준선, 시즌·회차 구조, 열린 위험과 결정 대기를 한눈에 봅니다.", "See planning baselines, season structure, open risks and pending decisions at a glance."),
    recommendedSpecialties: ["world-building", "episode-planning", "adaptation", "quality-control"],
    actions: [
      action("/production", "제작 기획 열기", "Open production planning", "작품·시즌·회차 기준과 위험을 관리합니다.", "Manage project, season and episode baselines and risks."),
      action("/story-lab", "세계관·캐릭터", "Canon & characters", "설정 자료를 대본과 연결합니다.", "Connect reference material to scripts."),
      action("/production/projects/sample-project/planning", "기획 샘플 보기", "View planning sample", "완성된 기획 구조를 예제로 확인합니다.", "Explore a complete planning structure."),
    ],
  },
  {
    id: "storyboard",
    group: "art",
    lens: "art",
    label: text("콘티 작가", "Storyboard artist"),
    shortLabel: text("콘티", "Storyboard"),
    description: text("대본을 컷, 구도, 시선 흐름과 스크롤 리듬으로 번역합니다.", "Translate scripts into panels, composition, eye flow and scroll rhythm."),
    workspaceTitle: text("대본에서 컷으로 넘어가는 지점을 선명하게", "Make the script-to-panel handoff explicit"),
    workspaceSummary: text("스토리 의도, 차단 질문, 콘티 검수와 다음 작화 입력을 우선합니다.", "Prioritize narrative intent, blocking questions, storyboard review and art handoff inputs."),
    recommendedSpecialties: ["storyboard", "scroll-direction", "composition", "episode-planning"],
    actions: [
      action("/story-lab", "장면·콘티 구성", "Build scenes & boards", "대본과 장면 흐름을 컷으로 정리합니다.", "Turn scripts and scene flow into panels."),
      action("/production", "인수인계 확인", "Review handoffs", "보존 의도와 자유 영역을 확인합니다.", "Review must-preserve intent and creative latitude."),
      action("/studio/new?kind=webtoon&template=webtoon-vertical", "세로 콘티 시작", "Start a vertical board", "웹툰 스크롤 규격으로 바로 시작합니다.", "Start directly in a webtoon scroll format."),
    ],
  },
  {
    id: "line-art",
    group: "art",
    lens: "art",
    label: text("그림작가·선화", "Illustrator · line art"),
    shortLabel: text("그림작가", "Illustrator"),
    description: text("캐릭터 연기, 선화와 최종 작화 품질을 책임집니다.", "Own character acting, line art and final drawing quality."),
    workspaceTitle: text("캔버스와 오늘의 작화 작업을 가장 먼저", "Put the canvas and today's art tasks first"),
    workspaceSummary: text("담당 컷, 콘티 입력, 브러시·레퍼런스와 검수 대기를 빠르게 엽니다.", "Open assigned panels, storyboard inputs, brushes, references and review queues quickly."),
    recommendedSpecialties: ["line-art", "inking", "character-design", "composition"],
    actions: [
      action("/studio", "최근 원고 열기", "Open recent artwork", "진행 중인 캔버스와 회차를 이어갑니다.", "Continue active canvases and episodes."),
      action("/studio/brushes", "브러시 관리", "Manage brushes", "작화 브러시와 프리셋을 정리합니다.", "Organize drawing brushes and presets."),
      action("/production", "내 작화 작업", "My art queue", "담당 작업, 선행 입력과 검수 상태를 확인합니다.", "Review assigned tasks, dependencies and review state."),
    ],
  },
  {
    id: "background",
    group: "art",
    lens: "art",
    label: text("배경 작가", "Background artist"),
    shortLabel: text("배경", "Background"),
    description: text("공간, 소품, 원근과 2D·3D 배경 자산을 제작합니다.", "Create environments, props, perspective and 2D/3D background assets."),
    workspaceTitle: text("장면 요구와 배경 자산을 함께", "Keep scene requirements and environment assets together"),
    workspaceSummary: text("필요 장소, 카메라 구도, 3D 패스와 재사용 가능한 배경을 중심으로 구성합니다.", "Focus on required locations, camera composition, 3D passes and reusable environments."),
    recommendedSpecialties: ["background-2d", "background-3d", "prop-design", "composition"],
    actions: [
      action("/studio/bg3d", "3D 배경 열기", "Open 3D backgrounds", "장면 블로킹과 카메라를 설정합니다.", "Set scene blocking and cameras."),
      action("/studio/assets", "배경 에셋", "Browse environment assets", "재사용 가능한 배경과 소품을 찾습니다.", "Find reusable environments and props."),
      action("/production", "배경 작업 목록", "Background queue", "회차별 요구와 마감을 확인합니다.", "Review episode requirements and deadlines."),
    ],
  },
  {
    id: "color",
    group: "art",
    lens: "art",
    label: text("채색·후보정 작가", "Color · finishing artist"),
    shortLabel: text("채색", "Color"),
    description: text("밑색, 명암, 효과와 최종 화면 톤을 완성합니다.", "Complete flats, rendering, effects and final visual tone."),
    workspaceTitle: text("색 기준과 통합 원고를 빠르게", "Reach color standards and integrated pages quickly"),
    workspaceSummary: text("팔레트, 선화 정본, 담당 컷과 후보정 검수 대기를 우선합니다.", "Prioritize palettes, approved line art, assigned panels and finishing review queues."),
    recommendedSpecialties: ["flat-color", "rendering", "effects", "retouching"],
    actions: [
      action("/studio", "채색 원고 열기", "Open color work", "최근 회차의 통합 캔버스를 엽니다.", "Open the integrated canvas for recent episodes."),
      action("/studio/assets", "팔레트·효과 에셋", "Color & effect assets", "재사용 가능한 컬러와 효과 자료를 찾습니다.", "Find reusable color and effects resources."),
      action("/production", "채색 작업 목록", "Color queue", "선행 선화와 검수 일정을 확인합니다.", "Review line-art dependencies and review dates."),
    ],
  },
  {
    id: "lettering",
    group: "art",
    lens: "art",
    label: text("식자·편집 작가", "Lettering artist"),
    shortLabel: text("식자", "Lettering"),
    description: text("말풍선, 대사, 효과음과 최종 읽기 흐름을 정리합니다.", "Refine balloons, dialogue, sound effects and reading flow."),
    workspaceTitle: text("대사와 최종 원고 규격을 함께", "Keep dialogue and final-page requirements together"),
    workspaceSummary: text("확정 대본, 말풍선 충돌, 효과음과 플랫폼 규격 검수를 중심으로 보여줍니다.", "Focus on locked scripts, balloon collisions, sound effects and platform preflight."),
    recommendedSpecialties: ["lettering", "balloon", "sound-effects", "proofing"],
    actions: [
      action("/studio", "식자 원고 열기", "Open lettering work", "통합 원고의 대사와 말풍선을 편집합니다.", "Edit dialogue and balloons on integrated pages."),
      action("/story-lab", "확정 대본 확인", "Review locked scripts", "대사와 호칭 기준을 확인합니다.", "Review dialogue and naming conventions."),
      action("/studio?view=exports", "규격 검사", "Run export preflight", "잘림, 여백과 파일 규격을 확인합니다.", "Check clipping, margins and file specifications."),
    ],
  },
  {
    id: "character",
    group: "art",
    lens: "art",
    label: text("캐릭터 디자이너", "Character designer"),
    shortLabel: text("캐릭터", "Character"),
    description: text("캐릭터 외형, 표정, 의상과 반복 사용 기준을 설계합니다.", "Design appearance, expressions, costumes and reusable character standards."),
    workspaceTitle: text("캐릭터 기준과 반복 제작 자산을 중심으로", "Center character standards and reusable assets"),
    workspaceSummary: text("캐릭터 시트, 표정·의상 변형과 회차별 등장 요구를 연결합니다.", "Connect character sheets, expression and costume variants with episode requirements."),
    recommendedSpecialties: ["character-design", "composition", "line-art", "flat-color"],
    actions: [
      action("/studio/assets?tab=characters&action=openVault", "캐릭터 만들기", "Create a character", "캐릭터 시트와 반복 자산을 등록합니다.", "Register character sheets and reusable assets."),
      action("/studio/assets", "캐릭터 라이브러리", "Character library", "등록한 인물과 포즈 자료를 확인합니다.", "Review saved characters and pose references."),
      action("/story-lab", "캐릭터 설정", "Character canon", "성격, 관계와 회차별 변화를 확인합니다.", "Review personality, relationships and episode changes."),
    ],
  },
  {
    id: "three-d",
    group: "art",
    lens: "art",
    label: text("3D 아티스트", "3D artist"),
    shortLabel: text("3D", "3D"),
    description: text("배경, 소품, 카메라와 렌더 패스를 제작합니다.", "Create environments, props, cameras and render passes."),
    workspaceTitle: text("3D 장면과 원고 연결을 안전하게", "Connect 3D scenes to artwork safely"),
    workspaceSummary: text("카메라, 장면 자산, 렌더 패스와 최종 PNG 연결 상태를 우선합니다.", "Prioritize cameras, scene assets, render passes and final PNG linkage."),
    recommendedSpecialties: ["background-3d", "prop-design", "composition", "quality-control"],
    actions: [
      action("/studio/bg3d", "3D 스튜디오", "Open 3D Studio", "배경과 카메라를 배치합니다.", "Arrange environments and cameras."),
      action("/studio/immersive", "몰입형 장면", "Immersive scene", "공간과 시점을 입체적으로 확인합니다.", "Inspect space and viewpoints immersively."),
      action("/studio/assets", "3D 에셋", "3D asset library", "재사용 가능한 모델과 소품을 관리합니다.", "Manage reusable models and props."),
    ],
  },
  {
    id: "educator",
    group: "support",
    lens: "story",
    label: text("강사·교육자", "Instructor · educator"),
    shortLabel: text("교육", "Educator"),
    description: text("웹툰 제작 과정을 가르치고 실습·과제·피드백을 운영합니다.", "Teach webtoon production and manage practice, assignments and feedback."),
    workspaceTitle: text("수업과 실습, 피드백을 하나의 흐름으로", "Connect lessons, practice and feedback in one flow"),
    workspaceSummary: text("교육 자료, 학생 과제, 실습 작업실과 작품 피드백을 우선해서 보여줍니다.", "Prioritize learning resources, assignments, practice workspaces and critique."),
    recommendedSpecialties: ["storyboard", "composition", "quality-control", "editing"],
    actions: [
      action("/learn/classroom", "수업·과제 관리", "Manage classes & assignments", "수업 흐름과 학생 과제를 준비합니다.", "Prepare lessons and student assignments."),
      action("/learn", "교육 자료", "Learning resources", "작화·스토리 제작 자료를 찾습니다.", "Find drawing and storytelling resources."),
      action("/studio/projects", "학생 작품·실습", "Student work & practice", "실습 프로젝트와 피드백 대상을 엽니다.", "Open practice projects and critique targets."),
    ],
  },
  {
    id: "assistant",
    group: "support",
    lens: "art",
    label: text("어시스턴트", "Assistant"),
    shortLabel: text("어시", "Assistant"),
    description: text("배정된 컷과 보조 공정을 납품 기준에 맞게 수행합니다.", "Complete assigned panels and support tasks to the delivery standard."),
    workspaceTitle: text("오늘 맡은 일과 완료 기준만 선명하게", "Make today's assigned work and completion criteria unmistakable"),
    workspaceSummary: text("담당 작업, 입력 파일, 레이어 규칙, 수정 요청과 마감을 우선해서 보여줍니다.", "Prioritize assigned tasks, input files, layer rules, change requests and deadlines."),
    recommendedSpecialties: ["file-cleanup", "flat-color", "background-2d", "retouching"],
    actions: [
      action("/production", "내 작업 목록", "My task queue", "담당 공정과 완료 조건을 확인합니다.", "Review assigned stages and completion criteria."),
      action("/studio", "작업 파일 열기", "Open working files", "최근 배정된 원고를 이어서 작업합니다.", "Continue recently assigned artwork."),
      action("/studio/import", "파일 가져오기", "Import files", "PSD·이미지 원본을 보존해 가져옵니다.", "Import PSD and image originals without flattening them."),
    ],
  },
  {
    id: "editor",
    group: "production",
    lens: "producer",
    label: text("편집자", "Editor"),
    shortLabel: text("편집", "Editor"),
    description: text("작품 방향, 원고 품질, 피드백과 연재 준비를 조율합니다.", "Coordinate direction, manuscript quality, feedback and release readiness."),
    workspaceTitle: text("검수 대기와 결정이 필요한 항목부터", "Start with review queues and decisions"),
    workspaceSummary: text("수정 요청, 승인 대기, 대본·원고 일치와 게시 전 검수를 우선합니다.", "Prioritize change requests, approvals, script-art alignment and pre-publish review."),
    recommendedSpecialties: ["editing", "proofing", "quality-control", "episode-planning"],
    actions: [
      action("/production", "검수·수정 열기", "Open review & changes", "역할별 승인과 수정 요청을 확인합니다.", "Review role-specific approvals and change requests."),
      action("/showcase", "공개 화면 확인", "Review public presentation", "독자에게 보이는 작품 정보를 확인합니다.", "Review how the work appears to readers."),
      action("/studio?view=publications", "게시 준비", "Publishing readiness", "연재 상태와 최종 규격을 확인합니다.", "Review release state and final specifications."),
    ],
  },
  {
    id: "producer",
    group: "production",
    lens: "producer",
    label: text("프로듀서·웹툰 PD", "Producer · webtoon PD"),
    shortLabel: text("프로듀서", "Producer"),
    description: text("일정, 인력, 위험, 검수와 연재 운영을 총괄합니다.", "Coordinate schedule, staffing, risk, review and publishing operations."),
    workspaceTitle: text("마감 위험과 팀 병목을 가장 먼저", "Surface deadline risk and team bottlenecks first"),
    workspaceSummary: text("회차 진척, 미배정 작업, 지연 위험, 승인 대기와 연재 일정을 한눈에 봅니다.", "See episode progress, unassigned work, delay risk, pending approvals and publishing dates at a glance."),
    recommendedSpecialties: ["production-schedule", "budget", "quality-control", "episode-planning"],
    actions: [
      action("/production", "제작 대시보드", "Production dashboard", "전체 프로젝트의 일정과 위험을 확인합니다.", "Review schedules and risks across projects."),
      action("/studio/projects", "프로젝트 관리", "Manage projects", "활성 프로젝트와 최근 작업을 정리합니다.", "Organize active projects and recent work."),
      action("/studio?view=publications", "연재 일정", "Publishing schedule", "게시 준비와 공개 상태를 확인합니다.", "Review publishing readiness and release state."),
    ],
  },
  {
    id: "localization",
    group: "production",
    lens: "producer",
    label: text("번역·현지화 담당", "Localization specialist"),
    shortLabel: text("현지화", "Localization"),
    description: text("번역, 문화권 조정, 식자와 플랫폼별 현지화를 담당합니다.", "Handle translation, cultural adaptation, lettering and platform localization."),
    workspaceTitle: text("확정 원문과 현지화 산출물을 나란히", "Keep locked source text beside localized deliverables"),
    workspaceSummary: text("원문 버전, 번역 대기, 식자 반영과 언어별 검수 상태를 우선합니다.", "Prioritize source revisions, translation queues, lettering updates and language review."),
    recommendedSpecialties: ["localization", "proofing", "lettering", "adaptation"],
    actions: [
      action("/production", "현지화 공정", "Localization queue", "언어별 담당과 검수 상태를 확인합니다.", "Review language assignments and approval status."),
      action("/story-lab", "원문·용어 기준", "Source text & glossary", "대사와 고유명사 기준을 확인합니다.", "Review dialogue and terminology standards."),
      action("/studio?view=exports", "언어별 내보내기", "Localized exports", "언어별 원고 규격을 준비합니다.", "Prepare language-specific manuscript exports."),
    ],
  },
  {
    id: "reviewer",
    group: "production",
    lens: "producer",
    label: text("검수 담당", "Reviewer"),
    shortLabel: text("검수", "Reviewer"),
    description: text("설정, 작화, 규격과 권리 기준에 따라 결과물을 검수합니다.", "Review deliverables against canon, art, format and rights requirements."),
    workspaceTitle: text("승인 대기와 검수 근거를 한 화면에", "Keep pending approvals and review evidence together"),
    workspaceSummary: text("검수 lane, 필수 수정, 근거 자료와 승인된 정본을 중심으로 구성합니다.", "Focus on review lanes, required changes, evidence and approved revisions."),
    recommendedSpecialties: ["quality-control", "proofing", "editing", "retouching"],
    actions: [
      action("/production", "검수 대기열", "Review queue", "역할별 검수와 차단 항목을 확인합니다.", "Review role-specific approvals and blockers."),
      action("/studio?view=exports", "규격 검수", "Export preflight", "플랫폼 규격과 파일 상태를 확인합니다.", "Check platform specifications and file state."),
      action("/showcase", "공개 결과 확인", "Review public output", "최종 노출 화면을 확인합니다.", "Inspect the final public presentation."),
    ],
  },
] as const satisfies readonly CreatorRoleDefinition[];

export const CREATOR_SPECIALTY_DEFINITIONS = [
  { id: "world-building", label: text("세계관", "Worldbuilding") },
  { id: "plot", label: text("플롯", "Plot") },
  { id: "dialogue", label: text("대사", "Dialogue") },
  { id: "adaptation", label: text("각색", "Adaptation") },
  { id: "episode-planning", label: text("회차 기획", "Episode planning") },
  { id: "storyboard", label: text("콘티", "Storyboard") },
  { id: "scroll-direction", label: text("스크롤 연출", "Scroll direction") },
  { id: "composition", label: text("구도", "Composition") },
  { id: "character-design", label: text("캐릭터 디자인", "Character design") },
  { id: "line-art", label: text("선화", "Line art") },
  { id: "inking", label: text("펜터치", "Inking") },
  { id: "background-2d", label: text("2D 배경", "2D backgrounds") },
  { id: "background-3d", label: text("3D 배경", "3D backgrounds") },
  { id: "prop-design", label: text("소품 디자인", "Prop design") },
  { id: "flat-color", label: text("밑색", "Flat color") },
  { id: "rendering", label: text("명암·렌더링", "Rendering") },
  { id: "effects", label: text("효과", "Effects") },
  { id: "retouching", label: text("후보정", "Retouching") },
  { id: "lettering", label: text("식자", "Lettering") },
  { id: "balloon", label: text("말풍선", "Balloons") },
  { id: "sound-effects", label: text("효과음", "Sound effects") },
  { id: "production-schedule", label: text("제작 일정", "Production scheduling") },
  { id: "budget", label: text("예산·정산", "Budget & settlement") },
  { id: "quality-control", label: text("품질 관리", "Quality control") },
  { id: "editing", label: text("편집", "Editing") },
  { id: "proofing", label: text("교정·검수", "Proofing") },
  { id: "localization", label: text("번역·현지화", "Localization") },
  { id: "file-cleanup", label: text("파일·레이어 정리", "File & layer cleanup") },
] as const satisfies readonly CreatorSpecialtyDefinition[];

export const CREATOR_EXPERIENCE_LABELS: Readonly<Record<CreatorExperienceLevel, LocalizedCreatorText>> = {
  beginner: text("입문·준비 중", "Starting out"),
  experienced: text("경험 있음", "Experienced"),
  professional: text("연재·프로 경험", "Professional / serialized"),
};

export const CREATOR_COLLABORATION_LABELS: Readonly<Record<CreatorCollaborationStatus, LocalizedCreatorText>> = {
  available: text("새 협업 제안 가능", "Open to collaboration"),
  limited: text("조건부 협업 가능", "Limited availability"),
  unavailable: text("현재 협업 불가", "Not available"),
};

export const EMPTY_CREATOR_ROLE_PROFILE: CreatorRoleProfile = Object.freeze({
  version: CREATOR_ROLE_PROFILE_VERSION,
  primaryRole: null,
  secondaryRoles: Object.freeze([]),
  specialties: Object.freeze([]),
  creatorStage: null,
  experienceLevel: null,
  collaborationStatus: null,
  roleVisibility: true,
  activeRole: null,
});

const ROLE_ID_SET = new Set<string>(CREATOR_ROLE_IDS);
const SPECIALTY_ID_SET = new Set<string>(CREATOR_SPECIALTY_IDS);
const STAGE_SET = new Set<string>(CREATOR_STAGE_IDS);
const EXPERIENCE_SET = new Set<string>(CREATOR_EXPERIENCE_LEVELS);
const COLLABORATION_SET = new Set<string>(CREATOR_COLLABORATION_STATUSES);

export function creatorText(value: LocalizedCreatorText, locale: CreatorRoleLocale): string {
  return value[locale];
}

export function normalizeCreatorRoleId(value: unknown): CreatorRoleId | null {
  return typeof value === "string" && ROLE_ID_SET.has(value) ? value as CreatorRoleId : null;
}

export function normalizeCreatorSpecialtyId(value: unknown): CreatorSpecialtyId | null {
  return typeof value === "string" && SPECIALTY_ID_SET.has(value) ? value as CreatorSpecialtyId : null;
}

export function normalizeCreatorStage(value: unknown): CreatorStage | null {
  return typeof value === "string" && STAGE_SET.has(value) ? value as CreatorStage : null;
}

export function normalizeCreatorExperienceLevel(value: unknown): CreatorExperienceLevel | null {
  return typeof value === "string" && EXPERIENCE_SET.has(value) ? value as CreatorExperienceLevel : null;
}

export function normalizeCreatorCollaborationStatus(value: unknown): CreatorCollaborationStatus | null {
  return typeof value === "string" && COLLABORATION_SET.has(value)
    ? value as CreatorCollaborationStatus
    : null;
}

function normalizeDistinctValues<T>(
  value: unknown,
  parse: (entry: unknown) => T | null,
  max: number,
): T[] {
  if (!Array.isArray(value)) return [];
  const normalized: T[] = [];
  const seen = new Set<T>();
  for (const entry of value) {
    const parsed = parse(entry);
    if (parsed !== null && !seen.has(parsed)) {
      seen.add(parsed);
      normalized.push(parsed);
    }
    if (normalized.length >= max) break;
  }
  return normalized;
}

export function normalizeCreatorRoleProfile(value: unknown): CreatorRoleProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_CREATOR_ROLE_PROFILE, secondaryRoles: [], specialties: [] };
  }
  const record = value as Record<string, unknown>;
  const primaryRole = normalizeCreatorRoleId(record.primaryRole);
  const secondaryRoles = normalizeDistinctValues(
    record.secondaryRoles,
    normalizeCreatorRoleId,
    CREATOR_ROLE_MAX_SECONDARY,
  ).filter((role) => role !== primaryRole);
  const specialties = normalizeDistinctValues(
    record.specialties,
    normalizeCreatorSpecialtyId,
    CREATOR_ROLE_MAX_SPECIALTIES,
  );
  const selectedRoles = new Set<CreatorRoleId>([
    ...(primaryRole ? [primaryRole] : []),
    ...secondaryRoles,
  ]);
  const requestedActiveRole = normalizeCreatorRoleId(record.activeRole);
  const activeRole = requestedActiveRole && selectedRoles.has(requestedActiveRole)
    ? requestedActiveRole
    : primaryRole;
  return {
    version: CREATOR_ROLE_PROFILE_VERSION,
    primaryRole,
    secondaryRoles,
    specialties,
    creatorStage: normalizeCreatorStage(record.creatorStage),
    experienceLevel: normalizeCreatorExperienceLevel(record.experienceLevel),
    collaborationStatus: normalizeCreatorCollaborationStatus(record.collaborationStatus),
    roleVisibility: typeof record.roleVisibility === "boolean" ? record.roleVisibility : true,
    activeRole,
  };
}

const CREATOR_ROLE_PROFILE_KEYS = new Set([
  "version",
  "primaryRole",
  "secondaryRoles",
  "specialties",
  "creatorStage",
  "experienceLevel",
  "collaborationStatus",
  "roleVisibility",
  "activeRole",
]);

function validOptionalEnumValue(value: unknown, parse: (entry: unknown) => unknown): boolean {
  return value === undefined || value === null || parse(value) !== null;
}

function validEnumArray(value: unknown, parse: (entry: unknown) => unknown, max: number): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.length <= max && value.every((entry) => parse(entry) !== null))
  );
}

/** Strict write-boundary parser. Reads stay tolerant through normalizeCreatorRoleProfile. */
export function parseCreatorRoleProfileInput(value: unknown): CreatorRoleProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !CREATOR_ROLE_PROFILE_KEYS.has(key))) return null;
  if (record.version !== undefined && record.version !== CREATOR_ROLE_PROFILE_VERSION) return null;
  if (!validOptionalEnumValue(record.primaryRole, normalizeCreatorRoleId)) return null;
  if (!validEnumArray(record.secondaryRoles, normalizeCreatorRoleId, CREATOR_ROLE_MAX_SECONDARY)) return null;
  if (!validEnumArray(record.specialties, normalizeCreatorSpecialtyId, CREATOR_ROLE_MAX_SPECIALTIES)) return null;
  if (!validOptionalEnumValue(record.creatorStage, normalizeCreatorStage)) return null;
  if (!validOptionalEnumValue(record.experienceLevel, normalizeCreatorExperienceLevel)) return null;
  if (!validOptionalEnumValue(record.collaborationStatus, normalizeCreatorCollaborationStatus)) return null;
  if (record.roleVisibility !== undefined && typeof record.roleVisibility !== "boolean") return null;
  if (!validOptionalEnumValue(record.activeRole, normalizeCreatorRoleId)) return null;

  const profile = normalizeCreatorRoleProfile(record);
  if (!profile.primaryRole && profile.secondaryRoles.length > 0) return null;
  if (record.activeRole !== undefined && record.activeRole !== null) {
    const requestedActiveRole = normalizeCreatorRoleId(record.activeRole);
    const selected = new Set(creatorRoleSelection(profile));
    if (!requestedActiveRole || !selected.has(requestedActiveRole)) return null;
  }
  return profile;
}

export function publicCreatorRoleProfile(value: unknown): PublicCreatorRoleProfile | null {
  const profile = normalizeCreatorRoleProfile(value);
  if (!profile.roleVisibility || !profile.primaryRole) return null;
  return {
    version: profile.version,
    primaryRole: profile.primaryRole,
    secondaryRoles: profile.secondaryRoles,
    specialties: profile.specialties,
    experienceLevel: profile.experienceLevel,
    collaborationStatus: profile.collaborationStatus,
  };
}

export function creatorRoleDefinition(role: CreatorRoleId | null | undefined): CreatorRoleDefinition | null {
  if (!role) return null;
  return CREATOR_ROLE_DEFINITIONS.find((entry) => entry.id === role) ?? null;
}

export function creatorSpecialtyDefinition(
  specialty: CreatorSpecialtyId | null | undefined,
): CreatorSpecialtyDefinition | null {
  if (!specialty) return null;
  return CREATOR_SPECIALTY_DEFINITIONS.find((entry) => entry.id === specialty) ?? null;
}

export function creatorRoleSelection(profile: CreatorRoleProfile): readonly CreatorRoleId[] {
  return profile.primaryRole
    ? [profile.primaryRole, ...profile.secondaryRoles.filter((role) => role !== profile.primaryRole)]
    : profile.secondaryRoles;
}

export function creatorRoleLens(role: CreatorRoleId | null | undefined): CreatorRoleLens {
  return creatorRoleDefinition(role)?.lens ?? "producer";
}

export function recommendedCreatorSpecialties(
  roles: readonly CreatorRoleId[],
): readonly CreatorSpecialtyId[] {
  const result: CreatorSpecialtyId[] = [];
  const seen = new Set<CreatorSpecialtyId>();
  for (const role of roles) {
    for (const specialty of creatorRoleDefinition(role)?.recommendedSpecialties ?? []) {
      if (!seen.has(specialty)) {
        seen.add(specialty);
        result.push(specialty);
      }
    }
  }
  return result;
}
