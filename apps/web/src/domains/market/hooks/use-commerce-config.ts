import { useEffect, useState } from "react";

import {
  getCommerceConfig,
  type CommerceConfigResponse,
} from "../commerce-api";

let snapshot: CommerceConfigResponse | null = null;
let lastLoadedAt = 0;
let inFlight: Promise<CommerceConfigResponse> | null = null;
const listeners = new Set<(value: CommerceConfigResponse) => void>();
const MAX_AGE_MS = 15_000;

function publish(value: CommerceConfigResponse) {
  snapshot = value;
  lastLoadedAt = Date.now();
  for (const listener of listeners) listener(value);
}

export function refreshCommerceConfig(): Promise<CommerceConfigResponse> {
  if (inFlight) return inFlight;
  inFlight = getCommerceConfig()
    .then((value) => {
      publish(value);
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useCommerceConfig() {
  const [config, setConfig] = useState<CommerceConfigResponse | null>(snapshot);

  useEffect(() => {
    listeners.add(setConfig);
    if (!snapshot || Date.now() - lastLoadedAt > MAX_AGE_MS) {
      void refreshCommerceConfig().catch(() => undefined);
    }
    const onChanged = () => {
      lastLoadedAt = 0;
      void refreshCommerceConfig().catch(() => undefined);
    };
    window.addEventListener("toonspectrum:commerce-config-changed", onChanged);
    return () => {
      listeners.delete(setConfig);
      window.removeEventListener("toonspectrum:commerce-config-changed", onChanged);
    };
  }, []);

  return {
    config,
    loading: config === null,
    isPaidMode: config?.operationMode === "paid",
  };
}
