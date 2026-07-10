import { describe, expect, it } from "vitest";

import {
  appendStudioAiOperation,
  createEmptyStudioAiProvenanceDocument,
} from "./studio-ai-provenance";
import {
  createStudioCheckpoint,
  deleteStudioCheckpoint,
  listStudioCheckpoints,
  renameStudioCheckpoint,
  STUDIO_CHECKPOINT_LIMIT,
  studioCheckpointKey,
} from "./studio-checkpoints";

const PRIVATE_PROMPT = "체크포인트에 남으면 안 되는 원문 프롬프트";

function retainedAiProvenance() {
  return appendStudioAiOperation(
    createEmptyStudioAiProvenanceDocument(),
    {
      id: "operation-1",
      kind: "text",
      task: "dialogue",
      provider: "deepseek",
      model: "deepseek-chat",
      transport: "server",
      promptVersion: 1,
      prompt: PRIVATE_PROMPT,
      createdAt: "2026-07-10T00:00:00.000Z",
    },
    { retainRawPrompt: true }
  );
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("studio checkpoints", () => {
  it("isolates checkpoints by user and document context", () => {
    expect(studioCheckpointKey({ userId: "u1", workId: "w1" })).not.toBe(
      studioCheckpointKey({ userId: "u1", workId: "w2" })
    );
    expect(studioCheckpointKey({ userId: "u1", workId: "w1" })).not.toBe(
      studioCheckpointKey({ userId: "u2", workId: "w1" })
    );
    expect(studioCheckpointKey({ userId: "u1", remixId: "w1" })).not.toBe(
      studioCheckpointKey({ userId: "u1", workId: "w1" })
    );
  });

  it("creates newest-first checkpoints and preserves the project payload", () => {
    const storage = memoryStorage();
    const key = studioCheckpointKey({ userId: "u1", workId: "w1" });
    createStudioCheckpoint(storage, key, {
      name: "초안",
      payload: { version: 2, title: "작품" },
      now: new Date("2026-07-10T01:00:00.000Z"),
      idFactory: () => "c1",
    });
    const checkpoints = createStudioCheckpoint(storage, key, {
      name: "  대사 수정  ",
      payload: { version: 2, title: "수정본" },
      now: new Date("2026-07-10T02:00:00.000Z"),
      idFactory: () => "c2",
    });
    expect(checkpoints.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "c2", name: "대사 수정" },
      { id: "c1", name: "초안" },
    ]);
    expect(checkpoints[0].payload).toEqual({ version: 2, title: "수정본" });
  });

  it("redacts raw AI prompts when creating and reloading checkpoints", () => {
    const storage = memoryStorage();
    const checkpoints = createStudioCheckpoint(storage, "ai-history", {
      name: "AI 초안",
      payload: { version: 2, aiProvenance: retainedAiProvenance() },
      now: new Date("2026-07-10T02:00:00.000Z"),
      idFactory: () => "ai-checkpoint",
    });
    const serializedStorage = storage.getItem("ai-history") ?? "";
    const restored = listStudioCheckpoints(storage, "ai-history");
    const createdPayload = checkpoints[0].payload as { aiProvenance: ReturnType<typeof retainedAiProvenance> };
    const restoredPayload = restored[0].payload as { aiProvenance: ReturnType<typeof retainedAiProvenance> };

    expect(createdPayload.aiProvenance.operations[0].prompt.retention).toBe("hash-only");
    expect(restoredPayload.aiProvenance.operations).toHaveLength(1);
    expect(serializedStorage).not.toContain(PRIVATE_PROMPT);
    expect(JSON.stringify(restored)).not.toContain(PRIVATE_PROMPT);
  });

  it("redacts raw prompts while migrating legacy checkpoint containers", () => {
    const storage = memoryStorage();
    storage.setItem(
      "legacy-ai",
      JSON.stringify([
        {
          id: "legacy-ai",
          name: "과거 AI 초안",
          createdAt: "2026-07-10T00:00:00.000Z",
          payload: { aiProvenance: retainedAiProvenance() },
        },
      ])
    );

    const restored = listStudioCheckpoints(storage, "legacy-ai");
    const payload = restored[0].payload as { aiProvenance: ReturnType<typeof retainedAiProvenance> };
    expect(payload.aiProvenance.operations[0].prompt).not.toHaveProperty("raw");
    expect(JSON.stringify(restored)).not.toContain(PRIVATE_PROMPT);
  });

  it("migrates the legacy array container and drops malformed records", () => {
    const storage = memoryStorage();
    const key = "legacy";
    storage.setItem(
      key,
      JSON.stringify([
        { id: "good", name: "정상", createdAt: "2026-07-10T00:00:00.000Z", payload: { ok: true } },
        { id: "bad", name: "", createdAt: "invalid", payload: null },
      ])
    );
    expect(listStudioCheckpoints(storage, key)).toHaveLength(1);
    expect(listStudioCheckpoints(storage, key)[0].id).toBe("good");
  });

  it("keeps only the bounded newest checkpoints", () => {
    const storage = memoryStorage();
    const key = "bounded";
    for (let index = 0; index < STUDIO_CHECKPOINT_LIMIT + 3; index++) {
      createStudioCheckpoint(storage, key, {
        name: `v${index}`,
        payload: { index },
        now: new Date(Date.UTC(2026, 0, 1, 0, index)),
        idFactory: () => `id-${index}`,
      });
    }
    const checkpoints = listStudioCheckpoints(storage, key);
    expect(checkpoints).toHaveLength(STUDIO_CHECKPOINT_LIMIT);
    expect(checkpoints[0].name).toBe(`v${STUDIO_CHECKPOINT_LIMIT + 2}`);
    expect(checkpoints.at(-1)?.name).toBe("v3");
  });

  it("renames and deletes a checkpoint without changing payload order", () => {
    const storage = memoryStorage();
    const key = "edit";
    createStudioCheckpoint(storage, key, {
      name: "초안",
      payload: { keep: true },
      idFactory: () => "one",
    });
    expect(renameStudioCheckpoint(storage, key, "one", "  최종 전  ")[0]).toMatchObject({
      id: "one",
      name: "최종 전",
      payload: { keep: true },
    });
    expect(deleteStudioCheckpoint(storage, key, "one")).toEqual([]);
    expect(storage.getItem(key)).toBeNull();
  });

  it("rejects blank names and reports storage quota failures", () => {
    const storage = memoryStorage();
    expect(() => createStudioCheckpoint(storage, "key", { name: "   ", payload: {} })).toThrow(/이름/);
    expect(() =>
      createStudioCheckpoint(
        { ...storage, setItem: () => { throw new Error("quota"); } },
        "key",
        { name: "저장", payload: {} }
      )
    ).toThrow(/저장공간/);
  });
});
