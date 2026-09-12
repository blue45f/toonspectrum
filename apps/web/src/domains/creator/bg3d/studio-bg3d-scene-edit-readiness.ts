/** Engine admission is earlier than renderer creation and initial document restoration. */
export function isStudioBg3dSceneEditReady(host: {
  readonly open: boolean;
  readonly modelRenderer: unknown;
  readonly isRestoringScene: boolean;
}): boolean {
  return host.open && host.modelRenderer != null && !host.isRestoringScene;
}
