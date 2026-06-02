import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// 로컬: file 기반 libSQL(SQLite 호환). 프로덕션: Turso/libSQL URL + 토큰(env).
// 외부 클라우드 DB 키 없이도 로컬에서 실제 동작·테스트 가능.
//
// 기본 file 경로는 cwd가 아니라 레포 루트(pnpm-workspace.yaml 위치)에 고정한다. API는 apps/api에서,
// 크롤/ingest 스크립트와 drizzle-kit은 레포 루트에서 실행되는데, cwd 상대경로(`file:./data/...`)면
// 서로 다른 webdex.db를 가리켜(스냅샷이 한쪽에만 쌓이는 split-brain) 카탈로그가 비어 보인다.
// apps/api 빌드가 CommonJS라 import.meta는 쓰지 않고 cwd에서 거슬러 올라가 루트를 찾는다.
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const REPO_ROOT = findRepoRoot(process.cwd());
const url = process.env.TURSO_DATABASE_URL ?? `file:${path.join(REPO_ROOT, "data", "webdex.db")}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, ...(authToken ? { authToken } : {}) });

export const db = drizzle(client, { schema });
export const dbClient = client;
export * from "./schema";
