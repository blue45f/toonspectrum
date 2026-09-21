import type { StudioToolbarPreferences, StudioToolbarProfile } from "./studio-app-settings";

const comparableName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();

/** Creation and renaming share the same validation; imported historical names are not rewritten. */
export function studioToolbarProfileNameError(
  profiles: readonly StudioToolbarProfile[], name: string, exceptId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 48) return "구성 이름을 1~48자로 입력하세요.";
  if (profiles.some((profile) => profile.id !== exceptId && comparableName(profile.name) === comparableName(trimmed))) {
    return "같은 이름의 구성이 있습니다. 다른 이름을 입력하세요.";
  }
  return null;
}

export function studioToolbarProfileMatches(profile: StudioToolbarProfile, toolbar: StudioToolbarPreferences): boolean {
  return profile.view === (toolbar.view ?? "single") && profile.visibleIds.length === toolbar.visibleIds.length
    && profile.visibleIds.every((id, index) => id === toolbar.visibleIds[index]);
}
