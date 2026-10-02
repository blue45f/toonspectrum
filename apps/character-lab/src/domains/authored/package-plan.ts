/**
 * AuthoredPackagePlan 생성: files.glb 필수, 품질 게이트(quality.passed·score ≥ minimumScore), SHA-256·바이트 수 검증,
 * shape key·본·메시 매핑, 15슬롯 능력, 헤어 LOD 정책. 실패는 LabFailure(한글 사유)로 돌려준다.
 */
import { failVisible } from "../../contracts";

import { selectHairLod } from "./mesh-role-mapping";
import { judgeCapabilities, mappingsFromManifest } from "./package-capability";

import type { HairLodSelection } from "./mesh-role-mapping";
import type { CapabilityJudgement } from "./package-capability";
import type { AuthoredPackagePlan, CharacterPackageManifest, LabFailure } from "../../contracts";

export interface VerifiedGlb {
  readonly glbSha256: string;
  readonly glbBytes: number;
}

export interface PackagePlanOptions {
  /** 기본 0(가장 상세한 LOD) */
  readonly preferredLod?: number;
  /** index.json의 licenseNote(없으면 provenance.license) */
  readonly licenseNote?: string;
  readonly now?: number;
}

export type PackagePlanResult =
  | { readonly ok: true; readonly plan: AuthoredPackagePlan; readonly judgement: CapabilityJudgement; readonly hairLod: HairLodSelection }
  | { readonly ok: false; readonly failure: LabFailure };

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** `${baseUrl}/${relativePath}` (중복 슬래시 없음) */
export function joinPackageUrl(baseUrl: string, relativePath: string): string {
  return `${trimSlash(baseUrl)}/${relativePath.replace(/^\/+/u, "")}`;
}

function licenseFromProvenance(manifest: CharacterPackageManifest): string {
  const license = manifest.provenance.license;
  if (typeof license === "string" && license.length > 0) return license;
  return "라이선스 미기재(패키지 provenance에 license 없음)";
}

/** 게이트와 매핑을 모두 돌려주는 상세 버전 */
export function buildPackagePlanDetailed(
  manifest: CharacterPackageManifest,
  baseUrl: string,
  verified: VerifiedGlb,
  options: PackagePlanOptions = {},
): PackagePlanResult {
  const now = options.now;
  const glb = manifest.files.glb;
  if (!glb) {
    return { ok: false, failure: failVisible("package-no-glb", "제작 패키지 manifest에 files.glb가 없습니다.", undefined, now) };
  }
  if (!manifest.quality.passed) {
    return {
      ok: false,
      failure: failVisible(
        "package-quality-failed",
        `품질 게이트 미통과 패키지입니다(점수 ${manifest.quality.score}, 최소 ${manifest.quality.minimumScore}, passed=false).`,
        undefined,
        now,
      ),
    };
  }
  if (manifest.quality.score < manifest.quality.minimumScore) {
    return {
      ok: false,
      failure: failVisible(
        "package-quality-below-minimum",
        `품질 점수 ${manifest.quality.score}가 최소 ${manifest.quality.minimumScore} 미만입니다(passed 플래그와 모순).`,
        undefined,
        now,
      ),
    };
  }
  if (verified.glbSha256.toLowerCase() !== glb.sha256) {
    return {
      ok: false,
      failure: failVisible(
        "package-sha-mismatch",
        `GLB SHA-256이 manifest와 다릅니다(기대 ${glb.sha256.slice(0, 12)}…, 실제 ${verified.glbSha256.slice(0, 12)}…).`,
        undefined,
        now,
      ),
    };
  }
  if (verified.glbBytes !== glb.bytes) {
    return {
      ok: false,
      failure: failVisible("package-bytes-mismatch", `GLB 바이트 수가 manifest와 다릅니다(기대 ${glb.bytes}, 실제 ${verified.glbBytes}).`, undefined, now),
    };
  }

  const mappings = mappingsFromManifest(manifest);
  const judgement = judgeCapabilities(manifest, mappings);
  const hairLod = selectHairLod(Object.keys(mappings.meshes.roles), options.preferredLod ?? 0);
  const plan: AuthoredPackagePlan = {
    manifest,
    baseUrl: trimSlash(baseUrl),
    glbUrl: joinPackageUrl(baseUrl, glb.path),
    glbSha256: glb.sha256,
    glbBytes: glb.bytes,
    shapeKeyMap: mappings.shapeKeys.mapped,
    boneMap: mappings.bones.mapped,
    meshRoles: mappings.meshes.roles,
    hairLodPolicy: { preferredLod: hairLod.chosen ?? options.preferredLod ?? 0 },
    capabilities: judgement.capabilities,
    licenseNote: options.licenseNote ?? licenseFromProvenance(manifest),
  };
  return { ok: true, plan, judgement, hairLod };
}

/** 스펙 공개 API: 플랜 또는 LabFailure */
export function buildPackagePlan(manifest: CharacterPackageManifest, baseUrl: string, verified: VerifiedGlb, options?: PackagePlanOptions): AuthoredPackagePlan | LabFailure {
  const result = buildPackagePlanDetailed(manifest, baseUrl, verified, options);
  return result.ok ? result.plan : result.failure;
}
