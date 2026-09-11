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
  | "production";

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

function assetHref(projectId: string, view: string): string {
  return withQuery("/studio/assets", { project: projectId, view });
}

function shareHref(projectId: string): string {
  return withQuery("/studio/share", { scope: `work:${projectId}` });
}

function owned(
  descriptionKo: string,
  descriptionEn: string,
  ctaKo = "현재 화면에서 작업",
  ctaEn = "Work here",
): Omit<StudioProjectViewDestination, "labelEn" | "labelKo" | "section" | "view"> {
  return {
    owner: "project-shell",
    href: null,
    ctaKo,
    ctaEn,
    descriptionKo,
    descriptionEn,
  };
}

function external(
  owner: Exclude<StudioProjectViewOwner, "project-shell">,
  href: string,
  ctaKo: string,
  ctaEn: string,
  descriptionKo: string,
  descriptionEn: string,
): Omit<StudioProjectViewDestination, "labelEn" | "labelKo" | "section" | "view"> {
  return { owner, href, ctaKo, ctaEn, descriptionKo, descriptionEn };
}

function destination(
  projectId: string,
  section: StudioProjectSection,
  view: string,
): Omit<StudioProjectViewDestination, "labelEn" | "labelKo" | "section" | "view"> {
  if (section === "overview") {
    if (view === "activity") {
      return owned(
        "최근 제작·검토·출력 활동과 독자 반응을 프로젝트 안에서 함께 확인합니다.",
        "Review recent production, review, export and audience activity in this project.",
      );
    }
    if (view === "readiness") {
      return owned(
        "스토리·제작·에셋·검토·현지화·출력 상태를 합쳐 지금 해결할 문제를 계산합니다.",
        "Combine story, production, asset, review, localization and export state into actionable readiness checks.",
      );
    }
    return owned(
      "이어서 할 작업, 진행 상황, 검토 요청과 공개 준비 상태를 한눈에 확인합니다.",
      "See next actions, progress, review requests and release readiness at a glance.",
    );
  }

  if (section === "story") {
    if (view === "characters") {
      return external(
        "assets",
        withQuery("/studio/assets/characters/new", { project: projectId }),
        "캐릭터 편집기 열기",
        "Open character editor",
        "캐릭터 Bible과 연결된 외형·표정·포즈·3D 참고를 전문 편집기에서 조정합니다.",
        "Edit appearance, expressions, poses and 3D reference linked to the character bible.",
      );
    }
    if (view === "localization") {
      return owned(
        "번역·용어집·원문 정리·말풍선 맞춤과 언어별 품질 검사를 이 프로젝트에서 처리합니다.",
        "Handle translation, terminology, cleanup, balloon fitting and locale quality in this project.",
      );
    }
    const descriptions: Readonly<Record<string, readonly [string, string]>> = {
      overview: [
        "작품의 핵심 구조와 캐릭터·장소·설정 사실을 한곳에서 관리합니다.",
        "Manage the core story structure, characters, locations and facts in one place.",
      ],
      episodes: [
        "에피소드와 장면의 순서·목적·갈등을 정리하고 컷 계획으로 연결합니다.",
        "Organize episodes and scenes, then connect their purpose and conflict to panel planning.",
      ],
      script: [
        "장면과 대사를 작성하고 샷·카메라·말풍선 공간·스크롤 간격 제안을 확인합니다.",
        "Write beats and dialogue, then review shot, camera, balloon-space and scroll-gap suggestions.",
      ],
      world: [
        "세계관 규칙·조직·장소·소품과 장면 사이의 연결을 관리합니다.",
        "Manage world rules, organizations, locations, props and scene links.",
      ],
      timeline: [
        "사건과 캐릭터 상태의 시간 순서를 확인하고 설명 없는 변화를 찾습니다.",
        "Review event and character-state chronology and detect unexplained changes.",
      ],
      relations: [
        "캐릭터·조직·사건의 관계와 변화 시점을 연결합니다.",
        "Connect characters, organizations and events with relationship changes over time.",
      ],
      references: [
        "이미지·문서·링크·색상·3D 참고를 출처와 함께 프로젝트에 정리합니다.",
        "Organize images, documents, links, colors and 3D references with their sources.",
      ],
    };
    const text = descriptions[view] ?? descriptions.overview!;
    return owned(text[0], text[1]);
  }

  if (section === "production") {
    if (view === "documents") {
      return external(
        "editor",
        workHref(projectId, "canvas"),
        "원고 편집기 열기",
        "Open manuscript editor",
        "현재 프로젝트의 캔버스·레이어·도구와 웹툰 품질 검사를 전문 편집기에서 이어갑니다.",
        "Continue with the project canvas, layers, tools and webtoon quality checks in the full editor.",
      );
    }
    if (view === "renders") {
      return owned(
        "3D 분리 출력, 음성 재생성, 장면 타이밍과 장시간 처리 작업을 한곳에서 계획합니다.",
        "Plan 3D render passes, voice regeneration, scene timing and long-running jobs in one place.",
      );
    }
    const descriptions: Readonly<Record<string, readonly [string, string]>> = {
      board: [
        "대본부터 출력까지의 작업을 진행 상태와 다음 행동 중심으로 관리합니다.",
        "Manage work from story through export by status and next action.",
      ],
      pipeline: [
        "단계 의존 관계와 병목을 계산하고 지금 시작할 수 있는 작업을 표시합니다.",
        "Calculate stage dependencies and bottlenecks and surface work that can start now.",
      ],
      calendar: [
        "마감과 제작 단계를 일정에 배치하고 지연 위험을 확인합니다.",
        "Place deadlines and production stages on a schedule and identify delay risks.",
      ],
      workload: [
        "담당자별 남은 작업과 예상 시간을 비교해 과부하를 줄입니다.",
        "Compare remaining work and estimates by assignee to reduce overload.",
      ],
    };
    const text = descriptions[view] ?? descriptions.board!;
    return owned(text[0], text[1]);
  }

  if (section === "assets") {
    if (view === "series") {
      return owned(
        "작품 로고·색상·글꼴·말풍선·출력 규칙을 Series Kit으로 저장하고 모든 결과물에 재사용합니다.",
        "Store logos, colors, fonts, balloon styles and export rules in a reusable Series Kit.",
      );
    }
    if (view === "team") {
      return external(
        "production",
        shareHref(projectId),
        "팀·권한 관리",
        "Manage team and access",
        "프로젝트 참여자와 편집·검토·다운로드 권한을 관리합니다.",
        "Manage project members and edit, review and download permissions.",
      );
    }
    const viewName = view === "project" ? "project" : view;
    return external(
      "assets",
      assetHref(projectId, viewName),
      "에셋 화면 열기",
      "Open asset hub",
      view === "rights"
        ? "프로젝트에서 사용한 에셋·글꼴·AI 결과의 사용 권리와 출처를 확인합니다."
        : view === "missing"
          ? "누락되거나 연결이 끊긴 에셋을 찾아 다시 연결하거나 안전한 대체물을 선택합니다."
          : "현재 프로젝트에 설치·연결된 브러시·이미지·3D·글꼴·오디오를 관리합니다.",
      view === "rights"
        ? "Review usage rights and provenance for project assets, fonts and AI results."
        : view === "missing"
          ? "Find missing or disconnected assets and reconnect or replace them safely."
          : "Manage brushes, images, 3D, fonts and audio installed or linked to this project.",
    );
  }

  if (section === "review") {
    const descriptions: Readonly<Record<string, readonly [string, string]>> = {
      inbox: [
        "나에게 온 검토·수정·승인 요청을 우선순위와 상태별로 확인합니다.",
        "Review incoming review, change and approval requests by priority and state.",
      ],
      comments: [
        "문서·컷·레이어·대사에 연결된 댓글을 한 흐름에서 확인하고 해결합니다.",
        "Resolve comments connected to documents, panels, layers and dialogue in one flow.",
      ],
      requests: [
        "수정 요청을 담당자와 완료 상태에 연결하고 승인 전 해결 여부를 확인합니다.",
        "Assign change requests, track completion and verify resolution before approval.",
      ],
      approvals: [
        "검토자를 지정하고 승인된 버전을 자동으로 보관합니다.",
        "Assign reviewers and preserve approved versions automatically.",
      ],
      versions: [
        "자동·이름 있는·승인·출력 버전을 프로젝트 안에서 확인합니다.",
        "Review automatic, named, approved and exported versions inside the project.",
      ],
      compare: [
        "두 버전의 컷·대사·레이어·픽셀 차이를 비교하고 양쪽 결과를 보존합니다.",
        "Compare panel, dialogue, layer and pixel differences while preserving both results.",
      ],
      share: [
        "편집 초대와 로그인 없는 외부 검토 링크를 안전한 권한으로 만듭니다.",
        "Create editor invitations and login-free external review links with safe permissions.",
      ],
    };
    const text = descriptions[view] ?? descriptions.inbox!;
    return owned(text[0], text[1]);
  }

  if (section === "export") {
    const descriptions: Readonly<Record<string, readonly [string, string]>> = {
      preflight: [
        "플랫폼 규격·가독성·누락 에셋·사용 권리·현지화 상태를 출력 전에 검사합니다.",
        "Check platform rules, readability, missing assets, rights and localization before export.",
      ],
      targets: [
        "웹툰 플랫폼·SNS·인쇄·다른 편집기·전자책·영상 중 사용할 곳을 먼저 선택합니다.",
        "Choose a destination such as webtoon platform, social, print, another editor, ebook or video.",
      ],
      localization: [
        "승인된 언어별 원고와 메타데이터를 각각의 게시 규격으로 준비합니다.",
        "Prepare approved localized manuscripts and metadata for each publishing target.",
      ],
      packages: [
        "이미지·PSD·PDF·PPTX·EPUB·영상·프로젝트 백업을 재현 가능한 패키지로 만듭니다.",
        "Build reproducible image, PSD, PDF, PPTX, EPUB, video and project backup packages.",
      ],
      history: [
        "출력한 버전·설정·경고·파일을 기록하고 같은 결과를 다시 만들 수 있습니다.",
        "Record exported versions, settings, warnings and files so results can be reproduced.",
      ],
      analytics: [
        "언어와 에피소드별 조회·완독·반응·수익·제작 비용을 비교합니다.",
        "Compare opens, completion, reactions, revenue and production costs by episode and locale.",
      ],
    };
    const text = descriptions[view] ?? descriptions.preflight!;
    return owned(text[0], text[1]);
  }

  if (section === "settings" && view === "team") {
    return external(
      "production",
      shareHref(projectId),
      "팀·권한 관리",
      "Manage team and access",
      "프로젝트 참여자와 역할별 권한을 관리합니다.",
      "Manage project members and role-based permissions.",
    );
  }
  const settingsDescriptions: Readonly<Record<string, readonly [string, string]>> = {
    general: [
      "프로젝트 이름·설명·종류·기본 언어와 제작 메타데이터를 관리합니다.",
      "Manage project name, description, type, primary locale and production metadata.",
    ],
    automation: [
      "안전한 검사는 자동으로 실행하고 외부 게시·유료·파괴 작업만 확인을 받습니다.",
      "Run safe checks automatically and confirm only external, paid or destructive steps.",
    ],
    defaults: [
      "새 문서·컷·레이어·말풍선·템플릿·출력의 프로젝트 기본값을 관리합니다.",
      "Manage project defaults for documents, panels, layers, balloons, templates and export.",
    ],
    archive: [
      "완전한 프로젝트 사본을 만든 뒤 복원 가능한 상태로 보관합니다.",
      "Create a complete project copy, then archive the project in a reversible state.",
    ],
  };
  const text = settingsDescriptions[view] ?? settingsDescriptions.general!;
  return owned(text[0], text[1]);
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

/** Every planned view must resolve either to project-owned UI or an intentional specialist editor. */
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
          issues.push(`${section}.${view} loops back to its own view`);
        }
        const copy = `${resolved.descriptionKo} ${resolved.descriptionEn}`;
        if (/SQLite|OPFS|CRDT|리비전|\brevision\b|\blease\b/u.test(copy)) {
          issues.push(`${section}.${view} exposes implementation terminology`);
        }
      } catch (error) {
        issues.push(`${section}.${view}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return Object.freeze(issues);
}
