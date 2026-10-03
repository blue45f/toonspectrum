import {
  StudioCharacterAssetResidency,
  studioCharacterActionFrame,
  studioCharacterActionSheetMatches,
  studioCharacterActionTextureKey,
  studioCharacterFrameGeometry,
  studioCharacterPoseSheetMatches,
  studioCharacterPoseTextureKey,
  studioCharacterStaticAsset,
  studioCharacterStaticSheetMatches,
  studioCharacterVisualAssets,
  studioCharacterWalkAnimationKey as walkAnimationKey,
  studioCharacterWalkTextureKey as walkSheetKey,
} from "./studio-virtual-space-character-assets";
import {
  resolveStudioCharacterAppearance,
  studioCharacterActionClip,
  studioCharacterSkinForArtStyle,
  studioCharacterWalkClip,
  type StudioCharacterMotionState,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
import { studioCharacterExpressionFrame } from "./studio-virtual-space-expressions";
import { STUDIO_ACTOR_EXPRESSION_PRESENTATION } from "./studio-virtual-space-scene-art-runtime";
import { studioEffectiveGaitStride } from "./studio-virtual-space-locomotion-presentation";
import { studioGaitFrame } from "./studio-virtual-space-presentation";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type {
  StudioVirtualSpaceFacing,
  StudioVirtualSpacePeer,
} from "./studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";

/**
 * 스프라이트 비주얼 적용 클러스터의 명시적 의존.
 * sceneReady·cancelled·커스텀 시트 스킨은 이펙트 수명 동안 바뀌는 값이라 게터로 읽는다.
 */
export interface StudioSpriteVisualApplierDeps {
  readonly scene: import("phaser").Scene;
  readonly isCancelled: () => boolean;
  readonly isSceneReady: () => boolean;
  readonly characterAssets: StudioCharacterAssetResidency;
  readonly reducedMotion: MediaQueryList;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly actorExpressionTextureKey: string;
  readonly fallbackAsset: ReturnType<typeof studioCharacterStaticAsset>;
  readonly identityRef: { readonly current: string | undefined };
  readonly getSelfCustomSheetSkin: () => StudioCharacterSkin | null;
}

export function createStudioSpriteVisualApplier(deps: StudioSpriteVisualApplierDeps) {
  const {
    scene,
    characterAssets,
    reducedMotion,
    artStyle,
    actorExpressionTextureKey,
    fallbackAsset,
  } = deps;

  const ensureWalkAnimation = (skin: StudioCharacterSkin, direction: StudioVirtualSpaceFacing) => {
    const clip = studioCharacterWalkClip(skin, direction);
    const key = walkSheetKey(skin, direction);
    if (!clip || deps.isCancelled() || !scene.textures.exists(key) || scene.anims.exists(walkAnimationKey(skin, direction))) return;
    const texture = scene.textures.get(key);
    const source = texture.source[0];
    if (clip.atlas && (!source || !studioCharacterActionSheetMatches(clip, source.width, source.height))) return;
    if (!Number.isSafeInteger(clip.start) || !Number.isSafeInteger(clip.end)
      || clip.end < clip.start || clip.start < 0 || clip.end >= texture.frameTotal - 1) return;
    scene.anims.create({ key: walkAnimationKey(skin, direction), frames: scene.anims.generateFrameNumbers(key, { start: clip.start, end: clip.end }), frameRate: clip.frameRate, repeat: clip.repeat ?? -1 });
  };

  const updateDisplaySize = (sprite: import("phaser").GameObjects.Sprite) => {
    const presentation = sprite.getData("framePresentation") as Parameters<typeof studioCharacterFrameGeometry>[0];
    const geometry = studioCharacterFrameGeometry(presentation, sprite.frame.width, sprite.frame.height,
      Number(sprite.getData("visualWidth") ?? 92), Number(sprite.getData("visualHeight") ?? 123), Boolean(sprite.getData("seatAttached")));
    sprite.setDisplaySize(geometry.width, geometry.height).setOrigin(geometry.originX, geometry.originY);
  };
  const hasStaticAsset = (asset: ReturnType<typeof studioCharacterStaticAsset>) => {
    if (!scene.textures.exists(asset.key)) return false;
    const source = scene.textures.get(asset.key).source[0];
    return Boolean(source && studioCharacterStaticSheetMatches(asset, source.width, source.height));
  };
  const applySpriteVisual = (
    sprite: import("phaser").GameObjects.Sprite,
    skin: StudioCharacterSkin,
    nextFacing: StudioVirtualSpaceFacing,
    nextState: StudioCharacterMotionState,
  ) => {
    const owner = sprite.getData("assetOwner") as string;
    if (deps.isSceneReady() && owner) characterAssets.use(owner, studioCharacterVisualAssets(skin, nextFacing, nextState), sprite.texture.key);
    if (sprite.getData("visualMotionState") !== nextState) {
      sprite.setData("visualMotionState", nextState).setData("visualStateStartedAt", scene.time.now);
    }
    const action = studioCharacterActionClip(skin, nextFacing, nextState);
    const actionKey = action ? studioCharacterActionTextureKey(skin, nextFacing, nextState) : null;
    const actionSource = actionKey && scene.textures.exists(actionKey) ? scene.textures.get(actionKey).source[0] : undefined;
    if (action && actionKey && scene.textures.exists(actionKey)
      && actionSource && studioCharacterActionSheetMatches(action, actionSource.width, actionSource.height)
      && action.end < scene.textures.get(actionKey).frameTotal - 1) {
      if (sprite.anims.isPlaying) sprite.stop();
      if (sprite.getData("actionKey") !== actionKey) {
        sprite.setData("actionKey", actionKey).setData("actionStartedAt", scene.time.now);
      }
      const frame = studioCharacterActionFrame(action, scene.time.now - Number(sprite.getData("actionStartedAt")), reducedMotion.matches);
      sprite.setTexture(actionKey, frame).setData("framePresentation", action.frames?.[frame - action.start]);
      updateDisplaySize(sprite);
      return;
    }
    sprite.setData("actionKey", null);
    sprite.setData("poseTextureUsed", false);
    // 손 인사는 전신 wave 포즈 시트를 표정 프레임보다 우선한다(몸 전체가 인사하는 편이 멀리서도 읽힌다).
    // 눕기(lie)도 포즈 텍스처가 등록되면(트랙1) 자동 사용, 없으면 idle 프레임+회전 폴백.
    const pose = nextState === "wave" || nextState === "sit" || nextState === "lie" ? skin.poses?.[nextState] : undefined;
    if (pose && (nextState === "wave" || nextState === "sit" || nextState === "lie")) {
      const poseKey = studioCharacterPoseTextureKey(skin, nextState);
      const poseSource = scene.textures.exists(poseKey) ? scene.textures.get(poseKey).getSourceImage() : undefined;
      if (poseSource && studioCharacterPoseSheetMatches(pose, poseSource.width, poseSource.height)) {
        if (sprite.anims.isPlaying) sprite.stop();
        const frame = pose.directionFrames[nextFacing];
        sprite.setTexture(poseKey, frame).setData("framePresentation", pose.frames[frame]);
        sprite.setData("poseTextureUsed", true);
        updateDisplaySize(sprite);
        return;
      }
    }
    const expression = artStyle === "sky-island" && scene.textures.exists(actorExpressionTextureKey)
      ? studioCharacterExpressionFrame({ skinKey: skin.key, time: scene.time.now,
        idleForMs: scene.time.now - Number(sprite.getData("visualStateStartedAt") ?? scene.time.now),
        moving: nextState === "walk", facing: nextFacing, reducedMotion: reducedMotion.matches,
        motionState: nextState, identity: owner,
        reaction: sprite.getData("actorReaction") as StudioVirtualSpaceSnapshot["selfReaction"] }) : null;
    if (expression !== null) {
      if (sprite.anims.isPlaying) sprite.stop();
      sprite.setTexture(actorExpressionTextureKey, expression).setData("framePresentation", STUDIO_ACTOR_EXPRESSION_PRESENTATION[expression]);
      updateDisplaySize(sprite);
      return;
    }
    if (nextState === "walk") {
      const clip = studioCharacterWalkClip(skin, nextFacing);
      const animationKey = walkAnimationKey(skin, nextFacing);
      ensureWalkAnimation(skin, nextFacing);
      // 크로스페이드 런타임이 방향 전환을 판정할 수 있게 현재 방향 클립을 남긴다.
      sprite.setData("visualWalkClipKey", clip ? animationKey : "");
      if (clip && scene.anims.exists(animationKey)) {
        if (clip.distancePerCycle || reducedMotion.matches) {
          if (sprite.anims.isPlaying) sprite.stop();
          const frame = clip.start + (reducedMotion.matches ? 0 : studioGaitFrame(
            Number(sprite.getData("walkDistance") ?? 0), clip.end - clip.start + 1,
            studioEffectiveGaitStride(sprite.getData("gaitDistancePerCycle") as number | undefined, clip.distancePerCycle),
          ));
          const sheet = walkSheetKey(skin, nextFacing);
          if (sprite.texture.key !== sheet || String(sprite.frame.name) !== String(frame)) sprite.setTexture(sheet, frame);
          sprite.setData("framePresentation", clip.frames?.[frame - clip.start]);
        } else {
          sprite.play(animationKey, true);
          sprite.setData("framePresentation", clip.frames?.[Number(sprite.frame.name) - clip.start]);
        }
        updateDisplaySize(sprite);
        return;
      }
    }
    if (sprite.anims.isPlaying) sprite.stop();
    const current = studioCharacterStaticAsset(skin, nextFacing, nextState);
    const standing = studioCharacterStaticAsset(skin, nextFacing);
    const asset = hasStaticAsset(current) ? current
      : hasStaticAsset(standing) ? standing
        : scene.textures.exists(sprite.texture.key) ? undefined : fallbackAsset;
    if (asset && scene.textures.exists(asset.key)) {
      // 걷기와 idle은 같은 텍스처여도 선택 프레임이 다르므로 반드시 함께 비교한다.
      if (sprite.texture.key !== asset.key || (asset.frame !== undefined && String(sprite.frame.name) !== String(asset.frame))) {
        sprite.setTexture(asset.key, asset.frame);
      }
      sprite.setData("framePresentation", asset.presentation);
    }
    updateDisplaySize(sprite);
  };

  const applyAvatarVisual = (
    sprite: import("phaser").GameObjects.Sprite,
    avatar: Pick<StudioVirtualSpacePeer["state"], "avatarIndex" | "appearance">,
    nextFacing: StudioVirtualSpaceFacing,
    nextState: StudioCharacterMotionState,
    identity?: string,
  ) => {
    // "lie"는 appearance clip 목록에 없다(트랙1이 lie 시트를 추가하면 연결).
    // resolver에는 "idle"로 요청하고, 비주얼 상태는 "lie"로 유지한다.
    const resolved = resolveStudioCharacterAppearance(avatar, identity,
      nextState === "walk" ? `walk-${nextFacing}` : nextState === "lie" ? "idle" : nextState);
    const state = nextState === "lie" ? "lie"
      : resolved.clip.startsWith("walk-") ? "walk" : resolved.clip as StudioCharacterMotionState;
    sprite.setData("appearanceIssues", resolved.issues);
    // 로컬 아바타는 활성 커스텀 시트 스킨을 우선한다 (피어는 프로시저럴 유지).
    const selfSkin = identity === deps.identityRef.current ? deps.getSelfCustomSheetSkin() : null;
    applySpriteVisual(sprite, selfSkin ?? studioCharacterSkinForArtStyle(resolved.skin, artStyle), nextFacing, state);
  };

  return { ensureWalkAnimation, updateDisplaySize, hasStaticAsset, applySpriteVisual, applyAvatarVisual };
}
