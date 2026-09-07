import {
  createEmptyProductionWorkspace as createRuntimeProductionWorkspace,
  type ProductionWorkspace,
} from "./studio-production-workspace-runtime";

export * from "./studio-production-workspace-runtime";

function productionWorkspaceTitle(scopeKey: string): string {
  if (scopeKey === "draft") return "새 웹툰 제작 프로젝트";
  const separator = scopeKey.indexOf(":");
  if (separator < 0) return scopeKey;
  const kind = scopeKey.slice(0, separator);
  const identity = scopeKey.slice(separator + 1);
  return `${kind} ${identity} 제작 운영`;
}

/**
 * Public workspace factory.
 *
 * A Work/Remix identity is opaque and may itself contain colons. Splitting with
 * `String#split(":", 2)` truncates that suffix and can make two valid scopes
 * render the same title. Keep the complete substring after the first separator.
 */
export function createEmptyProductionWorkspace(
  scopeKey: string,
  now = "1970-01-01T00:00:00.000Z",
): ProductionWorkspace {
  const workspace = createRuntimeProductionWorkspace(scopeKey, now);
  return scopeKey === "draft"
    ? workspace
    : { ...workspace, title: productionWorkspaceTitle(scopeKey) };
}
