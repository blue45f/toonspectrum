import { describe, expect, it, vi } from "vitest";
import type { StudioWorldPublication } from "@toonspectrum/studio-project-model/world-publication";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "../studio-virtual-space-world-manifest";
import { StudioWorldPublicationController, type StudioWorldPublicationDependencies } from "./studio-world-publication-controller";
import { StudioWorldPublicationError, studioWorldPublishManifest, type StudioWorldPublicationAuthority } from "./studio-world-publication-client";
import type { PreparedStudioWorld } from "./studio-world-publication-assets";

const publication = (revisionId = "revision-1", sequence = 1): StudioWorldPublication => ({ contract: "studio-world-publication-v1", workId: "work-1",
  projectId: "project-1", artifactId: "studio-world-work-1", revisionId, previousPublishedRevisionId: null,
  contentHash: "a".repeat(64), sequence, publishedBy: "alice", publishedAt: "2026-09-20T00:00:00.000Z",
  manifest: studioWorldPublishManifest(DEFAULT_STUDIO_WORLD_MANIFEST) });
function fixture(initial: StudioWorldPublication | null = null) {
  let now = 1, current = initial;
  const context = { actorId: "alice" as string | null, generation: 1, available: true };
  const authority = (): StudioWorldPublicationAuthority => ({ publication: current, canPublish: true, expiresAt: now + 15_000 });
  const prepared: PreparedStudioWorld[] = [];
  const deps: StudioWorldPublicationDependencies = {
    context: () => context, now: () => now, id: () => "intent-fixed", read: vi.fn(async () => authority()),
    prepare: vi.fn(async (candidate) => { const result = { publication: candidate, scope: candidate.revisionId, assetUrls: new Map(), dispose: vi.fn() }; prepared.push(result); return result; }),
    publish: vi.fn(async (_work, input) => { current = { ...publication("revision-2", 2), manifest: input.manifest, previousPublishedRevisionId: input.expectedPublishedRevisionId }; return { publication: current, replayed: false }; }),
  };
  const controller = new StudioWorldPublicationController("work-1", deps);
  return { controller, deps, context, prepared, authority, setCurrent: (value: StudioWorldPublication | null) => { current = value; }, advance: (ms: number) => { now += ms; } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("published world adoption", () => {
  it("reads/prepares/rechecks once and preserves the same scene through unchanged renewals", async () => {
    const f = fixture(publication()); await f.controller.read(); const active = f.controller.getSnapshot().active;
    await f.controller.read(false); await f.controller.read();
    expect(f.deps.prepare).toHaveBeenCalledTimes(1); expect(f.controller.getSnapshot().active).toBe(active);
    expect(f.controller.getSnapshot().viewVerified).toBe(true);
  });
  it("retains the old world until decode and the final fresh read, then disposes it exactly once", async () => {
    const f = fixture(publication()); await f.controller.read(); const old = f.controller.getSnapshot().active!;
    const gate = deferred<PreparedStudioWorld>(), next = publication("revision-2", 2);
    f.setCurrent(next); vi.mocked(f.deps.prepare).mockReturnValueOnce(gate.promise);
    const read = f.controller.read(); await Promise.resolve(); expect(f.controller.getSnapshot().active).toBe(old);
    const ready = { publication: next, scope: "new-scope", assetUrls: new Map(), dispose: vi.fn() }; gate.resolve(ready); await read;
    expect(f.controller.getSnapshot().active).toBe(ready); expect(old.dispose).toHaveBeenCalledTimes(1);
    f.controller.dispose(); expect(ready.dispose).toHaveBeenCalledTimes(1);
  });
  it("does not replace the old scene when assets fail or current publication changes while decoding", async () => {
    const f = fixture(publication()); await f.controller.read(); const old = f.controller.getSnapshot().active!;
    f.setCurrent(publication("revision-2", 2)); vi.mocked(f.deps.prepare).mockRejectedValueOnce(new StudioWorldPublicationError("assets"));
    await f.controller.read(); expect(f.controller.getSnapshot()).toMatchObject({ active: old, reason: "assets" }); expect(old.dispose).not.toHaveBeenCalled();
    vi.mocked(f.deps.read).mockResolvedValueOnce(f.authority()).mockResolvedValueOnce({ ...f.authority(), publication: publication("revision-3", 3) });
    await f.controller.read(); expect(f.controller.getSnapshot()).toMatchObject({ active: old, reason: "conflict" }); expect(f.prepared[1]!.dispose).toHaveBeenCalledOnce();
  });
  it("fences a hidden/superseded decode without ending the already accepted world's lifetime", async () => {
    const f = fixture(publication()); await f.controller.read(); const old = f.controller.getSnapshot().active!;
    const gate = deferred<PreparedStudioWorld>(), next = publication("revision-2", 2);
    f.setCurrent(next); vi.mocked(f.deps.prepare).mockReturnValueOnce(gate.promise);
    const read = f.controller.read(); await Promise.resolve(); f.context.available = false; f.controller.invalidate();
    const rejected = { publication: next, scope: "new", assetUrls: new Map(), dispose: vi.fn() }; gate.resolve(rejected); await read;
    expect(f.controller.getSnapshot().active).toBe(old); expect(old.dispose).not.toHaveBeenCalled(); expect(rejected.dispose).toHaveBeenCalledOnce();
  });
  it("revokes the visible published world only on actual access denial", async () => {
    const f = fixture(publication()); await f.controller.read(); const old = f.controller.getSnapshot().active!;
    f.advance(16_000); f.controller.checkLease(); expect(f.controller.getSnapshot().active).toBe(old);
    vi.mocked(f.deps.read).mockRejectedValueOnce(new StudioWorldPublicationError("access-denied")); await f.controller.read(false);
    expect(f.controller.getSnapshot()).toMatchObject({ active: null, accessDenied: true, viewVerified: false }); expect(old.dispose).toHaveBeenCalledOnce();
  });
});
describe("explicit world publication", () => {
  it("freezes the exact draft, performs fresh CAS and applies the canonical current publication", async () => {
    const f = fixture(); await f.controller.read();
    const draft = { ...structuredClone(DEFAULT_STUDIO_WORLD_MANIFEST), version: DEFAULT_STUDIO_WORLD_MANIFEST.version }, gate = deferred<StudioWorldPublicationAuthority>();
    vi.mocked(f.deps.read).mockReturnValueOnce(gate.promise);
    const write = f.controller.publish(draft); draft.version = 900; gate.resolve(f.authority()); await write;
    expect(vi.mocked(f.deps.publish).mock.calls[0]?.[1]).toMatchObject({ expectedPublishedRevisionId: null, manifest: { version: DEFAULT_STUDIO_WORLD_MANIFEST.version } });
    expect(f.controller.getSnapshot().active?.publication.revisionId).toBe("revision-2");
  });
  it("rejects a stale owner view without silently rebasing or sending any POST", async () => {
    const f = fixture(publication()); await f.controller.read(); f.setCurrent(publication("revision-2", 2));
    await f.controller.publish(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(f.deps.publish).not.toHaveBeenCalled(); expect(f.controller.getSnapshot().reason).toBe("conflict");
  });
  it("rejects the same revision ID with a different hash after publication instead of adopting it", async () => {
    const f = fixture(publication()); await f.controller.read(); const active = f.controller.getSnapshot().active;
    vi.mocked(f.deps.read).mockResolvedValueOnce(f.authority()).mockResolvedValueOnce({ ...f.authority(),
      publication: { ...publication("revision-2", 2), contentHash: "b".repeat(64) } });
    expect(await f.controller.publish(DEFAULT_STUDIO_WORLD_MANIFEST)).toBe(false);
    expect(f.controller.getSnapshot()).toMatchObject({ active, reason: "invalid-world" });
    expect(f.deps.prepare).toHaveBeenCalledOnce();
  });
  it("does not move a draft's base when background renewal observes another owner's publication", async () => {
    const f = fixture(publication()); await f.controller.read(); f.setCurrent(publication("revision-2", 2)); await f.controller.read(false);
    await f.controller.publish(DEFAULT_STUDIO_WORLD_MANIFEST, "revision-1");
    expect(f.deps.publish).not.toHaveBeenCalled(); expect(f.controller.getSnapshot().reason).toBe("conflict");
  });
  it("retains an ambiguous intent and retries only explicitly with the same ID and body", async () => {
    const f = fixture(); await f.controller.read(); vi.mocked(f.deps.publish).mockRejectedValueOnce(new Error("lost"));
    await f.controller.publish(DEFAULT_STUDIO_WORLD_MANIFEST); const first = vi.mocked(f.deps.publish).mock.calls[0]!;
    expect(f.controller.getSnapshot().retryIntent).toBe(true); expect(f.deps.publish).toHaveBeenCalledOnce();
    await f.controller.read(); expect(f.deps.publish).toHaveBeenCalledOnce();
    await f.controller.publish({ ...DEFAULT_STUDIO_WORLD_MANIFEST, version: 77 }); const second = vi.mocked(f.deps.publish).mock.calls[1]!;
    expect(second.slice(0, 3)).toEqual(first.slice(0, 3)); expect(f.controller.getSnapshot().retryIntent).toBe(false);
  });
  it("uses a new epoch for equal-content undo and never repeats mutation after an actor switch", async () => {
    const f = fixture(publication()); await f.controller.read(); const old = f.controller.getSnapshot().active!;
    await f.controller.publish(DEFAULT_STUDIO_WORLD_MANIFEST); expect(f.controller.getSnapshot().active).not.toBe(old);
    expect(f.controller.getSnapshot().previous?.revisionId).toBe("revision-1");
    const gate = deferred<StudioWorldPublicationAuthority>(); vi.mocked(f.deps.read).mockReturnValueOnce(gate.promise);
    const write = f.controller.publish(DEFAULT_STUDIO_WORLD_MANIFEST); f.context.actorId = "bob"; gate.resolve(f.authority()); await write;
    expect(f.deps.publish).toHaveBeenCalledOnce();
  });
});
