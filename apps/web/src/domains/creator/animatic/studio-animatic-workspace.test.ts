import { describe, expect, it } from "vitest";

import { ANIMATIC_WORKSPACE_LIMITS, createStudioAnimaticWorkspace, studioAnimaticWorkspaceSnapshot, validateStudioAnimaticWorkspace } from "./studio-animatic-workspace";

const fixture = () => createStudioAnimaticWorkspace([{ id: "page-1" }], "episode-1");
const asset = { hash: `sha256:${"a".repeat(64)}` as const, bytes: 4, mime: "image/png" };
const artwork = { pageId: "page-1", asset, width: 720, height: 1280, documentWidth: 720, documentHeight: 1280 };

describe("portable storyboard document validation", () => {
  it("rejects cross-document variants and duplicate IDs instead of linking unrelated review state", () => {
    const document = fixture();
    expect(() => validateStudioAnimaticWorkspace({ ...document, variants: [{ id: "v1", name: "다른 작품", createdAt: 1, snapshot: studioAnimaticWorkspaceSnapshot(createStudioAnimaticWorkspace([{ id: "p2" }], "episode-2")) }] })).toThrow("다른 작품");
    const marker = { id: "m1", label: "대사", timeMs: 1 };
    expect(() => validateStudioAnimaticWorkspace({ ...document, markers: [marker, marker] })).toThrow("마커");
    expect(() => validateStudioAnimaticWorkspace({ ...document, reviews: [{ id: "r1", variantId: "missing", timeMs: 1, text: "확인", resolved: false }] })).toThrow("검토 의견");
  });
  it("requires one unambiguous physical size and content description for each artwork asset", () => {
    const document = { ...fixture(), artwork: [artwork] };
    expect(() => validateStudioAnimaticWorkspace({ ...document, artwork: [{ ...artwork, width: 720.5 }] })).toThrow("페이지 이미지");
    expect(() => validateStudioAnimaticWorkspace({ ...document, variants: [{ id: "v1", name: "크기 충돌", createdAt: 1, snapshot: { ...studioAnimaticWorkspaceSnapshot(document), artwork: [{ ...artwork, asset: { ...asset, bytes: 5 } }] } }] })).toThrow("해시");
  });
  it("bounds total media across current and retained versions, counting shared content only once", () => {
    const large = { ...artwork, asset: { ...asset, bytes: 150_000_000 } };
    const document = { ...fixture(), artwork: [large] };
    const shared = { ...document, variants: [{ id: "v1", name: "같은 원고", createdAt: 1, snapshot: studioAnimaticWorkspaceSnapshot(document) }] };
    expect(validateStudioAnimaticWorkspace(shared).variants).toHaveLength(1);
    expect(() => validateStudioAnimaticWorkspace({ ...shared, artwork: [{ ...large, asset: { ...large.asset, hash: `sha256:${"b".repeat(64)}` } }] })).toThrow("256MB");
  });
  it("rejects non-finite values and invalid trim ranges before playback or export", () => {
    const track = { id: "a1", name: "대사", asset: { ...asset, mime: "audio/wav" }, durationMs: 3000, startMs: 0, trimStartMs: 0, trimEndMs: 2000, volume: 1, muted: false, waveform: [0.5] };
    expect(validateStudioAnimaticWorkspace({ ...fixture(), audio: [track] }).audio).toHaveLength(1);
    for (const change of [{ volume: Number.NaN }, { trimStartMs: 2100 }, { durationMs: 600001 }, { waveform: Array(ANIMATIC_WORKSPACE_LIMITS.waveformBins + 1).fill(0) }]) {
      expect(() => validateStudioAnimaticWorkspace({ ...fixture(), audio: [{ ...track, ...change }] })).toThrow("오디오");
    }
  });
});
