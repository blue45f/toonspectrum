import {
  validateEffectGraph,
  type EffectGraphIR,
  type EffectNodeIR,
} from "@toonspectrum/studio-project-model";

import type { EngineCapabilityRegistry, RegisteredProvider } from "./registry";

/**
 * EffectGraph compiler v1 (V11.1 §7.3).
 *
 * Pipeline: structural validation → topological order → per-node provider
 * candidate discovery (`filter.op.<tail>` capability) → native-node grouping
 * of consecutive same-provider nodes → preview/final split. Copy transitions
 * between groups are counted explicitly so cross-provider cost is visible to
 * the planner instead of hiding in adapters.
 *
 * Preview/final semantics: a node whose op only has final-phase providers is
 * NOT silently dropped from the preview graph — it is reported in
 * `deferredToFinal` so the UI can show "적용은 최종 렌더에서" honestly.
 */

export type EffectCompileMode = "preview" | "final";

export class EffectCompileError extends Error {
  constructor(
    message: string,
    readonly missingOps: string[] = [],
  ) {
    super(message);
    this.name = "EffectCompileError";
  }
}

export interface EffectNativeGroup {
  providerId: string;
  nodeIds: string[];
}

export interface CompiledEffectGraph {
  mode: EffectCompileMode;
  /** Native groups in execution order. */
  groups: EffectNativeGroup[];
  /** Cross-provider hand-offs (groups - 1, 0 when single provider). */
  copyTransitions: number;
  /** Preview mode only: nodes owned exclusively by final-phase providers. */
  deferredToFinal: string[];
}

function opCapability(node: EffectNodeIR): string {
  const tail = node.op.split(".").at(-1) ?? node.op;
  return `filter.op.${tail}`;
}

function topologicalOrder(graph: EffectGraphIR): EffectNodeIR[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const ordered: EffectNodeIR[] = [];
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = byId.get(id);
    if (!node) return;
    for (const input of node.inputs) {
      if (input !== "source") visit(input);
    }
    ordered.push(node);
  };
  visit(graph.output);
  // Nodes not reachable from the output still compile (side chains later);
  // deterministic order: reachable first, then declaration order.
  for (const node of graph.nodes) visit(node.id);
  return ordered;
}

function candidatesFor(
  registry: EngineCapabilityRegistry,
  node: EffectNodeIR,
): RegisteredProvider[] {
  const capability = opCapability(node);
  return [
    ...registry.query("filter", [capability]),
    ...registry.query("image-pipeline", [capability]),
  ];
}

export function compileEffectGraph(
  graph: EffectGraphIR,
  registry: EngineCapabilityRegistry,
  options: { mode: EffectCompileMode },
): CompiledEffectGraph {
  const issues = validateEffectGraph(graph);
  if (issues.length > 0) {
    throw new EffectCompileError(
      `invalid effect graph: ${issues.map((issue) => issue.message).join("; ")}`,
    );
  }

  const phaseCapability = `filter.phase.${options.mode}`;
  const ordered = topologicalOrder(graph);
  const missingOps: string[] = [];
  const deferredToFinal: string[] = [];
  const assignments: Array<{ node: EffectNodeIR; providerId: string }> = [];

  for (const node of ordered) {
    const candidates = candidatesFor(registry, node);
    if (candidates.length === 0) {
      missingOps.push(node.op);
      continue;
    }
    const phased = candidates.filter((candidate) =>
      candidate.descriptor.capabilities.includes(phaseCapability),
    );
    if (phased.length === 0) {
      if (options.mode === "preview") {
        // Final-only op: defer visibly instead of pretending it previewed.
        deferredToFinal.push(node.id);
        continue;
      }
      missingOps.push(node.op);
      continue;
    }
    // Final mode prefers production final quality; ties resolve by
    // registration order (registry priority).
    const chosen =
      options.mode === "final"
        ? (phased.find(
            (candidate) => candidate.descriptor.finalQuality === "production",
          ) ?? phased[0])
        : phased[0];
    if (!chosen) continue;
    assignments.push({ node, providerId: chosen.descriptor.id });
  }

  if (missingOps.length > 0) {
    throw new EffectCompileError(
      `no ${options.mode}-capable provider for ops: ${[...new Set(missingOps)].join(", ")}`,
      [...new Set(missingOps)],
    );
  }

  const groups: EffectNativeGroup[] = [];
  for (const assignment of assignments) {
    const current = groups.at(-1);
    if (current && current.providerId === assignment.providerId) {
      current.nodeIds.push(assignment.node.id);
    } else {
      groups.push({
        providerId: assignment.providerId,
        nodeIds: [assignment.node.id],
      });
    }
  }

  return {
    mode: options.mode,
    groups,
    copyTransitions: Math.max(0, groups.length - 1),
    deferredToFinal,
  };
}
