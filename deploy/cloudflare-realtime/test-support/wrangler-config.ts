import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { experimental_readRawConfig } from "wrangler";

// .jsonc.example도 실제 배포와 같은 JSONC 파서로 읽되, 정규화 기본값이
// 누락된 명시 설정을 가리지 않도록 raw config를 사용한다. 임시 경로는
// 운영 설정을 수정하지 않으며 로컬 배포 리다이렉션과도 분리된다.
export function parseWranglerJsonc(source: string) {
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-wrangler-contract-"));
  try {
    const configPath = join(directory, "wrangler.jsonc");
    writeFileSync(configPath, source, "utf8");
    const { rawConfig } = experimental_readRawConfig({ config: configPath });
    if (rawConfig === null || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      throw new Error("Wrangler 설정의 최상위 값은 객체여야 합니다.");
    }
    return rawConfig;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function requiredIdentity(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`실시간 Worker identity 필드가 없거나 유효하지 않습니다: ${key}`);
  }
  return value;
}

export function readRealtimeIdentity(config: ReturnType<typeof parseWranglerJsonc>) {
  return {
    name: requiredIdentity(config.name, "name"),
    issuer: requiredIdentity(config.vars?.REALTIME_TICKET_ISSUER, "REALTIME_TICKET_ISSUER"),
    audience: requiredIdentity(config.vars?.REALTIME_TICKET_AUDIENCE, "REALTIME_TICKET_AUDIENCE"),
  };
}
