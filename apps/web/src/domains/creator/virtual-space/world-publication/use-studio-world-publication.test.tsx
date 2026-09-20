// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession } from "@/compat/auth-session-state";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "../studio-virtual-space-world-manifest";
import { studioWorldPublishManifest, type StudioWorldPublicationAuthority } from "./studio-world-publication-client";
import type { PreparedStudioWorld } from "./studio-world-publication-assets";
import { useStudioWorldPublication } from "./use-studio-world-publication";

const f = vi.hoisted(() => ({ read: vi.fn(), publish: vi.fn(), prepare: vi.fn() }));
vi.mock("./studio-world-publication-client", async (original) => ({
  ...await original<typeof import("./studio-world-publication-client")>(),
  readStudioWorldPublicationAuthority: f.read, publishStudioWorld: f.publish,
}));
vi.mock("./studio-world-publication-assets", () => ({ prepareStudioWorldAssets: f.prepare }));
function authority(): StudioWorldPublicationAuthority {
  return { canPublish: true, expiresAt: Date.now() + 15_000, publication: {
    contract: "studio-world-publication-v1", workId: "work-1", projectId: "project-1", artifactId: "world-artifact",
    revisionId: "revision-1", previousPublishedRevisionId: null, contentHash: "a".repeat(64), sequence: 1,
    publishedBy: "alice", publishedAt: "2026-09-20T00:00:00.000Z", manifest: studioWorldPublishManifest(DEFAULT_STUDIO_WORLD_MANIFEST),
  } };
}
function prepared(): PreparedStudioWorld {
  return { publication: authority().publication!, scope: "b".repeat(64), assetUrls: new Map(), dispose: vi.fn() };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  persistSession({ user: { id: "alice" }, token: null });
  f.read.mockReset().mockImplementation(async () => authority()); f.publish.mockReset(); f.prepare.mockReset().mockImplementation(async () => prepared());
});
afterEach(() => { cleanup(); persistSession(null); vi.restoreAllMocks(); });

describe("publication hook identity and visibility", () => {
  it("does not report skipped operations as successful while a background renewal is pending", async () => {
    const hook = renderHook(() => useStudioWorldPublication("work-1", "alice", true));
    await waitFor(() => expect(hook.result.current.snapshot.active).not.toBeNull());
    const gate = deferred<StudioWorldPublicationAuthority>(); f.read.mockReturnValueOnce(gate.promise);
    act(() => { window.dispatchEvent(new Event("focus")); });
    await act(async () => {
      expect(await hook.result.current.publish(DEFAULT_STUDIO_WORLD_MANIFEST, "revision-1")).toBe(false);
      expect(await hook.result.current.refresh()).toBe(false);
      expect(await hook.result.current.reviewDraftBase()).toBeNull();
    });
    expect(f.publish).not.toHaveBeenCalled();
    await act(async () => { gate.resolve(authority()); });
    await act(async () => { expect(await hook.result.current.reviewDraftBase()).toEqual({ revisionId: "revision-1" }); });
  });
  it("does not silently rebase when the fresh read finds a different publication", async () => {
    const hook = renderHook(() => useStudioWorldPublication("work-1", "alice", true));
    await waitFor(() => expect(hook.result.current.snapshot.active).not.toBeNull());
    const newer = authority(); newer.publication!.revisionId = "revision-2";
    f.read.mockResolvedValue(newer);
    await act(async () => { expect(await hook.result.current.reviewDraftBase()).toBeNull(); });
    expect(hook.result.current.snapshot.active?.publication.revisionId).toBe("revision-1");
    await act(async () => { expect(await hook.result.current.reviewDraftBase()).toEqual({ revisionId: "revision-2" }); });
    expect(f.publish).not.toHaveBeenCalled();
  });
  it("keeps the exact realm through ordinary blur, hidden and same-actor renewal without mutation", async () => {
    const hook = renderHook(() => useStudioWorldPublication("work-1", "alice", true));
    await waitFor(() => expect(hook.result.current.snapshot.active).not.toBeNull());
    const active = hook.result.current.snapshot.active!;
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(hook.result.current.snapshot.active).toBe(active);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.snapshot.active).toBe(active); expect(active.dispose).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { persistSession({ user: { id: "alice", name: "Renewed Alice" }, token: null }); });
    expect(hook.result.current.snapshot.active).toBe(active); expect(f.prepare).toHaveBeenCalledOnce(); expect(f.publish).not.toHaveBeenCalled();
    hook.unmount(); expect(active.dispose).toHaveBeenCalledOnce();
  });
  it("clears the old actor realm immediately even before the React actor prop catches up", async () => {
    const hook = renderHook(() => useStudioWorldPublication("work-1", "alice", true));
    await waitFor(() => expect(hook.result.current.snapshot.active).not.toBeNull());
    const active = hook.result.current.snapshot.active!, gate = deferred<StudioWorldPublicationAuthority>();
    f.read.mockReturnValueOnce(gate.promise);
    let pending!: Promise<boolean>; act(() => { pending = hook.result.current.refresh(); });
    act(() => { persistSession({ user: { id: "bob" }, token: null }); });
    expect(hook.result.current.snapshot).toMatchObject({ active: null, authority: null, accessDenied: true, viewVerified: false });
    expect(active.dispose).toHaveBeenCalledOnce();
    await act(async () => { gate.resolve(authority()); expect(await pending).toBe(false); });
    expect(hook.result.current.snapshot.active).toBeNull(); expect(f.publish).not.toHaveBeenCalled();
    hook.unmount(); expect(active.dispose).toHaveBeenCalledOnce();
  });
  it("aborts a candidate on hiding, disposes its late decode and requires explicit adoption after restore", async () => {
    const gate = deferred<PreparedStudioWorld>(); f.prepare.mockReturnValueOnce(gate.promise);
    const hook = renderHook(() => useStudioWorldPublication("work-1", "alice", true));
    await waitFor(() => expect(hook.result.current.snapshot.phase).toBe("preparing"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    const rejected = prepared(); await act(async () => { gate.resolve(rejected); });
    expect(rejected.dispose).toHaveBeenCalledOnce(); expect(hook.result.current.snapshot.active).toBeNull();
    visibility.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.snapshot.active).toBeNull(); expect(f.prepare).toHaveBeenCalledOnce();
    await act(async () => { expect(await hook.result.current.refresh()).toBe(true); });
    expect(hook.result.current.snapshot.active).not.toBeNull(); expect(f.prepare).toHaveBeenCalledTimes(2);
  });
});
