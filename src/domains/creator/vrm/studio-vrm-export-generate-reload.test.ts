import { VRMLoaderPlugin, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { createAvatarForgeState } from "./studio-vrm-avatar-forge";
import { STUDIO_VRM_EXPORT_REQUIRED_BONES } from "./studio-vrm-export-vrm-extension";
import {
  createStudioVrmGenerateRecipe,
  exportStudioVrmFromGenerateRecipe,
} from "./studio-vrm-generate-recipe";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

async function loadVrmBytes(bytes: Uint8Array<ArrayBuffer>): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise<{ userData: { vrm: VRM } }>((resolve, reject) => {
    loader.parse(bytes.slice().buffer as ArrayBuffer, "", resolve as never, reject);
  });
  return gltf.userData.vrm;
}

/**
 * 사용자 경로 전체를 고정한다: 조형 패널의 레시피 → 실제 .vrm 바이너리 →
 * three-vrm 로더 재적재. 내보낸 파일은 스튜디오에서 즉시 캐릭터로 쓰일 수 있어야 한다.
 */
describe("generate recipe → .vrm file reload", () => {
  it("produces a loadable VRM with a complete humanoid and meta for the default and custom states", async () => {
    const recipes = [
      createStudioVrmGenerateRecipe({ presetId: null }),
      createStudioVrmGenerateRecipe({ state: createAvatarForgeState() }),
    ];
    for (const recipe of recipes) {
      const bytes = exportStudioVrmFromGenerateRecipe(recipe);
      expect(bytes.byteLength).toBeGreaterThan(1024);

      // glTF 컨테이너 헤더 + 확장 선언을 먼저 확인한다.
      const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      expect(magic).toBe("glTF");

      const vrm = await loadVrmBytes(bytes);
      expect(vrm.humanoid).toBeDefined();
      for (const boneName of STUDIO_VRM_EXPORT_REQUIRED_BONES) {
        expect(
          vrm.humanoid?.getNormalizedBoneNode(boneName as VRMHumanBoneName),
          `${recipe.label}: ${boneName} 누락`,
        ).not.toBeNull();
      }
      const meta = vrm.meta as { authors?: readonly string[]; title?: string };
      expect(meta.authors?.length ?? 0).toBeGreaterThan(0);
    }
  }, 60_000);

  it("keeps distinct body parameters distinguishable after reload", async () => {
    const base = exportStudioVrmFromGenerateRecipe(
      createStudioVrmGenerateRecipe({ presetId: null }),
    );
    const modifiedState = {
      ...createAvatarForgeState(),
      proportions: {
        ...createAvatarForgeState().proportions,
        torsoLength: 1.35,
        legLength: 0.75,
      },
    };
    const modified = exportStudioVrmFromGenerateRecipe(
      createStudioVrmGenerateRecipe({ state: modifiedState }),
    );

    // 다른 체형 파라미터는 서로 다른 바이너리여야 하고(프리셋 충돌 금지),
    // 둘 다 재적재 시 유효한 휴머노이드를 유지해야 한다.
    expect(Buffer.from(modified).equals(Buffer.from(base))).toBe(false);

    const reloaded = await loadVrmBytes(modified);
    expect(reloaded.humanoid?.getNormalizedBoneNode("hips")).not.toBeNull();
  }, 60_000);
});
