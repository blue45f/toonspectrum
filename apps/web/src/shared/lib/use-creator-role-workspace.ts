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
  enabled = true,
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
    if (!enabled) return;
    void loadCreatorRoleWorkspace(projectKey, fallbackProfile);
  }, [enabled, fallbackProfile, projectKey]);

  const save = useCallback(
    (document: CreatorRoleWorkspacePreference) => enabled
      ? persistCreatorRoleWorkspace(projectKey, document)
      : Promise.resolve(getCreatorRoleWorkspaceStoreState(projectKey)),
    [enabled, projectKey],
  );
  const reload = useCallback(
    () => enabled
      ? loadCreatorRoleWorkspace(projectKey, fallbackProfile, true)
      : Promise.resolve(getCreatorRoleWorkspaceStoreState(projectKey)),
    [enabled, fallbackProfile, projectKey],
  );

  return useMemo(() => ({
    ...state,
    save,
    reload,
  }), [reload, save, state]);
}
