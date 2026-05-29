"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useApp } from "@/lib/store";

// 세션 ↔ 스토어 동기화: 로그인 시 userId 설정 + DB 데이터 하이드레이션, 로그아웃 시 해제
export function StoreSync() {
  const { data: session, status } = useSession();
  const setUserId = useApp((s) => s.setUserId);
  const hydrate = useApp((s) => s.hydrateFromServer);
  const uid = session?.user?.id;

  useEffect(() => {
    if (status === "authenticated" && uid) {
      setUserId(uid);
      fetch("/api/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) hydrate(d);
        })
        .catch(() => {});
    } else if (status === "unauthenticated") {
      setUserId(null);
    }
  }, [status, uid, setUserId, hydrate]);

  return null;
}
