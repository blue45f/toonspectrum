/**
 * Rare-action product OPFS acquisition for linked 3D passes.
 *
 * Canonical descriptor parsing stays in the lightweight transaction contract; native OPFS and
 * asset-store implementations enter the graph only when a pass is saved, restored, or presented.
 */

import {
  STUDIO_LINKED_3D_PASS_CAS_ROOT,
  StudioLinked3dPassAuthorityError,
  type StudioLinked3dPassCasAuthority,
} from "./studio-linked-3d-pass-transaction";
import { createStudioOpfsAssetStore } from "./studio-opfs-asset-store";
import {
  createStudioOpfsNativeFileSystem,
  StudioOpfsError,
  type StudioOpfsStorageManagerLike,
} from "./studio-opfs-filesystem";

let productAuthorityPromise: Promise<StudioLinked3dPassCasAuthority> | null = null;

export async function acquireStudioLinked3dPassProductAuthority(): Promise<
  StudioLinked3dPassCasAuthority
> {
  productAuthorityPromise ??= (async () => {
    const manager = globalThis.navigator?.storage as StudioOpfsStorageManagerLike | undefined;
    if (!manager || typeof manager.getDirectory !== "function") {
      throw new StudioLinked3dPassAuthorityError(
        "opfs-unavailable",
        "이 브라우저에는 연결형 3D pass용 OPFS가 없습니다.",
      );
    }
    const store = createStudioOpfsAssetStore({
      fs: createStudioOpfsNativeFileSystem(manager, STUDIO_LINKED_3D_PASS_CAS_ROOT),
      estimator: typeof manager.estimate === "function"
        ? { estimate: () => manager.estimate!() }
        : null,
    });
    try {
      await store.list();
    } catch (cause) {
      throw new StudioLinked3dPassAuthorityError(
        "opfs-unavailable",
        "연결형 3D pass OPFS를 열지 못했습니다.",
        cause,
      );
    }
    return store;
  })().catch((cause) => {
    productAuthorityPromise = null;
    if (cause instanceof StudioLinked3dPassAuthorityError) throw cause;
    if (cause instanceof StudioOpfsError) {
      throw new StudioLinked3dPassAuthorityError(
        "opfs-unavailable",
        cause.message,
        cause,
      );
    }
    throw cause;
  });
  return await productAuthorityPromise;
}
