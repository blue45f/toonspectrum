import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveConfig } from "vite";

import { studioPromoE2eServerConfig } from "../tools/studio-promo-e2e-server-config.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));

test("홍보영상 서버가 실제 웹 앱 root와 @ alias를 불러온다", async () => {
  const input = studioPromoE2eServerConfig({});
  assert.equal(input.configFile, path.join(root, "apps/web/vite.config.ts"));
  const config = await resolveConfig(input, "serve");
  assert.equal(config.root, path.join(root, "apps/web"));
  assert.ok(config.resolve.alias.some(({ find, replacement }) =>
    find === "@" && replacement === path.join(root, "apps/web/src")));
  assert.ok(existsSync(path.join(config.root, "tools/browser-harnesses/promo-e2e.html")));
  assert.equal(config.server.port, 5353);
});

test("다른 디렉터리에서 실행해도 설정과 격리 캐시 경로가 달라지지 않는다", () => {
  const before = studioPromoE2eServerConfig({ STUDIO_PROMO_E2E_PORT: "5387" });
  const cwd = process.cwd();
  try {
    process.chdir(tmpdir());
    assert.deepEqual(studioPromoE2eServerConfig({ STUDIO_PROMO_E2E_PORT: "5387" }), before);
  } finally {
    process.chdir(cwd);
  }
});

for (const port of ["", "0", "1023", "65536", "5353.5", "NaN"]) {
  test(`잘못된 포트 ${JSON.stringify(port)}로 서버를 시작하지 않는다`, () => {
    assert.throws(() => studioPromoE2eServerConfig({ STUDIO_PROMO_E2E_PORT: port }), /정수/);
  });
}
