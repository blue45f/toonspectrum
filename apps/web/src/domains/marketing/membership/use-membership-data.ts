import { useCallback, useEffect, useState } from "react";

import {
  getMembershipCatalog,
  getMembershipOverview,
  type MembershipCatalog,
  type MembershipOverview,
} from "@/platform/membership-wallet-client";

import type { LoadStatus } from "./membership-copy";

/**
 * 멤버십 정책 카탈로그(누구나)와 내 현황(로그인한 사람만)을 불러온다.
 * 실패해도 페이지는 기본 정책으로 그려지고, '다시 시도'는 시도 횟수만 올려 같은 effect를 다시 돌린다.
 */
export function useMembershipData(userId: string | null | undefined) {
  const [catalog, setCatalog] = useState<MembershipCatalog | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>("loading");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [overview, setOverview] = useState<MembershipOverview | null>(null);
  const [overviewStatus, setOverviewStatus] = useState<"idle" | LoadStatus>("idle");
  const [overviewAttempt, setOverviewAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCatalogStatus("loading");
    void getMembershipCatalog()
      .then((result) => {
        if (cancelled) return;
        setCatalog(result);
        setCatalogStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setCatalogStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [catalogAttempt]);

  useEffect(() => {
    if (!userId) {
      setOverview(null);
      setOverviewStatus("idle");
      return;
    }
    let cancelled = false;
    setOverviewStatus("loading");
    void getMembershipOverview()
      .then((result) => {
        if (cancelled) return;
        setOverview(result);
        setOverviewStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setOverviewStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, overviewAttempt]);

  const retryCatalog = useCallback(() => setCatalogAttempt((attempt) => attempt + 1), []);
  const retryOverview = useCallback(() => setOverviewAttempt((attempt) => attempt + 1), []);

  return { catalog, catalogStatus, retryCatalog, overview, overviewStatus, retryOverview } as const;
}
