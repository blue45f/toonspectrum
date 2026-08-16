import {
  parseStudioWorkspaceRoute,
  studioWorkspaceCanonicalHref,
  studioWorkspaceDocumentIdentity,
  type InvalidStudioWorkspaceRoute,
  type StudioWorkspaceLocationInput,
  type StudioWorkspaceRoute,
  type StudioWorkspaceRouteErrorCode,
} from "../studio-workspace-route";

export const STUDIO_COMPANION_SURFACES = [
  "workspace",
  "navigator",
  "review",
  "reference",
] as const;

export type StudioCompanionRouteSurface =
  (typeof STUDIO_COMPANION_SURFACES)[number];

export type StudioRouteKind =
  | "companion"
  | "editor"
  | "invalid"
  | "placeholder"
  | "publish";

export interface StudioRouteManifestEntry {
  readonly id: string;
  readonly kind: Exclude<StudioRouteKind, "invalid">;
  readonly ownsDocumentTitle: boolean;
  readonly pattern: string;
}

/**
 * The single source of route ownership for the Studio shell. Patterns are descriptive; the pure
 * resolver below owns alias validation and canonicalization so React component lifetime is not
 * coupled to a second, competing route table.
 */
export const STUDIO_ROUTE_MANIFEST = Object.freeze([
  {
    id: "studio-editor",
    kind: "editor",
    ownsDocumentTitle: true,
    pattern: "/studio/(work/:workId|remix/:sourceWorkId)?/:surface?",
  },
  {
    id: "studio-publish",
    kind: "publish",
    ownsDocumentTitle: true,
    pattern: "/studio/(work/:workId/)?publish",
  },
  {
    id: "studio-companion",
    kind: "companion",
    ownsDocumentTitle: true,
    pattern: "/studio/companion/:surface",
  },
  {
    id: "studio-placeholder",
    kind: "placeholder",
    ownsDocumentTitle: false,
    pattern: "/studio/(assets|join|present|projects|review|share|versions)",
  },
  {
    id: "studio-work-placeholder",
    kind: "placeholder",
    ownsDocumentTitle: false,
    pattern: "/studio/work/:workId/:surface",
  },
  {
    id: "studio-remix-placeholder",
    kind: "placeholder",
    ownsDocumentTitle: false,
    pattern: "/studio/remix/:sourceWorkId/:surface",
  },
] as const satisfies readonly StudioRouteManifestEntry[]);

export interface StudioRouteLocationInput extends StudioWorkspaceLocationInput {
  readonly hash?: string;
}

interface StudioResolvedRouteBase {
  readonly canonicalHref: string;
  readonly canonicalPathname: string;
  readonly kind: StudioRouteKind;
  readonly lifecycleKey: string;
  readonly ownsDocumentTitle: boolean;
}

export interface StudioEditorRouteResolution extends StudioResolvedRouteBase {
  readonly kind: "editor";
  readonly workspaceRoute: StudioWorkspaceRoute;
}

export interface StudioPublishRouteResolution extends StudioResolvedRouteBase {
  readonly kind: "publish";
  readonly workId: string | null;
}

export interface StudioCompanionRouteResolution extends StudioResolvedRouteBase {
  readonly kind: "companion";
  readonly surface: StudioCompanionRouteSurface;
}

export type StudioPlaceholderRouteId =
  | "assets"
  | "review"
  | "join"
  | "versions"
  | "present"
  | "projects"
  | "share";

export interface StudioPlaceholderRouteResolution extends StudioResolvedRouteBase {
  readonly kind: "placeholder";
  readonly placeholderId: StudioPlaceholderRouteId;
}

export interface StudioInvalidRouteResolution
  extends Omit<StudioResolvedRouteBase, "canonicalHref" | "canonicalPathname"> {
  readonly errorCode: StudioWorkspaceRouteErrorCode;
  readonly kind: "invalid";
  readonly ownsDocumentTitle: false;
}

export type StudioRouteResolution =
  | StudioCompanionRouteResolution
  | StudioEditorRouteResolution
  | StudioInvalidRouteResolution
  | StudioPlaceholderRouteResolution
  | StudioPublishRouteResolution;

const PLACEHOLDER_IDS = new Set<StudioPlaceholderRouteId>([
  "assets",
  "review",
  "join",
  "versions",
  "present",
  "projects",
  "share",
]);

const WORK_SCOPE_PLACEHOLDER_SURFACES = new Set<Omit<StudioPlaceholderRouteId, "join" | "projects" | "share">>([
  "assets",
  "present",
  "review",
  "versions",
]);

function queryParams(search: string | URLSearchParams | undefined): URLSearchParams {
  return search instanceof URLSearchParams
    ? new URLSearchParams(search)
    : new URLSearchParams(search ?? "");
}

function href(pathname: string, params: URLSearchParams): string {
  const search = params.toString();
  return search.length > 0 ? `${pathname}?${search}` : pathname;
}

function invalidResolution(
  pathname: string,
  search: string | URLSearchParams | undefined,
  error: InvalidStudioWorkspaceRoute | StudioWorkspaceRouteErrorCode,
): StudioInvalidRouteResolution {
  const params = queryParams(search);
  const errorCode = typeof error === "string" ? error : error.errorCode;
  return Object.freeze({
    errorCode,
    kind: "invalid",
    lifecycleKey: href(pathname, params),
    ownsDocumentTitle: false,
  });
}

function normalizedSegments(pathname: string): readonly string[] | null {
  if (pathname !== "/studio" && !pathname.startsWith("/studio/")) return null;
  const segments = pathname.split("/").slice(1);
  if (segments.at(-1) === "") segments.pop();
  if (segments.some((segment) => segment.length === 0)) return null;
  return segments;
}

function publishPathname(workId: string | null): string {
  return workId === null
    ? "/studio/publish"
    : `/studio/work/${encodeURIComponent(workId)}/publish`;
}

function cleanIdentityQuery(
  search: string | URLSearchParams | undefined,
): URLSearchParams {
  const params = queryParams(search);
  params.delete("id");
  params.delete("mode");
  params.delete("remix");
  return params;
}

function resolveCanonicalPublish(
  pathname: string,
  search: string | URLSearchParams | undefined,
): StudioPublishRouteResolution | StudioInvalidRouteResolution | null {
  const segments = normalizedSegments(pathname);
  if (segments === null) return invalidResolution(pathname, search, "invalid-path");
  const isDraftPublish = segments.length === 2
    && (segments[1] === "publish" || segments[1] === "upload");
  if (isDraftPublish) {
    const params = queryParams(search);
    if (params.has("remix")) {
      return invalidResolution(pathname, search, "identity-conflict");
    }
    const legacyIdentity = parseStudioWorkspaceRoute({ pathname: "/studio", search });
    if (!legacyIdentity.valid) {
      return invalidResolution(pathname, search, legacyIdentity);
    }
    const canonicalPathname = publishPathname(legacyIdentity.workId);
    const lifecycleIdentity = legacyIdentity.workId === null
      ? "draft"
      : `work:${encodeURIComponent(legacyIdentity.workId)}`;
    return Object.freeze({
      canonicalHref: href(canonicalPathname, cleanIdentityQuery(search)),
      canonicalPathname,
      kind: "publish",
      lifecycleKey: `/studio/${lifecycleIdentity}/publish`,
      ownsDocumentTitle: true,
      workId: legacyIdentity.workId,
    });
  }
  if (
    segments.length !== 4
    || segments[1] !== "work"
    || (segments[3] !== "publish" && segments[3] !== "upload")
  ) {
    return null;
  }
  const workspace = parseStudioWorkspaceRoute({
    pathname: `/studio/work/${segments[2]}/canvas`,
    search,
  });
  if (!workspace.valid) {
    return invalidResolution(pathname, search, workspace);
  }
  if (workspace.workId === null) {
    return invalidResolution(pathname, search, "invalid-work-id");
  }
  const canonicalPathname = publishPathname(workspace.workId);
  return Object.freeze({
    canonicalHref: href(canonicalPathname, cleanIdentityQuery(search)),
    canonicalPathname,
    kind: "publish",
    lifecycleKey: `/studio/work:${encodeURIComponent(workspace.workId)}/publish`,
    ownsDocumentTitle: true,
    workId: workspace.workId,
  });
}

function isCompanionSurface(value: string): value is StudioCompanionRouteSurface {
  return (STUDIO_COMPANION_SURFACES as readonly string[]).includes(value);
}

function resolveCompanion(
  pathname: string,
  search: string | URLSearchParams | undefined,
): StudioCompanionRouteResolution | StudioInvalidRouteResolution | null {
  const segments = normalizedSegments(pathname);
  if (segments === null) return invalidResolution(pathname, search, "invalid-path");
  const params = queryParams(search);
  let surface: StudioCompanionRouteSurface;
  if (segments.length === 2 && segments[1] === "tools-companion") {
    const views = params.getAll("view");
    if (views.length > 1 || (views.length === 1 && !isCompanionSurface(views[0]))) {
      return invalidResolution(pathname, search, "invalid-path");
    }
    surface = views.length === 1 ? views[0] as StudioCompanionRouteSurface : "workspace";
  } else if (
    segments.length === 3
    && segments[1] === "companion"
    && isCompanionSurface(segments[2])
  ) {
    surface = segments[2];
    const views = params.getAll("view");
    if (views.length > 1 || (views.length === 1 && views[0] !== surface)) {
      return invalidResolution(pathname, search, "invalid-path");
    }
  } else {
    return null;
  }
  const canonicalPathname = `/studio/companion/${surface}`;
  // The detached page still consumes `view`; the identity nevertheless lives in the path. Keeping
  // this redundant compatibility value lets old and new companion builds interoperate safely.
  params.set("view", surface);
  return Object.freeze({
    canonicalHref: href(canonicalPathname, params),
    canonicalPathname,
    kind: "companion",
    lifecycleKey: `${canonicalPathname}`,
    ownsDocumentTitle: true,
    surface,
  });
}

function resolvePlaceholder(
  pathname: string,
  search: string | URLSearchParams | undefined,
): StudioPlaceholderRouteResolution | null {
  const segments = normalizedSegments(pathname);
  if (
    segments === null
    || segments.length !== 2
    || !PLACEHOLDER_IDS.has(segments[1] as StudioPlaceholderRouteId)
  ) {
    return null;
  }
  const placeholderId = segments[1] as StudioPlaceholderRouteId;
  const canonicalPathname = `/studio/${placeholderId}`;
  return Object.freeze({
    canonicalHref: href(canonicalPathname, queryParams(search)),
    canonicalPathname,
    kind: "placeholder",
    lifecycleKey: canonicalPathname,
    ownsDocumentTitle: false,
    placeholderId,
  });
}

function resolveWorkScopedPlaceholder(
  pathname: string,
  search: string | URLSearchParams | undefined,
): StudioPlaceholderRouteResolution | null {
  const segments = normalizedSegments(pathname);
  if (segments === null || segments.length !== 4) return null;
  const [_, scope, encodedIdentity, candidateSurface] = segments;
  if (scope !== "work" && scope !== "remix") return null;
  if (!WORK_SCOPE_PLACEHOLDER_SURFACES.has(candidateSurface as StudioPlaceholderRouteId)) return null;

  const probePathname = `/studio/${scope}/${encodedIdentity}/canvas`;
  const parsed = parseStudioWorkspaceRoute({ pathname: probePathname });
  if (!parsed.valid) return null;
  const surface = candidateSurface as Exclude<
    StudioPlaceholderRouteId,
    "projects" | "join" | "share"
  >;
  const canonicalPathname = scope === "work"
    ? `/studio/work/${encodeURIComponent(parsed.workId ?? "")}/${surface}`
    : `/studio/remix/${encodeURIComponent(parsed.remixSourceWorkId ?? "")}/${surface}`;

  return Object.freeze({
    canonicalHref: href(canonicalPathname, queryParams(search)),
    canonicalPathname,
    kind: "placeholder",
    lifecycleKey: `/studio/${scope === "work"
      ? `work:${encodeURIComponent(parsed.workId ?? "")}`
      : `remix:${encodeURIComponent(parsed.remixSourceWorkId ?? "")}`}/${surface}`,
    ownsDocumentTitle: false,
    placeholderId: surface,
  });
}

export function resolveStudioRoute({
  pathname,
  search,
}: StudioRouteLocationInput): StudioRouteResolution {
  const publish = resolveCanonicalPublish(pathname, search);
  if (publish !== null) return publish;
  const companion = resolveCompanion(pathname, search);
  if (companion !== null) return companion;
  const placeholder = resolvePlaceholder(pathname, search);
  if (placeholder !== null) return placeholder;
  const workScopedPlaceholder = resolveWorkScopedPlaceholder(pathname, search);
  if (workScopedPlaceholder !== null) return workScopedPlaceholder;

  const workspaceRoute = parseStudioWorkspaceRoute({ pathname, search });
  if (!workspaceRoute.valid) return invalidResolution(pathname, search, workspaceRoute);
  if (workspaceRoute.presentation === "publish") {
    const canonicalPathname = publishPathname(workspaceRoute.workId);
    return Object.freeze({
      canonicalHref: href(canonicalPathname, cleanIdentityQuery(search)),
      canonicalPathname,
      kind: "publish",
      lifecycleKey: `/studio/${studioWorkspaceDocumentIdentity(workspaceRoute)}/publish`,
      ownsDocumentTitle: true,
      workId: workspaceRoute.workId,
    });
  }
  return Object.freeze({
    canonicalHref: studioWorkspaceCanonicalHref(workspaceRoute, search),
    canonicalPathname: workspaceRoute.canonicalPathname,
    kind: "editor",
    lifecycleKey: `/studio/${studioWorkspaceDocumentIdentity(workspaceRoute)}/editor`,
    ownsDocumentTitle: true,
    workspaceRoute,
  });
}

export function studioRouteOwnsDocumentTitle(
  location: StudioRouteLocationInput,
): boolean {
  return resolveStudioRoute(location).ownsDocumentTitle;
}
