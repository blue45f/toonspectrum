import {
  translateBilingualValueForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { useCallback, useEffect, useRef, useState } from "react";

import { httpStatus } from "@/infrastructure/api";

import {
  readStudioProjectGraphCache,
  writeStudioProjectGraphCache,
} from "./studio-project-graph-cache";
import {
  getStudioProject,
  getStudioProjectByWork,
} from "./studio-project-graph-client";
import type { StudioProjectRecord } from "./studio-project-graph-contract";

export type StudioProjectGraphStatus =
  | "loading"
  | "synced"
  | "cached"
  | "offline"
  | "local-only"
  | "error";

export interface StudioProjectGraphController {
  readonly project: StudioProjectRecord | null;
  readonly status: StudioProjectGraphStatus;
  readonly error: string | null;
  readonly cachedAt: number | null;
  readonly refresh: () => Promise<void>;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function fetchStudioProject(identifier: string): Promise<StudioProjectRecord> {
  try {
    return await getStudioProjectByWork(identifier);
  } catch (error) {
    if (httpStatus(error) !== 404) throw error;
    return getStudioProject(identifier);
  }
}

function readableError(locale: string): string {
  return translateBilingualValueForLocale(locale, "domains.creator.project.graph.useStudioProjectGraph", "클라우드 작품 상태를 확인하지 못했습니다. 로컬 원고와 자동 복구 데이터는 그대로 유지됩니다.", "Cloud project state could not be checked. Local documents and recovery data remain unchanged.");
}

export function useStudioProjectGraph(
  identifier: string,
  locale: string,
): StudioProjectGraphController {
  const [project, setProject] = useState<StudioProjectRecord | null>(null);
  const [status, setStatus] = useState<StudioProjectGraphStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const normalized = identifier.trim();
    if (!normalized) {
      setProject(null);
      setStatus("local-only");
      setError(null);
      return;
    }

    const currentGeneration = ++generation.current;
    const cached = readStudioProjectGraphCache({
      storage: storage(),
      alias: normalized,
      allowExpired: true,
    });
    if (cached) {
      setProject(cached.record);
      setCachedAt(cached.cachedAt);
      setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "cached");
    } else {
      setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "loading");
    }
    setError(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    try {
      const next = await fetchStudioProject(normalized);
      if (generation.current !== currentGeneration) return;
      writeStudioProjectGraphCache({ storage: storage(), record: next });
      setProject(next);
      setCachedAt(Date.now());
      setStatus("synced");
      setError(null);
    } catch (nextError) {
      if (generation.current !== currentGeneration) return;
      const missing = httpStatus(nextError) === 404;
      if (missing && !cached) {
        setProject(null);
        setStatus("local-only");
        setError(null);
        return;
      }
      setStatus(cached ? "cached" : "error");
      setError(readableError(locale));
    }
  }, [identifier, locale]);

  useEffect(() => {
    void refresh();
    if (typeof window === "undefined") return undefined;

    const online = () => { void refresh(); };
    const offline = () => {
      setStatus((current) => current === "local-only" ? current : "offline");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      generation.current += 1;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [refresh]);

  return Object.freeze({ project, status, error, cachedAt, refresh });
}
