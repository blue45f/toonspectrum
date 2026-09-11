export type StudioRightsNodeKind =
  | "document"
  | "asset"
  | "font"
  | "voice"
  | "ai-output"
  | "plugin";
export type StudioRightsStatus = "allowed" | "warning" | "blocked";
export type StudioRightsEdgeKind = "uses" | "contains" | "derived-from";

export interface StudioRightsNode {
  readonly id: string;
  readonly kind: StudioRightsNodeKind;
  readonly title: string;
  readonly status: StudioRightsStatus;
  readonly licenseId: string | null;
  readonly attributionText: string | null;
  readonly sourceUrl: string | null;
}

export interface StudioRightsEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: StudioRightsEdgeKind;
}

export interface StudioRightsGraph {
  readonly nodes: readonly StudioRightsNode[];
  readonly edges: readonly StudioRightsEdge[];
}

export interface StudioRightsGraphFinding {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly affectedIds: readonly string[];
}

export interface StudioRightsBomEntry extends StudioRightsNode {
  readonly paths: readonly (readonly string[])[];
}

export interface StudioRightsAuditReport {
  readonly status: StudioRightsStatus;
  readonly rootIds: readonly string[];
  readonly entries: readonly StudioRightsBomEntry[];
  readonly attributionTexts: readonly string[];
  readonly findings: readonly StudioRightsGraphFinding[];
}

function finding(
  code: string,
  severity: StudioRightsGraphFinding["severity"],
  affectedIds: readonly string[],
): StudioRightsGraphFinding {
  return Object.freeze({ code, severity, affectedIds: Object.freeze([...affectedIds]) });
}

export function validateStudioRightsGraph(
  graph: StudioRightsGraph,
): readonly StudioRightsGraphFinding[] {
  const findings: StudioRightsGraphFinding[] = [];
  const ids = graph.nodes.map((node) => node.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    findings.push(finding("node-id-duplicate", "error", ids));
  }
  for (const node of graph.nodes) {
    if (!node.id.trim() || !node.title.trim()) {
      findings.push(finding("node-required", "error", [node.id]));
    }
    if (node.kind !== "document" && !node.licenseId?.trim()) {
      findings.push(finding("license-missing", "warning", [node.id]));
    }
    if (node.status === "warning" && !node.attributionText?.trim() && !node.licenseId?.trim()) {
      findings.push(finding("warning-without-condition", "warning", [node.id]));
    }
  }
  const edgeKeys = graph.edges.map((edge) => `${edge.fromId}\u0000${edge.toId}\u0000${edge.kind}`);
  if (new Set(edgeKeys).size !== edgeKeys.length) {
    findings.push(finding("edge-duplicate", "warning", edgeKeys));
  }
  for (const edge of graph.edges) {
    const missing = [edge.fromId, edge.toId].filter((id) => !idSet.has(id));
    if (missing.length > 0) findings.push(finding("edge-node-missing", "error", missing));
    if (edge.fromId === edge.toId) findings.push(finding("edge-self-reference", "error", [edge.fromId]));
  }
  return Object.freeze(findings);
}

export function auditStudioRightsGraph(
  graph: StudioRightsGraph,
  rootIds: readonly string[],
): StudioRightsAuditReport {
  const findings = [...validateStudioRightsGraph(graph)];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, StudioRightsEdge[]>();
  for (const edge of graph.edges) {
    outgoing.set(edge.fromId, [...(outgoing.get(edge.fromId) ?? []), edge]);
  }
  const unknownRoots = rootIds.filter((id) => !nodeById.has(id));
  if (unknownRoots.length > 0) findings.push(finding("root-missing", "error", unknownRoots));
  const pathsById = new Map<string, string[][]>();
  const visiting = new Set<string>();

  const visit = (nodeId: string, path: readonly string[]): void => {
    if (visiting.has(nodeId)) {
      findings.push(finding("dependency-cycle", "error", [...path, nodeId]));
      return;
    }
    const node = nodeById.get(nodeId);
    if (!node) return;
    const nextPath = [...path, nodeId];
    pathsById.set(nodeId, [...(pathsById.get(nodeId) ?? []), nextPath]);
    visiting.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) visit(edge.toId, nextPath);
    visiting.delete(nodeId);
  };
  for (const rootId of rootIds) visit(rootId, []);

  const entries = [...pathsById.entries()]
    .map(([id, paths]) => {
      const node = nodeById.get(id);
      if (!node) throw new Error("Rights graph path referenced an unknown node.");
      return Object.freeze({
        ...node,
        paths: Object.freeze(paths.map((path) => Object.freeze(path))),
      });
    })
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title));
  const attributionTexts = [...new Set(entries
    .map((entry) => entry.attributionText?.trim() ?? "")
    .filter(Boolean))]
    .sort();
  const blocked = entries.some((entry) => entry.status === "blocked")
    || findings.some((item) => item.severity === "error");
  const warning = entries.some((entry) => entry.status === "warning")
    || findings.some((item) => item.severity === "warning");
  return Object.freeze({
    status: blocked ? "blocked" : warning ? "warning" : "allowed",
    rootIds: Object.freeze([...rootIds]),
    entries: Object.freeze(entries),
    attributionTexts: Object.freeze(attributionTexts),
    findings: Object.freeze(findings),
  });
}
