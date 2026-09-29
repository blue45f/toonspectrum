import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  apiHealthUrl,
  disposableDatabaseUrl,
  isRemoteDatabaseUrl,
  localClusterDir,
  LOCAL_TEST_DB_CONTAINER,
  parseLocalTestStackArgs,
  redactDatabaseUrl,
  webHealthUrl,
} from "./local-test-stack.mjs";

describe("local-test-stack args", () => {
  it("기본값은 API 4001 + Web 5173", () => {
    assert.deepEqual(parseLocalTestStackArgs([]), {
      check: false,
      help: false,
      apiPort: 4001,
      webPort: 5173,
      resetDb: false,
    });
  });

  it("--check/--reset-db/포트를 파싱한다", () => {
    const parsed = parseLocalTestStackArgs([
      "--check",
      "--reset-db",
      "--api-port",
      "4101",
      "--web-port=5273",
    ]);
    assert.equal(parsed.check, true);
    assert.equal(parsed.resetDb, true);
    assert.equal(parsed.apiPort, 4101);
    assert.equal(parsed.webPort, 5273);
  });

  it("잘못된 포트와 알 수 없는 인자를 거부한다", () => {
    assert.throws(() => parseLocalTestStackArgs(["--api-port", "0"]), /포트/);
    assert.throws(() => parseLocalTestStackArgs(["--web-port=99999"]), /포트/);
    assert.throws(() => parseLocalTestStackArgs(["--seed"]), /알 수 없는 인자/);
  });
});

describe("local-test-stack url helpers", () => {
  it("헬스 URL을 조립한다", () => {
    assert.equal(apiHealthUrl(4001), "http://127.0.0.1:4001/api/health/live");
    assert.equal(webHealthUrl(5173), "http://127.0.0.1:5173/");
  });

  it("DB URL에서 자격증명을 마스킹한다", () => {
    // secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- synthetic loopback fixture: this test exists to prove credentials are redacted, so it must carry a credentialed URL
    const redacted = redactDatabaseUrl("postgresql://pguser:s3cret@127.0.0.1:55432/postgres?sslmode=require");
    assert.ok(!redacted.includes("s3cret"), redacted);
    assert.ok(!redacted.includes("pguser"), redacted);
    assert.ok(redacted.includes("127.0.0.1:55432"), redacted);
    assert.equal(redactDatabaseUrl("not-a-url"), "(unparseable-url)");
  });

  it("원격 DB를 구분한다", () => {
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@127.0.0.1:55432/db"), false);
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@localhost/db"), false);
    assert.equal(isRemoteDatabaseUrl("postgresql://u:p@ep-xxx.neon.tech/db"), true);
    assert.equal(isRemoteDatabaseUrl("not-a-url"), true);
  });

  it("disposable DB는 로컬 고정 컨테이너를 가리킨다", () => {
    assert.equal(LOCAL_TEST_DB_CONTAINER, "toonstudio-local-test-db");
    const url = disposableDatabaseUrl();
    assert.ok(url.includes("127.0.0.1:55432"), url);
    assert.equal(isRemoteDatabaseUrl(url), false);
  });

  it("initdb 폴백 클러스터 경로와 URL이 로컬을 가리킨다", () => {
    assert.ok(localClusterDir().includes("toonstudio-local-test-pg"));
    assert.ok(disposableDatabaseUrl().includes("127.0.0.1:55432"));
  });
});
