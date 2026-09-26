export type StudioSpatialInviteContext =
  | { readonly kind: "team-lobby" }
  | { readonly kind: "project-space"; readonly projectId: string }
  | { readonly kind: "interview-waiting" };

export interface ParsedStudioSpatialInvite {
  readonly token: string | null;
  readonly context: StudioSpatialInviteContext;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const ENTRY = new Set(["team-lobby", "project-space", "interview-waiting"]);

export function normalizeStudioSpatialInviteContext(
  value: StudioSpatialInviteContext,
): StudioSpatialInviteContext {
  if (value.kind === "project-space" && OPAQUE_ID.test(value.projectId)) {
    return Object.freeze({ kind: "project-space", projectId: value.projectId });
  }
  if (value.kind === "interview-waiting") {
    return Object.freeze({ kind: "interview-waiting" });
  }
  return Object.freeze({ kind: "team-lobby" });
}

export function createStudioSpatialInviteFragment(
  token: string,
  context: StudioSpatialInviteContext,
): string {
  if (!TOKEN.test(token)) throw new Error("Invalid invitation token");
  const safe = normalizeStudioSpatialInviteContext(context);
  const fragment = new URLSearchParams({ invite: token, entry: safe.kind });
  if (safe.kind === "project-space") fragment.set("project", safe.projectId);
  return `#${fragment.toString()}`;
}

export function parseStudioSpatialInviteFragment(hash: string): ParsedStudioSpatialInvite {
  const fragment = new URLSearchParams(hash.replace(/^#/u, ""));
  const rawToken = fragment.get("invite");
  const token = rawToken && TOKEN.test(rawToken) ? rawToken : null;
  const entry = fragment.get("entry");
  const projectId = fragment.get("project");
  let context: StudioSpatialInviteContext = { kind: "team-lobby" };
  if (token && entry && ENTRY.has(entry)) {
    if (entry === "project-space" && projectId && OPAQUE_ID.test(projectId)) {
      context = { kind: "project-space", projectId };
    } else if (entry === "interview-waiting") {
      context = { kind: "interview-waiting" };
    }
  }
  return Object.freeze({
    token,
    context: normalizeStudioSpatialInviteContext(context),
  });
}

export function studioSpatialInviteDestination(
  context: StudioSpatialInviteContext,
  workspaceId: string,
): string {
  const safeWorkspace = OPAQUE_ID.test(workspaceId) ? workspaceId : "";
  const normalized = normalizeStudioSpatialInviteContext(context);
  if (normalized.kind === "project-space") {
    return `/studio/p/${encodeURIComponent(normalized.projectId)}/space?lobby=1`;
  }
  if (normalized.kind === "interview-waiting") {
    const query = new URLSearchParams({ panel: "rooms", waiting: "1" });
    if (safeWorkspace) query.set("workspace", safeWorkspace);
    return `/team/recruiting?${query.toString()}`;
  }
  const query = safeWorkspace ? `?workspace=${encodeURIComponent(safeWorkspace)}&lobby=1` : "?lobby=1";
  return `/team${query}`;
}
