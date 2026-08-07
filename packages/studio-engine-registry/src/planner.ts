import type { Capability, ProviderKind } from "./descriptor";
import type { EngineCapabilityRegistry, RegisteredProvider } from "./registry";

/**
 * HybridExecutionPlanner (V11 §2, §9).
 *
 * Renderer choice happens per island/workspace, never per object (absolute
 * rule 7), and interactive plans must not require a GPU→CPU pixel readback on
 * the hot path (absolute rule 8) — the planner encodes both as invariants
 * instead of conventions.
 */

/** Cross-engine transport ladder, cheapest first (V11 §9.2). */
export const COPY_COST_LADDER = [
  "same-gpu-texture",
  "encoded-command-buffer",
  "image-bitmap",
  "shared-array-buffer-tile",
  "cpu-readback",
] as const;
export type CopyCost = (typeof COPY_COST_LADDER)[number];

export function copyCostRank(cost: CopyCost): number {
  return COPY_COST_LADDER.indexOf(cost);
}

export type PlanMode = "interactive" | "final-export";

export interface IslandRequest {
  islandId: string;
  kind: ProviderKind;
  requiredCapabilities: Capability[];
  /** Transport available between this island's output and the primary surface. */
  availableTransports: CopyCost[];
}

export interface SurfacePlanRequest {
  surfaceId: string;
  mode: PlanMode;
  /** Provider that owns the surface composition (one-primary-surface rule). */
  primaryCandidates: string[];
  islands: IslandRequest[];
}

export interface PlannedIsland {
  islandId: string;
  providerId: string;
  fallbackChain: string[];
  transport: CopyCost;
}

export interface SurfacePlan {
  surfaceId: string;
  mode: PlanMode;
  primaryOwnerId: string;
  islands: PlannedIsland[];
  violations: string[];
}

export class PlanUnsatisfiableError extends Error {
  constructor(
    message: string,
    readonly violations: string[],
  ) {
    super(message);
    this.name = "PlanUnsatisfiableError";
  }
}

function cheapestAllowedTransport(
  available: CopyCost[],
  mode: PlanMode,
): CopyCost | null {
  const sorted = [...available].sort((a, b) => copyCostRank(a) - copyCostRank(b));
  for (const transport of sorted) {
    if (mode === "interactive" && transport === "cpu-readback") continue;
    return transport;
  }
  return null;
}

export class HybridExecutionPlanner {
  constructor(private readonly registry: EngineCapabilityRegistry) {}

  plan(request: SurfacePlanRequest): SurfacePlan {
    const violations: string[] = [];

    const primaryOwner = request.primaryCandidates
      .map((id) => this.registry.get(id))
      .find((provider): provider is RegisteredProvider => provider !== null);
    if (!primaryOwner) {
      violations.push(
        `no registered primary surface owner among [${request.primaryCandidates.join(", ")}]`,
      );
      throw new PlanUnsatisfiableError(
        `surface ${request.surfaceId}: no primary owner`,
        violations,
      );
    }

    const islands: PlannedIsland[] = [];
    for (const island of request.islands) {
      const candidates = this.registry.query(island.kind, island.requiredCapabilities);
      const chosen = candidates[0] ?? null;
      if (!chosen) {
        violations.push(
          `island ${island.islandId}: no ${island.kind} provider offers [${island.requiredCapabilities.join(", ")}]`,
        );
        continue;
      }
      const transport = cheapestAllowedTransport(island.availableTransports, request.mode);
      if (transport === null) {
        violations.push(
          `island ${island.islandId}: interactive mode forbids cpu-readback and no cheaper transport exists`,
        );
        continue;
      }
      islands.push({
        islandId: island.islandId,
        providerId: chosen.descriptor.id,
        fallbackChain: this.registry.fallbackChain(chosen.descriptor.id),
        transport,
      });
    }

    if (violations.length > 0) {
      throw new PlanUnsatisfiableError(
        `surface ${request.surfaceId}: ${violations.length} violation(s)`,
        violations,
      );
    }

    return {
      surfaceId: request.surfaceId,
      mode: request.mode,
      primaryOwnerId: primaryOwner.descriptor.id,
      islands,
      violations,
    };
  }
}
