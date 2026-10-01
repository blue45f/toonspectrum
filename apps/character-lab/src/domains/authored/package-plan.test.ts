import { describe, expect, it } from "vitest";

import { isLabFailure } from "../../contracts";
import { FIXTURE_GLB_SHA256, characterPackageManifestFixture } from "../../testing/manifest-fixtures";

import { buildPackagePlan, buildPackagePlanDetailed, joinPackageUrl } from "./package-plan";

describe("authored/package-plan", () => {
  const verified = { glbSha256: FIXTURE_GLB_SHA256, glbBytes: 1024 };

  it("정상 manifest는 플랜을 만들고 매핑·능력·LOD 정책을 채운다", () => {
    const plan = buildPackagePlan(characterPackageManifestFixture(), "/assets/characters/mina/", verified);
    expect(isLabFailure(plan)).toBe(false);
    if (isLabFailure(plan)) return;
    expect(plan.baseUrl).toBe("/assets/characters/mina");
    expect(plan.glbUrl).toBe("/assets/characters/mina/mina.glb");
    expect(plan.glbSha256).toBe(FIXTURE_GLB_SHA256);
    expect(plan.glbBytes).toBe(1024);
    expect(Object.keys(plan.shapeKeyMap).length).toBeGreaterThanOrEqual(24);
    expect(plan.shapeKeyMap.faceEyeSizeBig).toBe("param:eyeSize:+");
    expect(plan.capabilities["face-shape"].status).toBe("available");
    expect(plan.hairLodPolicy.preferredLod).toBe(0);
    expect(plan.licenseNote).toMatch(/라이선스 미기재/u);
  });

  it("SHA·바이트 불일치, 품질 미통과, files.glb 없음은 LabFailure(한글 사유)", () => {
    const manifest = characterPackageManifestFixture();
    const sha = buildPackagePlan(manifest, "/p", { glbSha256: "f".repeat(64), glbBytes: 1024 });
    expect(isLabFailure(sha) && sha.code).toBe("package-sha-mismatch");
    const bytes = buildPackagePlan(manifest, "/p", { glbSha256: FIXTURE_GLB_SHA256, glbBytes: 1 });
    expect(isLabFailure(bytes) && bytes.code).toBe("package-bytes-mismatch");
    const quality = buildPackagePlan(characterPackageManifestFixture({ qualityPassed: false }), "/p", verified);
    expect(isLabFailure(quality) && quality.reasonKo).toMatch(/품질 게이트 미통과/u);
    const contradictory = buildPackagePlan({ ...manifest, quality: { ...manifest.quality, score: 0.1 } }, "/p", verified);
    expect(isLabFailure(contradictory) && contradictory.code).toBe("package-quality-below-minimum");
    const { glb: _glb, ...rest } = manifest.files;
    const noGlb = buildPackagePlan({ ...manifest, files: rest }, "/p", verified);
    expect(isLabFailure(noGlb) && noGlb.code).toBe("package-no-glb");
  });

  it("상세 버전은 판정·LOD 선택을 함께 주고 옵션(licenseNote·preferredLod)을 반영한다", () => {
    const result = buildPackagePlanDetailed(characterPackageManifestFixture(), "/p", verified, { licenseNote: "CC0-1.0", preferredLod: 2, now: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.licenseNote).toBe("CC0-1.0");
    expect(result.judgement.basis.hair).toBe("rule");
    expect(result.hairLod.chosen).toBeNull();
    expect(result.plan.hairLodPolicy.preferredLod).toBe(2);
    expect(joinPackageUrl("/a/", "/b.glb")).toBe("/a/b.glb");
  });
});
