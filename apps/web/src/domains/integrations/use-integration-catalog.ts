import { useEffect, useState } from "react";

import { getApiErrorMessage } from "@/platform/api";

import { integrationPlatformClient } from "./integration-platform-client";
import type { IntegrationCatalogResponse } from "./integration-platform-types";

export function useIntegrationCatalog() {
  const [catalog, setCatalog] = useState<IntegrationCatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void integrationPlatformClient.catalog()
      .then((response) => {
        if (!cancelled) setCatalog(response);
      })
      .catch(async (reason: unknown) => {
        if (!cancelled) {
          setError(await getApiErrorMessage(reason, "연동 목록을 불러오지 못했습니다."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return {
    catalog,
    error,
    loading: !catalog && !error,
    refresh: () => setRefreshKey((value) => value + 1),
  };
}
