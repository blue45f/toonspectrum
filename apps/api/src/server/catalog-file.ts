// 배포 카탈로그 파일 읽기 계층.
//
// 크롤링과 갱신은 로컬 수동 도구에서만 수행한다. 배포된 API는 번들된 catalog.json.gz를
// 부팅 시 한 번 읽을 뿐이며, 파일 쓰기·스탯 폴링·외부 수집 기능을 갖지 않는다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import type { Title } from "../../../web/src/shared/lib/types";

const CANDIDATES = ["apps/api/data/catalog.json.gz", "data/catalog.json.gz", "catalog.json.gz"];

type EnvLike = Partial<Record<string, string | undefined>>;

function envCatalogPath(env: EnvLike): string | null {
  const raw = env.WEBDEX_CATALOG_FILE || env.WEBDEX_CATALOG_GZ;
  return raw ? path.resolve(raw) : null;
}

// 환경변수로 경로를 지정하면 그 파일만 사용한다. 미지정이면 번들 후보를 상위 디렉터리까지 찾는다.
export function resolveCatalogFile(env: EnvLike = process.env): string | null {
  const envPath = envCatalogPath(env);
  if (envPath) return existsSync(envPath) ? envPath : null;

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    for (const relativePath of CANDIDATES) {
      const candidate = path.resolve(dir, relativePath);
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

interface CatalogFileWrapper {
  titles: Title[];
  sourceVersion?: string;
  runHash?: string;
}

function readWrapper(file: string): CatalogFileWrapper | null {
  try {
    const raw = file.endsWith(".gz")
      ? gunzipSync(readFileSync(file)).toString("utf8")
      : readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return { titles: parsed as Title[] };
    if (!parsed || typeof parsed !== "object") return null;
    const wrapper = parsed as CatalogFileWrapper;
    return Array.isArray(wrapper.titles) ? wrapper : null;
  } catch {
    return null;
  }
}

export function loadCatalogTitlesFromFile(env: EnvLike = process.env): {
  titles: Title[];
  sourceVersion: string;
  file: string;
  runHash: string | null;
} | null {
  const file = resolveCatalogFile(env);
  if (!file) return null;
  const wrapper = readWrapper(file);
  if (!wrapper || wrapper.titles.length === 0) return null;
  return {
    titles: wrapper.titles,
    sourceVersion: wrapper.sourceVersion ?? `file:${path.basename(file)}`,
    file,
    runHash: typeof wrapper.runHash === "string" && wrapper.runHash ? wrapper.runHash : null,
  };
}
