/** Local playback priority only. This store carries no media, audience or permissions. */
const owners = new Set<symbol>();
const listeners = new Set<() => void>();
export const studioHuddleAudioFocusSnapshot = (): boolean => owners.size > 0;
export function subscribeStudioHuddleAudioFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function acquireStudioHuddleAudioFocus(): () => void {
  const owner = Symbol("joined-huddle");
  const wasActive = owners.size > 0;
  owners.add(owner);
  if (!wasActive) for (const listener of listeners) listener();
  return () => {
    if (owners.delete(owner) && owners.size === 0) for (const listener of listeners) listener();
  };
}
