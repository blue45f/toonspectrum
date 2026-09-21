/** Authoring is optional; viewing a live world never loads the editor or template packaging UI. */
export function loadStudioWorldAuthoring() {
  return import("./StudioVirtualSpaceWorldAuthoringPanel").then((module) => ({ default: module.StudioVirtualSpaceWorldAuthoringPanel }));
}
