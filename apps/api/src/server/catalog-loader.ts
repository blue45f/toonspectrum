import {
  getCatalogState,
  replaceCatalogData,
  resetCatalogToEmpty,
} from "../../../../packages/core/src/catalog/catalog-store";

import { loadCatalogTitlesFromFile } from "./catalog-file";

/**
 * Load the reviewed catalog artifact bundled with the deployment.
 *
 * This module is intentionally read-only. Catalog crawling and regeneration are local manual
 * maintenance tasks; the deployed API never runs a crawler, writes a catalog, or polls for updates.
 */
export function loadBundledCatalog() {
  const result = loadCatalogTitlesFromFile();
  if (!result) {
    resetCatalogToEmpty("no-catalog-file");
    return {
      loaded: false as const,
      source: "empty",
      titleCount: getCatalogState().titleCount,
      generatedAt: new Date().toISOString(),
    };
  }

  const titles = replaceCatalogData(result.titles, {
    source: "file-snapshot",
    sourceVersion: result.sourceVersion,
  });
  return {
    loaded: true as const,
    source: "catalog-file",
    sourceVersion: result.sourceVersion,
    file: result.file,
    runHash: result.runHash,
    titleCount: titles.length,
    generatedAt: new Date().toISOString(),
  };
}
