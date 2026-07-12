type StudioSvgExportModule = typeof import("./studio-svg-export");
type StudioPsdExportModule = typeof import("./studio-psd-export");
type StudioPsdImportModule = typeof import("./studio-psd-import");

let svgExportModulePromise: Promise<StudioSvgExportModule> | null = null;
let psdExportModulePromise: Promise<StudioPsdExportModule> | null = null;
let psdImportModulePromise: Promise<StudioPsdImportModule> | null = null;

/**
 * Document interchange engines are deliberately absent from the initial Studio graph. Each
 * literal import remains statically analyzable by Vite while the cached promise makes hover,
 * focus, pointer-down, and click converge on one request. A failed chunk can be retried after a
 * deployment instead of poisoning the tab for the rest of its lifetime.
 */
export function loadStudioSvgExportModule(): Promise<StudioSvgExportModule> {
  svgExportModulePromise ??= import("./studio-svg-export").catch((error: unknown) => {
    svgExportModulePromise = null;
    throw error;
  });
  return svgExportModulePromise;
}

export function loadStudioPsdExportModule(): Promise<StudioPsdExportModule> {
  psdExportModulePromise ??= import("./studio-psd-export").catch((error: unknown) => {
    psdExportModulePromise = null;
    throw error;
  });
  return psdExportModulePromise;
}

export function loadStudioPsdImportModule(): Promise<StudioPsdImportModule> {
  psdImportModulePromise ??= import("./studio-psd-import").catch((error: unknown) => {
    psdImportModulePromise = null;
    throw error;
  });
  return psdImportModulePromise;
}

export function preloadStudioSvgExportModule(): void {
  void loadStudioSvgExportModule();
}

export function preloadStudioPsdExportModule(): void {
  void loadStudioPsdExportModule();
}

export function preloadStudioPsdImportModule(): void {
  void loadStudioPsdImportModule();
}
