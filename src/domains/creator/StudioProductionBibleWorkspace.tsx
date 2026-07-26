import { useEffect, useRef, useState } from "react";

import {
  createEmptyStudioProductionBible,
  StudioProductionBibleLocalRepository,
  studioProductionBibleStorageKey,
  type StudioProductionBible,
  type StudioProductionBiblePersistenceResult,
} from "./studio-production-bible";
import {
  StudioProductionBiblePanel,
  type StudioProductionBibleLinkOption,
} from "./StudioProductionBiblePanel";

type ProductionBibleRepository = Pick<
  StudioProductionBibleLocalRepository,
  "load" | "save"
>;

export interface StudioProductionBibleWorkspaceProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly userId?: string | null;
  readonly workId?: string | null;
  readonly remixId?: string | null;
  readonly characterOptions?: readonly StudioProductionBibleLinkOption[];
  readonly assetOptions?: readonly StudioProductionBibleLinkOption[];
  /** Test/custom-storage seam. The default remains IndexedDB with localStorage recovery. */
  readonly repository?: ProductionBibleRepository;
}

const INITIAL_PERSISTENCE: StudioProductionBiblePersistenceResult = {
  bible: createEmptyStudioProductionBible(),
  backend: "memory",
  persisted: false,
  localOnly: true,
};

/**
 * Lazy host that keeps the production-bible core out of Studio's initial route chunk.
 * The document remains deliberately local-only until a server schema is explicitly introduced.
 */
export function StudioProductionBibleWorkspace({
  open,
  onClose,
  userId,
  workId,
  remixId,
  characterOptions,
  assetOptions,
  repository,
}: StudioProductionBibleWorkspaceProps) {
  const [defaultRepository] = useState(
    () => new StudioProductionBibleLocalRepository()
  );
  const activeRepository = repository ?? defaultRepository;
  const storageKey = studioProductionBibleStorageKey({
    userId,
    workId,
    remixId,
  });
  const [bible, setBible] = useState<StudioProductionBible>(
    INITIAL_PERSISTENCE.bible
  );
  const [persistence, setPersistence] =
    useState<StudioProductionBiblePersistenceResult>(INITIAL_PERSISTENCE);
  const saveEpochRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadEpoch = ++saveEpochRef.current;
    void activeRepository.load(storageKey).then((result) => {
      if (!active || loadEpoch !== saveEpochRef.current) return;
      setBible(result.bible);
      setPersistence(result);
    });
    return () => {
      active = false;
    };
  }, [activeRepository, open, storageKey]);

  function changeBible(next: StudioProductionBible): void {
    setBible(next);
    const saveEpoch = ++saveEpochRef.current;
    void activeRepository.save(storageKey, next).then((result) => {
      if (saveEpoch !== saveEpochRef.current) return;
      setPersistence(result);
    });
  }

  return (
    <StudioProductionBiblePanel
      open={open}
      onClose={onClose}
      bible={bible}
      onChange={changeBible}
      characterOptions={characterOptions}
      assetOptions={assetOptions}
      persistence={{
        backend: persistence.backend,
        persisted: persistence.persisted,
        ...(persistence.warning ? { warning: persistence.warning } : {}),
      }}
    />
  );
}
