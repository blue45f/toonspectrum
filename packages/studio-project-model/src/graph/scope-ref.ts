export const STUDIO_SCOPE_LEVELS = [
  "project",
  "series",
  "season",
  "episode",
  "sequence",
  "scene",
  "panel",
  "element",
] as const;

export type StudioScopeLevel = (typeof STUDIO_SCOPE_LEVELS)[number];

export interface StudioScopeRefV1 {
  readonly version: 1;
  readonly projectId: string;
  readonly seriesId?: string;
  readonly seasonId?: string;
  readonly episodeId?: string;
  readonly sequenceId?: string;
  readonly sceneId?: string;
  readonly panelId?: string;
  readonly elementId?: string;
}

export interface StudioScopeIssue {
  readonly code: "invalid-id" | "missing-episode-parent" | "missing-panel-parent";
  readonly field: keyof StudioScopeRefV1;
  readonly message: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const ID_FIELDS = [
  "projectId",
  "seriesId",
  "seasonId",
  "episodeId",
  "sequenceId",
  "sceneId",
  "panelId",
  "elementId",
] as const satisfies readonly (keyof StudioScopeRefV1)[];

export function isStudioScopeIdentity(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

export function validateStudioScopeRef(
  scope: StudioScopeRefV1,
): readonly StudioScopeIssue[] {
  const issues: StudioScopeIssue[] = [];
  for (const field of ID_FIELDS) {
    const value = scope[field];
    if (value !== undefined && !isStudioScopeIdentity(value)) {
      issues.push({
        code: "invalid-id",
        field,
        message: `${field} is not a canonical Studio identity.`,
      });
    }
  }
  if (
    (scope.sequenceId !== undefined
      || scope.sceneId !== undefined
      || scope.panelId !== undefined)
    && scope.episodeId === undefined
  ) {
    issues.push({
      code: "missing-episode-parent",
      field: "episodeId",
      message: "Sequence, scene and panel scopes require an episode parent.",
    });
  }
  if (scope.elementId !== undefined && scope.panelId === undefined) {
    issues.push({
      code: "missing-panel-parent",
      field: "panelId",
      message: "Element scopes require a panel parent.",
    });
  }
  return Object.freeze(issues);
}

export function assertStudioScopeRef(scope: StudioScopeRefV1): StudioScopeRefV1 {
  const issues = validateStudioScopeRef(scope);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join(" "));
  }
  return scope;
}

export function createStudioScopeRef(
  input: Omit<StudioScopeRefV1, "version">,
): StudioScopeRefV1 {
  const scope = Object.freeze({ version: 1, ...input } as const);
  assertStudioScopeRef(scope);
  return scope;
}

export function studioScopeKey(scope: StudioScopeRefV1): string {
  assertStudioScopeRef(scope);
  return ID_FIELDS
    .map((field, index) => ({ level: STUDIO_SCOPE_LEVELS[index], value: scope[field] }))
    .filter((entry): entry is { level: StudioScopeLevel; value: string } =>
      typeof entry.value === "string"
    )
    .map((entry) => `${entry.level}:${encodeURIComponent(entry.value)}`)
    .join("/");
}

export function studioScopeDepth(scope: StudioScopeRefV1): number {
  assertStudioScopeRef(scope);
  return ID_FIELDS.filter((field) => scope[field] !== undefined).length;
}

export function studioScopeContains(
  container: StudioScopeRefV1,
  candidate: StudioScopeRefV1,
): boolean {
  assertStudioScopeRef(container);
  assertStudioScopeRef(candidate);
  return ID_FIELDS.every((field) => {
    const expected = container[field];
    return expected === undefined || expected === candidate[field];
  });
}
