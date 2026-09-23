/**
 * Photo-tab grade twin sync policy: the grade session may advance only after the host
 * bone write succeeds. Keeping this pure makes the ordering contract unit-testable.
 */
export function shouldSyncGradePoseAfterPhotoApply(hostApplied: boolean): boolean {
  return hostApplied === true;
}
