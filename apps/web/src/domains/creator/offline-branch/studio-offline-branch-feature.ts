export function studioAutomergeOfflineBranchEnabled(
  value = import.meta.env.VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH,
): boolean {
  return value === "1" || value === "true";
}
