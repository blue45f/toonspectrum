// 캐릭터 캐논 라이브러리의 React 바인딩.
// 게스트는 localStorage에만 쓰고, 로그인 상태에서는 서버에 write-through 한다.
// 저장·갤러리 같은 실제 동작은 studio-character-canon.ts의 순수 함수에 두고
// 이 훅은 브라우저 저장소 연결과 로그인 감지만 맡는다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useApp } from "@/shared/lib/store";

import {
  buildCharacterCanonSheet,
  canonPanelUsageForCharacter,
  characterCanonSheetById,
  emptyCharacterCanonDocument,
  loadCharacterCanonDocument,
  recordCanonPanelUsage,
  removeCharacterCanonSheet,
  saveCharacterCanonDocument,
  syncCharacterCanonToServer,
  touchCharacterCanonSheet,
  upsertCharacterCanonSheet,
  validateCanonSheetDraft,
  type CanonPanelUsage,
  type CanonSheetDraft,
  type CanonStorage,
  type CharacterCanonDocument,
} from "./studio-character-canon";

function browserCanonStorage(): CanonStorage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

/** AI 코믹 디렉터 세션 문서에서 패널 썸네일을 찾아온다(갤러리용). */
export function loadCanonPanelThumbnail(
  storage: Pick<CanonStorage, "getItem">,
  sessionId: string,
  panelIndex: number,
): string | null {
  if (!sessionId) return null;
  try {
    const raw = storage.getItem(
      `toonspectrum:studio-ai-comic-director:${sessionId}`,
    );
    if (!raw) return null;
    const document = JSON.parse(raw) as {
      readonly scenes?: readonly { readonly imageDataUrl?: unknown }[];
    };
    const scene = document.scenes?.[panelIndex];
    return typeof scene?.imageDataUrl === "string" && scene.imageDataUrl
      ? scene.imageDataUrl
      : null;
  } catch {
    return null;
  }
}

export function useStudioCharacterCanon() {
  const userId = useApp((state) => state.userId);
  const [document, setDocument] = useState<CharacterCanonDocument>(() =>
    loadCharacterCanonDocument(browserCanonStorage()),
  );
  // setState 업데이터는 늦게 실행될 수 있어서, 저장 결과를 동기적으로 만들려면
  // 최신 문서를 ref로 함께 추적한다.
  const documentRef = useRef(document);

  // 문서가 바뀔 때마다 로컬에 저장하고, 로그인 상태면 서버에도 밀어 넣는다.
  useEffect(() => {
    const storage = browserCanonStorage();
    saveCharacterCanonDocument(storage, document);
    syncCharacterCanonToServer(document, userId);
    documentRef.current = document;
  }, [document, userId]);

  const saveSheet = useCallback(
    (draft: CanonSheetDraft, editingId?: string | null) => {
      const errors = validateCanonSheetDraft(draft);
      if (errors.length > 0) return { ok: false as const, errors };
      const current = documentRef.current;
      const existing = editingId
        ? characterCanonSheetById(current, editingId)
        : null;
      const saved = existing
        ? touchCharacterCanonSheet(existing, draft)
        : buildCharacterCanonSheet(draft);
      documentRef.current = upsertCharacterCanonSheet(current, saved);
      setDocument(documentRef.current);
      return { ok: true as const, sheet: saved };
    },
    [],
  );

  const deleteSheet = useCallback((sheetId: string) => {
    documentRef.current = removeCharacterCanonSheet(
      documentRef.current,
      sheetId,
    );
    setDocument(documentRef.current);
  }, []);

  const recordUsage = useCallback(
    (
      record: Omit<CanonPanelUsage, "id" | "injectedAt"> & {
        readonly injectedAt?: string;
      },
    ) => {
      documentRef.current = recordCanonPanelUsage(documentRef.current, {
        ...record,
        injectedAt: record.injectedAt ?? new Date().toISOString(),
      });
      setDocument(documentRef.current);
    },
    [],
  );

  const usageForCharacter = useCallback(
    (characterId: string) => canonPanelUsageForCharacter(document, characterId),
    [document],
  );

  const sheets = useMemo(() => document.sheets, [document]);
  const usageCount = document.usage.length;

  return {
    sheets,
    usageCount,
    isGuest: userId === null,
    saveSheet,
    deleteSheet,
    recordUsage,
    usageForCharacter,
    sheetById: useCallback(
      (sheetId: string) => characterCanonSheetById(document, sheetId),
      [document],
    ),
    /** 테스트·외부 동기화용 이스케이프 해치. */
    replaceDocument: setDocument,
    empty: emptyCharacterCanonDocument(),
  };
}
