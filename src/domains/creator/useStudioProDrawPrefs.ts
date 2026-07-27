import { useEffect, useRef, useState } from "react";

import {
  loadStudioProDrawPrefs,
  mutateStudioProDrawPrefs,
  STUDIO_PRO_DRAW_PREFS_KEY,
  studioProDrawStorage,
  toggleFavoriteBrushId,
  type StudioProDrawPrefs,
} from "./studio-pro-draw-prefs";

export type StudioProDrawPrefsMutation = (
  latest: StudioProDrawPrefs,
) => StudioProDrawPrefs;

/**
 * Owns the cross-tab-aware preference seam outside the Studio coordinator.
 *
 * Every normal mutation first reloads the freshest persisted snapshot, preventing sequential
 * stale-tab overwrites. localStorage itself remains last-writer-wins for truly simultaneous tabs.
 */
export function useStudioProDrawPrefs() {
  const [proDrawPrefs, setProDrawPrefs] = useState<StudioProDrawPrefs>(() =>
    loadStudioProDrawPrefs(studioProDrawStorage())
  );
  const proDrawPrefsRef = useRef(proDrawPrefs);
  const proDrawPrefsStorageDirtyRef = useRef(false);
  proDrawPrefsRef.current = proDrawPrefs;

  function commitProDrawPrefsMutation(mutate: StudioProDrawPrefsMutation) {
    const result = mutateStudioProDrawPrefs(
      studioProDrawStorage(),
      proDrawPrefsRef.current,
      mutate,
      { preferCurrent: proDrawPrefsStorageDirtyRef.current },
    );
    proDrawPrefsStorageDirtyRef.current = !result.persisted;
    proDrawPrefsRef.current = result.prefs;
    setProDrawPrefs(result.prefs);
    return result;
  }

  function toggleProDrawFavorite(
    brushId: string,
    announce: (message: string) => void,
  ): void {
    const result = commitProDrawPrefsMutation(
      (latest) => toggleFavoriteBrushId(latest, brushId),
    );
    const favorite = result.prefs.favoriteBrushIds.includes(brushId);
    if (result.persisted) {
      announce(favorite ? "즐겨찾기 추가" : "즐겨찾기 해제");
      return;
    }
    announce(
      favorite
        ? "즐겨찾기는 현재 탭에 추가했지만 브라우저 저장소에는 기록하지 못했어요."
        : "즐겨찾기는 현재 탭에서 해제했지만 브라우저 저장소에는 기록하지 못했어요.",
    );
  }

  useEffect(() => {
    function onStudioProDrawPrefsStorage(event: StorageEvent) {
      if (event.key !== STUDIO_PRO_DRAW_PREFS_KEY && event.key !== null) return;
      // A remote stale payload must not erase a favorite that this tab could not persist yet.
      if (proDrawPrefsStorageDirtyRef.current) return;
      const next = loadStudioProDrawPrefs(studioProDrawStorage());
      proDrawPrefsRef.current = next;
      setProDrawPrefs(next);
    }
    globalThis.addEventListener?.("storage", onStudioProDrawPrefsStorage);
    return () => globalThis.removeEventListener?.("storage", onStudioProDrawPrefsStorage);
  }, []);

  return {
    proDrawPrefs,
    commitProDrawPrefsMutation,
    toggleProDrawFavorite,
  };
}
