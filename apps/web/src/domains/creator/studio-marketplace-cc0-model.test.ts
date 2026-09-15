import { beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_MARKETPLACE_CC0_ASSETS } from "./studio-marketplace-cc0-catalog.generated";
import { prepareStudioMarketplaceCc0ModelScene } from "./studio-marketplace-cc0-model";

const mocks = vi.hoisted(() => ({ importModels: vi.fn(), compensate: vi.fn(), attachment: vi.fn() }));
vi.mock("./bg3d/bg3d-model-library", () => ({
  importVerifiedBg3dModelsAtomicallyWithDispositionV12: mocks.importModels,
  compensateImportedBg3dModelsIfCreationMatchesV12: mocks.compensate,
  createStudioBg3dModelAttachment: mocks.attachment,
}));
const model = STUDIO_MARKETPLACE_CC0_ASSETS.find(asset => asset.kind === "model")!;
const ref = `studio-3d-asset:cc0/${model.id}`;
const disposition = { records: [{ id: "private-model", contentHash: `sha256:${model.sha256}`, byteSize: model.bytes }] };
function response(bytes = model.bytes, type = "model/gltf-binary") {
  return new Response(new Uint8Array(bytes), { headers: { "content-type": type, "content-length": String(bytes) } });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  mocks.importModels.mockReset().mockResolvedValue(disposition);
  mocks.compensate.mockReset().mockResolvedValue(true);
  mocks.attachment.mockReset().mockReturnValue({
    id: "market-attachment", name: "model.glb", mime: "model/gltf-binary", byteSize: model.bytes,
    hash: `sha256:${model.sha256}`, source: "local-library",
    rights: { status: "public-domain", commercialUse: true, attributionRequired: false, licenseName: "CC0 1.0" },
  });
});

describe("exact CC0 model scene preparation", () => {
  it("passes pinned hashes through the real worker/storage boundary and creates one independent model node", async () => {
    const scene = await prepareStudioMarketplaceCc0ModelScene(ref, { isCurrent: () => true });
    expect(scene.nodes).toHaveLength(1);
    expect(scene.attachments).toHaveLength(1);
    expect(scene.nodes[0]).toMatchObject({ kind: "model", attachmentId: "market-attachment" });
    expect(scene.attachments[0].hash).toBe(`sha256:${model.sha256}`);
    expect(mocks.importModels).toHaveBeenCalledWith([expect.objectContaining({
      expectedSha256: model.sha256,
      rights: expect.objectContaining({ status: "public-domain", licenseName: "CC0 1.0" }),
    })], expect.objectContaining({ profile: "mobile", executionBackend: "worker" }));
    expect(mocks.compensate).not.toHaveBeenCalled();
  });
  it("does not fetch or mutate for unknown and cancelled requests", async () => {
    await expect(prepareStudioMarketplaceCc0ModelScene("https://example.com/asset.glb", { isCurrent: () => true })).rejects.toThrow();
    await expect(prepareStudioMarketplaceCc0ModelScene(ref, { isCurrent: () => false })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.importModels).not.toHaveBeenCalled();
  });
  it.each(["text/html", "application/json"])("rejects %s before any model import", async type => {
    vi.mocked(fetch).mockResolvedValueOnce(response(model.bytes, type));
    await expect(prepareStudioMarketplaceCc0ModelScene(ref, { isCurrent: () => true })).rejects.toThrow();
    expect(mocks.importModels).not.toHaveBeenCalled();
  });
  it.each([-1, 1])("rejects a byte length discrepancy of %s", async difference => {
    vi.mocked(fetch).mockResolvedValueOnce(response(model.bytes + difference));
    await expect(prepareStudioMarketplaceCc0ModelScene(ref, { isCurrent: () => true })).rejects.toThrow();
    expect(mocks.importModels).not.toHaveBeenCalled();
  });
  it("compensates only its import receipt if the canvas changes during persistent import", async () => {
    let current = true;
    mocks.importModels.mockImplementationOnce(async () => { current = false; return disposition; });
    await expect(prepareStudioMarketplaceCc0ModelScene(ref, { isCurrent: () => current })).rejects.toThrow();
    expect(mocks.compensate).toHaveBeenCalledExactlyOnceWith(disposition);
  });
  it("does not construct a scene from a mismatched stored model", async () => {
    const mismatch = { records: [{ ...disposition.records[0], contentHash: `sha256:${"0".repeat(64)}` }] };
    mocks.importModels.mockResolvedValueOnce(mismatch);
    await expect(prepareStudioMarketplaceCc0ModelScene(ref, { isCurrent: () => true })).rejects.toThrow(/무결성/u);
    expect(mocks.compensate).toHaveBeenCalledExactlyOnceWith(mismatch);
  });
});
