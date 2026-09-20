export * from "./ir/color";
export * from "./ir/path";
export * from "./ir/path-transform";
export * from "./ir/scene";
export * from "./ir/render-scene";
export * from "./ir/frame-graph";
export * from "./ir/scene-features";
export * from "./ir/scene-sharding";
export * from "./ir/stroke";
export * from "./ir/brush";
export * from "./ir/effect";
export * from "./ir/comic";
export * from "./ir/comic-lowering";
export * from "./ir/balloon-text-layout";
export * from "./ir/animation";
export * from "./ir/animation-lowering";
export * from "./ir/asset-metadata";
export * from "./ir/journal";
export * from "./ir/digest";
export * from "./ir/project-state";
export * from "./command/reducer";
export * from "./command/journal-store";
export * from "./command/recovery";
export * from "./command/bus";
export * from "./testing/fault-injection";
export {
  STUDIO_SCOPE_LEVELS,
  isStudioScopeIdentity,
  validateStudioScopeRef,
  assertStudioScopeRef,
  createStudioScopeRef,
  studioScopeKey,
  studioScopeDepth,
  studioScopeContains,
  scopeRefKey,
  scopeRefContains,
} from "./graph/scope-ref";
export type {
  StudioScopeLevel,
  StudioScopeRefV1,
  StudioScopeIssue,
} from "./graph/scope-ref";
export * from "./graph/artifact-revision";
export * from "./graph/project-graph";
export * from "./graph/external-file-binding";
export * from "./authority/document-authority";
export * from "./capability/capability-ledger";
export * from "./interchange/compatibility-report";
export * from "./assets/asset-lockfile";

export * from "./compat/project-graph-v3";
export * from "./graph/review-source-map";
export * from "./graph/review-task-reference";
export * from "./graph/review-task-role-assignment";
export * from "./graph/review-task-completion";
export * from "./graph/handoff-envelope";
export * from "./graph/world-publication";
export * from "./graph/world-acoustic";
