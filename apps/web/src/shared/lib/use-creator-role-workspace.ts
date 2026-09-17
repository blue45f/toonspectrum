import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  getCreatorRoleWorkspaceStoreState,
  loadCreatorRoleWorkspace,
  persistCreatorRoleWorkspace,
  subscribeCreatorRoleWorkspace,
} from "./creator-role-workspace-store";

import type { CreatorRoleProfile } from "./creator-role-contract";
import type {
  CreatorRoleWorkspacePreference,
} from "./creator-role-workspace-contract";

export function useCreatorRoleWorkspace(
  projectKey: string,
  fallbackProfile?: CreatorRoleProfile | null,
) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeCreatorRoleWorkspace(projectKey, listener),
    [projectKey],
  );
  const getSnapshot = useCallback(
    () => getCreatorRoleWorkspaceStoreState(projectKey),
    [projectKey],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void loadCreatorRoleWorkspace(projectKey, fallbackProfile);
  }, [fallbackProfile, projectKey]);

  const save = useCallback(
    (document: CreatorRoleWorkspacePreference) => (
      persistCreatorRoleWorkspace(projectKey, document)
    ),
    [projectKey],
  );
  const reload = useCallback(
    () => loadCreatorRoleWorkspace(projectKey, fallbackProfile, true),
    [fallbackProfile, projectKey],
  );

  return useMemo(() => ({
    ...state,
    save,
    reload,
  }), [reload, save, state]);
}
