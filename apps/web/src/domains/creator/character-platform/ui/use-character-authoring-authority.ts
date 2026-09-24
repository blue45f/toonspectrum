import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  CharacterAuthoringAuthority,
  type CharacterAuthoringCommand,
  type CharacterAuthoringReceipt,
} from "../application/character-authoring-authority";
import {
  getCharacterDocumentV3Repository,
  type CharacterDocumentV3Repository,
} from "../document/character-document-v3-repository";
import {
  parseCharacterDocumentV3,
  serializeCharacterDocumentV3,
  type CharacterDocumentV3,
} from "../document/character-document-v3";

export type CharacterAuthoringPersistenceStatus =
  | "loading"
  | "ready"
  | "saving"
  | "saved"
  | "error";

export interface UseCharacterAuthoringAuthorityOptions {
  readonly repository?: CharacterDocumentV3Repository;
  readonly autosave?: boolean;
}

export interface CharacterAuthoringAuthorityHookResult {
  readonly authority: CharacterAuthoringAuthority;
  readonly snapshot: ReturnType<CharacterAuthoringAuthority["getSnapshot"]>;
  readonly persistenceStatus: CharacterAuthoringPersistenceStatus;
  readonly persistenceError: string | null;
  readonly hydrated: boolean;
  readonly dispatch: (command: CharacterAuthoringCommand) => CharacterAuthoringReceipt;
  readonly beginPreview: (command: CharacterAuthoringCommand) => CharacterAuthoringReceipt;
  readonly cancelPreview: () => boolean;
  readonly commitPreview: () => CharacterAuthoringReceipt | null;
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly exportJson: () => string;
  readonly importJson: (raw: string) => Promise<boolean>;
  readonly saveNow: () => Promise<boolean>;
}

function lastCompatibilityFingerprint(document: CharacterDocumentV3): string | null {
  const receipt = [...document.sourceReceipts].reverse().find((item) =>
    item.kind === "compatibility-projection"
  );
  return typeof receipt?.sourceFingerprint === "string"
    ? receipt.sourceFingerprint
    : null;
}

function syncCommand(
  current: CharacterDocumentV3,
  projection: CharacterDocumentV3,
  sourceFingerprint: string,
  sequence: number,
): CharacterAuthoringCommand {
  return {
    commandId: `character.compatibility-sync/${sequence}`,
    label: "호환 런타임 상태 동기화",
    source: "system",
    expectedDocumentId: current.documentId,
    expectedRevision: current.revision,
    operations: [{
      kind: "sync-compatibility-projection",
      projection,
      sourceFingerprint,
    }],
  };
}

export function useCharacterAuthoringAuthority(
  projection: CharacterDocumentV3,
  sourceFingerprint: string,
  options: UseCharacterAuthoringAuthorityOptions = {},
): CharacterAuthoringAuthorityHookResult {
  const repository = options.repository ?? getCharacterDocumentV3Repository();
  const autosave = options.autosave !== false;
  const holder = useRef<{
    readonly documentId: string;
    readonly authority: CharacterAuthoringAuthority;
  } | null>(null);
  if (!holder.current || holder.current.documentId !== projection.documentId) {
    holder.current = {
      documentId: projection.documentId,
      authority: new CharacterAuthoringAuthority(projection),
    };
  }
  const authority = holder.current.authority;
  const projectionRef = useRef(projection);
  projectionRef.current = projection;
  const fingerprintRef = useRef(sourceFingerprint);
  fingerprintRef.current = sourceFingerprint;
  const [hydrated, setHydrated] = useState(false);
  const [persistenceStatus, setPersistenceStatus] =
    useState<CharacterAuthoringPersistenceStatus>("loading");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const syncSequenceRef = useRef(1);
  const saveGenerationRef = useRef(0);

  const snapshot = useSyncExternalStore(
    authority.subscribe,
    authority.getSnapshot,
    authority.getSnapshot,
  );

  useEffect(() => {
    const generation = ++generationRef.current;
    let active = true;
    setHydrated(false);
    setPersistenceStatus("loading");
    setPersistenceError(null);
    void repository.load(projection.documentId).then((stored) => {
      if (!active || generation !== generationRef.current) return;
      authority.replaceDocument(stored ?? projectionRef.current);
      const current = authority.getSnapshot().document;
      const fingerprint = fingerprintRef.current;
      if (lastCompatibilityFingerprint(current) !== fingerprint) {
        authority.dispatch(syncCommand(
          current,
          projectionRef.current,
          fingerprint,
          syncSequenceRef.current++,
        ));
      }
      setHydrated(true);
      setPersistenceStatus(stored ? "ready" : "saved");
      setPersistenceError(null);
    }).catch((error: unknown) => {
      if (!active || generation !== generationRef.current) return;
      authority.replaceDocument(projectionRef.current);
      const current = authority.getSnapshot().document;
      authority.dispatch(syncCommand(
        current,
        projectionRef.current,
        fingerprintRef.current,
        syncSequenceRef.current++,
      ));
      setHydrated(true);
      setPersistenceStatus("error");
      setPersistenceError(
        error instanceof Error ? error.message : "캐릭터 V3 문서를 복원하지 못했습니다.",
      );
    });
    return () => { active = false; };
  }, [authority, projection.documentId, repository]);

  useEffect(() => {
    if (!hydrated) return;
    const current = authority.getSnapshot().document;
    const fingerprint = fingerprintRef.current;
    if (lastCompatibilityFingerprint(current) === fingerprint) return;
    authority.dispatch(syncCommand(
      current,
      projectionRef.current,
      fingerprint,
      syncSequenceRef.current++,
    ));
  }, [authority, hydrated, sourceFingerprint, projection]);

  const persist = useCallback(async (): Promise<boolean> => {
    const generation = ++saveGenerationRef.current;
    setPersistenceStatus("saving");
    try {
      await repository.save(authority.getSnapshot().document);
      if (generation !== saveGenerationRef.current) return false;
      setPersistenceStatus("saved");
      setPersistenceError(null);
      return true;
    } catch (error) {
      if (generation !== saveGenerationRef.current) return false;
      setPersistenceStatus("error");
      setPersistenceError(
        error instanceof Error ? error.message : "캐릭터 V3 문서를 저장하지 못했습니다.",
      );
      return false;
    }
  }, [authority, repository]);

  const persistedRevisionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!hydrated || !autosave) return;
    if (persistedRevisionRef.current === snapshot.document.revision) return;
    persistedRevisionRef.current = snapshot.document.revision;
    const timeout = window.setTimeout(() => { void persist(); }, 120);
    return () => window.clearTimeout(timeout);
  }, [autosave, hydrated, persist, snapshot.document.revision]);

  const importJson = useCallback(async (raw: string): Promise<boolean> => {
    try {
      const document = parseCharacterDocumentV3(JSON.parse(raw));
      if (document.documentId !== authority.getSnapshot().document.documentId) {
        throw new Error("현재 캐릭터와 다른 CharacterDocument V3입니다.");
      }
      authority.replaceDocument(document);
      const saved = await persist();
      return saved;
    } catch (error) {
      setPersistenceStatus("error");
      setPersistenceError(
        error instanceof Error ? error.message : "CharacterDocument V3를 불러오지 못했습니다.",
      );
      return false;
    }
  }, [authority, persist]);

  return useMemo(() => Object.freeze({
    authority,
    snapshot,
    persistenceStatus,
    persistenceError,
    hydrated,
    dispatch: (command: CharacterAuthoringCommand) => authority.dispatch(command),
    beginPreview: (command: CharacterAuthoringCommand) => authority.beginPreview(command),
    cancelPreview: () => authority.cancelPreview(),
    commitPreview: () => authority.commitPreview(),
    undo: () => authority.undo(),
    redo: () => authority.redo(),
    exportJson: () => serializeCharacterDocumentV3(authority.getSnapshot().document),
    importJson,
    saveNow: persist,
  }), [
    authority,
    hydrated,
    importJson,
    persist,
    persistenceError,
    persistenceStatus,
    snapshot,
  ]);
}
