import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";

const contractRequire = createRequire(new URL("../packages/contracts/package.json", import.meta.url));
const contractRuntime = realpathSync(contractRequire.resolve("zod"));

// 다른 런타임에서 만든 기본값 스키마는 중첩 객체의 필수 값 검사와 호환되지 않을 수 있다.
describe("공유 계약의 Zod 런타임 일치", () => {
  it.each([
    "../package.json",
    "../apps/api/package.json",
    "../packages/core/package.json",
  ])("%s 소비자와 같은 런타임으로 계약을 구성한다", (manifest) => {
    const consumerRequire = createRequire(new URL(manifest, import.meta.url));
    expect(realpathSync(consumerRequire.resolve("zod"))).toBe(contractRuntime);
  });
});

it("간접 의존성의 Zod 패키지와 설치 스냅샷을 모두 보존한다", () => {
  const dependencyMap = z.record(z.string(), z.string()).optional();
  const schema = z.object({
    packages: z.record(z.string(), z.unknown()),
    snapshots: z.record(z.string(), z.object({
      dependencies: dependencyMap,
      optionalDependencies: dependencyMap,
    })),
  });
  const lock = schema.parse(parse(readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8")));
  const versions = new Set<string>();
  for (const snapshot of Object.values(lock.snapshots)) {
    for (const dependencies of [snapshot.dependencies, snapshot.optionalDependencies]) {
      if (dependencies?.zod) versions.add(dependencies.zod);
    }
  }
  expect(versions.size).toBeGreaterThan(0);
  for (const version of versions) {
    expect(Object.hasOwn(lock.packages, `zod@${version}`), `패키지 해시 누락: zod@${version}`).toBe(true);
    expect(Object.hasOwn(lock.snapshots, `zod@${version}`), `설치 스냅샷 누락: zod@${version}`).toBe(true);
  }
});
