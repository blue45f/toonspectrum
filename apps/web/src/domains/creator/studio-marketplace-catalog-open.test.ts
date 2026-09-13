import { describe, expect, it, vi } from "vitest";
import { openStudioMarketplaceCatalog, confirmStudioMarketplacePackSync } from "./studio-marketplace-catalog-open";
import type { StudioCreatorPackDefinition } from "./studio-creator-pack-catalog";
import { createDefaultStudioBg3dSceneDocument } from "./bg3d/studio-bg3d-scene-document";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), prepare: vi.fn() }));
vi.mock("./studio-creator-pack-runtime", () => ({ resolveStudioCreatorBundledCatalogTarget: mocks.resolve }));
vi.mock("./studio-marketplace-cc0-model", () => ({ prepareStudioMarketplaceCc0ModelScene: mocks.prepare }));
const pack = {} as StudioCreatorPackDefinition;
const actions = () => ({ isCurrent: () => true, canMutate: () => true,
  openTemplate: vi.fn(), openBackground3d: vi.fn(), setInitialScene: vi.fn() });
describe("market catalog opening", () => {
  it("opens the exact prepared model scene", async () => {
    mocks.resolve.mockReturnValue({ status: "supported", target: { kind: "3d-asset-catalog", runtimeRef: "registered" } });
    const prepared = { name: "Model", scene: createDefaultStudioBg3dSceneDocument(), cancel: vi.fn() };
    mocks.prepare.mockResolvedValue(prepared);
    const ports = actions();
    expect((await openStudioMarketplaceCatalog(pack, ports)).status).toBe("opened");
    expect(ports.openBackground3d).toHaveBeenCalledOnce(); expect(ports.setInitialScene).toHaveBeenCalledWith(prepared.scene);
    expect(prepared.cancel).not.toHaveBeenCalled();
  });
  it("compensates a stale prepared model without opening the editor", async () => {
    mocks.resolve.mockReturnValue({ status: "supported", target: { kind: "3d-asset-catalog", runtimeRef: "registered" } });
    let current = true; const cancel = vi.fn(async () => true);
    mocks.prepare.mockImplementation(async () => { current = false; return { name: "Model", scene: createDefaultStudioBg3dSceneDocument(), cancel }; });
    const ports = { ...actions(), isCurrent: () => current };
    expect((await openStudioMarketplaceCatalog(pack, ports)).status).toBe("unsupported");
    expect(cancel).toHaveBeenCalledOnce(); expect(ports.openBackground3d).not.toHaveBeenCalled();
  });
  it("preserves the exact template identity", async () => {
    mocks.resolve.mockReturnValue({ status: "supported", target: { kind: "scene-template-catalog", templateId: "confession" } });
    const ports = actions();
    expect((await openStudioMarketplaceCatalog(pack, ports)).status).toBe("opened");
    expect(ports.openTemplate).toHaveBeenCalledWith("confession"); expect(ports.openBackground3d).not.toHaveBeenCalled();
  });
  it("does not open a locked document", async () => {
    mocks.resolve.mockReturnValue({ status: "supported", target: { kind: "scene-template-catalog", templateId: "confession" } });
    const ports = { ...actions(), canMutate: () => false };
    expect((await openStudioMarketplaceCatalog(pack, ports)).status).toBe("unsupported");
    expect(ports.openTemplate).not.toHaveBeenCalled();
  });
  it("preserves retry feedback on account sync failure", async () => {
    const failure = new Error("network failed"); const onFailure = vi.fn(); const onSuccess = vi.fn();
    await expect(confirmStudioMarketplacePackSync(async () => { throw failure; },
      { isCurrent: () => true, assertCurrent: vi.fn() }, onSuccess, onFailure)).rejects.toBe(failure);
    expect(onFailure).toHaveBeenCalledWith("network failed"); expect(onSuccess).not.toHaveBeenCalled();
  });
  it("never confirms a stale account sync", async () => {
    const stale = new Error("stale"); const onSuccess = vi.fn(); const onFailure = vi.fn();
    const guard = { isCurrent: () => false, assertCurrent: () => { throw stale; } };
    const synchronize = vi.fn(async () => ({ message: "ok" }));
    await expect(confirmStudioMarketplacePackSync(synchronize, guard, onSuccess, onFailure)).rejects.toBe(stale);
    expect(synchronize).not.toHaveBeenCalled(); expect(onSuccess).not.toHaveBeenCalled(); expect(onFailure).not.toHaveBeenCalled();
  });
});
