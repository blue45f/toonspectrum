// 번들된 정적 카탈로그(apps/api/data/catalog.json.gz)에서 타이틀을 읽는다 — Neon 전송 없이 부팅.
// 서버리스(api/index.js, includeFiles 로 번들)와 로컬 dev 양쪽에서 동작하도록 cwd 에서 위로 탐색한다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Title } from "../types";

const CANDIDATES = ["apps/api/data/catalog.json.gz", "data/catalog.json.gz", "catalog.json.gz"];

function resolveCatalogFile(): string | null {
  const envPath = process.env.WEBDEX_CATALOG_GZ;
  if (envPath && existsSync(envPath)) return envPath;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    for (const rel of CANDIDATES) {
      const candidate = path.resolve(dir, rel);
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadCatalogTitlesFromFile(): { titles: Title[]; sourceVersion: string } | null {
  const file = resolveCatalogFile();
  if (!file) return null;
  try {
    const raw = file.endsWith(".gz")
      ? gunzipSync(readFileSync(file)).toString("utf8")
      : readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const titles = Array.isArray(parsed) ? parsed : (parsed as { titles?: unknown }).titles;
    if (!Array.isArray(titles) || titles.length === 0) return null;
    return { titles: titles as Title[], sourceVersion: `file:${path.basename(file)}` };
  } catch {
    return null;
  }
}
