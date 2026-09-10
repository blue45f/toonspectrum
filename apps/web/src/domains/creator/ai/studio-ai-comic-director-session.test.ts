import { describe, expect, it } from "vitest";

import {
  createStudioAiComicApplyDiff,
  createStudioAiComicDirectorId,
  createStudioAiComicDirectorSession,
  hydrateStudioAiComicDirectorSession,
  loadStudioAiComicDirectorSession,
  reconcileStudioAiComicDirectorJobs,
  saveStudioAiComicDirectorSession,
  studioAiComicDirectorCandidateDigest,
  studioAiComicDirectorStorageKey,
  updateStudioAiComicDirectorSession,
} from "./studio-ai-comic-director-session";

import type { ScenarioPreviewItem } from "../studio-scenario-layout";

function scene(): ScenarioPreviewItem {
  return {
    frame: { x: 24, y: 24, width: 672, height: 480 },
    bubbles: [
      {
        type: "bubble",
        variant: "speech",
        text: "안녕",
        x: 40,
        y: 40,
        width: 200,
        height: 90,
        fill: "#fff",
        textFill: "#111",
        rotation: 0,
      },
    ],
    beatType: "setup",
    summary: "첫 컷",
    imagePrompt: "주인공이 문을 연다",
    dialogue: "주인공: 안녕",
    aspect: "landscape",
    imageDataUrl: "data:image/png;base64,scene",
    imageCandidates: [
      {
        id: "candidate-1",
        imageDataUrl: "data:image/png;base64,scene",
        inputFingerprint: "fingerprint-1",
        createdAt: "2026-09-09T00:00:00.000Z",
      },
    ],
    selectedImageCandidateId: "candidate-1",
    layerManifest: {
      version: 1,
      method: "manual-mask",
      editable: true,
      sourceCandidateId: "candidate-1",
      createdAt: "2026-09-09T00:00:00.000Z",
      layers: [
        {
          id: "candidate-1:bg",
          name: "배경",
          role: "background",
          imageDataUrl: "data:image/png;base64,bg",
          sourceCandidateId: "candidate-1",
        },
        {
          id: "candidate-1:fg",
          name: "전경",
          role: "foreground",
          imageDataUrl: "data:image/png;base64,fg",
          sourceCandidateId: "candidate-1",
        },
      ],
    },
  };
}

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("AI Comic Director session", () => {
  it("uses Web Crypto entropy when randomUUID is unavailable", () => {
    const generated = createStudioAiComicDirectorId("comic", {
      getRandomValues(array) {
        array.set(Array.from({ length: 16 }, (_, index) => index));
        return array;
      },
    });

    expect(generated).toBe("comic-000102030405060708090a0b0c0d0e0f");
  });

  it("fails closed when secure entropy is unavailable", () => {
    expect(() => createStudioAiComicDirectorId("comic", null)).toThrow(
      "안전한 AI 코믹 디렉터 식별자를 생성할 수 없습니다.",
    );
  });

  it("round-trips a durable local session without image authority changes", () => {
    const storage = new MemoryStorage();
    const session = createStudioAiComicDirectorSession({
      id: "session-1",
      workId: "work-1",
      scenes: [scene()],
      baseDocumentRevision: "revision-7",
    });

    saveStudioAiComicDirectorSession(storage, session);
    expect(storage.values.has(studioAiComicDirectorStorageKey("session-1"))).toBe(true);
    expect(loadStudioAiComicDirectorSession(storage, "session-1")).toEqual(session);
  });

  it("invalidates approval whenever a material session mutation creates a new revision", () => {
    const base = createStudioAiComicDirectorSession({
      id: "session-2",
      scenes: [scene()],
    });
    const digest = studioAiComicDirectorCandidateDigest(base.scenes);
    const approved = {
      ...base,
      approval: {
        id: "approval-1",
        sessionRevision: base.revision,
        candidateDigest: digest,
        status: "active" as const,
        createdAt: "2026-09-09T00:00:00.000Z",
      },
    };

    const changed = updateStudioAiComicDirectorSession(approved, {
      storyText: "변경된 이야기",
    });
    expect(changed.revision).toBe(approved.revision + 1);
    expect(changed.approval).toBeNull();
  });

  it("produces an explicit non-destructive apply diff and validates approval digest", () => {
    const base = createStudioAiComicDirectorSession({
      id: "session-3",
      scenes: [scene()],
      baseDocumentRevision: "revision-3",
    });
    const candidateDigest = studioAiComicDirectorCandidateDigest(base.scenes);
    const approved = {
      ...base,
      approval: {
        id: "approval-3",
        sessionRevision: base.revision,
        candidateDigest,
        status: "active" as const,
        createdAt: "2026-09-09T00:00:00.000Z",
      },
    };

    expect(createStudioAiComicApplyDiff({
      session: approved,
      target: "current-page",
      operationId: "operation-1",
    })).toMatchObject({
      operationId: "operation-1",
      panelCount: 1,
      imageCount: 1,
      nativeBubbleCount: 1,
      decomposedLayerCount: 2,
      existingLayerChanges: 0,
      approved: true,
      baseDocumentRevision: "revision-3",
    });
  });

  it("marks only expired running jobs unknown during recovery", () => {
    const now = Date.parse("2026-09-09T01:00:00.000Z");
    const jobs = reconcileStudioAiComicDirectorJobs([
      {
        id: "expired",
        operationId: "op-1",
        kind: "generation",
        status: "running",
        progressDone: 1,
        progressTotal: 4,
        payload: {},
        result: null,
        error: null,
        leaseExpiresAt: "2026-09-09T00:59:00.000Z",
        updatedAt: "2026-09-09T00:58:00.000Z",
      },
      {
        id: "live",
        operationId: "op-2",
        kind: "repair",
        status: "running",
        progressDone: 0,
        progressTotal: 1,
        payload: {},
        result: null,
        error: null,
        leaseExpiresAt: "2026-09-09T01:01:00.000Z",
        updatedAt: "2026-09-09T00:58:00.000Z",
      },
    ], now);

    expect(jobs[0]?.status).toBe("unknown");
    expect(jobs[1]?.status).toBe("running");
  });

  it("rejects malformed persisted data", () => {
    expect(hydrateStudioAiComicDirectorSession({ version: 2, id: "legacy" })).toBeNull();
    expect(hydrateStudioAiComicDirectorSession({ version: 1 })).toBeNull();
  });
});
