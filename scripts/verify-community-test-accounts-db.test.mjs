import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
const script = fileURLToPath(new URL("./verify-community-test-accounts-db.mjs", import.meta.url));
function run(value, args = []) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, COMMUNITY_TEST_DATABASE_URL: value }, timeout: 10000 });
}
test("dry-run은 DB 연결 없이 검증 범위를 설명한다", () => {
  const result = run("", ["--dry-run"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /운영 연결은 거부/);
});
for (const address of [
  "postgresql://example.invalid:61983/community_qa_verification",
  "postgresql://127.0.0.1:5432/community_qa_verification",
  "postgresql://127.0.0.1:61983/production",
  "postgresql://127.0.0.1:61983/community_qa_verification?host=example.invalid",
  "postgresql://127.0.0.1:61983/community_qa_verification#override",
  "https://127.0.0.1:61983/community_qa_verification",
]) {
  test(`허용 범위 밖 연결 차단: ${address}`, () => {
    const result = run(address);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /운영 보호/);
  });
}
