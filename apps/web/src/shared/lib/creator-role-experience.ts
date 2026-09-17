import type { CreatorRoleId } from "./creator-role-contract";
import {
  GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
  creatorDetailedRoleLens,
  creatorRoleStudioWorkspace,
  type CreatorProductionRole,
  type CreatorRoleWorkspacePreset,
  type RankedCreatorWorkItem,
} from "./creator-role-workspace-contract";

export interface CreatorRoleNavigationItem {
  readonly id: string;
  readonly href: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

export interface CreatorRolePrimaryAction extends CreatorRoleNavigationItem {
  readonly workspacePreset: CreatorRoleWorkspacePreset | null;
}

export interface CreatorRoleExperience {
  readonly role: CreatorRoleId;
  readonly primaryAction: CreatorRolePrimaryAction;
  readonly navigation: readonly CreatorRoleNavigationItem[];
  readonly emptyStateKo: string;
  readonly emptyStateEn: string;
}
function nav(
  id: string,
  href: string,
  labelKo: string,
  labelEn: string,
  descriptionKo: string,
  descriptionEn: string,
): CreatorRoleNavigationItem {
  return { id, href, labelKo, labelEn, descriptionKo, descriptionEn };
}

function primary(
  id: string,
  href: string,
  labelKo: string,
  labelEn: string,
  descriptionKo: string,
  descriptionEn: string,
  workspacePreset: CreatorRoleWorkspacePreset | null,
): CreatorRolePrimaryAction {
  return { ...nav(id, href, labelKo, labelEn, descriptionKo, descriptionEn), workspacePreset };
}

const PROJECTS = nav("projects", "/studio/projects", "작품", "Projects", "최근 작품과 회차를 확인합니다.", "Open recent projects and episodes.");
const PRODUCTION = nav("production", "/production", "제작 현황", "Production", "담당 업무와 인수인계를 확인합니다.", "Review assigned work and handoffs.");
const ASSETS = nav("assets", "/studio/assets", "소재", "Assets", "프로젝트 자료와 반복 제작 자산을 엽니다.", "Open project references and reusable assets.");
const REVIEW = nav("review", "/production", "검수", "Review", "수정 요청과 승인 대기를 확인합니다.", "Review change requests and approvals.");
function studioRoleHref(role: CreatorRoleId): string {
  const lens = creatorDetailedRoleLens(role);
  const workspace = lens === "story" || lens === "planning" || lens === "storyboard"
    ? "storyboard"
    : lens === "review"
      ? "review"
      : lens === "background" && role === "three-d"
        ? "3d"
        : lens === "lettering"
          ? "localization"
          : "draw";
  const params = new URLSearchParams({
    workspace,
    roleWorkspace: creatorRoleStudioWorkspace(role),
    uiMode: "standard",
  });
  return `/studio?${params.toString()}`;
}

const ROLE_EXPERIENCES: Readonly<Record<CreatorRoleId, CreatorRoleExperience>> = {
  creator: {
    role: "creator",
    primaryAction: primary("resume", studioRoleHref("creator"), "이어서 제작하기", "Resume production", "마지막 원고와 현재 공정에서 바로 이어갑니다.", "Resume from the latest manuscript and production stage.", "pro-comic"),
    navigation: [PROJECTS, nav("story", "/story-lab", "스토리", "Story", "설정과 대본을 정리합니다.", "Organize canon and scripts."), nav("drawing", studioRoleHref("creator"), "드로잉", "Drawing", "통합 원고를 제작합니다.", "Work on the integrated manuscript."), ASSETS, REVIEW, nav("publish", "/studio?view=publications", "발행", "Publish", "게시 준비 상태를 확인합니다.", "Review publishing readiness.")],
    emptyStateKo: "진행 중인 작업이 없으면 다음 회차를 시작하세요.",
    emptyStateEn: "Start the next episode when there is no active work.",
  },
  story: {
    role: "story",
    primaryAction: primary("write", "/story-lab", "이어 쓰기", "Resume writing", "미완성 장면과 대본을 바로 이어 씁니다.", "Continue the unfinished scene or script.", "quick-sketch"),
    navigation: [nav("writing", "/story-lab", "집필", "Writing", "회차·장면·대사를 작성합니다.", "Write episodes, scenes and dialogue."), nav("canon", "/story-lab", "스토리·설정", "Story & canon", "플롯, 캐릭터와 세계관을 연결합니다.", "Connect plot, characters and canon."), PRODUCTION, REVIEW, PROJECTS],
    emptyStateKo: "진행 중인 장면이 없으면 다음 회차의 첫 장면을 시작하세요.",
    emptyStateEn: "Start the first scene of the next episode when nothing is in progress.",
  },
  planner: {
    role: "planner",
    primaryAction: primary("plan", "/production", "기획 이어가기", "Resume planning", "시즌·회차 기준과 열린 결정을 이어서 정리합니다.", "Continue season, episode and decision planning.", "storyboard"),
    navigation: [nav("planning", "/production", "기획", "Planning", "작품·시즌·회차 기준을 관리합니다.", "Manage project, season and episode baselines."), nav("canon", "/story-lab", "세계관", "Canon", "캐릭터와 설정 자료를 확인합니다.", "Review characters and canon."), nav("pipeline", "/production", "파이프라인", "Pipeline", "후속 공정 영향을 확인합니다.", "Review downstream workflow impact."), REVIEW, PROJECTS],
    emptyStateKo: "열린 결정이 없으면 다음 회차 기획 기준을 준비하세요.",
    emptyStateEn: "Prepare the next episode baseline when no decisions are open.",
  },
  storyboard: {
    role: "storyboard",
    primaryAction: primary("board", studioRoleHref("storyboard"), "콘티 이어 그리기", "Resume storyboard", "현재 장면과 컷 흐름에서 바로 이어갑니다.", "Continue from the current scene and panel flow.", "storyboard"),
    navigation: [nav("boards", studioRoleHref("storyboard"), "콘티", "Storyboard", "세로 스크롤 컷을 구성합니다.", "Compose vertical-scroll panels."), nav("script", "/story-lab", "대본", "Script", "장면 의도와 대사를 확인합니다.", "Review scene intent and dialogue."), nav("reference", "/studio/assets", "레퍼런스", "References", "인물·공간 자료를 확인합니다.", "Review character and environment references."), PRODUCTION, REVIEW],
    emptyStateKo: "배정된 콘티가 없으면 다음 대본에서 새 콘티를 시작하세요.",
    emptyStateEn: "Start a new storyboard from the next script when none is assigned.",
  },
  "line-art": {
    role: "line-art",
    primaryAction: primary("draw", studioRoleHref("line-art"), "이어 그리기", "Resume drawing", "마지막 담당 컷을 선화 작업공간으로 엽니다.", "Open the latest assigned panel in the line-art workspace.", "lineart"),
    navigation: [nav("drawing", studioRoleHref("line-art"), "드로잉", "Drawing", "선화와 캐릭터 연기를 진행합니다.", "Work on line art and character acting."), nav("cuts", "/production", "내 컷", "My panels", "배정 컷과 마감을 확인합니다.", "Review assigned panels and deadlines."), nav("brushes", "/studio/brushes", "브러시", "Brushes", "작화 브러시와 프리셋을 관리합니다.", "Manage drawing brushes and presets."), ASSETS, REVIEW],
    emptyStateKo: "배정된 컷이 없으면 최근 원고나 다음 회차를 열어보세요.",
    emptyStateEn: "Open recent artwork or the next episode when no panel is assigned.",
  },
  background: {
    role: "background",
    primaryAction: primary("background", studioRoleHref("background"), "배경 작업 이어가기", "Resume background work", "현재 컷의 공간·원근 작업을 이어갑니다.", "Continue environment and perspective work for the current panel.", "pose-3d"),
    navigation: [nav("background", studioRoleHref("background"), "배경 작업", "Background", "2D·3D 배경을 제작합니다.", "Create 2D and 3D environments."), nav("3d", "/studio/bg3d", "3D Studio", "3D Studio", "카메라와 공간을 배치합니다.", "Block cameras and environments."), nav("assets", "/studio/assets", "배경 소재", "Environment assets", "재사용 배경과 소품을 찾습니다.", "Find reusable environments and props."), PRODUCTION, REVIEW],
    emptyStateKo: "배경 작업이 없으면 재사용 가능한 장소·소품 자산을 정리하세요.",
    emptyStateEn: "Organize reusable environments and props when no background task is assigned.",
  },
  color: {
    role: "color",
    primaryAction: primary("color", studioRoleHref("color"), "채색 이어가기", "Resume coloring", "승인된 선화의 다음 담당 컷을 엽니다.", "Open the next assigned panel with approved line art.", "coloring"),
    navigation: [nav("color", studioRoleHref("color"), "채색", "Color", "밑색·명암·효과를 작업합니다.", "Work on flats, rendering and effects."), nav("queue", "/production", "배정 컷", "Assigned panels", "선행 선화와 마감을 확인합니다.", "Review line-art dependencies and deadlines."), nav("palette", "/studio/assets", "팔레트·효과", "Palette & effects", "작품 색 기준과 효과 소재를 확인합니다.", "Review color standards and effects assets."), REVIEW, PROJECTS],
    emptyStateKo: "채색 대기가 없으면 작품 팔레트와 출력 기준을 점검하세요.",
    emptyStateEn: "Review palette and output standards when no color work is waiting.",
  },
  lettering: {
    role: "lettering",
    primaryAction: primary("letter", studioRoleHref("lettering"), "식자 이어가기", "Resume lettering", "확정 대본과 현재 원고를 함께 엽니다.", "Open approved copy beside the current manuscript.", "lettering"),
    navigation: [nav("lettering", studioRoleHref("lettering"), "대사·식자", "Dialogue & lettering", "말풍선, 대사와 효과음을 편집합니다.", "Edit balloons, dialogue and sound effects."), nav("script", "/story-lab", "확정 대본", "Approved script", "최종 대사와 호칭을 확인합니다.", "Review final dialogue and naming."), nav("preflight", "/studio?view=exports", "규격 검사", "Preflight", "안전 영역과 출력 규격을 확인합니다.", "Check safe areas and export specs."), PRODUCTION, REVIEW],
    emptyStateKo: "식자 대기가 없으면 확정 대본과 플랫폼 규격을 점검하세요.",
    emptyStateEn: "Review approved copy and platform specs when no lettering is waiting.",
  },
  character: {
    role: "character",
    primaryAction: primary("character", "/studio/assets?tab=characters&action=openVault", "캐릭터 작업 이어가기", "Resume character work", "캐릭터 시트와 반복 제작 자산을 엽니다.", "Open character sheets and reusable production assets.", "lineart"),
    navigation: [nav("characters", "/studio/assets?tab=characters&action=openVault", "캐릭터", "Characters", "시트, 표정과 의상 변형을 관리합니다.", "Manage sheets, expressions and costumes."), nav("canon", "/story-lab", "캐릭터 설정", "Character canon", "성격·관계와 회차 변화를 확인합니다.", "Review personality, relationships and episode changes."), nav("drawing", studioRoleHref("character"), "드로잉", "Drawing", "디자인 시안을 제작합니다.", "Create character design artwork."), ASSETS, REVIEW],
    emptyStateKo: "새 요청이 없으면 자주 쓰는 표정·의상 자산을 정리하세요.",
    emptyStateEn: "Organize reusable expression and costume assets when no request is open.",
  },
  "three-d": {
    role: "three-d",
    primaryAction: primary("3d", "/studio/bg3d", "3D 장면 이어가기", "Resume 3D scene", "최근 장면의 카메라와 배치를 복원합니다.", "Restore the latest scene, camera and blocking.", "pose-3d"),
    navigation: [nav("scene", "/studio/bg3d", "3D Studio", "3D Studio", "장면, 카메라와 조명을 편집합니다.", "Edit scenes, cameras and lighting."), nav("immersive", "/studio/immersive", "장면 탐색", "Scene explorer", "공간과 시점을 입체적으로 확인합니다.", "Inspect space and viewpoints immersively."), ASSETS, PRODUCTION, REVIEW],
    emptyStateKo: "3D 요청이 없으면 재사용 장면과 카메라 프리셋을 정리하세요.",
    emptyStateEn: "Organize reusable scenes and camera presets when no 3D task is assigned.",
  },
  assistant: {
    role: "assistant",
    primaryAction: primary("next-task", "/production", "다음 작업 시작", "Start next task", "우선순위가 가장 높은 배정 업무부터 시작합니다.", "Start with the highest-priority assigned task.", "lineart"),
    navigation: [nav("tasks", "/production", "내 작업", "My work", "오늘 배정된 작업과 완료 기준을 봅니다.", "See today's assignments and completion criteria."), nav("studio", studioRoleHref("assistant"), "작업실", "Studio", "배정 업무에 맞는 기본 작업공간을 엽니다.", "Open the default assistant workspace."), nav("import", "/studio/import", "파일 가져오기", "Import", "원본 구조를 보존해 작업 파일을 엽니다.", "Open source files without flattening their structure."), ASSETS, REVIEW],
    emptyStateKo: "현재 배정된 작업이 없습니다. 새 작업이 배정되면 여기에 표시됩니다.",
    emptyStateEn: "There is no assigned work. New assignments will appear here automatically.",
  },
  editor: {
    role: "editor",
    primaryAction: primary("review", "/production", "검수 시작", "Start review", "승인 대기와 수정 요청을 우선순위대로 확인합니다.", "Review approvals and change requests by priority.", "review"),
    navigation: [nav("queue", "/production", "검토 대기", "Review queue", "스토리·콘티·작화 검수를 모아봅니다.", "Review story, storyboard and artwork queues."), nav("changes", "/production", "수정 요청", "Changes", "열린 수정 요청과 재제출을 확인합니다.", "Review open changes and resubmissions."), nav("public", "/showcase", "공개 화면", "Public view", "독자에게 보일 작품 화면을 확인합니다.", "Inspect the reader-facing presentation."), nav("publish", "/studio?view=publications", "게시 준비", "Publishing", "최종 규격과 공개 상태를 확인합니다.", "Review final specs and release state."), PROJECTS],
    emptyStateKo: "검수 대기가 없으면 다음 발행 회차의 준비 상태를 확인하세요.",
    emptyStateEn: "Review the next release readiness when the review queue is empty.",
  },
  producer: {
    role: "producer",
    primaryAction: primary("risk", "/production", "문제 확인", "Review risks", "지연·미배정·승인 대기부터 확인합니다.", "Start with delays, unassigned work and pending approvals.", "publish"),
    navigation: [nav("dashboard", "/production", "대시보드", "Dashboard", "마감 위험과 병목을 확인합니다.", "Review deadline risk and bottlenecks."), nav("pipeline", "/production", "파이프라인", "Pipeline", "회차별 공정 진행을 확인합니다.", "Review episode production progress."), nav("team", "/production", "팀·작업량", "Team & workload", "담당자와 과부하를 확인합니다.", "Review ownership and workload."), REVIEW, nav("publish", "/studio?view=publications", "발행", "Publishing", "연재·납품 준비를 확인합니다.", "Review release and delivery readiness."), PROJECTS],
    emptyStateKo: "위험 작업이 없으면 다음 마감과 미배정 업무를 선제적으로 확인하세요.",
    emptyStateEn: "Review upcoming deadlines and unassigned work when no risk is active.",
  },
  localization: {
    role: "localization",
    primaryAction: primary("localize", studioRoleHref("localization"), "현지화 이어가기", "Resume localization", "확정 원문과 현재 언어 원고를 함께 엽니다.", "Open the locked source beside the current localized manuscript.", "lettering"),
    navigation: [nav("localization", studioRoleHref("localization"), "현지화", "Localization", "언어별 대사와 식자를 반영합니다.", "Apply language-specific copy and lettering."), nav("source", "/story-lab", "원문·용어", "Source & glossary", "확정 원문과 용어 기준을 확인합니다.", "Review locked source and terminology."), nav("queue", "/production", "언어별 작업", "Language queue", "담당과 검수 상태를 확인합니다.", "Review assignments and approvals by language."), nav("export", "/studio?view=exports", "내보내기", "Exports", "언어별 납품 규격을 확인합니다.", "Review language-specific delivery specs."), REVIEW],
    emptyStateKo: "현지화 대기가 없으면 용어집과 다음 언어 배포 기준을 점검하세요.",
    emptyStateEn: "Review glossary and upcoming locale requirements when no localization is waiting.",
  },
  reviewer: {
    role: "reviewer",
    primaryAction: primary("review", "/production", "검수 시작", "Start review", "차단 이슈와 승인 대기를 우선 검수합니다.", "Review blocking issues and pending approvals first.", "review"),
    navigation: [nav("queue", "/production", "검수 대기", "Review queue", "검수가 필요한 산출물을 확인합니다.", "Review deliverables waiting for inspection."), nav("preflight", "/studio?view=exports", "규격 검수", "Preflight", "플랫폼 규격과 파일 구성을 확인합니다.", "Check platform specs and file completeness."), nav("public", "/showcase", "최종 화면", "Final output", "독자에게 노출될 결과를 확인합니다.", "Inspect the reader-facing final output."), nav("changes", "/production", "수정 확인", "Verify changes", "재제출과 해결 여부를 확인합니다.", "Verify resubmissions and resolution."), PROJECTS],
    emptyStateKo: "검수 대기가 없으면 다음 납품의 규격과 승인 상태를 확인하세요.",
    emptyStateEn: "Review upcoming delivery specs and approvals when the queue is empty.",
  },
};

export function creatorRoleExperience(
  role: CreatorRoleId | null | undefined,
): CreatorRoleExperience {
  return ROLE_EXPERIENCES[role ?? "creator"];
}
export interface CreatorWorkItemLaunch {
  readonly href: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly workspacePreset: CreatorRoleWorkspacePreset | null;
  readonly surface: "studio" | "story" | "production";
}

const TASK_WORKSPACES: Readonly<Partial<Record<CreatorProductionRole, {
  readonly documentWorkspace: string;
  readonly preset: CreatorRoleWorkspacePreset;
}>>> = {
  storyboard: { documentWorkspace: "storyboard", preset: "storyboard" },
  lineart: { documentWorkspace: "draw", preset: "lineart" },
  color: { documentWorkspace: "draw", preset: "coloring" },
  background: { documentWorkspace: "3d", preset: "pose-3d" },
  lettering: { documentWorkspace: "localization", preset: "lettering" },
};

function appendScope(params: URLSearchParams, projectKey: string): void {
  if (projectKey !== "draft" && projectKey !== GLOBAL_CREATOR_ROLE_WORKSPACE_KEY) {
    params.set("scope", projectKey);
  }
}

function studioTaskLaunch(
  projectKey: string,
  taskId: string,
  workspace: { readonly documentWorkspace: string; readonly preset: CreatorRoleWorkspacePreset },
): string {
  const params = new URLSearchParams({
    workspace: workspace.documentWorkspace,
    roleWorkspace: workspace.preset,
    uiMode: "standard",
    taskId,
  });
  appendScope(params, projectKey);
  return `/studio?${params.toString()}`;
}
function workActionLabel(item: RankedCreatorWorkItem): Pick<CreatorWorkItemLaunch, "labelKo" | "labelEn"> {
  if (item.kind === "review" || item.reasons.includes("review-requested")) {
    return { labelKo: "검수하기", labelEn: "Review" };
  }
  if (item.status === "blocked" || item.status === "needs-input") {
    return { labelKo: "문제 확인", labelEn: "Resolve blocker" };
  }
  if (["doing", "in-progress", "changes-requested", "paused"].includes(item.status)) {
    return { labelKo: "이어 작업하기", labelEn: "Resume work" };
  }
  return { labelKo: "작업 시작", labelEn: "Start work" };
}

function productionTaskHref(projectId: string, taskId: string): string {
  return `/production/projects/${encodeURIComponent(projectId)}/production?task=${encodeURIComponent(taskId)}`;
}

export function creatorWorkItemLaunch(
  item: RankedCreatorWorkItem,
  options: {
    readonly activeRole: CreatorRoleId | null;
    readonly projectKey: string;
    readonly productionProjectId?: string | null;
  },
): CreatorWorkItemLaunch {
  const label = workActionLabel(item);
  const roleLens = creatorDetailedRoleLens(options.activeRole);
  const productionHref = options.productionProjectId
    ? productionTaskHref(options.productionProjectId, item.id)
    : null;
  if (productionHref && (
    item.kind === "review"
    || item.reasons.includes("review-requested")
    || item.status === "blocked"
    || roleLens === "review"
    || roleLens === "production"
  )) {
    return { ...label, href: productionHref, workspacePreset: "review", surface: "production" };
  }
  if (item.kind === "review") {
    const params = new URLSearchParams({ reviewId: item.id });
    if (options.projectKey !== "draft") params.set("projectKey", options.projectKey);
    return { ...label, href: `/production?${params.toString()}`, workspacePreset: "review", surface: "production" };
  }

  const taskWorkspace = item.productionRole ? TASK_WORKSPACES[item.productionRole] : null;
  if (taskWorkspace) {
    return {
      ...label,
      href: studioTaskLaunch(options.projectKey, item.id, taskWorkspace),
      workspacePreset: taskWorkspace.preset,
      surface: "studio",
    };
  }

  if (item.productionRole === "story") {
    const params = new URLSearchParams({ taskId: item.id });
    if (options.projectKey !== "draft") params.set("projectKey", options.projectKey);
    return { ...label, href: `/story-lab?${params.toString()}`, workspacePreset: "quick-sketch", surface: "story" };
  }
  if (
    item.productionRole === "reviewer"
    || item.productionRole === "director"
    || item.productionRole === "publisher"
  ) {
    if (productionHref) {
      return { ...label, href: productionHref, workspacePreset: null, surface: "production" };
    }
    const params = new URLSearchParams({ taskId: item.id });
    if (options.projectKey !== "draft") params.set("projectKey", options.projectKey);
    return { ...label, href: `/production?${params.toString()}`, workspacePreset: null, surface: "production" };
  }

  const experience = creatorRoleExperience(options.activeRole);
  const separator = experience.primaryAction.href.includes("?") ? "&" : "?";
  return {
    ...label,
    href: `${experience.primaryAction.href}${separator}taskId=${encodeURIComponent(item.id)}`,
    workspacePreset: experience.primaryAction.workspacePreset,
    surface: experience.primaryAction.href.startsWith("/story-lab")
      ? "story"
      : experience.primaryAction.href.startsWith("/production")
        ? "production"
        : "studio",
  };
}
