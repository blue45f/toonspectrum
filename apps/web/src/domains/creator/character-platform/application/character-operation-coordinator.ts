export type CharacterOperationResource =
  | "document-write"
  | "model-topology"
  | "live-renderer"
  | "preview-renderer"
  | "pose-preview"
  | "texture-atlas"
  | "surface-ink"
  | "export-buffer";

export type CharacterResourceClaimMode = "shared" | "exclusive";

export interface CharacterResourceClaim {
  readonly resource: CharacterOperationResource;
  readonly mode: CharacterResourceClaimMode;
}

export interface CharacterOperationRequest {
  readonly operationId: string;
  readonly owner: string;
  readonly claims: readonly CharacterResourceClaim[];
  readonly startedAt?: number;
}

export interface CharacterOperationConflict {
  readonly requested: CharacterResourceClaim;
  readonly heldByOperationId: string;
  readonly heldByOwner: string;
  readonly heldMode: CharacterResourceClaimMode;
}

export interface CharacterOperationLease {
  readonly operationId: string;
  readonly owner: string;
  readonly claims: readonly CharacterResourceClaim[];
  readonly startedAt: number;
  release(): boolean;
}

export type CharacterOperationAcquireResult =
  | { readonly ok: true; readonly lease: CharacterOperationLease }
  | { readonly ok: false; readonly conflicts: readonly CharacterOperationConflict[] };

export interface CharacterOperationSnapshot {
  readonly operationId: string;
  readonly owner: string;
  readonly claims: readonly CharacterResourceClaim[];
  readonly startedAt: number;
}

interface HeldOperation {
  readonly operationId: string;
  readonly owner: string;
  readonly claims: readonly CharacterResourceClaim[];
  readonly startedAt: number;
}

function claimsConflict(left: CharacterResourceClaim, right: CharacterResourceClaim): boolean {
  return left.resource === right.resource && (left.mode === "exclusive" || right.mode === "exclusive");
}

function normalizeClaims(claims: readonly CharacterResourceClaim[]): readonly CharacterResourceClaim[] {
  const byResource = new Map<CharacterOperationResource, CharacterResourceClaimMode>();
  for (const claim of claims) {
    const previous = byResource.get(claim.resource);
    if (previous === "exclusive" || claim.mode === previous) continue;
    byResource.set(claim.resource, claim.mode === "exclusive" ? "exclusive" : previous ?? "shared");
  }
  return Object.freeze(
    [...byResource.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([resource, mode]) => Object.freeze({ resource, mode })),
  );
}

export class CharacterOperationCoordinator {
  readonly #operations = new Map<string, HeldOperation>();

  tryAcquire(request: CharacterOperationRequest): CharacterOperationAcquireResult {
    const operationId = request.operationId.trim();
    const owner = request.owner.trim();
    const claims = normalizeClaims(request.claims);
    if (!operationId || !owner || claims.length === 0 || this.#operations.has(operationId)) {
      return { ok: false, conflicts: [] };
    }

    const conflicts: CharacterOperationConflict[] = [];
    for (const held of this.#operations.values()) {
      for (const requested of claims) {
        const blocking = held.claims.find((claim) => claimsConflict(requested, claim));
        if (!blocking) continue;
        conflicts.push({
          requested,
          heldByOperationId: held.operationId,
          heldByOwner: held.owner,
          heldMode: blocking.mode,
        });
      }
    }
    if (conflicts.length > 0) return { ok: false, conflicts: Object.freeze(conflicts) };

    const held: HeldOperation = Object.freeze({
      operationId,
      owner,
      claims,
      startedAt: request.startedAt ?? Date.now(),
    });
    this.#operations.set(operationId, held);
    let released = false;
    const lease: CharacterOperationLease = Object.freeze({
      ...held,
      release: () => {
        if (released || this.#operations.get(operationId) !== held) return false;
        released = true;
        return this.#operations.delete(operationId);
      },
    });
    return { ok: true, lease };
  }

  release(operationId: string): boolean {
    return this.#operations.delete(operationId);
  }

  isHeld(resource: CharacterOperationResource): boolean {
    return [...this.#operations.values()].some((operation) =>
      operation.claims.some((claim) => claim.resource === resource)
    );
  }

  snapshot(): readonly CharacterOperationSnapshot[] {
    return Object.freeze(
      [...this.#operations.values()]
        .sort((left, right) => left.startedAt - right.startedAt || left.operationId.localeCompare(right.operationId, "en"))
        .map((operation) => Object.freeze({ ...operation, claims: Object.freeze([...operation.claims]) })),
    );
  }
}
