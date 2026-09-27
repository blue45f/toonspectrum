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
  readonly enabled?: boolean;
  readonly synchronizeProjection?: boolean;
  readonly initializeDocument?: (projection: CharacterDocumentV3) => Promise<CharacterDocumentV3>;
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
  readonly retryRestore: () => void;
  readonly setRuntimeSyncPending: (owner: string, pending: boolean) => void;
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
  previousProjection?: CharacterDocumentV3,
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
      previousProjection,
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
  const enabled = options.enabled !== false;
  const initializeRef = useRef(options.initializeDocument);
  initializeRef.current = options.initializeDocument;
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
  const [hydrationOwner, setHydrationOwner] = useState<{
    readonly authority: CharacterAuthoringAuthority;
    readonly repository: CharacterDocumentV3Repository;
  } | null>(null);
  const hydrationRef = useRef<typeof hydrationOwner>(null);
  const hydrated = enabled && hydrationOwner?.authority === authority && hydrationOwner.repository === repository;
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const persistedDocumentRef = useRef<CharacterDocumentV3 | null>(null);
  const synchronizedFingerprintRef = useRef<string | null>(null);
  const synchronizedProjectionRef = useRef<CharacterDocumentV3 | null>(null);
  const runtimeSyncOwners = useRef(new Set<string>());
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
    ++saveGenerationRef.current;
    hydrationRef.current = null;
    persistedDocumentRef.current = null;
    synchronizedFingerprintRef.current = null;
    runtimeSyncOwners.current.clear();
    setHydrationOwner(null);
    setPersistenceStatus("loading");
    setPersistenceError(null);
    if (!enabled) return;
    void repository.load(projection.documentId).then(async (stored) => {
      if (!active || generation !== generationRef.current) return;
      const initial = stored ?? (initializeRef.current
        ? await initializeRef.current(projectionRef.current)
        : projectionRef.current);
      if (!active || generation !== generationRef.current) return;
      const fingerprint = fingerprintRef.current;
      authority.replaceDocument(!stored && lastCompatibilityFingerprint(initial) !== fingerprint
        ? { ...initial, sourceReceipts: [
          ...initial.sourceReceipts.filter((item) => item.kind !== "compatibility-projection"),
          { kind: "compatibility-projection", sourceFingerprint: fingerprint, sourceRevision: initial.revision },
        ] }
        : initial);
      synchronizedFingerprintRef.current = fingerprint;
      synchronizedProjectionRef.current = projectionRef.current;
      persistedDocumentRef.current = stored ? authority.getSnapshot().document : null;
      const owner = { authority, repository };
      hydrationRef.current = owner;
      setHydrationOwner(owner);
      // 저장 요청을 예약한 것과 실제로 저장된 것을 구분한다.
      setPersistenceStatus("ready");
      setPersistenceError(null);
    }).catch((error: unknown) => {
      if (!active || generation !== generationRef.current) return;
      // 원본을 읽지 못했을 때 기본값을 자동저장하면 복구 가능한 데이터를 잃는다.
      hydrationRef.current = null;
      setHydrationOwner(null);
      setPersistenceStatus("error");
      setPersistenceError(
        error instanceof Error ? error.message : "캐릭터 V3 문서를 복원하지 못했습니다.",
      );
    });
    return () => {
      active = false;
      // 소유권을 해제하면 이전 저장 결과가 현재 화면에 반영되지 않는다.
      hydrationRef.current = null;
    };
  }, [authority, enabled, projection.documentId, repository, restoreAttempt]);

  useEffect(() => {
    if (options.synchronizeProjection === false || !hydrated || snapshot.previewCommandId !== null || runtimeSyncOwners.current.size > 0) return;
    const fingerprint = fingerprintRef.current;
    if (synchronizedFingerprintRef.current === fingerprint) return;
    const current = authority.getSnapshot().document;
    const result = authority.dispatch(syncCommand(
      current, projectionRef.current, fingerprint, syncSequenceRef.current++,
      synchronizedProjectionRef.current ?? undefined,
    ));
    if (result.status === "applied" || result.status === "noop") {
      synchronizedFingerprintRef.current = fingerprint;
      synchronizedProjectionRef.current = projectionRef.current;
    }
  }, [authority, hydrated, sourceFingerprint, projection, snapshot.previewCommandId, options.synchronizeProjection]);

  const persist = useCallback(async (): Promise<boolean> => {
    const owner = hydrationRef.current;
    if (owner?.authority !== authority || owner.repository !== repository) return false;
    const document = authority.getSnapshot().document;
    const generation = ++saveGenerationRef.current;
    setPersistenceStatus("saving");
    try {
      await repository.save(document);
      if (generation !== saveGenerationRef.current || hydrationRef.current !== owner) return false;
      persistedDocumentRef.current = document;
      const currentSaved = authority.getSnapshot().document === document;
      setPersistenceStatus(currentSaved ? "saved" : "ready");
      setPersistenceError(null);
      return currentSaved;
    } catch (error) {
      if (generation !== saveGenerationRef.current || hydrationRef.current !== owner) return false;
      setPersistenceStatus("error");
      setPersistenceError(
        error instanceof Error ? error.message : "캐릭터 V3 문서를 저장하지 못했습니다.",
      );
      return false;
    }
  }, [authority, repository]);

  useEffect(() => {
    if (!hydrated || !autosave || persistedDocumentRef.current === snapshot.document) return;
    const timeout = window.setTimeout(() => { void persist(); }, 120);
    return () => window.clearTimeout(timeout);
  }, [autosave, hydrated, persist, snapshot.document]);

  const importJson = useCallback(async (raw: string): Promise<boolean> => {
    const owner = hydrationRef.current;
    if (owner?.authority !== authority || owner.repository !== repository) return false;
    try {
      const document = parseCharacterDocumentV3(JSON.parse(raw));
      const current = authority.getSnapshot().document;
      if (document.documentId !== current.documentId) {
        throw new Error("현재 캐릭터와 다른 CharacterDocument V3입니다.");
      }
      const result = authority.dispatch({
        commandId: `character.restore/${syncSequenceRef.current++}`,
        label: "캐릭터 백업 복원",
        source: "user",
        expectedDocumentId: current.documentId,
        expectedRevision: current.revision,
        operations: [{ kind: "restore-document", document }],
      });
      if (result.status !== "applied" && result.status !== "noop") {
        throw new Error(result.reason ?? "캐릭터 백업을 복원하지 못했습니다.");
      }
      return await persist();
    } catch (error) {
      if (hydrationRef.current !== owner) return false;
      setPersistenceStatus("error");
      setPersistenceError(
        error instanceof Error ? error.message : "CharacterDocument V3를 불러오지 못했습니다.",
      );
      return false;
    }
  }, [authority, persist, repository]);

  const retryRestore = useCallback(() => setRestoreAttempt((attempt) => attempt + 1), []);
  const setRuntimeSyncPending = useCallback((owner: string, pending: boolean) => {
    if (pending) runtimeSyncOwners.current.add(owner);
    else {
      runtimeSyncOwners.current.delete(owner);
      // 런타임 복원 결과는 새로운 사용자 편집이 아니다.
      synchronizedProjectionRef.current = projectionRef.current;
      synchronizedFingerprintRef.current = fingerprintRef.current;
    }
  }, []);
  const visiblePersistenceStatus = persistenceStatus === "saved"
    && persistedDocumentRef.current !== snapshot.document ? "ready" : persistenceStatus;

  return useMemo(() => Object.freeze({
    authority,
    snapshot,
    persistenceStatus: visiblePersistenceStatus,
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
    retryRestore,
    setRuntimeSyncPending,
  }), [
    authority,
    hydrated,
    importJson,
    persist,
    persistenceError,
    visiblePersistenceStatus,
    retryRestore,
    setRuntimeSyncPending,
    snapshot,
  ]);
}
