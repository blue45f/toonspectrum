"use client";

import { useEffect } from "react";
import { useSession } from "@/src/compat/auth-session";
import { useApp, useHydrated } from "@/lib/store";

// 세션 ↔ 스토어 동기화: 로그인 시 userId 설정 + DB 데이터 하이드레이션, 로그아웃 시 해제
export function StoreSync() {
  const { data: session, status } = useSession();
  const hydrated = useHydrated();
  const setUserId = useApp((s) => s.setUserId);
  const setSessionToken = useApp((s) => s.setSessionToken);
  const hydrate = useApp((s) => s.hydrateFromServer);
  const uid = session?.user?.id;
  const token = session?.token ?? null;

  useEffect(() => {
    // persist 복원 후에만 — 게스트 로컬 데이터가 스토어에 올라온 뒤 병합해야 손실이 없다.
    if (!hydrated) return;

    if (status === "authenticated" && uid) {
      const prev = useApp.getState().userId;
      setUserId(uid);
      setSessionToken(token);
      // 서명 토큰을 x-user-id로 전송(서버가 검증). 토큰 없는 레거시 세션은 미인증 → 재로그인 필요.
      const authHeaders = { "Content-Type": "application/json", "x-user-id": token ?? "" };

      if (prev !== uid) {
        // 로그인 전환(게스트→계정 등): 로컬 상태를 서버로 1회 병합 후 통합 결과 하이드레이트
        const s = useApp.getState();
        const local = {
          ratings: s.ratings,
          reads: s.reads,
          subscriptions: s.subscriptions,
          reviews: s.reviews,
          likedReviews: s.likedReviews,
          collections: s.collections,
        };
        fetch("/api/me/merge", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(local),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d) hydrate(d);
          })
          .catch(() => {});
      } else {
        // 이미 로그인 상태(새로고침): 서버 데이터만 하이드레이트
        fetch("/api/me", { headers: { "x-user-id": token ?? "" } })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d) hydrate(d);
          })
          .catch(() => {});
      }
    } else if (status === "unauthenticated") {
      setUserId(null);
      setSessionToken(null);
    }
  }, [hydrated, status, uid, token, setUserId, setSessionToken, hydrate]);

  return null;
}
