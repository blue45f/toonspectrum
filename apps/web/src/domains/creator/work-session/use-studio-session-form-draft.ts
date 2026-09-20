import { useState } from "react";

/** Mounted under the actor/work/session key; keeps unsent text across failed requests in this tab only. */
export function useStudioSessionFormDraft(key: string, limit: number) {
  const [value, setValue] = useState(() => {
    try { return (window.sessionStorage.getItem(key) ?? "").slice(0, limit); } catch { return ""; }
  });
  const [storageError, setStorageError] = useState(false);
  const update = (next: string) => {
    const text = next.slice(0, limit); setValue(text);
    try {
      if (text) window.sessionStorage.setItem(key, text); else window.sessionStorage.removeItem(key);
      setStorageError(false);
    } catch { setStorageError(true); }
  };
  return [value, update, storageError] as const;
}
