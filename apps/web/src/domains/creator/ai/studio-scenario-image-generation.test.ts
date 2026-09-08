import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyStudioCharacterBible } from "../studio-character-bible";
import { layoutScenarioPanels } from "../studio-scenario-layout";

import { STUDIO_AI_DEFAULT_SETTINGS, type StudioAiResult } from "./studio-ai-client";
import * as studioAiClient from "./studio-ai-client";
import { createEmptyStudioAiImageReferenceDocument } from "./studio-ai-image-reference-roles";
import { createEmptyStudioAiProvenanceDocument, serializeStudioAiProvenanceDocument } from "./studio-ai-provenance";
import { recordPendingStudioAiOperation, settleStudioAiOperation } from "./studio-ai-provenance-recorder";
import {
  createStudioScenarioImageGenerationExecutors,
  type StudioScenarioImageGenerationContext,
  type StudioScenarioImageGenerationSnapshot,
} from "./studio-scenario-image-generation";

const generateImage = vi.fn();

const ORIGINAL_IMAGE = "data:image/png;base64,original-reviewed-image";
const REPLACEMENT_IMAGE = "data:image/png;base64,new-reviewed-image";
const ORIGINAL_PROVENANCE = {
  action: "generated" as const,
  provider: "original.example.test",
  model: "original-model",
  transport: "byok" as const,
  promptVersion: 1 as const,
  createdAt: "2026-09-08T00:00:00.000Z",
};

function session(mode: "background" | "character" | "role" = "background", hasImage = true) {
  const panels = layoutScenarioPanels([], 800, 1_200, [
    { imagePrompt: "private replacement prompt", dialogue: "" },
    { imagePrompt: "second scene", dialogue: "" },
  ]).panels;
  let preview: StudioScenarioImageGenerationSnapshot | null = {
    items: panels.map((panel, index) => ({
      ...panel,
      ...(hasImage && index === 0 ? { imageDataUrl: ORIGINAL_IMAGE, imageProvenance: ORIGINAL_PROVENANCE } : {}),
      ...(mode === "character" && index === 1 ? { imageDataUrl: "data:image/png;base64,character", imageProvenance: ORIGINAL_PROVENANCE } : {}),
    })),
    nextCanvasH: 1_200,
    characterDescription: "",
    textAiProvenance: { ...ORIGINAL_PROVENANCE },
  };
  const original = structuredClone(preview);
  let ledger = createEmptyStudioAiProvenanceDocument();
  let sequence = 0;
  const controllerRef = { current: null as AbortController | null };
  const context: StudioScenarioImageGenerationContext = {
    collaborationAccessRef: { current: { locked: false } },
    scenarioAbortControllerRef: controllerRef,
    scenarioCancelRef: { current: false },
    scenarioResult: preview,
    scenarioBusy: false,
    scenarioRegeneratingIndex: null,
    aiSettings: { ...STUDIO_AI_DEFAULT_SETTINGS, baseUrl: "https://replacement.example.test/v1", apiKey: "test-only", imageModel: "replacement-model" },
    scenarioImageReferenceDocument: createEmptyStudioAiImageReferenceDocument(),
    scenarioImageReferenceResolution: {
      references: mode === "role" ? [{ referenceId: "style-1", role: "style", dataUrl: "data:image/png;base64,style" }] : [],
      missing: [], trackingAssetIds: mode === "role" ? ["style-1"] : [], hasCharacterReference: false,
    },
    assetsLoaded: true,
    assetsLoading: false,
    characterBible: createEmptyStudioCharacterBible(),
    activePage: { id: "page-1" },
    captureStudioMutationTicket: () => ({ authScopeKey: null, workId: null, accessGeneration: 0, documentGeneration: 0 }),
    canApplyStudioMutation: () => true,
    beginScenarioRequest: () => {
      controllerRef.current = new AbortController();
      return controllerRef.current;
    },
    finishScenarioRequest: vi.fn((controller: AbortController) => {
      if (controllerRef.current === controller) controllerRef.current = null;
    }),
    beginTrackedStudioAiOperation: (scope, input) => {
      const id = `${scope}-${++sequence}`;
      ledger = recordPendingStudioAiOperation(ledger, { ...input, id });
      return id;
    },
    settleTrackedStudioAiOperation: (id, result, options) => {
      ledger = settleStudioAiOperation(ledger, id, result, options);
    },
    setScenarioBusy: vi.fn(),
    setScenarioError: vi.fn(),
    setScenarioStageLabel: vi.fn(),
    setScenarioProgress: vi.fn(),
    setScenarioResult: (update) => { preview = typeof update === "function" ? update(preview) : update; },
    setScenarioRegeneratingIndex: vi.fn(),
  };
  return {
    context,
    original,
    controllerRef,
    preview: () => preview,
    ledger: () => ledger,
    regenerate: () => createStudioScenarioImageGenerationExecutors({ ...context, scenarioResult: preview }).executeRegenerateScenarioImage(0),
  };
}

beforeEach(() => {
  generateImage.mockReset();
  vi.spyOn(studioAiClient, "generateBackgroundImage").mockImplementation(generateImage);
  vi.spyOn(studioAiClient, "generateConsistentCharacterImage").mockImplementation(generateImage);
  vi.spyOn(studioAiClient, "generateImageWithRoleReferences").mockImplementation(generateImage);
});
afterEach(() => vi.restoreAllMocks());

describe("reviewed scenario image replacement integrity", () => {
  it.each(["background", "character", "role"] as const)("retains the reviewed image and its exact provenance when %s replacement fails", async (mode) => {
    const current = session(mode);
    let resolve!: (result: StudioAiResult<{ dataUrl: string }>) => void;
    generateImage.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const running = current.regenerate();

    expect(current.preview()?.items[0]).toEqual(current.original.items[0]);
    expect(current.ledger().operations[0]?.status).toBe("pending");
    resolve({ ok: false, code: "http_error", error: "새 이미지 생성에 실패했어요." });
    await running;

    expect(current.preview()?.items[0]).toEqual({ ...current.original.items[0], imageError: "새 이미지 생성에 실패했어요." });
    expect(current.preview()?.items[1]).toEqual(current.original.items[1]);
    expect(current.original.items[0]?.imageDataUrl).toBe(ORIGINAL_IMAGE);
    expect(current.ledger().operations[0]).toMatchObject({ status: "failed", model: "replacement-model" });
    expect(serializeStudioAiProvenanceDocument(current.ledger())).not.toContain("private replacement prompt");
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(current.controllerRef.current).toBeNull();
    expect(current.context.setScenarioRegeneratingIndex).toHaveBeenLastCalledWith(null);
  });

  it("replaces image and provenance together only after a later explicit retry succeeds", async () => {
    const current = session();
    generateImage.mockResolvedValueOnce({ ok: false, code: "http_error", error: "다시 시도해 주세요." });
    await current.regenerate();
    expect(current.preview()?.items[0]?.imageDataUrl).toBe(ORIGINAL_IMAGE);

    generateImage.mockResolvedValueOnce({ ok: true, data: { dataUrl: REPLACEMENT_IMAGE } });
    await current.regenerate();

    expect(current.preview()?.items[0]).toMatchObject({
      imageDataUrl: REPLACEMENT_IMAGE,
      imageProvenance: { provider: "replacement.example.test", model: "replacement-model" },
    });
    expect(current.preview()?.items[0]?.imageError).toBeUndefined();
    expect(current.preview()?.items[1]).toEqual(current.original.items[1]);
    expect(current.ledger().operations.map((operation) => operation.status).sort()).toEqual(["failed", "succeeded"]);
    expect(generateImage).toHaveBeenCalledTimes(2);
  });

  it("keeps the reviewed result intact when an in-flight replacement is cancelled", async () => {
    const current = session();
    let resolve!: (result: StudioAiResult<{ dataUrl: string }>) => void;
    generateImage.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const running = current.regenerate();
    current.controllerRef.current!.abort();
    resolve({ ok: false, code: "network_error", error: "요청이 취소되었습니다." });
    await running;

    expect(current.preview()).toEqual(current.original);
    expect(current.ledger().operations[0]).toMatchObject({ status: "cancelled", error: { code: "USER_CANCELLED" } });
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(current.controllerRef.current).toBeNull();
  });

  it("does not invent an image or provenance when the first generation fails", async () => {
    const current = session("background", false);
    generateImage.mockResolvedValueOnce({ ok: false, code: "http_error", error: "생성 실패" });
    await current.regenerate();

    expect(current.preview()?.items[0]?.imageDataUrl).toBeUndefined();
    expect(current.preview()?.items[0]?.imageProvenance).toBeUndefined();
    expect(current.preview()?.items[0]?.imageError).toBe("생성 실패");
    expect(current.ledger().operations[0]?.status).toBe("failed");
  });
});
