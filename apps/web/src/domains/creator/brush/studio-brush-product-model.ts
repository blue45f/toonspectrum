/** Canonical user-facing model for the single Brush Studio product. */

export const STUDIO_BRUSH_LABELS = Object.freeze({
  product: "브러시 스튜디오",
  choose: "브러시 선택",
  editCurrent: "현재 브러시 편집",
  create: "새 브러시 만들기",
  manage: "브러시 관리",
  fullEditor: "전체 편집",
  expertSettings: "전문가 설정",
} as const);

export const STUDIO_BRUSH_LIBRARY_ROUTE = "/studio/assets/brushes";
export const STUDIO_BRUSH_CREATE_ROUTE = "/studio/assets/brushes/new";

export type StudioBrushEditorMode = "create" | "edit";
export type StudioBrushEditorContextKind = "draft" | "work" | "remix" | "document" | "brush";

export interface StudioBrushEditorRouteParams {
  readonly workId?: string;
  readonly sourceWorkId?: string;
  readonly brushId?: string;
}

export interface StudioBrushEditorContext {
  readonly kind: StudioBrushEditorContextKind;
  readonly mode: StudioBrushEditorMode;
  readonly scope: string;
  readonly baseHref: string;
  readonly returnHref: string;
  readonly returnLabel: string;
  readonly contextLabel: string;
  readonly workspaceTitle: string;
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function createHref(entries: Readonly<Record<string, string | null>> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value) params.set(key, value);
  }
  params.sort();
  const query = params.toString();
  return query ? `${STUDIO_BRUSH_CREATE_ROUTE}?${query}` : STUDIO_BRUSH_CREATE_ROUTE;
}

/** Preserve the active manuscript context while entering the canonical full Brush Studio. */
export function studioBrushEditorHref(pathname: string): string {
  const document = /^\/studio\/p\/([^/]+)\/d\/([^/?#]+)/u.exec(pathname);
  if (document?.[1] && document[2]) {
    return createHref({
      context: "document",
      documentId: decodePathSegment(document[2]),
      projectId: decodePathSegment(document[1]),
    });
  }

  const work = /^\/studio\/work\/([^/?#]+)/u.exec(pathname);
  if (work?.[1]) {
    return createHref({ context: "work", workId: decodePathSegment(work[1]) });
  }

  const remix = /^\/studio\/remix\/([^/?#]+)/u.exec(pathname);
  if (remix?.[1]) {
    return createHref({ context: "remix", sourceWorkId: decodePathSegment(remix[1]) });
  }

  return STUDIO_BRUSH_CREATE_ROUTE;
}

function workContext(workId: string): StudioBrushEditorContext {
  const encoded = encodeURIComponent(workId);
  return {
    kind: "work",
    mode: "create",
    scope: `work:${workId}`,
    baseHref: createHref({ context: "work", workId }),
    returnHref: `/studio/work/${encoded}/canvas`,
    returnLabel: "원고로 돌아가기",
    contextLabel: `원고 ${workId}`,
    workspaceTitle: "원고용 브러시 만들기",
  };
}

function remixContext(sourceWorkId: string): StudioBrushEditorContext {
  const encoded = encodeURIComponent(sourceWorkId);
  return {
    kind: "remix",
    mode: "create",
    scope: `remix:${sourceWorkId}`,
    baseHref: createHref({ context: "remix", sourceWorkId }),
    returnHref: `/studio/remix/${encoded}/canvas`,
    returnLabel: "리믹스로 돌아가기",
    contextLabel: `리믹스 ${sourceWorkId}`,
    workspaceTitle: "리믹스용 브러시 만들기",
  };
}

function documentContext(projectId: string, documentId: string): StudioBrushEditorContext {
  const encodedProject = encodeURIComponent(projectId);
  const encodedDocument = encodeURIComponent(documentId);
  return {
    kind: "document",
    mode: "create",
    scope: `document:${projectId}:${documentId}`,
    baseHref: createHref({ context: "document", documentId, projectId }),
    returnHref: `/studio/p/${encodedProject}/d/${encodedDocument}`,
    returnLabel: "원고로 돌아가기",
    contextLabel: `프로젝트 ${projectId} · 문서 ${documentId}`,
    workspaceTitle: "현재 원고용 브러시 만들기",
  };
}

/** Resolve legacy scoped routes and the canonical query-based context into one editor contract. */
export function resolveStudioBrushEditorContext(
  params: StudioBrushEditorRouteParams,
  search = "",
): StudioBrushEditorContext {
  const brushId = clean(params.brushId);
  if (brushId) {
    const encoded = encodeURIComponent(brushId);
    return {
      kind: "brush",
      mode: "edit",
      scope: `brush:${brushId}`,
      baseHref: `/studio/assets/brushes/${encoded}/edit`,
      returnHref: `${STUDIO_BRUSH_LIBRARY_ROUTE}?selected=${encoded}`,
      returnLabel: "브러시 선택으로",
      contextLabel: `브러시 ${brushId}`,
      workspaceTitle: "브러시 전체 편집",
    };
  }

  const routeWorkId = clean(params.workId);
  if (routeWorkId) return workContext(routeWorkId);

  const routeSourceWorkId = clean(params.sourceWorkId);
  if (routeSourceWorkId) return remixContext(routeSourceWorkId);

  const query = new URLSearchParams(search);
  const context = query.get("context");
  if (context === "work") {
    const workId = clean(query.get("workId"));
    if (workId) return workContext(workId);
  }
  if (context === "remix") {
    const sourceWorkId = clean(query.get("sourceWorkId"));
    if (sourceWorkId) return remixContext(sourceWorkId);
  }
  if (context === "document") {
    const projectId = clean(query.get("projectId"));
    const documentId = clean(query.get("documentId"));
    if (projectId && documentId) return documentContext(projectId, documentId);
  }

  return {
    kind: "draft",
    mode: "create",
    scope: "draft",
    baseHref: STUDIO_BRUSH_CREATE_ROUTE,
    returnHref: "/studio/canvas",
    returnLabel: "캔버스로 돌아가기",
    contextLabel: "새 브러시",
    workspaceTitle: STUDIO_BRUSH_LABELS.create,
  };
}
