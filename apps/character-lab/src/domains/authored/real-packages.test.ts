/**
 * 실제 제작 패키지 2종(public/assets/characters)을 fs 포트로 끝까지 로드한다.
 * GLB 바이트의 SHA-256을 Node crypto로 계산해 manifest·index 값과 대조하고, 규칙 판정과 Blender 레인 선언(slot-mapping.json)을 비교한다.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CHARACTER_SLOT_KINDS } from "../../contracts";

import { compareCapabilities } from "./package-capability";
import { loadAuthoredPackageFlow, loadPackageIndexFlow } from "./package-load-flow";
import { parseVrmFromGlb } from "./vrm-extension-parser";

import type { AuthoredIndexEntry } from "./package-index";
import type { PackageFetchPort } from "./package-load-flow";

const ASSET_ROOT = fileURLToPath(new URL("../../../public/assets/characters/", import.meta.url));
const URL_PREFIX = "/assets/characters/";

function fsPort(): PackageFetchPort {
  const resolve = (url: string): string => {
    if (!url.startsWith(URL_PREFIX)) throw new Error(`예상 밖 URL: ${url}`);
    return `${ASSET_ROOT}${url.slice(URL_PREFIX.length)}`;
  };
  return {
    async fetchJson(url) {
      try {
        return { ok: true, json: JSON.parse(await readFile(resolve(url), "utf8")) as unknown };
      } catch (error) {
        return { ok: false, status: 404, message: error instanceof Error ? error.message : String(error) };
      }
    },
    async fetchBytes(url) {
      try {
        return { ok: true, bytes: new Uint8Array(await readFile(resolve(url))) };
      } catch (error) {
        return { ok: false, status: 404, message: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

const sha256 = async (bytes: Uint8Array): Promise<string> => createHash("sha256").update(bytes).digest("hex");

async function loadIndexEntries(): Promise<readonly AuthoredIndexEntry[]> {
  const index = await loadPackageIndexFlow(fsPort(), undefined, 1);
  if (!index.ok) throw new Error(index.failure.reasonKo);
  return index.entries;
}

describe("authored/real-packages (public/assets/characters)", () => {
  it("index.json은 Orion(primary)·reference 두 항목을 낸다", async () => {
    const entries = await loadIndexEntries();
    expect(entries.map((entry) => entry.characterId)).toEqual(["avatar-orion-authored", "reference-character"]);
    expect(entries[0]?.primary).toBe(true);
    expect(entries[0]?.manifestFormat).toBe("authored-character");
    expect(entries[0]?.licenseNote).toBe("CC0-1.0");
    expect(entries[0]?.summary.hairLodTriangles).toEqual([3752, 1788, 960]);
    expect(entries[1]?.summary.skeleton).toBe(false);
  });

  it("Orion: GLB 실측 SHA-256 = manifest·index 값, 플랜·매핑·능력 판정이 선언과 ears·accessory만 다르다", async () => {
    const [orion] = await loadIndexEntries();
    if (!orion) throw new Error("orion");
    const loaded = await loadAuthoredPackageFlow(fsPort(), orion, { sha256, now: 1 });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const { plan, detail } = loaded;
    expect(detail.observedSha256).toBe("7a2bfd8d2a8a3f54395162ba44f4249259d9c8bdd826a619bc0090c040cd06ed");
    expect(plan.glbSha256).toBe(orion.glbSha256);
    expect(plan.glbBytes).toBe(4_045_664);
    expect(detail.glbBytes.byteLength).toBe(4_045_664);
    expect(plan.glbUrl).toBe("/assets/characters/avatar-orion-authored/avatar-orion-authored.glb");
    expect(plan.licenseNote).toBe("CC0-1.0");
    expect(detail.warnings).toEqual([]);
    expect(plan.manifest.capabilities.authoredHair.style).toBe("short-layered");
    expect(plan.manifest.capabilities.semanticFaceShapes.shapeKeys.length).toBe(24);
    // 매핑
    expect(Object.values(plan.boneMap).length).toBe(53);
    expect(plan.boneMap["mixamorig:Spine2"]).toBe("chest");
    expect(plan.boneMap["TS_OrionEye.L"]).toBe("leftEye");
    expect(detail.judgement.mappings.bones.required.missing).toEqual([]);
    expect(detail.judgement.mappings.bones.fingers.missing).toEqual([]);
    expect(plan.shapeKeyMap["Avatar_Orion_Body:faceEyeSizeBig"]).toBe("param:eyeSize:+");
    expect(plan.shapeKeyMap.faceEyeSizeBig).toBe("param:eyeSize:+");
    expect(plan.shapeKeyMap["Avatar_Orion_Body:blendShape2.vrc_v_aa"]).toBe("facs:jawOpen");
    expect(plan.meshRoles.Avatar_Orion_Body_primitive0).toBe("skin");
    expect(plan.meshRoles.TS_Orion_Pupil_L).toBe("pupil");
    expect(plan.meshRoles["TS_AuthoredHair_short-layered_LOD2"]).toBe("hair");
    expect(detail.hairLod).toMatchObject({ style: "short-layered", lods: [0, 1, 2], chosen: 0, visible: ["TS_AuthoredHair_short-layered_LOD0"] });
    expect(plan.hairLodPolicy.preferredLod).toBe(0);
    // 능력: 선언(slot-mapping.json)이 최종값
    const final = Object.fromEntries(CHARACTER_SLOT_KINDS.map((slot) => [slot, plan.capabilities[slot].status]));
    expect(final).toEqual({
      "face-shape": "available", eyes: "available", irises: "partial", nose: "available", mouth: "available", ears: "partial",
      hair: "partial", body: "partial", top: "unavailable", bottom: "unavailable", shoes: "unavailable", accessory: "partial",
      expression: "available", pose: "available", "hand-pose": "available",
    });
    expect(CHARACTER_SLOT_KINDS.every((slot) => detail.judgement.basis[slot] === "declared")).toBe(true);
    const comparison = compareCapabilities(detail.judgement.ruleOnly, plan.capabilities);
    expect(comparison.divergent).toEqual([
      { slot: "ears", rule: "available", declared: "partial" },
      { slot: "accessory", rule: "unavailable", declared: "partial" },
    ]);
    expect(detail.judgement.facsUnits.length).toBeGreaterThanOrEqual(8);
    expect(detail.gaps.map((gap) => gap.id)).toContain("hair-outline-not-in-glb");
    expect(plan.capabilities.irises.reasonKo).toMatch(/irisSize shape key가 없다/u);
  });

  it("reference: 스켈레톤·표정 없음 → pose/hand-pose/expression unavailable, 선언과 mouth·ears만 다르다", async () => {
    const [, reference] = await loadIndexEntries();
    if (!reference) throw new Error("reference");
    const loaded = await loadAuthoredPackageFlow(fsPort(), reference, { sha256, now: 1 });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const { plan, detail } = loaded;
    expect(detail.observedSha256).toBe("17b879a7b7af470f7643d1ca4c0ca7d1d1172c17dca4cc5316c1a27a959bb611");
    expect(plan.glbBytes).toBe(903_016);
    expect(Object.keys(plan.boneMap)).toEqual([]);
    expect(plan.meshRoles.TS_ReferenceBust).toBe("top");
    expect(plan.meshRoles.TS_ReferenceHead).toBe("head");
    expect(plan.meshRoles.TS_ReferenceEye_L).toBe("eyeball");
    expect(detail.hairLod.style).toBe("soft-bob");
    expect(detail.judgement.facsUnits).toEqual([]);
    const final = Object.fromEntries(CHARACTER_SLOT_KINDS.map((slot) => [slot, plan.capabilities[slot].status]));
    expect(final).toEqual({
      "face-shape": "available", eyes: "available", irises: "unavailable", nose: "available", mouth: "partial", ears: "partial",
      hair: "partial", body: "unavailable", top: "partial", bottom: "unavailable", shoes: "unavailable", accessory: "unavailable",
      expression: "unavailable", pose: "unavailable", "hand-pose": "unavailable",
    });
    const comparison = compareCapabilities(detail.judgement.ruleOnly, plan.capabilities);
    expect(comparison.divergent).toEqual([
      { slot: "mouth", rule: "available", declared: "partial" },
      { slot: "ears", rule: "available", declared: "partial" },
    ]);
    expect(detail.judgement.ruleOnly.pose.reasonKo).toMatch(/스켈레톤 없음/u);
  });

  it("실제 GLB에는 VRM 확장이 없고 노드 이름에 Mixamo 본이 있다(JSON 청크만 읽음)", async () => {
    const bytes = new Uint8Array(await readFile(`${ASSET_ROOT}avatar-orion-authored/avatar-orion-authored.glb`));
    const parsed = parseVrmFromGlb(bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.info).toBeNull();
    expect(parsed.nodeNames).toContain("mixamorig:Hips");
    expect(parsed.nodeNames).toContain("TS_AuthoredHair_short-layered_LOD0");
    expect(parsed.nodeNames.length).toBeGreaterThanOrEqual(67);
    const reference = parseVrmFromGlb(new Uint8Array(await readFile(`${ASSET_ROOT}reference-character/reference-character.glb`)));
    expect(reference.ok && reference.nodeNames).toContain("TS_ReferenceHead");
  });
});
