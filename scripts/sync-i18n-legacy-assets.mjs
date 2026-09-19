import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(import.meta.dirname, "../apps/web/public/i18n");
const shellOnlyKeys = new Set([
  "control.language.group.englishBase",
  "control.language.group.translated",
]);

/** Keep legacy readers compatible without replacing newer authored namespace copy. */
export function synchronizeLegacyI18nAssets(directory = root, { check = false } = {}) {
  const changed = [];
  const sync = (filename, dictionary) => {
    const contents = JSON.stringify(dictionary, null, 2) + "\n";
    if (readFileSync(filename, "utf8") === contents) return;
    changed.push(filename);
    if (!check) writeFileSync(filename, contents);
  };
  for (const bucket of ["app", "admin"]) {
    const base = path.join(directory, bucket);
    const namespaces = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const locales = readdirSync(base).filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5)).sort();
    const dictionaries = new Map();
    const owner = new Map();
    for (const locale of locales) {
      const parts = new Map();
      for (const namespace of namespaces) {
        const filename = path.join(base, namespace, locale + ".json");
        let dictionary;
        try { dictionary = JSON.parse(readFileSync(filename, "utf8")); }
        catch (error) { if (error.code === "ENOENT") continue; throw error; }
        parts.set(namespace, dictionary);
        for (const key of Object.keys(dictionary)) owner.set(key, namespace);
      }
      dictionaries.set(locale, parts);
    }
    // Recover keys stranded by a namespace migration; existing namespace values always win.
    for (const locale of locales) {
      const parts = dictionaries.get(locale);
      const merged = Object.assign({}, ...parts.values());
      const flat = JSON.parse(readFileSync(path.join(base, locale + ".json"), "utf8"));
      for (const [key, value] of Object.entries(flat)) {
        if (key in merged) continue;
        const namespace = owner.get(key) ?? key.split(".")[0];
        const part = parts.get(namespace);
        if (!part) throw new Error(`No existing namespace owns ${bucket}/${locale}/${key}`);
        part[key] = value;
        owner.set(key, namespace);
      }
    }
    if (bucket === "app") {
      const reference = Object.assign({}, ...dictionaries.get("en").values());
      for (const locale of locales) {
        if (locale === "en" || locale === "ko") continue;
        const parts = dictionaries.get(locale);
        const merged = Object.assign({}, ...parts.values());
        for (const [key, value] of Object.entries(reference)) {
          if (key in merged || shellOnlyKeys.has(key)) continue;
          // Missing authored translations use the honest English fallback. The generated
          // coverage catalogue counts identical English strings as untranslated.
          const part = parts.get(owner.get(key));
          if (!part) throw new Error(`Missing fallback namespace for ${locale}/${key}`);
          part[key] = value;
        }
      }
    }
    for (const locale of locales) {
      const parts = dictionaries.get(locale);
      for (const [namespace, dictionary] of parts) {
        sync(path.join(base, namespace, locale + ".json"), dictionary);
      }
      sync(path.join(base, locale + ".json"), Object.assign({}, ...parts.values()));
    }
  }
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const changed = synchronizeLegacyI18nAssets(root, { check });
  console.log(`[i18n-legacy] ${changed.length} ${check ? "out-of-sync" : "updated"} files`);
  if (check && changed.length) process.exitCode = 1;
}
