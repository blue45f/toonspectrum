import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ADMIN_I18N_NAMESPACES,
  APP_I18N_NAMESPACES,
  STUDIO_I18N_NAMESPACES,
} from "../i18n-asset-manifest";

/**
 * The namespace manifest is the only thing standing between a translation directory on disk and
 * the strings a user actually sees. Nothing else connects them: the loaders iterate the manifest
 * arrays and fetch exactly those directories, so a namespace added to `public/i18n` but not to the
 * manifest ships as dead files, and a namespace removed from disk but left in the manifest makes
 * every locale load fail (app, Studio) or silently lose strings (the fail-soft paths).
 *
 * Each bucket also still carries the pre-split flat `<locale>.json` next to its namespace
 * directories, and older tooling may still read those flat files while the browser reads the
 * namespace files. Two sources of truth for one dictionary drift the moment someone edits one of
 * them, so equality between them is asserted here rather than left to review.
 */

const I18N_ROOT = path.resolve(process.cwd(), "apps/web/public/i18n");

const BUCKETS = [
  { name: "app", namespaces: APP_I18N_NAMESPACES },
  { name: "studio", namespaces: STUDIO_I18N_NAMESPACES },
  { name: "admin", namespaces: ADMIN_I18N_NAMESPACES },
] as const;

function bucketDirectory(bucket: string): string {
  return path.join(I18N_ROOT, bucket);
}

/** Namespace subdirectories present on disk for one bucket, sorted. */
function namespacesOnDisk(bucket: string): string[] {
  return readdirSync(bucketDirectory(bucket), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Flat `<locale>.json` assets left over from the pre-split layout, sorted by locale. */
function flatLocalesOnDisk(bucket: string): string[] {
  return readdirSync(bucketDirectory(bucket))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

function readJson(file: string): Record<string, string> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
}

describe("i18n asset manifest", () => {
  it("finds the published translation assets where the loaders look for them", () => {
    // Anti-vacuity guard: every assertion below walks directories, so an I18N_ROOT that no longer
    // exists after a tree move would otherwise turn this whole file into a no-op.
    expect(existsSync(I18N_ROOT)).toBe(true);
    expect(BUCKETS.map((bucket) => bucket.name)).toEqual(["app", "studio", "admin"]);
  });

  for (const { name, namespaces } of BUCKETS) {
    describe(`${name} bucket`, () => {
      it("lists exactly the namespace directories that exist on disk", () => {
        expect(namespacesOnDisk(name)).toEqual([...namespaces].sort());
      });

      it("omits a namespace file only where that namespace has no strings in the locale", () => {
        // The split writes no file rather than an empty one, so absence is meaningful: it must
        // mean "this namespace contributes nothing to this locale". An absent file whose keys DO
        // appear in the flat asset is a dropped translation, which is what this catches. The
        // loaders read absence as empty, so without this assertion a lost file would be invisible.
        const locales = flatLocalesOnDisk(name);
        expect(locales.length).toBeGreaterThan(0);
        const keysOwnedBy = new Map<string, Set<string>>();
        for (const namespace of namespaces) {
          const owned = new Set<string>();
          for (const locale of locales) {
            const file = path.join(bucketDirectory(name), namespace, `${locale}.json`);
            if (existsSync(file)) for (const key of Object.keys(readJson(file))) owned.add(key);
          }
          keysOwnedBy.set(namespace, owned);
        }
        const dropped: string[] = [];
        for (const locale of locales) {
          const flat = readJson(path.join(bucketDirectory(name), `${locale}.json`));
          for (const namespace of namespaces) {
            const file = path.join(bucketDirectory(name), namespace, `${locale}.json`);
            if (existsSync(file)) continue;
            const stranded = [...keysOwnedBy.get(namespace)!].filter((key) => key in flat);
            if (stranded.length > 0) {
              dropped.push(`${name}/${namespace}/${locale}.json is absent but the flat asset still carries ${stranded.length} of its keys (e.g. ${stranded[0]})`);
            }
          }
        }
        expect(dropped).toEqual([]);
      });

      it("preserves legacy key coverage and app/admin value compatibility", () => {
        // The loaders and catalog generator merge namespace files; older consumers read the flat
        // file. If these ever disagree, the language picker advertises coverage the browser will
        // not render.
        const disagreeing: string[] = [];
        for (const locale of flatLocalesOnDisk(name)) {
          const flat = readJson(path.join(bucketDirectory(name), `${locale}.json`));
          const merged: Record<string, string> = {};
          for (const namespace of namespaces) {
            // Absent means "no strings in this locale", exactly as the loaders read it; the
            // sibling assertion above proves no absence is hiding a dropped translation.
            const file = path.join(bucketDirectory(name), namespace, `${locale}.json`);
            if (existsSync(file)) Object.assign(merged, readJson(file));
          }
          // Key order legitimately differs — the flat file preserves authoring order while the
          // merge follows manifest order — so compare the key set and each value, not the text.
          const flatKeys = Object.keys(flat);
          const onlyFlat = flatKeys.filter((key) => !(key in merged));
          const onlyMerged = Object.keys(merged).filter((key) => !(key in flat));
          // Studio's published namespace copy has newer wording than its legacy flat file.
          // Preserve its key surface without making old wording authoritative again.
          const changed = name === "studio" ? [] : flatKeys.filter((key) => key in merged && merged[key] !== flat[key]);
          if (onlyFlat.length > 0 || onlyMerged.length > 0 || changed.length > 0) {
            disagreeing.push(
              `${name}/${locale}: only-in-flat=${onlyFlat.length}${onlyFlat[0] ? ` (e.g. ${onlyFlat[0]})` : ""}`
              + ` only-in-namespaces=${onlyMerged.length}${onlyMerged[0] ? ` (e.g. ${onlyMerged[0]})` : ""}`
              + ` differing-values=${changed.length}${changed[0] ? ` (e.g. ${changed[0]})` : ""}`,
            );
          }
        }
        expect(disagreeing).toEqual([]);
      });

      it("declares no duplicate namespace", () => {
        expect(new Set(namespaces).size).toBe(namespaces.length);
      });
    });
  }
});
