export const STUDIO_PROJECT_SECTION_VIEWS = {
  overview: ["summary", "activity", "readiness"],
  story: [
    "overview",
    "episodes",
    "script",
    "characters",
    "world",
    "timeline",
    "relations",
    "references",
    "localization",
  ],
  production: ["board", "documents", "pipeline", "calendar", "workload", "renders"],
  assets: ["project", "series", "team", "installed", "missing", "rights"],
  review: ["inbox", "comments", "requests", "approvals", "versions", "compare", "share"],
  export: ["preflight", "targets", "localization", "packages", "history", "analytics"],
  settings: ["general", "team", "automation", "defaults", "archive"],
} as const;

export type StudioProjectSection = keyof typeof STUDIO_PROJECT_SECTION_VIEWS;
export type StudioProjectView<S extends StudioProjectSection = StudioProjectSection> =
  (typeof STUDIO_PROJECT_SECTION_VIEWS)[S][number];

export const STUDIO_PROJECT_VIEW_LABELS: Readonly<
  Record<StudioProjectSection, Readonly<Record<string, { readonly ko: string; readonly en: string }>>>
> = Object.freeze({
  overview: Object.freeze({
    summary: { ko: "요약", en: "Summary" },
    activity: { ko: "최근 활동", en: "Activity" },
    readiness: { ko: "완성 준비", en: "Readiness" },
  }),
  story: Object.freeze({
    overview: { ko: "작품 구조", en: "Overview" },
    episodes: { ko: "에피소드", en: "Episodes" },
    script: { ko: "대본", en: "Script" },
    characters: { ko: "캐릭터", en: "Characters" },
    world: { ko: "세계관", en: "World" },
    timeline: { ko: "연표", en: "Timeline" },
    relations: { ko: "관계도", en: "Relations" },
    references: { ko: "참고자료", en: "References" },
    localization: { ko: "현지화", en: "Localization" },
  }),
  production: Object.freeze({
    board: { ko: "제작 보드", en: "Board" },
    documents: { ko: "문서", en: "Documents" },
    pipeline: { ko: "제작 단계", en: "Pipeline" },
    calendar: { ko: "일정", en: "Calendar" },
    workload: { ko: "담당·작업량", en: "Workload" },
    renders: { ko: "처리 중 작업", en: "Renders" },
  }),
  assets: Object.freeze({
    project: { ko: "프로젝트", en: "Project" },
    series: { ko: "Series Kit", en: "Series Kit" },
    team: { ko: "팀", en: "Team" },
    installed: { ko: "설치됨", en: "Installed" },
    missing: { ko: "누락", en: "Missing" },
    rights: { ko: "사용 권리", en: "Rights" },
  }),
  review: Object.freeze({
    inbox: { ko: "받은 요청", en: "Inbox" },
    comments: { ko: "댓글", en: "Comments" },
    requests: { ko: "수정 요청", en: "Change requests" },
    approvals: { ko: "승인", en: "Approvals" },
    versions: { ko: "버전", en: "Versions" },
    compare: { ko: "비교", en: "Compare" },
    share: { ko: "공유", en: "Share" },
  }),
  export: Object.freeze({
    preflight: { ko: "사전검사", en: "Preflight" },
    targets: { ko: "사용할 곳", en: "Destinations" },
    localization: { ko: "언어별 출력", en: "Localization" },
    packages: { ko: "파일 패키지", en: "Packages" },
    history: { ko: "출력 기록", en: "History" },
    analytics: { ko: "성과", en: "Analytics" },
  }),
  settings: Object.freeze({
    general: { ko: "프로젝트 정보", en: "General" },
    team: { ko: "팀·권한", en: "Team & permissions" },
    automation: { ko: "자동화", en: "Automation" },
    defaults: { ko: "기본값", en: "Defaults" },
    archive: { ko: "보관", en: "Archive" },
  }),
});

export interface StudioProjectViewResolution<S extends StudioProjectSection = StudioProjectSection> {
  readonly section: S;
  readonly view: StudioProjectView<S>;
  readonly canonicalHref: string;
  readonly canonicalPathname: string;
  readonly changed: boolean;
}

function validIdentity(value: string): boolean {
  if (
    value.length === 0
    || value.length > 160
    || value.trim() !== value
    || value === "."
    || value === ".."
    || value.includes("\\")
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

export function isStudioProjectSection(value: unknown): value is StudioProjectSection {
  return typeof value === "string" && Object.hasOwn(STUDIO_PROJECT_SECTION_VIEWS, value);
}

export function isStudioProjectView<S extends StudioProjectSection>(
  section: S,
  value: unknown,
): value is StudioProjectView<S> {
  return typeof value === "string"
    && (STUDIO_PROJECT_SECTION_VIEWS[section] as readonly string[]).includes(value);
}

export function studioProjectDefaultView<S extends StudioProjectSection>(
  section: S,
): StudioProjectView<S> {
  return STUDIO_PROJECT_SECTION_VIEWS[section][0] as StudioProjectView<S>;
}

export function studioProjectSectionPathname(
  projectId: string,
  section: StudioProjectSection,
): string {
  if (!validIdentity(projectId)) throw new Error("A project route requires a valid identity.");
  return `/studio/p/${encodeURIComponent(projectId)}/${section}`;
}

export function studioProjectSectionHref<S extends StudioProjectSection>(
  projectId: string,
  section: S,
  view: StudioProjectView<S> = studioProjectDefaultView(section),
  search?: string | URLSearchParams,
): string {
  if (!isStudioProjectView(section, view)) {
    throw new Error(`Unknown ${section} project view: ${String(view)}`);
  }
  const params = search instanceof URLSearchParams
    ? new URLSearchParams(search)
    : new URLSearchParams(search ?? "");
  params.delete("view");
  params.set("view", view);
  params.sort();
  const serialized = params.toString();
  const pathname = studioProjectSectionPathname(projectId, section);
  return serialized.length > 0 ? `${pathname}?${serialized}` : pathname;
}

export function resolveStudioProjectView<S extends StudioProjectSection>(
  projectId: string,
  section: S,
  search?: string | URLSearchParams,
): StudioProjectViewResolution<S> {
  const params = search instanceof URLSearchParams
    ? new URLSearchParams(search)
    : new URLSearchParams(search ?? "");
  const values = params.getAll("view");
  const requested = values.length === 1 ? values[0] : null;
  const view = isStudioProjectView(section, requested)
    ? requested
    : studioProjectDefaultView(section);
  params.delete("view");
  params.set("view", view);
  params.sort();
  const canonicalPathname = studioProjectSectionPathname(projectId, section);
  const serialized = params.toString();
  const canonicalHref = serialized.length > 0
    ? `${canonicalPathname}?${serialized}`
    : canonicalPathname;
  const originalParams = search instanceof URLSearchParams
    ? new URLSearchParams(search)
    : new URLSearchParams(search ?? "");
  originalParams.sort();
  const original = originalParams.toString();
  return Object.freeze({
    section,
    view,
    canonicalHref,
    canonicalPathname,
    changed: values.length !== 1 || requested !== view || original !== serialized,
  });
}
