import { useCallback, useEffect, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  readStudioVirtualArtStyle,
  writeStudioVirtualArtStyle,
  type StudioVirtualArtStyleKey,
} from "../studio-virtual-space-art-style";
import {
  readStudioVirtualCharacterCustomization,
  readStudioVirtualDecorationState,
  writeStudioVirtualCharacterCustomization,
  writeStudioVirtualDecorationState,
  type StudioVirtualCharacterCustomization,
  type StudioVirtualDecorationState,
} from "../studio-virtual-space-customization";
import { studioVirtualSpaceDecorationSync, studioVirtualSpaceSyncEnabled } from "../studio-virtual-space-decoration-sync-gate";
import {
  readStudioVirtualEnvironmentPreference,
  writeStudioVirtualEnvironmentPreference,
  type StudioVirtualEnvironmentPreference,
} from "../studio-virtual-space-environment-preference";
import {
  readStudioVirtualExperiencePreference,
  writeStudioVirtualExperiencePreference,
  type StudioVirtualExperiencePreference,
} from "../studio-virtual-space-experience-preference";
import {
  readStudioSpaceTheme,
  writeStudioSpaceTheme,
  type StudioSpaceThemeKey,
} from "../studio-virtual-space-theme";
import {
  applyStudioVirtualReward,
  readStudioVirtualRewardInventory,
  unlockStudioVirtualReward,
  writeStudioVirtualRewardInventory,
  type StudioVirtualRewardId,
  type StudioVirtualRewardInventory,
} from "../studio-virtual-space-rewards";
import { studioDistrictEnvironment } from "../studio-virtual-space-scene-direction";

/**
 * 이 브라우저에 저장하는 개인 설정(아트 스타일·캐릭터 꾸미기·보상·경험·환경·공간 꾸미기).
 * 저장 실패는 적용은 유지하고 notify로 알린다. 새 저장 키는 만들지 않는다.
 */
export function useSpacePreferences({ initialArtStyle, decorationScope, notify }: {
  readonly initialArtStyle?: StudioVirtualArtStyleKey;
  readonly decorationScope: string;
  readonly notify: (message: string, tone?: "info" | "warn") => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceExperience");
  const [artStyle, setArtStyle] = useState<StudioVirtualArtStyleKey>(() => initialArtStyle ?? readStudioVirtualArtStyle());
  const selectArtStyle = useCallback((next: StudioVirtualArtStyleKey) => {
    setArtStyle(next);
    writeStudioVirtualArtStyle(next);
  }, []);

  const [characterCustomization, setCharacterCustomization] = useState<StudioVirtualCharacterCustomization>(
    () => readStudioVirtualCharacterCustomization(),
  );
  const selectCharacterCustomization = useCallback((next: StudioVirtualCharacterCustomization) => {
    setCharacterCustomization(next);
    writeStudioVirtualCharacterCustomization(next);
  }, []);

  const [rewardInventory, setRewardInventory] = useState<StudioVirtualRewardInventory>(() => readStudioVirtualRewardInventory());
  // 상태 갱신 함수 안에서 저장하지 않는다(갱신 함수는 순수해야 한다).
  const claimReward = useCallback((id: StudioVirtualRewardId) => {
    const next = unlockStudioVirtualReward(rewardInventory, id);
    setRewardInventory(next);
    writeStudioVirtualRewardInventory(next);
  }, [rewardInventory]);
  const equipReward = useCallback((id: StudioVirtualRewardId) => {
    const next = applyStudioVirtualReward(characterCustomization, id);
    setCharacterCustomization(next);
    writeStudioVirtualCharacterCustomization(next);
  }, [characterCustomization]);

  const [initialExperiencePreference] = useState(readStudioVirtualExperiencePreference);
  const [experiencePreference, setExperiencePreference] = useState<StudioVirtualExperiencePreference>(initialExperiencePreference);
  const selectExperiencePreference = useCallback((next: StudioVirtualExperiencePreference) => {
    setExperiencePreference(next);
    writeStudioVirtualExperiencePreference(next);
  }, []);

  const [environmentPreference, setEnvironmentPreference] = useState<StudioVirtualEnvironmentPreference>(
    () => readStudioVirtualEnvironmentPreference(),
  );
  const selectEnvironmentPreference = useCallback((next: StudioVirtualEnvironmentPreference) => {
    setEnvironmentPreference(next);
    writeStudioVirtualEnvironmentPreference(next);
  }, []);

  const [spaceTheme, setSpaceTheme] = useState<StudioSpaceThemeKey>(() => readStudioSpaceTheme());
  const selectSpaceTheme = useCallback((next: StudioSpaceThemeKey) => {
    setSpaceTheme(next);
    writeStudioSpaceTheme(next);
  }, []);

  const spaceSyncEnabled = studioVirtualSpaceSyncEnabled();
  const [decorationDrafts, setDecorationDrafts] = useState<ReadonlyMap<string, StudioVirtualDecorationState>>(() => new Map());
  const initialDecorations = useMemo(() => readStudioVirtualDecorationState(decorationScope), [decorationScope]);
  const decorations = decorationDrafts.get(decorationScope) ?? initialDecorations;
  const selectDecorations = useCallback((next: StudioVirtualDecorationState) => {
    setDecorationDrafts((current) => new Map(current).set(decorationScope, next));
    if (!writeStudioVirtualDecorationState(next, decorationScope)) {
      notify(bt("공간 변경은 적용됐지만 이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.", "Space changes are applied, but could not be saved on this device. Check available storage."), "warn");
    }
    if (next.districtKey !== decorations.districtKey) selectEnvironmentPreference(studioDistrictEnvironment(next.districtKey));
    if (spaceSyncEnabled) {
      void studioVirtualSpaceDecorationSync()
        .save(decorationScope, next.districtKey, next)
        .then((result) => {
          // 다른 기기가 먼저 저장했으면 조용히 덮어쓰지 않고 알려 준다.
          if (result.status === "conflict") {
            notify(bt("다른 기기에서 이 공간을 먼저 바꿔서 여기 저장은 하지 않았어요.", "Another device changed this space first, so this change was not saved."), "warn");
          }
        });
    }
  }, [bt, decorationScope, decorations.districtKey, notify, selectEnvironmentPreference, spaceSyncEnabled]);
  useEffect(() => {
    if (!spaceSyncEnabled) return undefined;
    let cancelled = false;
    void studioVirtualSpaceDecorationSync()
      .load(decorationScope, initialDecorations.districtKey)
      .then((result) => {
        if (cancelled || result.status !== "server") return;
        setDecorationDrafts((current) => new Map(current).set(decorationScope, result.state));
      });
    return () => { cancelled = true; };
  }, [decorationScope, initialDecorations.districtKey, spaceSyncEnabled]);

  return {
    artStyle, selectArtStyle,
    characterCustomization, selectCharacterCustomization,
    rewardInventory, claimReward, equipReward,
    initialExperiencePreference, experiencePreference, selectExperiencePreference,
    environmentPreference, selectEnvironmentPreference,
    spaceTheme, selectSpaceTheme,
    decorations, selectDecorations,
  };
}
