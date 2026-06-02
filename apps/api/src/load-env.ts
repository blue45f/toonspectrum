import { existsSync } from "node:fs";
import path from "node:path";

// 다른 import보다 먼저 평가되어야 한다(main.ts의 첫 import).
// lib/db가 모듈 로드 시 DATABASE_URL을 읽으므로, 그 전에 레포 루트 .env.local을 주입한다.
// (Drizzle 스택은 Prisma처럼 .env 자동 로드가 없다.)
const candidates = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), "../../.env.local"),
];
for (const candidate of candidates) {
  if (existsSync(candidate)) {
    try {
      process.loadEnvFile(candidate);
    } catch {
      // 무시 — env 없이도 로컬 docker 폴백으로 동작
    }
    break;
  }
}
