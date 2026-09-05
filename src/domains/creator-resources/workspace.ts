import { useCallback, useEffect, useState } from "react";

import { emptyWorkspace, parseWorkspace } from "@/lib/creator-resources";

import type { CreatorWorkspace } from "@/lib/creator-resources";

const KEY = "toonstudio.creator-resources.v1";
const EVENT = "toonstudio:creator-resources";
function readWorkspace() { return parseWorkspace(window.localStorage.getItem(KEY)); }
export function useCreatorWorkspace() {
  const [workspace, setWorkspace] = useState<CreatorWorkspace>(emptyWorkspace);
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => {
      try { setWorkspace(readWorkspace()); setError(""); }
      catch { setError("저장 보드를 읽을 수 없습니다. 기존 데이터는 덮어쓰지 않습니다. 브라우저 저장소 설정을 확인하세요."); }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) sync(); };
    sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, sync);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, sync); };
  }, []);
  const update = useCallback((change: (value: CreatorWorkspace) => CreatorWorkspace): boolean => {
    try {
      // Re-read before each mutation so other mounted pages and tabs do not overwrite a stale snapshot.
      const next = parseWorkspace(JSON.stringify(change(readWorkspace())));
      window.localStorage.setItem(KEY, JSON.stringify(next));
      setWorkspace(next); setError(""); window.dispatchEvent(new Event(EVENT));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.");
      return false;
    }
  }, []);
  const restore = useCallback((raw: string): boolean => {
    try {
      const next = parseWorkspace(raw);
      window.localStorage.setItem(KEY, JSON.stringify(next));
      setWorkspace(next); setError(""); window.dispatchEvent(new Event(EVENT));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "백업을 복원하지 못했습니다.");
      return false;
    }
  }, []);
  return { workspace, update, restore, error };
}
export function downloadText(filename: string, content: string, mime = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
