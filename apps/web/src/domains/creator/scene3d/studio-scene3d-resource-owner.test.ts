import { describe, expect, it, vi } from "vitest";
import { registerStudioScene3dResourceOwner, disposeStudioScene3dResourceOwner } from "./studio-scene3d-resource-owner";

describe("Scene3D renderer resource owner", () => {
  it("disposes every registered owner once even if one callback throws", () => {
    const owner = {}; const first = vi.fn(() => { throw new Error("lost"); }); const second = vi.fn();
    registerStudioScene3dResourceOwner(owner, first);
    registerStudioScene3dResourceOwner(owner, second);
    disposeStudioScene3dResourceOwner(owner); disposeStudioScene3dResourceOwner(owner);
    expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
  });
  it("detaches completed scopes without retiring the renderer", () => {
    const owner = {}; const first = vi.fn(); const second = vi.fn();
    const unregister = registerStudioScene3dResourceOwner(owner, first); unregister();
    registerStudioScene3dResourceOwner(owner, second); disposeStudioScene3dResourceOwner(owner);
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledOnce();
  });
  it("refuses late registration on a disposed device and releases the new resource", () => {
    const owner = {}; const dispose = vi.fn(); disposeStudioScene3dResourceOwner(owner);
    expect(() => registerStudioScene3dResourceOwner(owner, dispose)).toThrow(/disposed/);
    expect(dispose).toHaveBeenCalledOnce();
  });
});


it("a stale double-unregister cannot erase a successor owner scope", () => {
  const owner = {}; const first = vi.fn(); const second = vi.fn();
  const unregister = registerStudioScene3dResourceOwner(owner, first); unregister();
  registerStudioScene3dResourceOwner(owner, second); unregister();
  disposeStudioScene3dResourceOwner(owner);
  expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledOnce();
});


it("snapshots teardown callbacks so one unregister cannot suppress another cleanup", () => {
  const owner = {}; const second = vi.fn(); let unregister = () => {};
  registerStudioScene3dResourceOwner(owner, () => unregister());
  unregister = registerStudioScene3dResourceOwner(owner, second);
  disposeStudioScene3dResourceOwner(owner);
  expect(second).toHaveBeenCalledOnce();
});
