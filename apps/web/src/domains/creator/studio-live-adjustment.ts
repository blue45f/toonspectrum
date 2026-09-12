import { StudioLiveAdjustmentMetadataSchema } from "./contracts/studio-live-adjustment-contract";
import { createEmptyStudioAdjustmentStack } from "./studio-adjustment-stack";

import type { El, ImageEl } from "./studio-element-model";

export const STUDIO_ADJUSTMENT_PLACEHOLDER_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
export type StudioLiveAdjustmentElement = ImageEl & El & { adjustmentLayer: { version: 1; scope: "composite-below" | "clip-previous" } };
export function isStudioLiveAdjustment(element: El): element is StudioLiveAdjustmentElement {
  return element.type === "image" && element.adjustmentLayer !== undefined;
}

export function createStudioLiveAdjustment(id: string, width: number, height: number): StudioLiveAdjustmentElement {
  if (!id || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("보정 레이어의 문서 크기가 올바르지 않습니다.");
  }
  return { id, type: "image", name: "보정 레이어", src: STUDIO_ADJUSTMENT_PLACEHOLDER_SRC,
    x: 0, y: 0, width, height, rotation: 0, opacity: 1,
    adjustmentLayer: { version: 1, scope: "composite-below" }, smartFilters: createEmptyStudioAdjustmentStack() };
}

export type StudioLiveAdjustmentRenderTree =
  | { kind: "underlay"; id: string }
  | { kind: "content"; id: string; element: El; index: number; clipBase?: StudioLiveAdjustmentRenderTree }
  | { kind: "group"; id: string; children: StudioLiveAdjustmentRenderTree[] }
  | { kind: "adjustment"; id: string; index: number; element: StudioLiveAdjustmentElement; composite: string; isolatedSource: boolean; children: StudioLiveAdjustmentRenderTree[] };

function treeComposite(node: StudioLiveAdjustmentRenderTree | undefined): string {
  if (!node || node.kind === "group" || node.kind === "underlay") return "source-over";
  if (node.kind === "adjustment") return node.composite;
  return node.element.type === "draw" && node.element.mode === "eraser"
    ? "destination-out" : node.element.blendMode ?? "source-over";
}

function foldScope(nodes: StudioLiveAdjustmentRenderTree[]): StudioLiveAdjustmentRenderTree[] {
  const output: StudioLiveAdjustmentRenderTree[] = [];
  for (const node of nodes) {
    if (node.kind !== "content" || !isStudioLiveAdjustment(node.element)) {
      const previous = output[output.length - 1];
      // The placeholder carries no alpha. A normal clipped layer needs the folded composite.
      output.push(node.kind === "content" && node.element.clipBelow && previous?.kind === "adjustment" && previous.index === node.index - 1
        ? { ...node, clipBase: previous } : node);
      continue;
    }
    const metadata = StudioLiveAdjustmentMetadataSchema.parse(node.element.adjustmentLayer);
    const isolatedSource = (node.element.clipBelow ?? (metadata.scope === "clip-previous"));
    const children = isolatedSource
      ? output[output.length - 1]?.kind === "underlay" ? [] : output.splice(-1)
      : output.splice(0);
    // An empty adjustment has no pixels, but retains a real mount and capture failure fence.
    output.push({ kind: "adjustment", id: node.id, index: node.index, element: node.element,
      composite: isolatedSource ? treeComposite(children[0]) : "source-over", isolatedSource, children });
  }
  return output;
}

/** Group runs stay in painter order; root adjustments include preceding groups as composite inputs. */
export function buildStudioLiveAdjustmentRenderTree(
  elements: readonly El[], visible: (element: El) => boolean, underlayId?: string,
): StudioLiveAdjustmentRenderTree[] {
  const roots: StudioLiveAdjustmentRenderTree[] = underlayId ? [{ kind: "underlay", id: underlayId }] : [];
  let group: Extract<StudioLiveAdjustmentRenderTree, { kind: "group" }> | undefined;
  elements.forEach((element, index) => {
    if (!visible(element)) return;
    const node: StudioLiveAdjustmentRenderTree = { kind: "content", id: element.id, element, index };
    if (!element.groupId) { group = undefined; roots.push(node); return; }
    if (!group || group.id !== element.groupId) { group = { kind: "group", id: element.groupId, children: [] }; roots.push(group); }
    group.children.push(node);
  });
  for (const root of roots) if (root.kind === "group") root.children = foldScope(root.children);
  return foldScope(roots);
}


const liveAdjustmentRevisions = new WeakMap<object, number>();
let nextLiveAdjustmentRevision = 0;
export function studioLiveAdjustmentObjectRevision(value: object): number {
  let revision = liveAdjustmentRevisions.get(value);
  if (revision === undefined) {
    revision = ++nextLiveAdjustmentRevision;
    liveAdjustmentRevisions.set(value, revision);
  }
  return revision;
}

/** Immutable element identities bound cache keys to element count, never image/stroke payload size. */
export function studioLiveAdjustmentRenderRevision(node: StudioLiveAdjustmentRenderTree): string {
  if (node.kind === "underlay") return `underlay:${node.id}`;
  if (node.kind === "content") return `content:${studioLiveAdjustmentObjectRevision(node.element)}:${node.clipBase ? studioLiveAdjustmentRenderRevision(node.clipBase) : ""}`;
  const own = node.kind === "adjustment" ? studioLiveAdjustmentObjectRevision(node.element) : node.id;
  return `${node.kind}:${own}[${node.children.map(studioLiveAdjustmentRenderRevision).join(",")}]`;
}
