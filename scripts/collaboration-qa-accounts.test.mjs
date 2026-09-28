import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, chmod, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountEnvelope, prepareAccountFile, readAccountFile, registerAccounts, validateQaOrigin, QA_ACTORS } from "./collaboration-qa-accounts.mjs";

const sample = () => accountEnvelope("owned-inbox@gmail.com", "unit-test-20260928", "http://127.0.0.1:62055");
test("명시적 사이트와 본인 수신용 별칭만 사용한다", () => {
  const value = sample();
  assert.equal(new Set(QA_ACTORS.map((actor) => value[`COLLAB_QA_${actor}_PASSWORD`])).size, 3);
  assert.equal(value.COLLAB_QA_OWNER_STATE, "prepared");
  assert.match(value.COLLAB_QA_OWNER_EMAIL, /\+collab-unit-test-/u);
  const withCredentials = new URL("https://www.toonstudio.cloud");
  withCredentials.username = "fixture-user"; withCredentials.password = "fixture-value";
  for (const origin of ["https://evil.example", "https://www.toonstudio.cloud/path", withCredentials.href, "https://www.toonstudio.cloud?x=1"]) assert.throws(() => validateQaOrigin(origin));
  assert.throws(() => accountEnvelope("unknown@example.com", "unit-test-20260928", "http://127.0.0.1:62055"));
});
test("로컬 전용 파일은 600이며 기존 파일과 심볼릭 링크를 덮어쓰지 않는다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "collab-accounts-unit-"));
  try {
    const file = join(dir, ".env.local"), entries = sample();
    await prepareAccountFile(file, entries);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(await readAccountFile(file), { ...entries });
    await assert.rejects(prepareAccountFile(file, sample()));
    await symlink(file, join(dir, "alias")); await assert.rejects(readAccountFile(join(dir, "alias")));
    await chmod(file, 0o644); await assert.rejects(readAccountFile(file));
    assert.ok((await readFile(file, "utf8")).includes("COLLAB_QA_OWNER_PASSWORD"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("일반 회원가입 계약만 보내고 권한·테스트 표시·인증 완료를 주입하지 않는다", async () => {
  const entries = sample(), calls = [];
  const result = await registerAccounts(entries, async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, verificationRequired: true }), { status: 200 });
  });
  assert.equal(calls.length, 3);
  for (const call of calls) assert.deepEqual(Object.keys(call.body).sort(), ["email", "name", "password"]);
  assert.ok(result.every((value) => value.status === "verification-required"));
  assert.equal(JSON.stringify(result).includes(entries.COLLAB_QA_OWNER_PASSWORD), false);
  let repeated = false;
  await registerAccounts(entries, async () => { repeated = true; throw new Error("unexpected"); });
  assert.equal(repeated, false);
});
test("가입 실패는 즉시 중단하고 무한 재시도나 성공으로 오인하지 않는다", async () => {
  let calls = 0;
  const entries = sample();
  await assert.rejects(registerAccounts(entries, async () => { calls += 1; return new Response("rate-limited", { status: 429 }); }));
  assert.equal(calls, 1);
  assert.equal(entries.COLLAB_QA_OWNER_STATE, "prepared");
});

test("실제 로그인 CSRF 계약을 유지해 출처 증명 누락으로 가입이 거절되지 않는다", async () => {
  const { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } = await import("@toonstudio/contracts/security/csrf");
  await registerAccounts(sample(), async (url, options) => {
    const headers = new Headers(options.headers);
    assert.equal(headers.get(TOONSPECTRUM_CSRF_HEADER), TOONSPECTRUM_CSRF_HEADER_VALUE);
    assert.equal(headers.get("Origin"), new URL(url).origin);
    assert.equal(options.redirect, "error");
    return new Response(JSON.stringify({ ok: true, verificationRequired: true }));
  });
});

test("가입 실패 진단은 HTTP 상태만 포함하고 서버 본문이나 비밀번호를 포함하지 않는다", async () => {
  const { QaAccountRegistrationError } = await import("./collaboration-qa-accounts.mjs");
  const entries = sample();
  await assert.rejects(registerAccounts(entries, async () => new Response(entries.COLLAB_QA_OWNER_PASSWORD, { status: 503 })), (error) => {
    assert.ok(error instanceof QaAccountRegistrationError);
    assert.equal(error.status, 503);
    assert.equal(error.actor, "OWNER");
    assert.equal(JSON.stringify(error).includes(entries.COLLAB_QA_OWNER_PASSWORD), false);
    return true;
  });
});
