/** No request occurs until an explicit session opening or retry. */
export function loadStudioWorkSessionWorkspace() {
  return import("./StudioWorkSessionWorkspace").then((module) => ({ default: module.StudioWorkSessionWorkspace }));
}
