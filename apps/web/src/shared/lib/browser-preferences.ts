/** Storage is optional in embedded browsers, private sessions and blocked origins. */
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
export type StorageResolver = () => PreferenceStorage | undefined;

export function readBrowserPreference(resolve: StorageResolver, key: string): string | null {
  try {
    return resolve()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeBrowserPreference(resolve: StorageResolver, key: string, value: string): boolean {
  try {
    const storage = resolve();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
