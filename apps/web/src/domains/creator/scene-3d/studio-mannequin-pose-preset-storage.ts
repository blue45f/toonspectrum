/**
 * 데생 인형 포즈 프리셋 즐겨찾기(핀)·최근 사용 목록 localStorage 저장소.
 *
 * 포저 패널의 포즈 라이브러리 섹션에서 사용한다. 동작은 공용 팩토리
 * (studio-pose-preset-storage)와 같은 계약을 따른다.
 */

import {
  createStudioPosePresetStorage,
  STUDIO_POSE_PRESET_MAX_RECENT_DEFAULT,
} from "./studio-pose-preset-storage";

const mannequinPosePresetStorage = createStudioPosePresetStorage(
  "mannequin-pose-preset",
  STUDIO_POSE_PRESET_MAX_RECENT_DEFAULT,
);

/** 최근 사용 목록 최대 보관 개수. */
export const MANNEQUIN_POSE_PRESET_MAX_RECENT = STUDIO_POSE_PRESET_MAX_RECENT_DEFAULT;

/** 즐겨찾기(핀) 프리셋 id 목록을 읽는다. */
export const readMannequinPosePresetFavorites = mannequinPosePresetStorage.readFavorites;

/** 즐겨찾기를 토글하고 갱신된 id 목록을 돌려준다. */
export const toggleMannequinPosePresetFavorite = mannequinPosePresetStorage.toggleFavorite;

/** 즐겨찾기 목록을 통째로 덮어쓴다. */
export const writeMannequinPosePresetFavorites = mannequinPosePresetStorage.writeFavorites;

/** 최근 사용 프리셋 id 목록(최신 순)을 읽는다. */
export const readMannequinPosePresetRecent = mannequinPosePresetStorage.readRecent;

/** 최근 사용 목록 맨 앞에 기록하고 갱신된 목록을 돌려준다. */
export const recordMannequinPosePresetRecent = mannequinPosePresetStorage.recordRecent;

/** 최근 사용 목록을 비운다. */
export const clearMannequinPosePresetRecent = mannequinPosePresetStorage.clearRecent;
