import type { StudioMainMenuItem } from "../studio-main-menu-model";

/**
 * Preserve every canonical File command while presenting the lifecycle as
 * save → import/project → backup/export → optional publication.
 */
export function applyStudioSaveFirstFileMenu(
  items: readonly StudioMainMenuItem[],
): StudioMainMenuItem[] {
  const save = items.find((item) => item.id === "save-draft");
  const publish = items.find((item) => item.id === "publish");
  const middle = items.filter((item) => item.id !== "save-draft" && item.id !== "publish");
  const result: StudioMainMenuItem[] = [];

  if (save) {
    result.push({
      ...save,
      label: save.label === "공동 저장" ? "공동 저장" : "저장하기",
      separatorAfter: true,
    });
  }

  result.push(...middle);

  if (publish) {
    const lastMiddle = result.at(-1);
    if (lastMiddle && !lastMiddle.separatorAfter) {
      result[result.length - 1] = { ...lastMiddle, separatorAfter: true };
    }
    result.push({
      ...publish,
      label: publish.label === "수정 게시"
        ? "ToonSpectrum 게시 수정…"
        : "ToonSpectrum에 게시…",
      separatorAfter: false,
    });
  }

  return result;
}
