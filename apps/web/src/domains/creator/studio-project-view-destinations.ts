import {
  STUDIO_PROJECT_SECTION_VIEWS,
  STUDIO_PROJECT_VIEW_LABELS,
  isStudioProjectView,
  type StudioProjectSection,
} from "./studio-project-views";

export type StudioProjectViewOwner =
  | "assets"
  | "editor"
  | "project-shell"
  | "production"
  | "publishing"
  | "story";

export interface StudioProjectViewDestination {
  readonly section: StudioProjectSection;
  readonly view: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly ctaKo: string;
  readonly ctaEn: string;
  readonly href: string | null;
  readonly owner: StudioProjectViewOwner;
}

function requireProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (
    normalized.length === 0
    || normalized.length > 160
    || normalized === "."
    || normalized === ".."
    || normalized.includes("\\")
  ) {
    throw new Error("A valid Studio project id is required.");
  }
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code <= 31 || code === 127) throw new Error("A valid Studio project id is required.");
  }
  return normalized;
}

function withQuery(pathname: string, values: Readonly<Record<string, string>>): string {
  const params = new URLSearchParams(values);
  params.sort();
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function workHref(projectId: string, surface: string): string {
  return `/studio/work/${encodeURIComponent(projectId)}/${surface}`;
}

function productionHref(projectId: string, surface: "projects" | "share"): string {
  return withQuery(`/studio/${surface}`, { scope: `work:${projectId}` });
}

function assetHref(projectId: string, view?: string): string {
  return withQuery("/studio/assets", {
    project: projectId,
    ...(view ? { view } : {}),
  });
}

function destination(
  projectId: string,
  section: StudioProjectSection,
  view: string,
): Omit<StudioProjectViewDestination, "labelEn" | "labelKo" | "section" | "view"> {
  if (section === "overview") {
    if (view === "readiness") {
      return {
        owner: "project-shell",
        href: null,
        ctaKo: "현재 화면에서 확인",
        ctaEn: "Review here",
        descriptionKo: "스토리·제작·에셋·검토·현지화·출력의 실제 연결 상태를 이 화면에서 계산합니다.",
        descriptionEn: "Calculate the connected story, production, asset, review, localization and export state here.",
      };
    }
    return {
      owner: "production",
      href: productionHref(projectId, "projects"),
      ctaKo: "실제 프로젝트 보드 열기",
      ctaEn: "Open the production board",
      descriptionKo: view === "activity"
        ? "SQLite/OPFS 제작 작업공간에서 최근 작업과 저장 상태를 확인합니다."
        : "실제 프로젝트·작업·저장 상태가 연결된 제작 운영 화면을 엽니다.",
      descriptionEn: view === "activity"
        ? "Review recent work and persistence state in the SQLite/OPFS production workspace."
        : "Open the production workspace backed by real project, task and persistence state.",
    };
  }

  if (section === "story") {
    if (view === "episodes" || view === "script") {
      return {
        owner: "story",
        href: withQuery("/story-lab", { project: projectId }),
        ctaKo: "대본 작업공간 열기",
        ctaEn: "Open the script workspace",
        descriptionKo: "대본·에피소드 작업을 실제 Story Lab 편집 흐름으로 이어갑니다.",
        descriptionEn: "Continue scripts and episodes in the shipped Story Lab workflow.",
      };
    }
    if (view === "characters") {
      return {
        owner: "assets",
        href: withQuery("/studio/assets/characters/new", { project: projectId }),
        ctaKo: "캐릭터 작업공간 열기",
        ctaEn: "Open the character workspace",
        descriptionKo: "프로젝트 문맥을 유지한 채 캐릭터·표정·포즈 제작 화면을 엽니다.",
        descriptionEn: "Open character, expression and pose authoring while preserving project context.",
      };
    }
    if (view === "localization") {
      return {
        owner: "editor",
        href: withQuery(workHref(projectId, "comic"), { workspace: "localization" }),
        ctaKo: "현지화 원고 열기",
        ctaEn: "Open localized manuscript",
        descriptionKo: "번역·클리닝·레터링을 같은 원고의 현지화 작업공간에서 처리합니다.",
        descriptionEn: "Handle translation, cleaning and lettering in the manuscript localization workspace.",
      };
    }
    return {
      owner: "story",
      href: workHref(projectId, "storyworld"),
      ctaKo: "스토리월드 열기",
      ctaEn: "Open Storyworld",
      descriptionKo: "세계관·연표·관계·참고자료를 실제 문서 문맥의 Storyworld 화면에서 관리합니다.",
      descriptionEn: "Manage worldbuilding, timelines, relations and references in the document-scoped Storyworld surface.",
    };
  }

  if (section === "production") {
    if (view === "documents") {
      return {
        owner: "editor",
        href: workHref(projectId, "canvas"),
        ctaKo: "원고 열기",
        ctaEn: "Open manuscript",
        descriptionKo: "현재 프로젝트의 실제 캔버스·레이어·도구 상태를 엽니다.",
        descriptionEn: "Open the real canvas, layer and tool state for this project.",
      };
    }
    if (view === "renders") {
      return {
        owner: "production",
        href: workHref(projectId, "present"),
        ctaKo: "렌더·피치 작업 열기",
        ctaEn: "Open render and pitch work",
        descriptionKo: "처리 중 결과와 PPTX 피치 출력을 실제 제작 운영 화면에서 확인합니다.",
        descriptionEn: "Review in-flight results and PPTX pitch output in the production workspace.",
      };
    }
    return {
      owner: "production",
      href: productionHref(projectId, "projects"),
      ctaKo: "제작 운영 화면 열기",
      ctaEn: "Open production operations",
      descriptionKo: "작업 보드·단계·일정·담당량을 실제 저장되는 제작 운영 화면에서 관리합니다.",
      descriptionEn: "Manage boards, stages, schedules and workload in the persisted production workspace.",
    };
  }

  if (section === "assets") {
    if (view === "team") {
      return {
        owner: "production",
        href: productionHref(projectId, "share"),
        ctaKo: "팀·공유 설정 열기",
        ctaEn: "Open team and sharing",
        descriptionKo: "팀 구성원과 프로젝트 접근 권한을 실제 공유 화면에서 관리합니다.",
        descriptionEn: "Manage team members and project access in the shipped sharing surface.",
      };
    }
    return {
      owner: "assets",
      href: assetHref(projectId, view === "series" ? "series-kit" : view),
      ctaKo: "프로젝트 에셋 열기",
      ctaEn: "Open project assets",
      descriptionKo: "설치·누락·권리·Series Kit를 프로젝트 문맥이 유지되는 통합 에셋 화면에서 확인합니다.",
      descriptionEn: "Review installed, missing, rights and Series Kit state in the project-scoped asset hub.",
    };
  }

  if (section === "review") {
    if (view === "versions" || view === "compare") {
      return {
        owner: "production",
        href: workHref(projectId, "versions"),
        ctaKo: "버전·비교 화면 열기",
        ctaEn: "Open versions and comparison",
        descriptionKo: "서버 리비전과 저장된 버전을 실제 버전 비교 화면에서 확인합니다.",
        descriptionEn: "Review server revisions and stored versions in the shipped comparison surface.",
      };
    }
    if (view === "share") {
      return {
        owner: "production",
        href: productionHref(projectId, "share"),
        ctaKo: "공유·외부 검토 열기",
        ctaEn: "Open sharing and external review",
        descriptionKo: "편집 초대와 가벼운 외부 검토 링크를 실제 공유 화면에서 만듭니다.",
        descriptionEn: "Create editor invitations and lightweight external review links in the sharing surface.",
      };
    }
    return {
      owner: "production",
      href: workHref(projectId, "review"),
      ctaKo: "리뷰·승인 화면 열기",
      ctaEn: "Open review and approval",
      descriptionKo: "댓글·수정 요청·승인을 실제 문서 버전에 연결된 리뷰 화면에서 처리합니다.",
      descriptionEn: "Handle comments, change requests and approvals in the document-version review surface.",
    };
  }

  if (section === "export") {
    if (view === "analytics") {
      return {
        owner: "production",
        href: productionHref(projectId, "projects"),
        ctaKo: "프로젝트 성과 화면 열기",
        ctaEn: "Open project performance",
        descriptionKo: "제작 진행과 전달 결과를 실제 프로젝트 운영 데이터와 함께 확인합니다.",
        descriptionEn: "Review production progress and delivery outcomes alongside real project operations data.",
      };
    }
    return {
      owner: "publishing",
      href: workHref(projectId, "publish"),
      ctaKo: "출력 사전검사·게시 열기",
      ctaEn: "Open preflight and publishing",
      descriptionKo: "플랫폼 규격·권리·현지화·파일 패키지를 실제 게시 사전검사 흐름에서 확인합니다.",
      descriptionEn: "Check platform rules, rights, localization and file packages in the shipped publishing preflight.",
    };
  }

  if (view === "team") {
    return {
      owner: "production",
      href: productionHref(projectId, "share"),
      ctaKo: "팀·권한 화면 열기",
      ctaEn: "Open team and permissions",
      descriptionKo: "실제 공유 권한과 참여자 상태를 제작 운영 화면에서 관리합니다.",
      descriptionEn: "Manage real sharing permissions and participant state in production operations.",
    };
  }
  return {
    owner: "project-shell",
    href: null,
    ctaKo: "현재 프로젝트에서 설정",
    ctaEn: "Configure in this project",
    descriptionKo: "프로젝트 기본값·자동화·보관 정책은 이 셸이 소유하며 다른 제품으로 이동하지 않습니다.",
    descriptionEn: "Project defaults, automation and lifecycle policy remain owned by this shell instead of another product.",
  };
}

export function resolveStudioProjectViewDestination(
  projectId: string,
  section: StudioProjectSection,
  view: string,
): StudioProjectViewDestination {
  const normalizedProjectId = requireProjectId(projectId);
  if (!isStudioProjectView(section, view)) {
    throw new Error(`Unknown ${section} project view: ${view}`);
  }
  const label = STUDIO_PROJECT_VIEW_LABELS[section][view];
  const resolved = destination(normalizedProjectId, section, view);
  return Object.freeze({
    section,
    view,
    labelKo: label.ko,
    labelEn: label.en,
    ...resolved,
  });
}

/** Every planned view must resolve either to a real shipped route or an explicit shell-owned view. */
export function auditStudioProjectViewDestinations(projectId = "audit-project"): readonly string[] {
  const issues: string[] = [];
  for (const [section, views] of Object.entries(STUDIO_PROJECT_SECTION_VIEWS)) {
    for (const view of views) {
      try {
        const resolved = resolveStudioProjectViewDestination(
          projectId,
          section as StudioProjectSection,
          view,
        );
        if (resolved.owner !== "project-shell" && !resolved.href) {
          issues.push(`${section}.${view} has no reachable route`);
        }
        if (resolved.href?.startsWith(`/studio/p/${encodeURIComponent(projectId)}/${section}?view=`)) {
          issues.push(`${section}.${view} loops back to its own placeholder`);
        }
      } catch (error) {
        issues.push(`${section}.${view}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return Object.freeze(issues);
}
