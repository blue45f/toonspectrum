import { PRODUCTION_SCOPE_KINDS, type ProductionScopeKind, type ScopeAncestorRef, type ScopeRef } from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SCOPE_ORDER: Readonly<Record<ProductionScopeKind, number>> = Object.freeze({
  project: 0,
  season: 1,
  episode: 2,
  scene: 3,
  "scroll-segment": 4,
  cut: 5,
  "layer-group": 6,
  asset: 6,
  deliverable: 6,
});

export function isProductionIdentity(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function assertProductionIdentity(value: unknown, label = "identity"): string {
  if (!isProductionIdentity(value)) throw new Error(`Invalid production ${label}.`);
  return value;
}

function validateAncestor(ancestor: ScopeAncestorRef): void {
  if (!(PRODUCTION_SCOPE_KINDS as readonly string[]).includes(ancestor.kind)) {
    throw new Error("Invalid production scope ancestor kind.");
  }
  assertProductionIdentity(ancestor.id, "scope ancestor identity");
}

export function assertScopeRef(scope: ScopeRef): ScopeRef {
  if (!(PRODUCTION_SCOPE_KINDS as readonly string[]).includes(scope.kind)) {
    throw new Error("Invalid production scope kind.");
  }
  assertProductionIdentity(scope.id, "scope identity");
  const seen = new Set<string>();
  let previousOrder = -1;
  for (const ancestor of scope.ancestors) {
    validateAncestor(ancestor);
    const key = `${ancestor.kind}:${ancestor.id}`;
    if (seen.has(key)) throw new Error("Production scope contains a duplicate ancestor.");
    seen.add(key);
    const order = SCOPE_ORDER[ancestor.kind];
    if (order <= previousOrder || order >= SCOPE_ORDER[scope.kind]) {
      throw new Error("Production scope ancestors are not in canonical hierarchy order.");
    }
    previousOrder = order;
  }
  return scope;
}

export function productionScopeKey(scope: ScopeRef): string {
  assertScopeRef(scope);
  const path = [...scope.ancestors, { kind: scope.kind, id: scope.id }];
  return path.map(({ kind, id }) => `${kind}:${encodeURIComponent(id)}`).join("/");
}

export function productionScopeDepth(scope: ScopeRef): number {
  assertScopeRef(scope);
  return scope.ancestors.length + 1;
}

export function scopeContains(container: ScopeRef, candidate: ScopeRef): boolean {
  assertScopeRef(container);
  assertScopeRef(candidate);
  if (container.kind === candidate.kind && container.id === candidate.id) return true;
  return candidate.ancestors.some(
    (ancestor) => ancestor.kind === container.kind && ancestor.id === container.id,
  );
}

export function scopeIntersects(left: ScopeRef, right: ScopeRef): boolean {
  return scopeContains(left, right) || scopeContains(right, left);
}

export function projectScope(projectId: string): ScopeRef {
  return Object.freeze({ kind: "project", id: assertProductionIdentity(projectId, "project identity"), ancestors: [] });
}

export function episodeScope(projectId: string, episodeId: string): ScopeRef {
  return Object.freeze({
    kind: "episode",
    id: assertProductionIdentity(episodeId, "episode identity"),
    ancestors: Object.freeze([{ kind: "project", id: assertProductionIdentity(projectId, "project identity") }] as const),
  });
}
