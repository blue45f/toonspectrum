import { realpathSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

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
