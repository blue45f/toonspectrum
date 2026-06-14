import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import type { Title } from "../lib/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_GZ = path.join(ROOT, "apps/api/data/catalog.json.gz");

const norm = (s: string) => {
  let cleaned = String(s || "");
  cleaned = cleaned.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "");
  return cleaned.replace(/[\s:~!?,.\-()[\]·]/g, "").toLowerCase();
};

function main() {
  if (!existsSync(SRC_GZ)) {
    console.error(`Catalog snapshot not found at: ${SRC_GZ}`);
    process.exit(1);
  }

  console.log("Loading catalog snapshot...");
  const raw = gunzipSync(readFileSync(SRC_GZ)).toString("utf8");
  const data = JSON.parse(raw);
  const titles = (Array.isArray(data) ? data : data.titles) as Title[];
  if (!titles || !Array.isArray(titles)) {
    console.error("Invalid catalog snapshot format.");
    process.exit(1);
  }

  const missingBefore = titles.filter(t => !t.coverImage).length;
  console.log(`Loaded ${titles.length} titles. Missing cover image: ${missingBefore}`);

  let fixedByAdaptation = 0;
  let fixedByCrossPlatform = 0;

  // 1. Cross-platform matching (Propagate cover image from titles with the same normalized name)
  const coverMap = new Map<string, string>();
  titles.forEach(t => {
    if (t.coverImage) {
      coverMap.set(norm(t.title), t.coverImage);
    }
  });

  titles.forEach(t => {
    if (!t.coverImage) {
      const matchedCover = coverMap.get(norm(t.title));
      if (matchedCover) {
        t.coverImage = matchedCover;
        fixedByCrossPlatform++;
      }
    }
  });

  // 2. Adaptation matching (webtoon <-> webnovel)
  titles.forEach(t => {
    if (!t.coverImage) {
      if (t.type === "webnovel") {
        const wt = titles.find(w => w.type === "webtoon" && w.adaptedFrom === t.id);
        if (wt && wt.coverImage) {
          t.coverImage = wt.coverImage;
          fixedByAdaptation++;
        }
      } else if (t.type === "webtoon") {
        const wn = titles.find(n => n.type === "webnovel" && n.id === t.adaptedFrom);
        if (wn && wn.coverImage) {
          t.coverImage = wn.coverImage;
          fixedByAdaptation++;
        }
      }
    }
  });

  const missingAfter = titles.filter(t => !t.coverImage).length;
  console.log(`Recovery complete.`);
  console.log(`  - Fixed by cross-platform matching: ${fixedByCrossPlatform}`);
  console.log(`  - Fixed by adaptation mapping: ${fixedByAdaptation}`);
  console.log(`  - Remaining missing covers: ${missingAfter} (was ${missingBefore})`);

  if (fixedByCrossPlatform > 0 || fixedByAdaptation > 0) {
    console.log("Saving updated catalog snapshot back to GZ...");
    const payload = Array.isArray(data) ? titles : { ...data, titles };
    const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
    writeFileSync(SRC_GZ, compressed);
    console.log("Updated apps/api/data/catalog.json.gz successfully!");
  } else {
    console.log("No covers were updated.");
  }
}

main();
