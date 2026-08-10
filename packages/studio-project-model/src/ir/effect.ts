import { z } from "zod";

/**
 * EffectGraphIR — non-destructive filter DAG (V11 §7.3).
 *
 * Nodes reference inputs by id; `source` is the implicit island input. The
 * EffectGraph compiler groups provider-native subchains and computes
 * preview/final variants — this module only owns the stable structure and its
 * validation.
 */

export const effectParamValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
]);
export type EffectParamValue = z.infer<typeof effectParamValueSchema>;

export const effectNodeIRSchema = z.object({
  id: z.string().min(1),
  /** Namespaced op, e.g. "core.gaussian-blur", "opencv.canny", "gmic.recipe". */
  op: z.string().min(1),
  params: z.record(z.string(), effectParamValueSchema).default({}),
  /** Node ids or the literal "source". */
  inputs: z.array(z.string()).default([]),
  colorSpace: z.enum(["srgb", "linear"]).default("linear"),
});
export type EffectNodeIR = z.infer<typeof effectNodeIRSchema>;

export const effectGraphIRSchema = z.object({
  nodes: z.array(effectNodeIRSchema),
  output: z.string().min(1),
});
export type EffectGraphIR = z.infer<typeof effectGraphIRSchema>;

export interface EffectGraphIssue {
  nodeId: string | null;
  message: string;
}

/**
 * Structural validation: unique ids, resolvable inputs, reachable output and
 * acyclicity. Providers add capability-level validation on top.
 */
export function validateEffectGraph(graph: EffectGraphIR): EffectGraphIssue[] {
  const issues: EffectGraphIssue[] = [];
  const byId = new Map<string, EffectNodeIR>();
  for (const node of graph.nodes) {
    if (byId.has(node.id)) {
      issues.push({ nodeId: node.id, message: `duplicate node id: ${node.id}` });
    }
    byId.set(node.id, node);
  }
  for (const node of graph.nodes) {
    for (const input of node.inputs) {
      if (input !== "source" && !byId.has(input)) {
        issues.push({
          nodeId: node.id,
          message: `unknown input "${input}" on node ${node.id}`,
        });
      }
    }
  }
  if (!byId.has(graph.output)) {
    issues.push({ nodeId: null, message: `unknown output node: ${graph.output}` });
  }

  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id) || !byId.has(id)) return;
    if (visiting.has(id)) {
      issues.push({ nodeId: id, message: `cycle detected at node ${id}` });
      return;
    }
    visiting.add(id);
    const node = byId.get(id);
    if (node) {
      for (const input of node.inputs) {
        if (input !== "source") visit(input);
      }
    }
    visiting.delete(id);
    done.add(id);
  };
  for (const node of graph.nodes) visit(node.id);

  return issues;
}
