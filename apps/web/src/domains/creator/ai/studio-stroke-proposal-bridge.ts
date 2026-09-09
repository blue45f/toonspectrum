import { useEffect, useSyncExternalStore } from "react";

import {
  buildBoundedStudioStrokeProposalContext,
  validateStudioStrokeProposalResponse,
  type StudioCommittedStrokeContext,
  type StudioStrokeProposalResponse,
  type StudioStrokeProposalTransaction,
} from "./studio-stroke-proposal";
import { studioDeterministicContentId } from "../studio-deterministic-serialization";

interface StudioStrokeProposalBridgeSnapshot {
  readonly connected: boolean;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly activePointerStroke: boolean;
  readonly recentStrokes: readonly StudioCommittedStrokeContext[];
  readonly proposal: StudioStrokeProposalResponse | null;
  readonly busy: boolean;
  readonly error: string | null;
}

interface StudioStrokeProposalBridgeAdapter {
  readonly ownerId: string;
  requestProposal(): Promise<StudioStrokeProposalResponse>;
  apply(transaction: StudioStrokeProposalTransaction): void;
  cancel(): void;
}

const DISCONNECTED: StudioStrokeProposalBridgeSnapshot = Object.freeze({
  connected: false,
  documentId: "",
  documentGeneration: 0,
  activePointerStroke: false,
  recentStrokes: Object.freeze([]),
  proposal: null,
  busy: false,
  error: null,
});

let snapshot: StudioStrokeProposalBridgeSnapshot = DISCONNECTED;
let adapter: StudioStrokeProposalBridgeAdapter | null = null;
const listeners = new Set<() => void>();

function emit(next: StudioStrokeProposalBridgeSnapshot): void {
  snapshot = Object.freeze(next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStudioStrokeProposalBridgeSnapshot(): StudioStrokeProposalBridgeSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => DISCONNECTED);
}

export async function requestStudioStrokeProposal(): Promise<void> {
  if (!adapter || snapshot.activePointerStroke || snapshot.busy) return;
  emit({ ...snapshot, busy: true, error: null });
  try {
    const proposal = await adapter.requestProposal();
    emit({ ...snapshot, busy: false, proposal, error: null });
  } catch (error) {
    emit({
      ...snapshot,
      busy: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function applyStudioStrokeProposalTransaction(
  transaction: StudioStrokeProposalTransaction,
): void {
  if (!adapter) throw new Error("Studio stroke proposal bridge is disconnected.");
  adapter.apply(transaction);
  emit({
    ...snapshot,
    proposal: null,
    documentGeneration: snapshot.documentGeneration + 1,
    error: null,
  });
}

export function cancelConnectedStudioStrokeProposal(): void {
  adapter?.cancel();
  emit({ ...snapshot, proposal: null, busy: false, error: null });
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function string(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizedPoints(value: unknown): readonly { readonly x: number; readonly y: number; readonly pressure: number }[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  if (value.every((entry) => typeof entry === "number")) {
    const points = [];
    for (let index = 0; index + 1 < value.length; index += 2) {
      points.push(Object.freeze({
        x: number(value[index], 0),
        y: number(value[index + 1], 0),
        pressure: 0.5,
      }));
    }
    return Object.freeze(points);
  }
  return Object.freeze(
    value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const point = entry as Record<string, unknown>;
      if (typeof point.x !== "number" || typeof point.y !== "number") return [];
      return [Object.freeze({
        x: point.x,
        y: point.y,
        pressure: Math.max(0, Math.min(1, number(point.pressure, 0.5))),
      })];
    }),
  );
}

function recentStrokeContexts(elements: readonly unknown[]): readonly StudioCommittedStrokeContext[] {
  const contexts: StudioCommittedStrokeContext[] = [];
  for (let index = Math.max(0, elements.length - 200); index < elements.length; index += 1) {
    const element = elements[index];
    if (!element || typeof element !== "object") continue;
    const raw = element as Record<string, unknown>;
    if (raw.type !== "draw" && raw.type !== "stroke") continue;
    const points = normalizedPoints(raw.points);
    if (points.length < 1) continue;
    contexts.push(Object.freeze({
      id: string(raw.id, `draw-${index}`),
      brushId: string(raw.brushId ?? raw.brush, "pen"),
      color: string(raw.color ?? raw.stroke, "#000000"),
      width: Math.max(0.5, number(raw.width ?? raw.strokeWidth, 4)),
      opacity: Math.max(0, Math.min(1, number(raw.opacity, 1))),
      points,
      committedAtMs: number(raw.committedAtMs ?? raw.createdAt, index),
    }));
  }
  return Object.freeze(contexts.slice(-48));
}

function smoothPoints(
  points: StudioCommittedStrokeContext["points"],
): StudioCommittedStrokeContext["points"] {
  if (points.length < 3) return points;
  return Object.freeze(points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const previous = points[index - 1]!;
    const next = points[index + 1]!;
    return Object.freeze({
      x: (previous.x + point.x * 2 + next.x) / 4,
      y: (previous.y + point.y * 2 + next.y) / 4,
      pressure: (previous.pressure + point.pressure * 2 + next.pressure) / 4,
    });
  }));
}

function localProposal(
  documentId: string,
  documentGeneration: number,
  strokes: readonly StudioCommittedStrokeContext[],
): StudioStrokeProposalResponse {
  if (strokes.length < 1) throw new Error("최근 확정 획이 없어 제안할 수 없습니다.");
  const source = strokes.slice(-Math.min(6, strokes.length));
  const sourceHash = studioDeterministicContentId(source);
  return validateStudioStrokeProposalResponse({
    schemaVersion: 1,
    documentId,
    documentGeneration,
    variants: [
      {
        id: `local-cleanup-${sourceHash}`,
        label: "선 흐름 정리",
        strokes: source.map((stroke, index) => ({
          id: `proposal:${stroke.id}:${index}`,
          brushId: stroke.brushId,
          color: /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(stroke.color) ? stroke.color : "#000000",
          width: stroke.width,
          opacity: stroke.opacity,
          points: smoothPoints(stroke.points),
        })),
        provenance: {
          provider: "toonstudio-local-stroke-assist",
          model: "moving-average-v1",
          seed: 0,
          promptHash: studioDeterministicContentId("clean-current-strokes"),
          sourceHash,
          requestIdHash: studioDeterministicContentId({ documentId, documentGeneration, sourceHash }),
          generatedAtMs: Date.now(),
          transport: "local",
        },
      },
    ],
  });
}

function cloneElementForProposal<TElement>(
  source: TElement,
  transaction: StudioStrokeProposalTransaction,
  strokeIndex: number,
): TElement {
  if (!source || typeof source !== "object") throw new TypeError("proposal source element is invalid.");
  const stroke = transaction.addedStrokes[strokeIndex];
  if (!stroke) throw new TypeError("proposal stroke is missing.");
  const raw = source as Record<string, unknown>;
  const sourcePoints = raw.points;
  const points = Array.isArray(sourcePoints) && sourcePoints.every((entry) => typeof entry === "number")
    ? stroke.points.flatMap((point) => [point.x, point.y])
    : stroke.points.map((point) => ({ x: point.x, y: point.y, pressure: point.pressure }));
  return Object.freeze({
    ...raw,
    id: globalThis.crypto?.randomUUID?.() ?? `ai-stroke-${Date.now()}-${strokeIndex}`,
    points,
    color: stroke.color,
    stroke: stroke.color,
    width: stroke.width,
    strokeWidth: stroke.width,
    opacity: stroke.opacity,
    aiProvenance: Object.freeze({
      kind: "stroke-proposal",
      transactionId: transaction.id,
      proposalContentId: transaction.contentId,
      provider: transaction.provenance.provider,
      model: transaction.provenance.model,
      seed: transaction.provenance.seed,
      sourceHash: transaction.provenance.sourceHash,
    }),
  }) as TElement;
}

export function useStudioAiCanvasBridge<TElement>(input: {
  readonly ownerId: string;
  readonly documentId: string;
  readonly elements: readonly TElement[];
  readonly appendElement: (element: TElement) => void;
}): void {
  const documentGeneration = Number.parseInt(studioDeterministicContentId(input.elements).slice(0, 12), 16);
  const strokes = recentStrokeContexts(input.elements);
  useEffect(() => {
    let activePointerStroke = false;
    const update = () => {
      if (adapter?.ownerId !== input.ownerId) return;
      emit({
        ...snapshot,
        connected: true,
        documentId: input.documentId,
        documentGeneration,
        activePointerStroke,
        recentStrokes: strokes,
      });
    };
    const nextAdapter: StudioStrokeProposalBridgeAdapter = {
      ownerId: input.ownerId,
      requestProposal: async () => {
        buildBoundedStudioStrokeProposalContext({
          documentId: input.documentId,
          documentGeneration,
          viewport: { x: 0, y: 0, width: 1_000_000, height: 1_000_000 },
          recentStrokes: strokes,
          semanticSummary: "current ToonStudio drawing",
        });
        return localProposal(input.documentId, documentGeneration, strokes);
      },
      apply: (transaction) => {
        const sourceById = new Map(strokes.map((stroke, index) => [stroke.id, input.elements[input.elements.length - strokes.length + index]]));
        transaction.addedStrokes.forEach((stroke, index) => {
          const sourceId = stroke.id.split(":")[1];
          const source = (sourceId && sourceById.get(sourceId)) ?? input.elements.at(-1);
          if (!source) throw new Error("제안 획의 원본 요소를 찾을 수 없습니다.");
          input.appendElement(cloneElementForProposal(source, transaction, index));
        });
      },
      cancel: () => undefined,
    };
    adapter = nextAdapter;
    const pointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-studio-canvas-viewport]")) return;
      activePointerStroke = true;
      update();
    };
    const pointerDone = () => {
      if (!activePointerStroke) return;
      activePointerStroke = false;
      update();
    };
    globalThis.addEventListener("pointerdown", pointerDown, true);
    globalThis.addEventListener("pointerup", pointerDone, true);
    globalThis.addEventListener("pointercancel", pointerDone, true);
    update();
    return () => {
      globalThis.removeEventListener("pointerdown", pointerDown, true);
      globalThis.removeEventListener("pointerup", pointerDone, true);
      globalThis.removeEventListener("pointercancel", pointerDone, true);
      if (adapter === nextAdapter) {
        adapter = null;
        emit(DISCONNECTED);
      }
    };
  }, [documentGeneration, input.documentId, input.elements, input.ownerId, input.appendElement, strokes]);
}
