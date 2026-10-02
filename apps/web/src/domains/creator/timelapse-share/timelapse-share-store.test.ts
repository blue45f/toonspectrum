// timelapse-share-store 테스트 — 게스트 로컬 집계(좋아요·조회수), 서버 어댑터 미러링.
// DB·네트워크를 건드리지 않는다 — 어댑터는 가짜로 주입한다.
import { describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";

import {
  TIMELAPSE_SHARE_STORAGE_KEY,
  createTimelapseShareStore,
  type TimelapseClipServerAdapter,
} from "./timelapse-share-store";

import type { TimelapsePublishInput } from "./timelapse-share-model";

function memoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function publishInput(over: Partial<TimelapsePublishInput> = {}): TimelapsePublishInput {
  return {
    title: "테스트 클립",
    description: "그리기 과정",
    visibility: "public",
    width: 720,
    height: 1280,
    durationSec: 30,
    stepCount: 10,
    watermark: true,
    authorName: "게스트",
    authorIsGuest: true,
    ownerKey: "guest:test-guest",
    thumbnailDataUrl: "",
    ...over,
  };
}

function silentAdapter(over: Partial<TimelapseClipServerAdapter> = {}): TimelapseClipServerAdapter {
  return {
    pushClip: async () => undefined,
    toggleLike: async (_id, liked) => ({ liked, likes: liked ? 42 : 41 }),
    recordView: async () => undefined,
    ...over,
  };
}

describe("timelapse-share-store (게스트 로컬)", () => {
  it("publishClip — 최신 순으로 쌓고 메타를 보관한다", () => {
    const store = createTimelapseShareStore(memoryStorage);
    const first = store.getState().publishClip(publishInput({ title: "첫 클립" }));
    const second = store.getState().publishClip(publishInput({ title: "둘째 클립" }));
    const clips = store.getState().clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].id).toBe(second.id);
    expect(clips[1].id).toBe(first.id);
    expect(second.title).toBe("둘째 클립");
    expect(second.watermark).toBe(true);
  });

  it("toggleLike — 낙관적 토글과 카운트 증감", () => {
    const store = createTimelapseShareStore(memoryStorage);
    const clip = store.getState().publishClip(publishInput());
    expect(store.getState().toggleLike(clip.id)).toBe(true);
    expect(store.getState().clips[0]).toMatchObject({ liked: true, likes: 1 });
    expect(store.getState().toggleLike(clip.id)).toBe(false);
    expect(store.getState().clips[0]).toMatchObject({ liked: false, likes: 0 });
    // 없는 id는 조용히 무시(반환값 false)
    expect(store.getState().toggleLike("nope")).toBe(false);
  });

  it("applyServerLike — 서버 응답으로 로컬 상태를 맞춘다", () => {
    const store = createTimelapseShareStore(memoryStorage);
    const clip = store.getState().publishClip(publishInput());
    store.getState().toggleLike(clip.id); // 로컬 낙관 반영: likes 1
    store.getState().applyServerLike(clip.id, true, 42);
    expect(store.getState().clips[0]).toMatchObject({ liked: true, likes: 42 });
  });

  it("recordView — 본인 조회는 1회만 집계한다", () => {
    const store = createTimelapseShareStore(memoryStorage);
    const clip = store.getState().publishClip(publishInput());
    store.getState().recordView(clip.id);
    store.getState().recordView(clip.id);
    store.getState().recordView(clip.id);
    expect(store.getState().clips[0].views).toBe(1);
    expect(store.getState().viewedClipIds).toContain(clip.id);
  });

  it("removeClip — 클립과 조회 기록을 함께 지운다", () => {
    const store = createTimelapseShareStore(memoryStorage);
    const clip = store.getState().publishClip(publishInput());
    store.getState().recordView(clip.id);
    store.getState().removeClip(clip.id);
    expect(store.getState().clips).toHaveLength(0);
    expect(store.getState().viewedClipIds).not.toContain(clip.id);
  });

  it("persist — clips와 viewedClipIds만 저장된다", async () => {
    const storage = memoryStorage();
    const store = createTimelapseShareStore(() => storage);
    const clip = store.getState().publishClip(publishInput());
    store.getState().recordView(clip.id);
    store.getState().setServerAdapter(silentAdapter()); // 휘발성 — 저장되면 안 됨
    const raw = await storage.getItem(TIMELAPSE_SHARE_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { state: Record<string, unknown> };
    expect(Object.keys(parsed.state).sort()).toEqual(["clips", "viewedClipIds"]);
  });

  it("서버 어댑터 — publishClip/recordView가 best-effort로 미러링된다", async () => {
    const adapter = silentAdapter();
    const pushClip = vi.spyOn(adapter, "pushClip");
    const recordView = vi.spyOn(adapter, "recordView");
    const store = createTimelapseShareStore(memoryStorage);
    store.getState().setServerAdapter(adapter);
    const clip = store.getState().publishClip(publishInput());
    store.getState().recordView(clip.id);
    await Promise.resolve();
    expect(pushClip).toHaveBeenCalledTimes(1);
    expect(pushClip).toHaveBeenCalledWith(expect.objectContaining({ id: clip.id }));
    expect(recordView).toHaveBeenCalledWith(clip.id);
  });

  it("서버 어댑터 실패 — 로컬 게시는 유지된다", async () => {
    const store = createTimelapseShareStore(memoryStorage);
    store.getState().setServerAdapter(
      silentAdapter({
        pushClip: async () => {
          throw new Error("서버 오류");
        },
      }),
    );
    const clip = store.getState().publishClip(publishInput({ title: "서버 실패해도 로컬 유지" }));
    await Promise.resolve();
    expect(store.getState().clips[0].id).toBe(clip.id);
  });

  it("갤러리 상한 — 50개를 넘기면 오래된 것부터 버린다", () => {
    const store = createTimelapseShareStore(memoryStorage);
    for (let i = 0; i < 55; i += 1) {
      store.getState().publishClip(publishInput({ title: `클립 ${i}` }));
    }
    const clips = store.getState().clips;
    expect(clips).toHaveLength(50);
    expect(clips[0].title).toBe("클립 54");
  });
});
