export const STUDIO_DOCUMENT_WORKSPACES = [
  {
    id: "draw",
    labelKo: "드로잉",
    labelEn: "Drawing",
    descriptionKo: "브러시·레이어·선택·보정으로 원고를 그립니다.",
    descriptionEn: "Draw with brushes, layers, selections and adjustments.",
    legacySurface: "canvas",
    family: "visual",
  },
  {
    id: "comic",
    labelKo: "웹툰",
    labelEn: "Webtoon",
    descriptionKo: "컷·말풍선·대사와 긴 세로 원고를 편집합니다.",
    descriptionEn: "Edit panels, balloons, dialogue and long vertical pages.",
    legacySurface: "comic",
    family: "visual",
  },
  {
    id: "image",
    labelKo: "이미지 편집",
    labelEn: "Image editing",
    descriptionKo: "선택·마스크·필터와 비파괴 보정으로 이미지를 다듬습니다.",
    descriptionEn: "Refine images with selections, masks, filters and non-destructive adjustments.",
    legacySurface: "canvas",
    family: "visual",
  },
  {
    id: "design",
    labelKo: "디자인",
    labelEn: "Design",
    descriptionKo: "표지·홍보물·SNS 규격을 템플릿과 컴포넌트로 제작합니다.",
    descriptionEn: "Create covers, promotions and social formats with templates and components.",
    legacySurface: "canvas",
    family: "layout",
  },
  {
    id: "slides",
    labelKo: "발표 자료",
    labelEn: "Slides",
    descriptionKo: "피칭·설정집·발표 자료를 슬라이드 단위로 구성합니다.",
    descriptionEn: "Build pitches, bibles and presentations slide by slide.",
    legacySurface: "canvas",
    family: "layout",
  },
  {
    id: "storyboard",
    labelKo: "콘티",
    labelEn: "Storyboard",
    descriptionKo: "대본을 장면과 컷으로 나누고 카메라·타이밍을 설계합니다.",
    descriptionEn: "Break scripts into scenes and shots with camera and timing notes.",
    legacySurface: "comic",
    family: "story",
  },
  {
    id: "whiteboard",
    labelKo: "화이트보드",
    labelEn: "Whiteboard",
    descriptionKo: "관계도·아이디어·제작 흐름을 자유롭게 배치합니다.",
    descriptionEn: "Arrange relationships, ideas and production flows freely.",
    legacySurface: "canvas",
    family: "story",
  },
  {
    id: "3d",
    labelKo: "3D",
    labelEn: "3D",
    descriptionKo: "배경·카메라·조명·포즈를 원고 참고와 선화로 연결합니다.",
    descriptionEn: "Connect backgrounds, cameras, lights and poses to reference and line art.",
    legacySurface: "bg3d",
    family: "spatial",
  },
  {
    id: "animation",
    labelKo: "애니메이션",
    labelEn: "Animation",
    descriptionKo: "프레임·키프레임·어니언 스킨으로 움직임을 만듭니다.",
    descriptionEn: "Create motion with frames, keyframes and onion skinning.",
    legacySurface: "animation",
    family: "time",
  },
  {
    id: "motion",
    labelKo: "모션 웹툰",
    labelEn: "Motion comic",
    descriptionKo: "컷·대사·카메라 이동을 장면과 타임라인으로 편집합니다.",
    descriptionEn: "Edit panels, dialogue and camera movement as scenes or on a timeline.",
    legacySurface: "animation",
    family: "time",
  },
  {
    id: "audio",
    labelKo: "음성·오디오",
    labelEn: "Voice & audio",
    descriptionKo: "캐릭터 음성·효과음·BGM과 발음 사전을 관리합니다.",
    descriptionEn: "Manage character voices, sound effects, music and pronunciation dictionaries.",
    legacySurface: "animation",
    family: "time",
  },
  {
    id: "localization",
    labelKo: "현지화",
    labelEn: "Localization",
    descriptionKo: "번역·클리닝·레터링·언어별 품질 검사를 처리합니다.",
    descriptionEn: "Handle translation, cleaning, lettering and locale-specific quality checks.",
    legacySurface: "comic",
    family: "delivery",
  },
  {
    id: "review",
    labelKo: "검토",
    labelEn: "Review",
    descriptionKo: "댓글·수정 요청·버전 비교·승인을 문서 맥락에서 처리합니다.",
    descriptionEn: "Handle comments, change requests, version comparison and approval in context.",
    legacySurface: "canvas",
    family: "delivery",
  },
] as const;

export type StudioDocumentWorkspaceDefinition =
  (typeof STUDIO_DOCUMENT_WORKSPACES)[number];
export type StudioDocumentWorkspaceId = StudioDocumentWorkspaceDefinition["id"];
export type StudioDocumentLegacySurface = StudioDocumentWorkspaceDefinition["legacySurface"];
export type StudioDocumentRouteErrorCode =
  | "invalid-document-id"
  | "invalid-draft-id"
  | "invalid-focus"
  | "invalid-language"
  | "invalid-path"
  | "invalid-project-id"
  | "invalid-version"
  | "invalid-workspace";

export interface StudioDocumentLocationInput {
  readonly pathname: string;
  readonly search?: string | URLSearchParams;
}

export interface StudioDocumentHrefInput {
  readonly projectId?: string | null;
  readonly documentId?: string | null;
  readonly draftId?: string | null;
  readonly workspace?: StudioDocumentWorkspaceId;
  readonly focus?: string | null;
  readonly language?: string | null;
  readonly version?: string | null;
  readonly search?: string | URLSearchParams;
}

export interface StudioDocumentRouteResolution {
  readonly kind: "document";
  readonly scope: "project" | "draft";
  readonly canonicalHref: string;
  readonly canonicalPathname: string;
  readonly documentKey: string;
  readonly projectId: string | null;
  readonly documentId: string | null;
  readonly draftId: string | null;
  readonly workspace: StudioDocumentWorkspaceId;
  readonly focus: string | null;
  readonly language: string | null;
  readonly version: string | null;
  readonly legacyEditorHref: string;
}

export interface StudioInvalidDocumentRouteResolution {
  readonly kind: "invalid-document";
  readonly errorCode: StudioDocumentRouteErrorCode;
}

export interface StudioNotDocumentRouteResolution {
  readonly kind: "not-document";
}

export type StudioDocumentRouteResult =
  | StudioDocumentRouteResolution
  | StudioInvalidDocumentRouteResolution
  | StudioNotDocumentRouteResolution;

const WORKSPACE_IDS = new Set<StudioDocumentWorkspaceId>(
  STUDIO_DOCUMENT_WORKSPACES.map((workspace) => workspace.id),
);
const WORKSPACE_BY_ID = new Map<StudioDocumentWorkspaceId, StudioDocumentWorkspaceDefinition>(
  STUDIO_DOCUMENT_WORKSPACES.map((workspace) => [workspace.id, workspace]),
);
const RESERVED_QUERY_KEYS = ["workspace", "focus", "language", "version"] as const;

function paramsFrom(search: string | URLSearchParams | undefined): URLSearchParams {
  return search instanceof URLSearchParams
    ? new URLSearchParams(search)
    : new URLSearchParams(search ?? "");
}

function containsUnsafeCharacter(value: string): boolean {
  if (value.includes("\\")) return true;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function normalizeIdentity(value: string | null | undefined): string | null {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 160
    || value.trim() !== value
    || value === "."
    || value === ".."
    || containsUnsafeCharacter(value)
  ) {
    return null;
  }
  return value;
}

function decodeIdentity(segment: string): string | null {
  try {
    return normalizeIdentity(decodeURIComponent(segment));
  } catch {
    return null;
  }
}

function singleValue(
  params: URLSearchParams,
  key: (typeof RESERVED_QUERY_KEYS)[number],
): string | null | undefined {
  const values = params.getAll(key);
  if (values.length > 1) return undefined;
  return values[0] ?? null;
}

function normalizeFocus(value: string | null): string | null | undefined {
  if (value === null) return null;
  if (value.length === 0 || value.length > 256 || containsUnsafeCharacter(value)) {
    return undefined;
  }
  return value;
}

function normalizeLanguage(value: string | null): string | null | undefined {
  if (value === null) return null;
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(value) ? value : undefined;
}

function normalizeVersion(value: string | null): string | null | undefined {
  if (value === null) return null;
  return normalizeIdentity(value) ?? undefined;
}

function serializedHref(pathname: string, params: URLSearchParams): string {
  params.sort();
  const search = params.toString();
  return search.length > 0 ? `${pathname}?${search}` : pathname;
}

function requireDocumentMode(input: StudioDocumentHrefInput): {
  readonly scope: "project" | "draft";
  readonly projectId: string | null;
  readonly documentId: string | null;
  readonly draftId: string | null;
} {
  const projectId = normalizeIdentity(input.projectId);
  const documentId = normalizeIdentity(input.documentId);
  const draftId = normalizeIdentity(input.draftId);
  const projectMode = projectId !== null || documentId !== null;
  const draftMode = draftId !== null;

  if (projectMode === draftMode || (projectMode && (projectId === null || documentId === null))) {
    throw new Error("A document href requires either projectId + documentId or one draftId.");
  }
  return projectMode
    ? { scope: "project", projectId, documentId, draftId: null }
    : { scope: "draft", projectId: null, documentId: null, draftId };
}

export function isStudioDocumentWorkspace(value: unknown): value is StudioDocumentWorkspaceId {
  return typeof value === "string" && WORKSPACE_IDS.has(value as StudioDocumentWorkspaceId);
}

export function studioDocumentWorkspaceById(
  id: StudioDocumentWorkspaceId,
): StudioDocumentWorkspaceDefinition {
  const workspace = WORKSPACE_BY_ID.get(id);
  if (!workspace) throw new Error(`Unknown Studio document workspace: ${id}`);
  return workspace;
}

export function studioDocumentWorkspaceToLegacySurface(
  id: StudioDocumentWorkspaceId,
): StudioDocumentLegacySurface {
  return studioDocumentWorkspaceById(id).legacySurface;
}

export function studioProjectDocumentPathname(projectId: string, documentId: string): string {
  const normalizedProjectId = normalizeIdentity(projectId);
  const normalizedDocumentId = normalizeIdentity(documentId);
  if (!normalizedProjectId || !normalizedDocumentId) {
    throw new Error("Project document paths require valid project and document identities.");
  }
  return `/studio/p/${encodeURIComponent(normalizedProjectId)}/d/${encodeURIComponent(normalizedDocumentId)}`;
}

export function studioDraftDocumentPathname(draftId: string): string {
  const normalizedDraftId = normalizeIdentity(draftId);
  if (!normalizedDraftId) throw new Error("Draft document paths require a valid draft identity.");
  return `/studio/draft/${encodeURIComponent(normalizedDraftId)}`;
}

export function studioDocumentHref(input: StudioDocumentHrefInput): string {
  const identity = requireDocumentMode(input);
  const workspace = input.workspace ?? "draw";
  const params = paramsFrom(input.search);
  for (const key of RESERVED_QUERY_KEYS) params.delete(key);
  params.set("workspace", workspace);
  if (input.focus) params.set("focus", input.focus);
  if (input.language) params.set("language", input.language);
  if (input.version) params.set("version", input.version);

  const pathname = identity.scope === "project"
    ? studioProjectDocumentPathname(identity.projectId ?? "", identity.documentId ?? "")
    : studioDraftDocumentPathname(identity.draftId ?? "");
  return serializedHref(pathname, params);
}

export function studioLegacyEditorHref(input: StudioDocumentHrefInput): string {
  const identity = requireDocumentMode(input);
  const workspace = input.workspace ?? "draw";
  const legacySurface = studioDocumentWorkspaceToLegacySurface(workspace);
  const params = paramsFrom(input.search);
  for (const key of RESERVED_QUERY_KEYS) params.delete(key);
  params.delete("id");
  params.delete("mode");
  params.delete("remix");
  params.set("workspace", workspace);
  if (identity.projectId) params.set("project", identity.projectId);
  if (identity.draftId) params.set("draft", identity.draftId);
  if (input.focus) params.set("focus", input.focus);
  if (input.language) params.set("language", input.language);
  if (input.version) params.set("version", input.version);

  const pathname = identity.documentId
    ? `/studio/work/${encodeURIComponent(identity.documentId)}/${legacySurface}`
    : `/studio/${legacySurface}`;
  return serializedHref(pathname, params);
}

export function parseStudioDocumentLocation({
  pathname,
  search,
}: StudioDocumentLocationInput): StudioDocumentRouteResult {
  if (!pathname.startsWith("/studio/")) return { kind: "not-document" };
  const rawSegments = pathname.split("/").slice(1);
  if (rawSegments.at(-1) === "") rawSegments.pop();
  if (rawSegments.some((segment) => segment.length === 0)) {
    return { kind: "invalid-document", errorCode: "invalid-path" };
  }

  let scope: "project" | "draft";
  let projectId: string | null = null;
  let documentId: string | null = null;
  let draftId: string | null = null;
  if (
    rawSegments.length === 5
    && rawSegments[0] === "studio"
    && rawSegments[1] === "p"
    && rawSegments[3] === "d"
  ) {
    scope = "project";
    projectId = decodeIdentity(rawSegments[2] ?? "");
    documentId = decodeIdentity(rawSegments[4] ?? "");
    if (!projectId) return { kind: "invalid-document", errorCode: "invalid-project-id" };
    if (!documentId) return { kind: "invalid-document", errorCode: "invalid-document-id" };
  } else if (
    rawSegments.length === 3
    && rawSegments[0] === "studio"
    && rawSegments[1] === "draft"
  ) {
    scope = "draft";
    draftId = decodeIdentity(rawSegments[2] ?? "");
    if (!draftId) return { kind: "invalid-document", errorCode: "invalid-draft-id" };
  } else {
    return { kind: "not-document" };
  }

  const params = paramsFrom(search);
  const workspaceValue = singleValue(params, "workspace");
  if (workspaceValue === undefined || (workspaceValue !== null && !isStudioDocumentWorkspace(workspaceValue))) {
    return { kind: "invalid-document", errorCode: "invalid-workspace" };
  }
  const focus = normalizeFocus(singleValue(params, "focus") ?? null);
  if (focus === undefined) return { kind: "invalid-document", errorCode: "invalid-focus" };
  const language = normalizeLanguage(singleValue(params, "language") ?? null);
  if (language === undefined) return { kind: "invalid-document", errorCode: "invalid-language" };
  const version = normalizeVersion(singleValue(params, "version") ?? null);
  if (version === undefined) return { kind: "invalid-document", errorCode: "invalid-version" };
  const workspace = (workspaceValue ?? "draw") as StudioDocumentWorkspaceId;

  for (const key of RESERVED_QUERY_KEYS) params.delete(key);
  params.set("workspace", workspace);
  if (focus) params.set("focus", focus);
  if (language) params.set("language", language);
  if (version) params.set("version", version);

  const canonicalPathname = scope === "project"
    ? studioProjectDocumentPathname(projectId ?? "", documentId ?? "")
    : studioDraftDocumentPathname(draftId ?? "");
  const canonicalHref = serializedHref(canonicalPathname, params);
  const commonInput = {
    projectId,
    documentId,
    draftId,
    workspace,
    focus,
    language,
    version,
    search: params,
  } satisfies StudioDocumentHrefInput;

  return Object.freeze({
    kind: "document",
    scope,
    canonicalHref,
    canonicalPathname,
    documentKey: scope === "project"
      ? `project:${encodeURIComponent(projectId ?? "")}:document:${encodeURIComponent(documentId ?? "")}`
      : `draft:${encodeURIComponent(draftId ?? "")}`,
    projectId,
    documentId,
    draftId,
    workspace,
    focus,
    language,
    version,
    legacyEditorHref: studioLegacyEditorHref(commonInput),
  });
}
