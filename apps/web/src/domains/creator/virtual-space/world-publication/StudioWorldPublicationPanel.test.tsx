// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "../studio-virtual-space-world-manifest";
import { EMPTY_WORLD_PUBLICATION } from "./studio-world-publication-controller";
import { StudioWorldPublicationPanel } from "./StudioWorldPublicationPanel";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (_ko: string, en: string) => en }));
afterEach(cleanup);
describe("world publication controls", () => {
  it("publishes only the explicit owner choice and immutable draft base, applying only after success", async () => {
    const publish = vi.fn(async () => true), onApplied = vi.fn();
    render(<StudioWorldPublicationPanel draft={DEFAULT_STUDIO_WORLD_MANIFEST} draftBaseRevision={null} onApplied={onApplied}
      publication={{ enabled: true, publish, refresh: vi.fn(async () => true), reviewDraftBase: vi.fn(async () => null), snapshot: { ...EMPTY_WORLD_PUBLICATION, phase: "ready",
        authority: { publication: null, canPublish: true, expiresAt: Date.now() + 15_000 } } }} />);
    expect(publish).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Publish and apply draft" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledOnce()); expect(publish).toHaveBeenCalledWith(DEFAULT_STUDIO_WORLD_MANIFEST, null);
  });
  it("never offers owner mutation to a viewer or claims failed application", async () => {
    const onApplied = vi.fn(); render(<StudioWorldPublicationPanel draft={DEFAULT_STUDIO_WORLD_MANIFEST} onApplied={onApplied}
      publication={{ enabled: true, publish: vi.fn(async () => false), refresh: vi.fn(async () => false), reviewDraftBase: vi.fn(async () => null), snapshot: { ...EMPTY_WORLD_PUBLICATION,
        phase: "failed", reason: "assets", authority: { publication: null, canPublish: false, expiresAt: Date.now() + 15_000 } } }} />);
    expect(screen.queryByRole("button", { name: "Publish and apply draft" })).toBeNull(); expect(screen.getByRole("status").textContent).toContain("current space is preserved");
    fireEvent.click(screen.getByRole("button", { name: "Check and apply published space" })); await Promise.resolve(); expect(onApplied).not.toHaveBeenCalled();
  });
  it("makes an uncertain retry explicit and never substitutes the edited draft", async () => {
    const publish = vi.fn(async () => false); render(<StudioWorldPublicationPanel draft={DEFAULT_STUDIO_WORLD_MANIFEST} onApplied={vi.fn()}
      publication={{ enabled: true, publish, refresh: vi.fn(async () => false), reviewDraftBase: vi.fn(async () => null), snapshot: { ...EMPTY_WORLD_PUBLICATION, phase: "uncertain", retryIntent: true } }} />);
    expect(screen.queryByRole("button", { name: "Publish and apply draft" })).toBeNull();
    const retry = screen.getByRole("button", { name: "Retry same publication" }); expect(retry.className).toContain("min-h-11"); retry.focus(); fireEvent.click(retry);
    expect(publish).toHaveBeenCalledWith();
  });
  it.each([undefined, "older-publication"])("requires explicit fresh base review for persisted origin %s, without publishing", async (base) => {
    const publish = vi.fn(async () => true), onRebaseDraft = vi.fn(() => true), reviewDraftBase = vi.fn(async () => ({ revisionId: null }));
    render(<StudioWorldPublicationPanel draft={DEFAULT_STUDIO_WORLD_MANIFEST} draftBaseRevision={base} onRebaseDraft={onRebaseDraft} onApplied={vi.fn()}
      publication={{ enabled: true, publish, refresh: vi.fn(async () => true), reviewDraftBase, snapshot: { ...EMPTY_WORLD_PUBLICATION, phase: "ready",
        authority: { publication: null, canPublish: true, expiresAt: Date.now() + 15_000 } } }} />);
    expect(screen.queryByRole("button", { name: "Publish and apply draft" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save draft with current publication base" }));
    await waitFor(() => expect(onRebaseDraft).toHaveBeenCalledWith(null)); expect(reviewDraftBase).toHaveBeenCalledOnce(); expect(publish).not.toHaveBeenCalled();
  });
  it.each(["unmount", "draft-change"])("does not save a late rebase after %s", async (kind) => {
    let resolve!: (value: { revisionId: null }) => void;
    const onRebaseDraft = vi.fn(() => true), publication = { enabled: true, publish: vi.fn(async () => true), refresh: vi.fn(async () => true),
      reviewDraftBase: vi.fn(() => new Promise<{ revisionId: null }>((done) => { resolve = done; })),
      snapshot: { ...EMPTY_WORLD_PUBLICATION, phase: "ready" as const, authority: { publication: null, canPublish: true, expiresAt: Date.now() + 15_000 } } };
    const props = { publication, onRebaseDraft, onApplied: vi.fn(), draft: DEFAULT_STUDIO_WORLD_MANIFEST };
    const mounted = render(<StudioWorldPublicationPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Save draft with current publication base" }));
    if (kind === "unmount") mounted.unmount(); else mounted.rerender(<StudioWorldPublicationPanel {...props} draft={{ ...props.draft, version: 5 }} />);
    resolve({ revisionId: null }); await Promise.resolve(); await Promise.resolve(); expect(onRebaseDraft).not.toHaveBeenCalled();
  });
});
