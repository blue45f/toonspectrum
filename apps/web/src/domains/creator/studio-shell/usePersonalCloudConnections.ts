import { useCallback, useEffect, useMemo, useState } from "react";

import {
  PERSONAL_CLOUD_PROVIDER_IDS,
  disconnectPersonalCloud,
  listPersonalCloudConnections,
  startPersonalCloudConnection,
  type PersonalCloudConnectionStatus,
  type PersonalCloudProviderId,
} from "../save-first/personal-cloud-client";

export interface PersonalCloudConnectionsController {
  readonly connections: readonly PersonalCloudConnectionStatus[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly busyProvider: PersonalCloudProviderId | null;
  readonly statusFor: (
    provider: PersonalCloudProviderId,
  ) => PersonalCloudConnectionStatus | null;
  readonly reload: () => Promise<void>;
  readonly connect: (
    provider: PersonalCloudProviderId,
    returnTo?: string,
  ) => Promise<void>;
  readonly disconnect: (provider: PersonalCloudProviderId) => Promise<void>;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim().slice(0, 500)
    : fallback;
}
export function usePersonalCloudConnections(): PersonalCloudConnectionsController {
  const [connections, setConnections] = useState<readonly PersonalCloudConnectionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<PersonalCloudProviderId | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setConnections(await listPersonalCloudConnections());
      setError(null);
    } catch (cause) {
      setError(message(cause, "개인 저장소 연결 상태를 확인하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byProvider = useMemo(() => new Map(
    connections.map((entry) => [entry.provider, entry] as const),
  ), [connections]);

  const statusFor = useCallback((provider: PersonalCloudProviderId) => (
    byProvider.get(provider) ?? null
  ), [byProvider]);
  const connect = useCallback(async (
    provider: PersonalCloudProviderId,
    returnTo = "/studio?view=storage",
  ) => {
    if (typeof window === "undefined") return;
    setBusyProvider(provider);
    setError(null);
    try {
      const started = await startPersonalCloudConnection(provider, returnTo);
      window.location.assign(started.authorizeUrl);
    } catch (cause) {
      setError(message(cause, "개인 저장소 연결을 시작하지 못했습니다."));
      setBusyProvider(null);
    }
  }, []);

  const disconnect = useCallback(async (provider: PersonalCloudProviderId) => {
    setBusyProvider(provider);
    setError(null);
    try {
      await disconnectPersonalCloud(provider);
      await reload();
    } catch (cause) {
      setError(message(cause, "개인 저장소 연결을 해제하지 못했습니다."));
    } finally {
      setBusyProvider(null);
    }
  }, [reload]);

  return Object.freeze({
    connections,
    loading,
    error,
    busyProvider,
    statusFor,
    reload,
    connect,
    disconnect,
  });
}

export const PERSONAL_CLOUD_CONNECTION_PROVIDER_ORDER = PERSONAL_CLOUD_PROVIDER_IDS;
