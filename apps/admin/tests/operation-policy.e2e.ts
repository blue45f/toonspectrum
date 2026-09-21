import { expect, test, type Page } from "@playwright/test";

import { initialOperationPolicy, operationTransitionBlockers, resolveOperationPolicy, type OperationPolicyDraft } from "../../../packages/contracts/src/operation-policy";

async function policyFixture(page: Page, options: { denied?: boolean; commerciallyReviewed?: boolean } = {}) {
  let draft = initialOperationPolicy();
  let revision = 0;
  let applications = 0;
  const fingerprint = options.commerciallyReviewed ? `sha256:${"e".repeat(64)}` : null;
  if (fingerprint) draft = { ...draft, releaseReview: { state: "approved", approvedModes: ["paid"], subjectDigest: fingerprint, evidenceRef: "synthetic-browser-fixture-not-license-evidence", validUntil: null } };
  const record = () => ({ revision, draft, updatedAt: "2026-09-22T00:00:00Z" });
  await page.route("**/api/admin/production/operation-policy**", async (route) => {
    const request = route.request();
    if (options.denied) return route.fulfill({ status: 403, json: { message: "서비스 관리자 권한이 필요합니다." } });
    if (request.method() === "GET") return route.fulfill({ json: { policy: record(), effective: resolveOperationPolicy(record(), fingerprint, new Date()), runtimeFingerprint: fingerprint, audit: [] } });
    expect(request.headers()["x-toonspectrum-csrf"]).toBe("1");
    const body = request.postDataJSON() as { draft: OperationPolicyDraft; expectedRevision: number; reason?: string; previewDigest?: string };
    const blockedReasons = operationTransitionBlockers(body.draft, fingerprint, new Date());
    if (request.url().endsWith("/preview")) return route.fulfill({ json: {
      expectedRevision: revision, digest: "1".repeat(64), blockedReasons,
      effective: resolveOperationPolicy({ ...record(), draft: body.draft }, fingerprint, new Date()),
      changes: ["테스트용 정책 미리보기", "기존 자료를 보존하며 자동 청구하지 않습니다."],
    } });
    if (blockedReasons.length || body.expectedRevision !== revision) return route.fulfill({ status: 409, json: { message: "정책 확인이 필요합니다." } });
    expect(body.previewDigest).toBe("1".repeat(64));
    expect((body.reason ?? "").length).toBeGreaterThanOrEqual(5);
    applications += 1; revision += 1; draft = body.draft;
    return route.fulfill({ json: { acceptedRevision: revision } });
  });
  return { applications: () => applications, mode: () => draft.mode };
}

test("free default, blocked paid preview, and no automatic write", async ({ page }) => {
  const fixture = await policyFixture(page);
  await page.goto("/");
  await expect(page.getByText("현재: 무료 운영")).toBeVisible();
  await page.getByRole("radio", { name: "유료 운영", exact: true }).check();
  expect(fixture.applications()).toBe(0);
  await page.getByRole("button", { name: "변경 영향 미리보기" }).click();
  await expect(page.getByRole("button", { name: "확인한 정책 적용" })).toBeDisabled();
  await expect(page.getByText("현재 배포물과 일치하는 유료 운영 라이선스 검토 근거가 필요합니다.", { exact: true })).toBeVisible();
  expect(fixture.mode()).toBe("free");
});

test("reviewed mode toggle applies after preview and survives browser reload", async ({ page }) => {
  const fixture = await policyFixture(page, { commerciallyReviewed: true });
  await page.goto("/");
  await page.getByRole("radio", { name: "유료 운영", exact: true }).check();
  await page.getByLabel("변경 사유 (5자 이상)").fill("브라우저 정책 검증입니다");
  await page.getByRole("button", { name: "변경 영향 미리보기" }).click();
  await page.getByRole("button", { name: "확인한 정책 적용" }).click();
  await expect(page.getByText("현재: 유료 운영")).toBeVisible();
  await page.reload();
  await expect(page.getByText("현재: 유료 운영")).toBeVisible();
  await expect(page.getByText("이용료 결제: 비활성")).toBeVisible();
  expect(fixture.applications()).toBe(1);
  await page.getByRole("radio", { name: "무료 운영", exact: true }).check();
  await page.getByLabel("변경 사유 (5자 이상)").fill("무료 운영 복귀 검증입니다");
  await page.getByRole("button", { name: "변경 영향 미리보기" }).click();
  await page.getByRole("button", { name: "확인한 정책 적용" }).click();
  await expect(page.getByText("현재: 무료 운영")).toBeVisible();
  expect(fixture.applications()).toBe(2);
});

test("mobile layout keeps controls usable and does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await policyFixture(page);
  await page.goto("/");
  await expect(page.getByText("현재: 무료 운영")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("radio", { name: "무료 운영", exact: true })).toBeChecked();
  await page.screenshot({ path: "artifacts/operation-policy-browser/mobile.png", fullPage: true });
});

test("unauthorized administrator response never renders the controls", async ({ page }) => {
  await policyFixture(page, { denied: true });
  await page.goto("/");
  await expect(page.getByText("서비스 관리자 권한이 필요합니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});
