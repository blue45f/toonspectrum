import {
  studioDeterministicContentId,
  studioDeterministicJson,
} from "../studio-deterministic-serialization";

export const STUDIO_EFFECT_GRAPH_VERSION = 1 as const;

export type StudioEffectGraphNodeKind =
  | "source"
  | "linked-source"
  | "adjustment"
  | "live-effect"
  | "mask"
  | "blend"
  | "output";

export type StudioAdjustmentKind =
  | "levels"
  | "curves"
  | "hsl"
  | "color-balance"
  | "channel-mixer"
  | "gradient-map"
  | "lab";

export type StudioLiveEffectKind =
  | "blur"
  | "sharpen"
  | "glow"
  | "inflate"
  | "drop-shadow"
  | "distort";

export interface StudioEffectGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly input: "source" | "mask" | "backdrop";
}

interface StudioEffectGraphNodeBase {
  readonly id: string;
  readonly kind: StudioEffectGraphNodeKind;
  readonly enabled: boolean;
  readonly opacity: number;
  readonly blendMode: string;
}

export interface StudioSourceNode extends StudioEffectGraphNodeBase {
  readonly kind: "source" | "linked-source";
  readonly sourceHash: string;
  readonly sourceRevision?: string;
  readonly embedded: boolean;
}

export interface StudioAdjustmentNode extends StudioEffectGraphNodeBase {
  readonly kind: "adjustment";
  readonly adjustment: StudioAdjustmentKind;
  readonly parameters: Readonly<Record<string, number | string | boolean | readonly number[]>>;
  readonly colorSpace: "srgb" | "linear-srgb" | "display-p3" | "lab";
}

export interface StudioLiveEffectNode extends StudioEffectGraphNodeBase {
  readonly kind: "live-effect";
  readonly effect: StudioLiveEffectKind;
  readonly parameters: Readonly<Record<string, number | string | boolean | readonly number[]>>;
  readonly preferredBackend: "auto" | "webgpu" | "cpu";
}

export interface StudioMaskNode extends StudioEffectGraphNodeBase {
  readonly kind: "mask";
  readonly maskHash: string;
  readonly inverted: boolean;
  readonly featherPx: number;
}

export interface StudioBlendNode extends StudioEffectGraphNodeBase {
  readonly kind: "blend";
  readonly clipping: boolean;
  readonly isolate: boolean;
}

export interface StudioOutputNode extends StudioEffectGraphNodeBase {
  readonly kind: "output";
  readonly outputColorSpace: "srgb" | "display-p3" | "linear-srgb";
}

export type StudioEffectGraphNode =
  | StudioSourceNode
  | StudioAdjustmentNode
  | StudioLiveEffectNode
  | StudioMaskNode
  | StudioBlendNode
  | StudioOutputNode;

export interface StudioAdjustmentEffectGraph {
  readonly version: typeof STUDIO_EFFECT_GRAPH_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly nodes: readonly StudioEffectGraphNode[];
  readonly edges: readonly StudioEffectGraphEdge[];
  readonly outputNodeId: string;
}

export interface StudioEffectGraphValidation {
  readonly order: readonly string[];
  readonly reachable: ReadonlySet<string>;
  readonly graphHash: string;
}

function assertId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 240 || !/^[\w.:-]+$/u.test(normalized)) {
    throw new TypeError(`${field} is invalid.`);
  }
  return normalized;
}

function assertOpacity(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${field} must be between 0 and 1.`);
  }
  return value;
}

function assertNode(node: StudioEffectGraphNode): void {
  assertId(node.id, "node.id");
  assertOpacity(node.opacity, `${node.id}.opacity`);
  if (!node.blendMode.trim()) throw new TypeError(`${node.id}.blendMode is required.`);
  if (node.kind === "mask" && (!Number.isFinite(node.featherPx) || node.featherPx < 0 || node.featherPx > 10_000)) {
    throw new RangeError(`${node.id}.featherPx is invalid.`);
  }
  if ((node.kind === "source" || node.kind === "linked-source") && !node.sourceHash.trim()) {
    throw new TypeError(`${node.id}.sourceHash is required.`);
  }
}

export function validateStudioAdjustmentEffectGraph(
  graph: StudioAdjustmentEffectGraph,
): StudioEffectGraphValidation {
  if (graph.version !== STUDIO_EFFECT_GRAPH_VERSION) {
    throw new TypeError("Unsupported adjustment/effect graph version.");
  }
  assertId(graph.id, "graph.id");
  if (!Number.isSafeInteger(graph.revision) || graph.revision < 0) {
    throw new RangeError("graph.revision must be a non-negative integer.");
  }
  if (graph.nodes.length < 2 || graph.nodes.length > 2_048) {
    throw new RangeError("graph node count is outside the supported budget.");
  }
  if (graph.edges.length > 8_192) throw new RangeError("graph edge count exceeds its budget.");

  const nodes = new Map<string, StudioEffectGraphNode>();
  for (const node of graph.nodes) {
    assertNode(node);
    if (nodes.has(node.id)) throw new TypeError(`Duplicate graph node id: ${node.id}`);
    nodes.set(node.id, node);
  }
  const output = nodes.get(graph.outputNodeId);
  if (!output || output.kind !== "output") throw new TypeError("graph outputNodeId must reference an output node.");

  const outgoing = new Map<string, StudioEffectGraphEdge[]>();
  const incoming = new Map<string, StudioEffectGraphEdge[]>();
  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new TypeError("graph edge references an unknown node.");
    if (edge.from === edge.to) throw new TypeError("graph self edges are not allowed.");
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.input}`;
    if (edgeKeys.has(key)) throw new TypeError("duplicate graph edge is not allowed.");
    edgeKeys.add(key);
    const from = outgoing.get(edge.from) ?? [];
    from.push(edge);
    outgoing.set(edge.from, from);
    const to = incoming.get(edge.to) ?? [];
    to.push(edge);
    incoming.set(edge.to, to);
  }

  const indegree = new Map(graph.nodes.map((node) => [node.id, incoming.get(node.id)?.length ?? 0]));
  const ready = [...graph.nodes]
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (!id) break;
    order.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      const next = (indegree.get(edge.to) ?? 0) - 1;
      indegree.set(edge.to, next);
      if (next === 0) {
        ready.push(edge.to);
        ready.sort();
      }
    }
  }
  if (order.length !== graph.nodes.length) throw new TypeError("adjustment/effect graph contains a cycle.");

  const reachable = new Set<string>([graph.outputNodeId]);
  const queue = [graph.outputNodeId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    for (const edge of incoming.get(id) ?? []) {
      if (!reachable.has(edge.from)) {
        reachable.add(edge.from);
        queue.push(edge.from);
      }
    }
  }
  const unreachableEnabled = graph.nodes.filter((node) => node.enabled && !reachable.has(node.id));
  if (unreachableEnabled.length > 0) {
    throw new TypeError(`enabled graph nodes are unreachable: ${unreachableEnabled.map((node) => node.id).join(", ")}`);
  }
  return Object.freeze({
    order: Object.freeze(order),
    reachable,
    graphHash: studioDeterministicContentId(graph),
  });
}

export interface StudioEffectGraphRenderStep {
  readonly nodeId: string;
  readonly kind: StudioEffectGraphNodeKind;
  readonly inputNodeIds: readonly string[];
  readonly maskNodeIds: readonly string[];
  readonly cacheKey: string;
  readonly backend: "cpu" | "webgpu";
}

export interface StudioEffectGraphRenderPlan {
  readonly graphId: string;
  readonly revision: number;
  readonly graphHash: string;
  readonly purpose: "preview" | "export";
  readonly steps: readonly StudioEffectGraphRenderStep[];
}

export function planStudioEffectGraphRender(input: {
  readonly graph: StudioAdjustmentEffectGraph;
  readonly purpose: "preview" | "export";
  readonly webGpuAvailable: boolean;
  readonly sourceColorSpace: string;
}): StudioEffectGraphRenderPlan {
  const validation = validateStudioAdjustmentEffectGraph(input.graph);
  const byId = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const steps = validation.order
    .filter((id) => validation.reachable.has(id))
    .map((nodeId) => {
      const node = byId.get(nodeId);
      if (!node) throw new TypeError("render plan node disappeared.");
      const edges = input.graph.edges.filter((edge) => edge.to === nodeId);
      const preferred = node.kind === "live-effect" ? node.preferredBackend : "auto";
      const backend =
        input.webGpuAvailable && preferred !== "cpu" && node.kind !== "linked-source"
          ? "webgpu"
          : "cpu";
      const cacheKey = studioDeterministicContentId({
        graphId: input.graph.id,
        graphRevision: input.graph.revision,
        purpose: input.purpose,
        sourceColorSpace: input.sourceColorSpace,
        node,
        upstream: edges.map((edge) => ({ from: edge.from, input: edge.input })).sort((a, b) =>
          `${a.input}:${a.from}`.localeCompare(`${b.input}:${b.from}`),
        ),
        backend,
      });
      return Object.freeze({
        nodeId,
        kind: node.kind,
        inputNodeIds: Object.freeze(edges.filter((edge) => edge.input !== "mask").map((edge) => edge.from)),
        maskNodeIds: Object.freeze(edges.filter((edge) => edge.input === "mask").map((edge) => edge.from)),
        cacheKey,
        backend,
      });
    });
  return Object.freeze({
    graphId: input.graph.id,
    revision: input.graph.revision,
    graphHash: validation.graphHash,
    purpose: input.purpose,
    steps: Object.freeze(steps),
  });
}

export type StudioEffectGraphMutation =
  | { readonly type: "add-node"; readonly node: StudioEffectGraphNode }
  | { readonly type: "remove-node"; readonly nodeId: string }
  | { readonly type: "patch-node"; readonly nodeId: string; readonly patch: Readonly<Record<string, unknown>> }
  | { readonly type: "add-edge"; readonly edge: StudioEffectGraphEdge }
  | { readonly type: "remove-edge"; readonly edge: StudioEffectGraphEdge }
  | { readonly type: "set-output"; readonly nodeId: string };

function sameEdge(left: StudioEffectGraphEdge, right: StudioEffectGraphEdge): boolean {
  return left.from === right.from && left.to === right.to && left.input === right.input;
}

export function mutateStudioAdjustmentEffectGraph(
  graph: StudioAdjustmentEffectGraph,
  mutation: StudioEffectGraphMutation,
): StudioAdjustmentEffectGraph {
  let nodes = [...graph.nodes];
  let edges = [...graph.edges];
  let outputNodeId = graph.outputNodeId;
  switch (mutation.type) {
    case "add-node":
      nodes.push(mutation.node);
      break;
    case "remove-node":
      nodes = nodes.filter((node) => node.id !== mutation.nodeId);
      edges = edges.filter((edge) => edge.from !== mutation.nodeId && edge.to !== mutation.nodeId);
      break;
    case "patch-node":
      nodes = nodes.map((node) =>
        node.id === mutation.nodeId
          ? ({ ...node, ...mutation.patch, id: node.id, kind: node.kind } as StudioEffectGraphNode)
          : node,
      );
      break;
    case "add-edge":
      edges.push(mutation.edge);
      break;
    case "remove-edge":
      edges = edges.filter((edge) => !sameEdge(edge, mutation.edge));
      break;
    case "set-output":
      outputNodeId = mutation.nodeId;
      break;
  }
  const next = Object.freeze({
    ...graph,
    revision: graph.revision + 1,
    nodes: Object.freeze(nodes.map((node) => Object.freeze(node))),
    edges: Object.freeze(edges.map((edge) => Object.freeze(edge))),
    outputNodeId,
  });
  validateStudioAdjustmentEffectGraph(next);
  return next;
}

export interface StudioEffectGraphHistoryEntry {
  readonly transactionId: string;
  readonly before: StudioAdjustmentEffectGraph;
  readonly after: StudioAdjustmentEffectGraph;
  readonly beforeHash: string;
  readonly afterHash: string;
}

export function transactStudioEffectGraph(
  graph: StudioAdjustmentEffectGraph,
  transactionId: string,
  mutations: readonly StudioEffectGraphMutation[],
): StudioEffectGraphHistoryEntry {
  if (!transactionId.trim()) throw new TypeError("effect graph transaction id is required.");
  let after = graph;
  for (const mutation of mutations) after = mutateStudioAdjustmentEffectGraph(after, mutation);
  return Object.freeze({
    transactionId: transactionId.trim(),
    before: graph,
    after,
    beforeHash: studioDeterministicContentId(graph),
    afterHash: studioDeterministicContentId(after),
  });
}

export function undoStudioEffectGraphTransaction(entry: StudioEffectGraphHistoryEntry): StudioAdjustmentEffectGraph {
  return entry.before;
}

export function redoStudioEffectGraphTransaction(entry: StudioEffectGraphHistoryEntry): StudioAdjustmentEffectGraph {
  return entry.after;
}

export type StudioPsdEffectPreservation = "editable" | "preserved" | "flattened" | "unsupported";

export function classifyStudioPsdEffectNode(node: StudioEffectGraphNode): StudioPsdEffectPreservation {
  if (node.kind === "source") return "preserved";
  if (node.kind === "linked-source") return node.embedded ? "preserved" : "unsupported";
  if (node.kind === "adjustment") {
    return node.adjustment === "levels" || node.adjustment === "curves" || node.adjustment === "hsl"
      ? "editable"
      : "flattened";
  }
  if (node.kind === "mask" || node.kind === "blend" || node.kind === "output") return "preserved";
  if (node.kind === "live-effect") {
    return node.effect === "drop-shadow" || node.effect === "glow" ? "editable" : "flattened";
  }
  return "unsupported";
}

export function serializeStudioAdjustmentEffectGraph(graph: StudioAdjustmentEffectGraph): string {
  validateStudioAdjustmentEffectGraph(graph);
  return studioDeterministicJson(graph);
}
