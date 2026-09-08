import { useCallback, useEffect, useRef, useState } from "react";

import {
  readAuthoritativeCachedMarketResource,
  removeAuthoritativeCachedMarketResource,
  removeCachedMarketResource,
  writeAuthoritativeCachedMarketResource,
} from "../models/market-resource-cache";
import { getCreatorMarketplaceResource } from "../remotes/market-resource-remote";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { NotFoundError } from "@/infrastructure/use-api-resource";

export interface MarketResourceDetail {
  readonly record: CreatorMarketplaceResourceRecord | null;
  readonly loading: boolean;
  readonly notFound: boolean;
  readonly error: string | null;
  /** Network failure fallback from a previous successful server response. */
  readonly staleSavedAt: string | null;
  readonly reload: () => void;
}

/** Public detail is sourced only from the server or its isolated authoritative cache. */
export function useMarketResourceDetail(id: string | undefined): MarketResourceDetail {
  const [record, setRecord] = useState<CreatorMarketplaceResourceRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleSavedAt, setStaleSavedAt] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setRecord(null);
    setLoading(Boolean(id));
    setNotFound(false);
    setError(null);
    setStaleSavedAt(null);
    if (!id) return undefined;

    const controller = new AbortController();
    getCreatorMarketplaceResource(id, controller.signal)
      .then((parsed) => {
        if (controller.signal.aborted || generationRef.current !== generation) return;
        setRecord(parsed);
        setLoading(false);
        writeAuthoritativeCachedMarketResource(parsed);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || generationRef.current !== generation) return;
        if (cause instanceof NotFoundError) {
          removeAuthoritativeCachedMarketResource(id);
          removeCachedMarketResource(id);
          setNotFound(true);
          setLoading(false);
          return;
        }
        const cached = readAuthoritativeCachedMarketResource(id);
        if (cached) {
          setRecord(cached.record);
          setStaleSavedAt(cached.savedAt);
          setLoading(false);
          return;
        }
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "공유 리소스를 불러오지 못했습니다.",
        );
        setLoading(false);
      });

    return () => {
      controller.abort();
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [id, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return { record, loading, notFound, error, staleSavedAt, reload };
}
