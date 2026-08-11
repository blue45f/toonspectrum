export const STUDIO_DCC_WORKBENCH_MODES = [
  "model",
  "build",
  "cad",
  "sculpt",
  "material",
  "shot",
] as const;

export type StudioDccWorkbenchMode =
  (typeof STUDIO_DCC_WORKBENCH_MODES)[number];

export type StudioWorkspaceSurface = "canvas" | "dcc";

export type StudioWorkspaceRouteErrorCode =
  | "invalid-path"
  | "invalid-work-id"
  | "work-id-conflict";

export interface StudioWorkspaceRoute {
  readonly canonicalPathname: string;
  readonly dccMode: StudioDccWorkbenchMode | null;
  readonly legacyWorkIdQuery: boolean;
  readonly surface: StudioWorkspaceSurface;
  readonly valid: true;
  readonly workId: string | null;
}

export interface InvalidStudioWorkspaceRoute {
  readonly errorCode: StudioWorkspaceRouteErrorCode;
  readonly valid: false;
}

export type StudioWorkspaceRouteResolution =
  | StudioWorkspaceRoute
  | InvalidStudioWorkspaceRoute;

interface StudioWorkspaceLocationInput {
  readonly pathname: string;
  readonly search?: string | URLSearchParams;
}

interface StudioWorkspaceHrefInput {
  readonly search?: string | URLSearchParams;
  readonly workId: string | null;
}

interface StudioDccWorkspaceHrefInput extends StudioWorkspaceHrefInput {
  readonly mode: StudioDccWorkbenchMode;
}

interface StudioWorkspaceNavigationLocation {
  readonly key: string;
  readonly pathname: string;
  readonly search: string;
}

interface StudioWorkspaceReturnReceipt {
  readonly entryKey: string;
  readonly pathname: string;
  readonly search: string;
  readonly version: 1;
  readonly workId: string | null;
}

export interface StudioDccNavigationState {
  readonly studioWorkspaceReturn: StudioWorkspaceReturnReceipt;
}

function invalidStudioWorkspaceRoute(
  errorCode: StudioWorkspaceRouteErrorCode,
): InvalidStudioWorkspaceRoute {
  return Object.freeze({ errorCode, valid: false });
}

function queryParams(search: string | URLSearchParams | undefined): URLSearchParams {
  if (search instanceof URLSearchParams) return new URLSearchParams(search);
  return new URLSearchParams(search ?? "");
}

function hasUnsafeStudioWorkIdCharacter(value: string): boolean {
  if (value.includes("\\")) return true;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function decodeStudioWorkId(segment: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (
    decoded.length === 0
    || decoded.length > 160
    || decoded.trim() !== decoded
    || decoded === "."
    || decoded === ".."
    || hasUnsafeStudioWorkIdCharacter(decoded)
  ) {
    return null;
  }
  return decoded;
}

function normalizeQueryWorkId(value: string | null): string | null | undefined {
  if (value === null) return null;
  if (
    value.length === 0
    || value.length > 160
    || value.trim() !== value
    || value === "."
    || value === ".."
    || hasUnsafeStudioWorkIdCharacter(value)
  ) {
    return undefined;
  }
  return value;
}

export function isStudioRoutePathname(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/");
}

export function studioRouteStageKey(pathname: string): string {
  return isStudioRoutePathname(pathname) ? "/studio" : pathname;
}

export function shouldPreserveStudioRouteLifecycle(
  previousPathname: string,
  nextPathname: string,
): boolean {
  return isStudioRoutePathname(previousPathname)
    && isStudioRoutePathname(nextPathname);
}

export function isStudioDccWorkbenchMode(
  value: string,
): value is StudioDccWorkbenchMode {
  return (STUDIO_DCC_WORKBENCH_MODES as readonly string[]).includes(value);
}

export function studioCanvasPathname(workId: string | null): string {
  return workId === null
    ? "/studio"
    : `/studio/work/${encodeURIComponent(workId)}/canvas`;
}

export function studioDccPathname(
  workId: string | null,
  mode: StudioDccWorkbenchMode,
): string {
  const suffix = `3d/dcc/${mode}`;
  return workId === null
    ? `/studio/${suffix}`
    : `/studio/work/${encodeURIComponent(workId)}/${suffix}`;
}

function workspaceQuery(search: string | URLSearchParams | undefined): string {
  const params = queryParams(search);
  params.delete("id");
  params.delete("mode");
  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

export function studioCanvasHref({
  search,
  workId,
}: StudioWorkspaceHrefInput): string {
  return `${studioCanvasPathname(workId)}${workspaceQuery(search)}`;
}

export function studioDccHref({
  mode,
  search,
  workId,
}: StudioDccWorkspaceHrefInput): string {
  return `${studioDccPathname(workId, mode)}${workspaceQuery(search)}`;
}

export function parseStudioWorkspaceRoute({
  pathname,
  search,
}: StudioWorkspaceLocationInput): StudioWorkspaceRouteResolution {
  if (!isStudioRoutePathname(pathname)) {
    return invalidStudioWorkspaceRoute("invalid-path");
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "studio") {
    return invalidStudioWorkspaceRoute("invalid-path");
  }

  let pathWorkId: string | null = null;
  let surface: StudioWorkspaceSurface;
  let dccMode: StudioDccWorkbenchMode | null = null;

  if (segments.length === 1) {
    surface = "canvas";
  } else if (segments[1] === "work") {
    if (segments.length < 3) return invalidStudioWorkspaceRoute("invalid-work-id");
    pathWorkId = decodeStudioWorkId(segments[2]);
    if (pathWorkId === null) return invalidStudioWorkspaceRoute("invalid-work-id");
    const tail = segments.slice(3);
    if (tail.length === 0 || (tail.length === 1 && tail[0] === "canvas")) {
      surface = "canvas";
    } else if (
      tail[0] === "3d"
      && (tail.length === 1 || (tail.length === 2 && tail[1] === "dcc"))
    ) {
      surface = "dcc";
      dccMode = "model";
    } else if (
      tail.length === 3
      && tail[0] === "3d"
      && tail[1] === "dcc"
      && isStudioDccWorkbenchMode(tail[2])
    ) {
      surface = "dcc";
      dccMode = tail[2];
    } else {
      return invalidStudioWorkspaceRoute("invalid-path");
    }
  } else if (segments[1] === "3d") {
    if (segments.length === 2 || (segments.length === 3 && segments[2] === "dcc")) {
      surface = "dcc";
      dccMode = "model";
    } else if (
      segments.length === 4
      && segments[2] === "dcc"
      && isStudioDccWorkbenchMode(segments[3])
    ) {
      surface = "dcc";
      dccMode = segments[3];
    } else {
      return invalidStudioWorkspaceRoute("invalid-path");
    }
  } else {
    return invalidStudioWorkspaceRoute("invalid-path");
  }

  const rawQueryWorkId = queryParams(search).get("id");
  const queryWorkId = normalizeQueryWorkId(rawQueryWorkId);
  if (queryWorkId === undefined) {
    return invalidStudioWorkspaceRoute("invalid-work-id");
  }
  if (pathWorkId !== null && queryWorkId !== null && pathWorkId !== queryWorkId) {
    return invalidStudioWorkspaceRoute("work-id-conflict");
  }
  const workId = pathWorkId ?? queryWorkId;
  const canonicalPathname = surface === "dcc"
    ? studioDccPathname(workId, dccMode ?? "model")
    : studioCanvasPathname(workId);

  return Object.freeze({
    canonicalPathname,
    dccMode,
    legacyWorkIdQuery: pathWorkId === null && queryWorkId !== null,
    surface,
    valid: true,
    workId,
  });
}

export function createStudioDccNavigationState(
  route: StudioWorkspaceRoute,
  location: StudioWorkspaceNavigationLocation,
): StudioDccNavigationState {
  if (route.surface !== "canvas") {
    throw new Error("Studio DCC navigation must start from the canvas route.");
  }
  return Object.freeze({
    studioWorkspaceReturn: Object.freeze({
      entryKey: location.key,
      pathname: location.pathname,
      search: location.search,
      version: 1,
      workId: route.workId,
    }),
  });
}

function ownData(
  value: object,
  key: PropertyKey,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

export function studioWorkspaceReturnHref(
  state: unknown,
  currentRoute: StudioWorkspaceRoute,
): string | null {
  if (currentRoute.surface !== "dcc" || !state || typeof state !== "object") return null;
  const receipt = ownData(state, "studioWorkspaceReturn");
  if (!receipt || typeof receipt !== "object") return null;
  if (ownData(receipt, "version") !== 1) return null;
  const entryKey = ownData(receipt, "entryKey");
  const pathname = ownData(receipt, "pathname");
  const search = ownData(receipt, "search");
  const workId = ownData(receipt, "workId");
  if (
    typeof entryKey !== "string"
    || entryKey.length === 0
    || typeof pathname !== "string"
    || typeof search !== "string"
    || (workId !== null && typeof workId !== "string")
    || workId !== currentRoute.workId
  ) {
    return null;
  }
  const returnRoute = parseStudioWorkspaceRoute({ pathname, search });
  if (!returnRoute.valid || returnRoute.surface !== "canvas") return null;
  if (returnRoute.workId !== currentRoute.workId) return null;
  return `${pathname}${search}`;
}
