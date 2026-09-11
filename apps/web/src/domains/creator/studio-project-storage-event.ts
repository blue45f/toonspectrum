export function matchesStudioProjectStorageEvent(
  eventKey: string | null,
  projectStorageKey: string,
): boolean {
  if (!projectStorageKey) {
    throw new Error("A project storage key is required.");
  }
  return eventKey === null || eventKey === projectStorageKey;
}
