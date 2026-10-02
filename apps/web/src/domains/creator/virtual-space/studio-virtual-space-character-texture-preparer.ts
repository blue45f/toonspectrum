import {
  studioCharacterStaticAsset,
  studioCharacterTextureSheetMatches,
} from "./studio-virtual-space-character-assets";
import { registerStudioSceneAtlas } from "./studio-virtual-space-scene-art-runtime";

/** 캐릭터 텍스처 준비·큐잉. 시트 규격이 맞지 않으면 실패로 기록하고 텍스처를 제거한다. */
export function createStudioCharacterTexturePreparer(deps: {
  readonly scene: import("phaser").Scene;
  readonly failedTextures: Set<string>;
}) {
  const { scene, failedTextures } = deps;
  const prepareCharacterTexture = (asset: ReturnType<typeof studioCharacterStaticAsset>) => {
    if (!scene.textures.exists(asset.key)) return false;
    if (asset.type !== "spritesheet") return true;
    const texture = scene.textures.get(asset.key);
    const source = texture.getSourceImage();
    const valid = studioCharacterTextureSheetMatches(asset, source.width, source.height)
      && (!asset.atlas?.slicing || registerStudioSceneAtlas(texture, asset.atlas));
    if (!valid) { failedTextures.add(asset.key); scene.textures.remove(asset.key); }
    return valid;
  };
  const queueCharacterTexture = (asset: ReturnType<typeof studioCharacterStaticAsset>) => {
    if (asset.type === "spritesheet" && !asset.atlas?.slicing) {
      scene.load.spritesheet(asset.key, asset.url, { frameWidth: asset.frameWidth!, frameHeight: asset.frameHeight! });
    } else scene.load.image(asset.key, asset.url);
  };
  return { prepareCharacterTexture, queueCharacterTexture };
}
