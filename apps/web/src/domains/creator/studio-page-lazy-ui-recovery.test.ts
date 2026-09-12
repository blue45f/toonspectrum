import { afterEach, describe, expect, it, vi } from "vitest";

const { activationLoaders } = vi.hoisted(() => ({
  activationLoaders: new Map<string, () => Promise<unknown>>(),
}));
vi.mock("@/shared/lib/lazy-retry", () => ({
  lazyRetry: (load: () => Promise<unknown>, key: string) => {
    activationLoaders.set(key, load);
    return () => null;
  },
}));
vi.mock("./studio-capture-readiness", () => ({}));

const panels = [
  { name: "StudioAssetMenuPanel", path: "./StudioAssetMenuPanel", preload: "preloadStudioAssetMenuPanel" },
  { name: "StudioStockImagePanel", path: "./StudioStockImagePanel", preload: "preloadStudioStockImagePanel" },
  { name: "StudioIntegrationsSettingsPanel", path: "./StudioIntegrationsSettingsPanel", preload: "preloadStudioIntegrationsSettingsPanel" },
  { name: "StudioExportMenuPanel", path: "./export/StudioEnhancedExportMenuPanel", preload: "preloadStudioExportMenuPanel", exportName: "StudioEnhancedExportMenuPanel" },
  { name: "StudioColorPopover", path: "./StudioColorPopover", preload: "preloadStudioColorPopover" },
] as const;

afterEach(() => {
  for (const panel of panels) vi.doUnmock(panel.path);
  vi.resetModules();
  activationLoaders.clear();
});

describe("Studio optional panel warmup recovery", () => {
  it.each(panels)("retries $name after failed warmup and shares the successful activation", async (panel) => {
    const offlineImport = vi.fn(() => { throw new Error("offline optional panel"); });
    vi.doMock(panel.path, offlineImport);
    const registry = await import("./studio-page-lazy-ui");
    const preload = registry[panel.preload];

    expect(offlineImport).not.toHaveBeenCalled();
    expect(preload()).toBeUndefined();
    expect(preload()).toBeUndefined();
    await vi.dynamicImportSettled();
    expect(offlineImport).toHaveBeenCalledOnce();

    const Component = () => null;
    const restoredImport = vi.fn(() => ({ ["exportName" in panel ? panel.exportName : panel.name]: Component }));
    // The next network request can succeed; the old rejected registry promise must not win.
    vi.doMock(panel.path, restoredImport);
    const activate = activationLoaders.get(panel.name);
    expect(activate).toBeDefined();
    const first = activate!();
    expect(activate!()).toBe(first);
    await expect(first).resolves.toEqual({ default: Component });
    preload();
    await vi.dynamicImportSettled();
    expect(restoredImport).toHaveBeenCalledOnce();
  });
});
