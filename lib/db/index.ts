import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// 로컬: file 기반 libSQL(SQLite 호환). 프로덕션: Turso/libSQL URL + 토큰(env).
// 외부 클라우드 DB 키 없이도 로컬에서 실제 동작·테스트 가능.
const url = process.env.TURSO_DATABASE_URL ?? "file:./data/webdex.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, ...(authToken ? { authToken } : {}) });

export const db = drizzle(client, { schema });
export const dbClient = client;
export * from "./schema";
