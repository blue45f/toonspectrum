import { describe, expect, it } from "vitest";

import {
  createStudioLiveInstantWorkId,
  isStudioJoinedLiveJamRoom,
  isStudioLiveJamWorkId,
  openStudioLiveCompanionTab,
  readStudioLiveRoomQuery,
  resolveStudioLiveInstantWorkIdForTab,
  resolveStudioLiveSessionWorkId,
  shouldExpectStudioSharedDocument,
  shouldPublishStudioLiveJamRoom,
  shouldRequireStudioLiveServer,
  shouldSeedStudioLiveSharedBootstrapPage,
  studioLiveSharedBootstrapPageId,
  STUDIO_LIVE_OWNER_ROOM_SESSION_KEY,
  withStudioLiveJamRoom,
  type StudioLiveOwnerRoomSessionStorage,
} from "./studio-live-jam-session";

function sessionStorageFixture(
  initial: Record<string, string> = {},
): StudioLiveOwnerRoomSessionStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function cloneSessionStorage(
  source: ReturnType<typeof sessionStorageFixture>,
): ReturnType<typeof sessionStorageFixture> {
  return sessionStorageFixture(Object.fromEntries(source.values));
}

describe("studio live jam session", () => {
  it("reads and writes the Magma room query without treating it as a saved work", () => {
    expect(readStudioLiveRoomQuery("?remix=src")).toBeNull();
    expect(readStudioLiveRoomQuery("?room=jam-7")).toBe("jam-7");
    expect(withStudioLiveJamRoom("?remix=src", "jam-7").get("room")).toBe("jam-7");
    expect(shouldPublishStudioLiveJamRoom({
      workId: null,
      remixId: null,
      roomId: null,
    })).toBe(true);
    expect(shouldPublishStudioLiveJamRoom({
      workId: null,
      remixId: null,
      roomId: "jam-7",
    })).toBe(false);
    expect(shouldExpectStudioSharedDocument({
      workAuthScopeKey: "user-1",
      workId: "work-1",
      remixId: null,
    })).toBe(true);
    expect(shouldExpectStudioSharedDocument({
      workAuthScopeKey: "user-1",
      workId: null,
      remixId: null,
    })).toBe(false);
    expect(shouldRequireStudioLiveServer({
      expectsSharedDocument: false,
      draftCollaborationReady: false,
    })).toBe(false);
    expect(shouldRequireStudioLiveServer({
      expectsSharedDocument: false,
      draftCollaborationReady: false,
      liveJam: true,
    })).toBe(true);
    expect(shouldRequireStudioLiveServer({
      expectsSharedDocument: true,
      draftCollaborationReady: false,
    })).toBe(true);
  });

  it("distinguishes the instant room owner from a tab that joined the published room", () => {
    const instant = createStudioLiveInstantWorkId(() => 1, () => 0.5);
    expect(isStudioJoinedLiveJamRoom({ roomId: null, instantWorkId: instant })).toBe(false);
    expect(isStudioJoinedLiveJamRoom({ roomId: instant, instantWorkId: instant })).toBe(false);
    expect(isStudioJoinedLiveJamRoom({
      roomId: instant,
      instantWorkId: "work-instant-other-tab",
    })).toBe(true);
  });

  it("keeps an owner room editable across remount and reload while a fresh companion remains a joiner", () => {
    const ownerStorage = sessionStorageFixture();
    const ownerRoom = resolveStudioLiveInstantWorkIdForTab({
      workId: null,
      remixId: null,
      roomId: null,
      storage: ownerStorage,
      now: () => 1,
      random: () => 0.5,
      navigationType: "navigate",
    });

    const remountedOwnerId = resolveStudioLiveInstantWorkIdForTab({
      workId: null,
      remixId: null,
      roomId: ownerRoom,
      storage: ownerStorage,
      now: () => 2,
      random: () => 0.25,
      navigationType: "navigate",
    });
    expect(remountedOwnerId).toBe(ownerRoom);

    const reloadedOwnerId = resolveStudioLiveInstantWorkIdForTab({
      workId: null,
      remixId: null,
      roomId: ownerRoom,
      storage: cloneSessionStorage(ownerStorage),
      now: () => 2,
      random: () => 0.25,
      navigationType: "reload",
    });
    expect(reloadedOwnerId).toBe(ownerRoom);
    expect(isStudioJoinedLiveJamRoom({ roomId: ownerRoom, instantWorkId: reloadedOwnerId })).toBe(false);

    const companionId = resolveStudioLiveInstantWorkIdForTab({
      workId: null,
      remixId: null,
      roomId: ownerRoom,
      storage: sessionStorageFixture(),
      now: () => 2,
      random: () => 0.25,
      navigationType: "navigate",
    });
    expect(companionId).not.toBe(ownerRoom);
    expect(isStudioJoinedLiveJamRoom({ roomId: ownerRoom, instantWorkId: companionId })).toBe(true);
  });

  it("demotes a duplicated owner tab whose session storage was cloned", () => {
    const ownerStorage = sessionStorageFixture();
    const ownerRoom = resolveStudioLiveInstantWorkIdForTab({
      workId: null,
      remixId: null,
      roomId: null,
      storage: ownerStorage,
      now: () => 1,
      random: () => 0.5,
      navigationType: "navigate",
    });
    const duplicateStorage = cloneSessionStorage(ownerStorage);

    const duplicateId = resolveStudioLiveInstantWorkIdForTab({
      workId: null,
      remixId: null,
      roomId: ownerRoom,
      storage: duplicateStorage,
      now: () => 2,
      random: () => 0.25,
      navigationType: "navigate",
    });

    expect(duplicateId).not.toBe(ownerRoom);
    expect(isStudioJoinedLiveJamRoom({ roomId: ownerRoom, instantWorkId: duplicateId })).toBe(true);
    expect(duplicateStorage.getItem(STUDIO_LIVE_OWNER_ROOM_SESSION_KEY)).toBeNull();
  });

  it("fails open for the local mount when tab storage is unavailable", () => {
    const blockedStorage: StudioLiveOwnerRoomSessionStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(() => resolveStudioLiveInstantWorkIdForTab({
      workId: null,
      remixId: null,
      roomId: null,
      storage: blockedStorage,
      now: () => 1,
      random: () => 0.5,
    })).not.toThrow();
  });

  it("resolves the same session id for a first tab and a second tab that only has the room query", () => {
    const instant = createStudioLiveInstantWorkId(() => 1, () => 0.5);
    expect(instant.startsWith("work-instant-")).toBe(true);
    expect(isStudioLiveJamWorkId(instant)).toBe(true);
    expect(isStudioLiveJamWorkId(createStudioLiveInstantWorkId(() => 1, () => 0))).toBe(
      true,
    );
    const first = resolveStudioLiveSessionWorkId({
      workId: null,
      roomId: null,
      instantWorkId: instant,
    });
    const second = resolveStudioLiveSessionWorkId({
      workId: null,
      roomId: first,
      instantWorkId: "work-instant-other-tab",
    });
    expect(first).toBe(instant);
    expect(second).toBe(first);
    expect(studioLiveSharedBootstrapPageId(first)).toBe(studioLiveSharedBootstrapPageId(second));
    expect(studioLiveSharedBootstrapPageId(first)).toBe(`jam-page-${first}`);
    expect(shouldSeedStudioLiveSharedBootstrapPage(null)).toBe(true);
    expect(shouldSeedStudioLiveSharedBootstrapPage("work-saved-1")).toBe(false);
  });

  it("opens a companion tab at the shipped jam href", () => {
    const opened: string[] = [];
    expect(openStudioLiveCompanionTab("jam-22", (url) => {
      opened.push(url);
      return {} as Window;
    })).toBe(true);
    expect(opened).toEqual(["/studio?room=jam-22"]);
  });
});
