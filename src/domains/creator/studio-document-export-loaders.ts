type StudioSvgExportModule = typeof import("./export/studio-svg-export");
type StudioSvgExportWorkerClientModule = typeof import("./export/studio-svg-export-worker-client");
type StudioPsdExportModule = typeof import("./studio-psd-export");
type StudioPsdImportModule = typeof import("./studio-psd-import");

let svgExportModulePromise: Promise<StudioSvgExportModule> | null = null;
let svgExportWorkerClientModulePromise: Promise<StudioSvgExportWorkerClientModule> | null = null;
let psdExportModulePromise: Promise<StudioPsdExportModule> | null = null;
let psdImportModulePromise: Promise<StudioPsdImportModule> | null = null;

/**
 * Document interchange engines are deliberately absent from the initial Studio graph. Each
 * literal import remains statically analyzable by Vite while the cached promise makes hover,
 * focus, pointer-down, and click converge on one request. A failed chunk can be retried after a
 * deployment instead of poisoning the tab for the rest of its lifetime.
 */
export function loadStudioSvgExportModule(): Promise<StudioSvgExportModule> {
  svgExportModulePromise ??= import("./export/studio-svg-export").catch((error: unknown) => {
    svgExportModulePromise = null;
    throw error;
  });
  return svgExportModulePromise;
}

/** 실제 직렬화(exportPageToSvg)는 이 Worker 클라이언트를 통해서만 부른다 — 무거운 페이지를
 * 메인 스레드에서 막지 않고, Worker를 못 만드는 환경에서는 클라이언트 내부에서 동일 엔진으로
 * 폴백한다. MIME/파일명 등 가벼운 메타데이터는 여전히 loadStudioSvgExportModule을 쓴다. */
export function loadStudioSvgExportWorkerClientModule(): Promise<StudioSvgExportWorkerClientModule> {
  svgExportWorkerClientModulePromise ??= import("./export/studio-svg-export-worker-client").catch((error: unknown) => {
    svgExportWorkerClientModulePromise = null;
    throw error;
  });
  return svgExportWorkerClientModulePromise;
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
  void loadStudioSvgExportWorkerClientModule();
}

export function preloadStudioPsdExportModule(): void {
  void loadStudioPsdExportModule();
}

export function preloadStudioPsdImportModule(): void {
  void loadStudioPsdImportModule();
}
