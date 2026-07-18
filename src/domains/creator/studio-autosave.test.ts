import { describe, expect, it } from "vitest";

import {
  appendStudioAiOperation,
  createEmptyStudioAiProvenanceDocument,
} from "./studio-ai-provenance";
import {
  LEGACY_STUDIO_AUTOSAVE_KEY,
  parseStudioAutosave,
  readStudioAutosave,
  serializeStudioAutosave,
  studioAutosaveHasContent,
  studioAutosaveKey,
  studioLifecycleAutosaveSidecarKey,
  studioSharedAutosaveCompatibility,
  writeStudioLifecycleAutosave,
} from "./studio-autosave";
import { STUDIO_CANVAS_WIDTH } from "./studio-canvas-constants";
import { createDefaultStudioDrawingAssistDocument } from "./studio-drawing-assist-document";
import { createStudioReferenceBoardDocument } from "./studio-reference-board";

const PRIVATE_PROMPT = "공개하면 안 되는 반전 프롬프트";

function retainedAiProvenance() {
  return appendStudioAiOperation(
    createEmptyStudioAiProvenanceDocument(),
    {
      id: "operation-1",
      kind: "text",
      task: "scenario",
      provider: "zai",
      model: "glm-5.1",
      transport: "server",
      promptVersion: 1,
      prompt: PRIVATE_PROMPT,
      createdAt: "2026-07-10T00:00:00.000Z",
    },
    { retainRawPrompt: true }
  );
}

describe("studio autosave", () => {
  it("사용자와 문서 문맥별로 키를 격리한다", () => {
    expect(studioAutosaveKey({ userId: "u1", workId: "w1" })).not.toBe(
      studioAutosaveKey({ userId: "u1", workId: "w2" })
    );
    expect(studioAutosaveKey({ userId: "u1", remixId: "w1" })).not.toBe(
      studioAutosaveKey({ userId: "u1", workId: "w1" })
    );
    expect(studioAutosaveKey({ userId: "u1", workId: "w1" })).not.toBe(
      studioAutosaveKey({ userId: "u2", workId: "w1" })
    );
  });

  it("레거시 페이로드를 v2 최소 형태로 읽는다", () => {
    const parsed = parseStudioAutosave(
      JSON.stringify({ pagesList: [{ id: "p1", elements: [{ id: "e1" }] }], title: "작품" })
    );
    expect(parsed).toMatchObject({ version: 2, currentPageId: undefined, title: "작품" });
    expect(parsed && studioAutosaveHasContent(parsed)).toBe(true);
  });

  it("Publish Pack 설정을 자동저장 페이로드에서 보존한다", () => {
    const parsed = parseStudioAutosave(
      JSON.stringify({
        pagesList: [{ id: "p1", elements: [{ id: "e1" }] }],
        publishPack: { profile: "tapas", aiUsage: "none", disclosure: "" },
      })
    );
    expect(parsed?.publishPack).toEqual({ profile: "tapas", aiUsage: "none", disclosure: "" });
  });

  it("공동 작품 source work/revision을 직렬화·파싱 왕복에서 보존한다", () => {
    const parsed = parseStudioAutosave(
      serializeStudioAutosave({
        version: 2,
        savedAt: "2026-07-12T00:00:00.000Z",
        pagesList: [{ id: "p1", elements: [{ id: "e1" }] }],
        sourceWorkId: "shared/work 01",
        sourceRevision: 7,
      })
    );

    expect(parsed).toMatchObject({ sourceWorkId: "shared/work 01", sourceRevision: 7 });
  });

  it("공동 작품 자동저장은 work/revision exact match일 때만 복구 가능하다", () => {
    const payload = {
      version: 2 as const,
      savedAt: "2026-07-12T00:00:00.000Z",
      pagesList: [{ id: "p1", elements: [{ id: "e1" }] }],
      sourceWorkId: "shared-work",
      sourceRevision: 7,
    };

    expect(
      studioSharedAutosaveCompatibility(payload, { workId: "shared-work", revision: 7 })
    ).toEqual({ compatible: true, reason: "match" });
    expect(
      studioSharedAutosaveCompatibility(payload, { workId: "other-work", revision: 7 })
    ).toEqual({ compatible: false, reason: "work-mismatch" });
    expect(
      studioSharedAutosaveCompatibility(payload, { workId: "shared-work", revision: 8 })
    ).toEqual({ compatible: false, reason: "revision-mismatch" });
  });

  it("source metadata가 없는 legacy 공동 자동저장은 자동 재베이스하지 않는다", () => {
    const legacy = parseStudioAutosave(
      JSON.stringify({ pagesList: [{ id: "p1", elements: [{ id: "e1" }] }] })
    );

    expect(legacy).not.toBeNull();
    expect(
      studioSharedAutosaveCompatibility(legacy!, { workId: "shared-work", revision: 1 })
    ).toEqual({ compatible: false, reason: "legacy-unversioned" });
  });

  it("캘리그래피 획의 필압·틸트·회전·펜촉 설정을 자동저장 왕복에서 보존한다", () => {
    const stroke = {
      id: "calligraphy-1",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: "calligraphy",
      points: [0, 0, 10, 10],
      pressures: [0.25, 0.8],
      tiltXs: [20, 35],
      tiltYs: [-10, 15],
      twists: [5, 40],
      brushTip: { tiltEnabled: true, angleDeg: -30, roundness: 0.24 },
    };
    const serialized = serializeStudioAutosave({
      version: 2,
      savedAt: "2026-07-12T00:00:00.000Z",
      pagesList: [{ id: "p1", elements: [stroke] }],
    });
    const parsed = parseStudioAutosave(serialized);
    expect(parsed?.pagesList[0]?.elements?.[0]).toEqual(stroke);
  });

  it("캐릭터 바이블만 작성한 문서도 복구 대상으로 보존한다", () => {
    const characterBible = { version: 1, characters: [{ id: "hero", name: "윤슬" }] };
    const parsed = parseStudioAutosave(
      JSON.stringify({ pagesList: [{ id: "p1", elements: [] }], characterBible })
    );
    expect(parsed?.characterBible).toEqual(characterBible);
    expect(parsed && studioAutosaveHasContent(parsed)).toBe(true);
  });

  it("드로잉 가이드만 작성한 빈 페이지도 왕복하고 복구 대상으로 보존한다", () => {
    const guide = createDefaultStudioDrawingAssistDocument({
      canvasWidth: STUDIO_CANVAS_WIDTH,
      canvasHeight: 1_080,
    });
    const drawingAssist = {
      ...guide,
      perspective: {
        active: true,
        points: [{ id: "vp-a", x: 120, y: 240 }],
      },
    };
    const parsed = parseStudioAutosave(serializeStudioAutosave({
      version: 2,
      savedAt: "2026-07-19T00:00:00.000Z",
      pagesList: [{ id: "p1", elements: [], canvasH: 1_080, drawingAssist }],
    }));

    expect(parsed?.pagesList[0]?.drawingAssist).toEqual(drawingAssist);
    expect(parsed && studioAutosaveHasContent(parsed)).toBe(true);
    expect(studioAutosaveHasContent({
      version: 2,
      savedAt: "2026-07-19T00:00:00.000Z",
      pagesList: [{ id: "p1", elements: [], canvasH: 1_080, drawingAssist: guide }],
    })).toBe(false);
  });

  it("포즈 참고 보드만 작성한 빈 문서도 해시 기반으로 왕복하고 복구한다", () => {
    const referenceBoard = createStudioReferenceBoardDocument([{
      id: "pose-reference",
      asset: {
        sha256: `sha256:${"c".repeat(64)}`,
        assetId: "local-pose",
        name: "손 포즈",
      },
      view: {
        centerX: 0.25,
        centerY: 0.75,
        zoom: 2,
        rotationDeg: 30,
        flipX: true,
        flipY: false,
        opacity: 0.6,
        grayscale: true,
      },
    }]);
    const serialized = serializeStudioAutosave({
      version: 2,
      savedAt: "2026-07-19T00:00:00.000Z",
      pagesList: [{ id: "p1", elements: [] }],
      referenceBoard,
    });
    const parsed = parseStudioAutosave(serialized);

    expect(parsed?.referenceBoard).toEqual(referenceBoard);
    expect(serialized).not.toContain("data:");
    expect(parsed && studioAutosaveHasContent(parsed)).toBe(true);
  });

  it("Writer Room만 작성한 문서도 비공개 자동저장으로 보존한다", () => {
    const writerRoom = {
      version: 1,
      stages: { premise: { text: "기억을 파는 소녀", characterIds: [] } },
      completion: { premise: true },
      suggestions: [],
    };
    const parsed = parseStudioAutosave(
      JSON.stringify({ pagesList: [{ id: "p1", elements: [] }], writerRoom })
    );
    expect(parsed?.writerRoom).toEqual(writerRoom);
    expect(parsed && studioAutosaveHasContent(parsed)).toBe(true);
  });

  it("문서 댓글만 작성한 문서도 복구 대상으로 보존한다", () => {
    const comments = { version: 1, threads: [{ id: "comment-1" }] };
    const parsed = parseStudioAutosave(
      JSON.stringify({ pagesList: [{ id: "p1", elements: [] }], comments })
    );
    expect(parsed?.comments).toEqual(comments);
    expect(parsed && studioAutosaveHasContent(parsed)).toBe(true);
  });

  it("릴리스 일정 또는 수동 분석 기록만 있어도 운영 문서를 복구 대상으로 보존한다", () => {
    const schedule = parseStudioAutosave(
      JSON.stringify({
        pagesList: [{ id: "p1", elements: [] }],
        releaseSchedule: { version: 1, items: [{ id: "release-1" }] },
      })
    );
    const analytics = parseStudioAutosave(
      JSON.stringify({
        pagesList: [{ id: "p1", elements: [] }],
        publicationAnalytics: { version: 1, records: [{ id: "record-1" }] },
      })
    );
    expect(schedule?.releaseSchedule).toMatchObject({ version: 1 });
    expect(analytics?.publicationAnalytics).toMatchObject({ version: 1 });
    expect(schedule && studioAutosaveHasContent(schedule)).toBe(true);
    expect(analytics && studioAutosaveHasContent(analytics)).toBe(true);
  });

  it("AI 작업 이력을 복구하되 자동저장 경계에서 원문 프롬프트를 제거한다", () => {
    const serialized = serializeStudioAutosave({
      version: 2,
      savedAt: "2026-07-10T00:00:00.000Z",
      pagesList: [{ id: "p1", elements: [] }],
      aiProvenance: retainedAiProvenance(),
    });
    const parsed = parseStudioAutosave(serialized);

    expect(serialized).not.toContain(PRIVATE_PROMPT);
    expect(parsed?.aiProvenance?.operations).toHaveLength(1);
    expect(parsed?.aiProvenance?.operations[0].prompt.retention).toBe("hash-only");
    expect(parsed?.aiProvenance?.operations[0].prompt).not.toHaveProperty("raw");
    expect(JSON.stringify(parsed)).not.toContain(PRIVATE_PROMPT);
    expect(parsed && studioAutosaveHasContent(parsed)).toBe(true);
  });

  it("과거 코드가 직접 직렬화한 원문 포함 자동저장도 읽는 순간 비공개 처리한다", () => {
    const parsed = parseStudioAutosave(
      JSON.stringify({
        pagesList: [{ id: "p1", elements: [] }],
        aiProvenance: retainedAiProvenance(),
      })
    );

    expect(parsed?.aiProvenance?.operations).toHaveLength(1);
    expect(parsed?.aiProvenance?.operations[0].prompt).not.toHaveProperty("raw");
    expect(JSON.stringify(parsed)).not.toContain(PRIVATE_PROMPT);
  });

  it("AI 이력이 없는 레거시 자동저장을 그대로 읽고 손상된 이력은 빈 문서로 격리한다", () => {
    const legacy = parseStudioAutosave(JSON.stringify({ pagesList: [{ id: "p1", elements: [] }], title: "과거" }));
    const malformed = parseStudioAutosave(
      JSON.stringify({
        pagesList: [{ id: "p1", elements: [] }],
        aiProvenance: { version: 999, operations: [{ raw: PRIVATE_PROMPT }] },
      })
    );

    expect(legacy?.aiProvenance).toBeUndefined();
    expect(malformed?.aiProvenance).toEqual({ version: 1, operations: [] });
    expect(malformed && studioAutosaveHasContent(malformed)).toBe(false);
  });

  it("현재 문서 백업을 우선하고 새 문서에서만 레거시를 폴백한다", () => {
    const key = studioAutosaveKey({ userId: "u1", workId: "w1" });
    const values = new Map<string, string>([
      [key, JSON.stringify({ pagesList: [{ id: "current", elements: [] }], title: "현재" })],
      [LEGACY_STUDIO_AUTOSAVE_KEY, JSON.stringify({ pagesList: [{ id: "legacy", elements: [] }], title: "과거" })],
    ]);
    const storage = { getItem: (name: string) => values.get(name) ?? null };
    expect(readStudioAutosave(storage, key, true)?.payload.title).toBe("현재");
    values.delete(key);
    expect(readStudioAutosave(storage, key, false)).toBeNull();
    expect(readStudioAutosave(storage, key, true)?.payload.title).toBe("과거");
  });

  it("미해결 기본 복구본을 그대로 두고 lifecycle 편집은 sidecar에 보존한다", () => {
    const key = studioAutosaveKey({ userId: "u1", workId: "w1" });
    const original = JSON.stringify({
      version: 2,
      savedAt: "2026-07-18T00:00:00.000Z",
      pagesList: [{ id: "old", elements: [{ id: "old-stroke" }] }],
      sourceWorkId: "w1",
      sourceRevision: 4,
    });
    const values = new Map<string, string>([[key, original]]);
    const storage = {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => values.set(name, value),
      removeItem: (name: string) => values.delete(name),
    };

    const result = writeStudioLifecycleAutosave(
      storage,
      key,
      {
        version: 2,
        savedAt: "2026-07-18T00:00:01.000Z",
        pagesList: [{ id: "new", elements: [{ id: "new-stroke" }] }],
        sourceWorkId: "w1",
        sourceRevision: 5,
      },
      { preservePrimary: true }
    );

    expect(result).toEqual({
      key: studioLifecycleAutosaveSidecarKey(key),
      disposition: "preserved-primary-sidecar",
    });
    expect(values.get(key)).toBe(original);
    expect(values.get(result.key)).toContain("new-stroke");
    expect(readStudioAutosave(storage, key)?.key).toBe(result.key);
    expect(readStudioAutosave(storage, key)?.payload.pagesList[0]?.id).toBe("new");

    writeStudioLifecycleAutosave(
      storage,
      key,
      {
        version: 2,
        savedAt: "2026-07-18T00:00:02.000Z",
        pagesList: [{ id: "newer", elements: [{ id: "newer-stroke" }] }],
        sourceWorkId: "w1",
        sourceRevision: 5,
      },
      { preservePrimary: true }
    );
    const journalRaw = values.get(result.key) ?? "";
    expect(journalRaw).toContain("new-stroke");
    expect(journalRaw).toContain("newer-stroke");
    expect(readStudioAutosave(storage, key)?.payload.pagesList[0]?.id).toBe("newer");
  });

  it("해결된 복구 흐름은 primary를 갱신하고 남은 sidecar를 제거한다", () => {
    const key = studioAutosaveKey({ userId: "u1", workId: "w1" });
    const sidecarKey = studioLifecycleAutosaveSidecarKey(key);
    const values = new Map<string, string>([
      [key, JSON.stringify({ pagesList: [{ id: "old", elements: [{ id: "old" }] }] })],
      [sidecarKey, JSON.stringify({ pagesList: [{ id: "side", elements: [{ id: "side" }] }] })],
    ]);
    const storage = {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => values.set(name, value),
      removeItem: (name: string) => values.delete(name),
    };

    expect(
      writeStudioLifecycleAutosave(
        storage,
        key,
        {
          version: 2,
          savedAt: "2026-07-18T02:00:00.000Z",
          pagesList: [{ id: "resolved", elements: [{ id: "resolved" }] }],
        },
        { preservePrimary: false }
      )
    ).toEqual({ key, disposition: "primary" });
    expect(parseStudioAutosave(values.get(key) ?? null)?.pagesList[0]?.id).toBe("resolved");
    expect(values.has(sidecarKey)).toBe(false);
  });

  it("내용이 전혀 없는 백업은 복구 대상으로 삼지 않는다", () => {
    const payload = parseStudioAutosave(JSON.stringify({ pagesList: [{ id: "p1", elements: [] }] }));
    expect(payload && studioAutosaveHasContent(payload)).toBe(false);
  });
});
