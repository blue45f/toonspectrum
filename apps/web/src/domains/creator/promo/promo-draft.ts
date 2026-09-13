import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { parsePromoProject, type PromoProject } from "./promo-model";

interface Draft { project: PromoProject; revision: number; updatedAt: number }
function openDraft(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("이 브라우저는 로컬 초안 저장을 지원하지 않아요.")); return; }
    const request = indexedDB.open("toonstudio-promo-drafts", 1);
    let ended = false;
    const timeout = setTimeout(() => { ended = true; reject(new Error("초안 저장소를 열지 못했어요. JSON으로 백업하세요.")); }, 4000);
    request.onupgradeneeded = () => { request.result.createObjectStore("drafts"); };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (ended) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
  });
}
export async function loadPromoDraft(): Promise<Draft | null> {
  const db = await openDraft();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readonly");
      const request = tx.objectStore("drafts").get("current");
      let draft: Draft | null = null;
      request.onsuccess = () => {
        try {
          const value = request.result as Draft | undefined;
          if (value) {
            if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("초안 버전 정보가 손상되었어요.");
            draft = { ...value, project: parsePromoProject(value.project) };
          }
        } catch (error) { tx.abort(); reject(error); }
      };
      tx.oncomplete = () => resolve(draft);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("초안을 읽지 못했어요."));
    });
  } finally { db.close(); }
}
/** Compare-and-swap prevents two open tabs silently overwriting one another. */
export async function savePromoDraft(project: PromoProject, expectedRevision: number): Promise<number> {
  const checked = parsePromoProject(project);
  const db = await openDraft();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      const request = store.get("current");
      request.onsuccess = () => {
        const current = request.result as Draft | undefined;
        if ((current?.revision ?? 0) !== expectedRevision) {
          tx.abort(); reject(new Error("다른 탭에서 초안을 변경했어요. 현재 편집을 JSON으로 저장한 후 새로고침하세요.")); return;
        }
        store.put({ project: checked, revision: expectedRevision + 1, updatedAt: Date.now() } satisfies Draft, "current");
      };
      tx.oncomplete = () => resolve(expectedRevision + 1);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("초안 저장에 실패했어요. JSON으로 백업하세요."));
    });
  } finally { db.close(); }
}
export function usePromoDraft(project: PromoProject, setProject: Dispatch<SetStateAction<PromoProject>>) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("로컬 초안 확인 중…");
  const revision = useRef(0);
  const saved = useRef<PromoProject | null>(null);
  const enabled = useRef(true);
  const chain = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void loadPromoDraft().then((draft) => {
      if (!active) return;
      if (draft) { revision.current = draft.revision; saved.current = draft.project; setProject(draft.project); }
      setStatus(draft ? "이 브라우저의 이전 초안을 복원했어요." : "편집 내용은 이 브라우저에 자동 저장됩니다.");
      setReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      enabled.current = false;
      setStatus(error instanceof Error ? error.message : "초안 저장을 사용할 수 없어요. JSON으로 백업하세요.");
      setReady(true);
    });
    return () => { active = false; };
  }, [setProject]);
  useEffect(() => {
    if (!ready || !enabled.current || saved.current === project || (!project.panels.length && saved.current === null)) return;
    let active = true;
    setStatus("초안 저장 대기 중…");
    const timer = setTimeout(() => {
      chain.current = chain.current.then(async () => {
        if (!active || !enabled.current) return;
        try {
          revision.current = await savePromoDraft(project, revision.current);
          saved.current = project;
          if (active) setStatus("초안 자동 저장됨 · 이 브라우저에만 보관");
        } catch (error) {
          enabled.current = false;
          setStatus(error instanceof Error ? error.message : "초안을 저장하지 못했어요. JSON으로 백업하세요.");
        }
      });
    }, 700);
    return () => { active = false; clearTimeout(timer); };
  }, [ready, project]);
  return { ready, status };
}
