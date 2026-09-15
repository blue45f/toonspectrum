import { useCallback, useMemo, useState } from "react";

import {
  clearStudioToonBridgeSettings,
  loadStudioToonBridgeSettings,
  saveStudioToonBridgeSettings,
  STUDIO_TOONBRIDGE_DEFAULT_URL,
  StudioToonBridgeClient,
  type StudioToonBridgeSettings,
  type StudioToonBridgeStatus,
  type StudioToonBridgeToolProbe,
} from "./studio-toonbridge-client";

export interface StudioToonBridgeConnectionState {
  readonly settings: StudioToonBridgeSettings;
  readonly status: StudioToonBridgeStatus | null;
  readonly probes: readonly StudioToonBridgeToolProbe[];
  readonly connected: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly client: StudioToonBridgeClient | null;
  setBaseUrl(value: string): void;
  setToken(value: string): void;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  disconnect(): void;
}

function initialSettings(): StudioToonBridgeSettings {
  return loadStudioToonBridgeSettings() ?? {
    baseUrl: STUDIO_TOONBRIDGE_DEFAULT_URL,
    token: "",
  };
}

export function useStudioToonBridgeConnection(): StudioToonBridgeConnectionState {
  const [settings, setSettings] = useState<StudioToonBridgeSettings>(initialSettings);
  const [status, setStatus] = useState<StudioToonBridgeStatus | null>(null);
  const [probes, setProbes] = useState<readonly StudioToonBridgeToolProbe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    if (!settings.token) return null;
    try {
      return new StudioToonBridgeClient(settings);
    } catch {
      return null;
    }
  }, [settings]);

  const readConnection = useCallback(async (
    nextSettings: StudioToonBridgeSettings,
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const nextClient = new StudioToonBridgeClient(nextSettings);
      const [nextStatus, nextProbes] = await Promise.all([
        nextClient.status(),
        nextClient.tools(),
      ]);
      saveStudioToonBridgeSettings(nextSettings);
      setSettings(nextSettings);
      setStatus(nextStatus);
      setProbes(nextProbes);
    } catch (cause) {
      setStatus(null);
      setProbes([]);
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async () => {
    await readConnection(settings);
  }, [readConnection, settings]);

  const refresh = useCallback(async () => {
    const saved = loadStudioToonBridgeSettings();
    if (!saved) throw new Error("저장된 로컬 실행기 연결이 없습니다.");
    await readConnection(saved);
  }, [readConnection]);

  const disconnect = useCallback(() => {
    clearStudioToonBridgeSettings();
    setSettings({ baseUrl: STUDIO_TOONBRIDGE_DEFAULT_URL, token: "" });
    setStatus(null);
    setProbes([]);
    setError(null);
  }, []);

  return {
    settings,
    status,
    probes,
    connected: status !== null,
    loading,
    error,
    client,
    setBaseUrl(value) {
      setSettings((current) => ({ ...current, baseUrl: value }));
    },
    setToken(value) {
      setSettings((current) => ({ ...current, token: value }));
    },
    connect,
    refresh,
    disconnect,
  };
}
