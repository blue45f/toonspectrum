import { useEffect, useState } from "react";
import { useSession } from "@/src/compat/auth-session";
import { adminFetch, type AdminApiError, type AdminMe } from "./admin-client";
import { AdminNotice, AdminSpinner } from "./admin-ui";

// 관리자 콘솔 진입 게이트 — /admin과 분할 라우트(/admin/community, /admin/members)가 공유한다.
export type AdminGate =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "admin"; me: AdminMe };

export function useAdminGate(): { gate: AdminGate; uid: string | undefined } {
  const { data: session, status } = useSession();
  const uid = session?.user?.id;
  const [gate, setGate] = useState<AdminGate>({ kind: "loading" });

  useEffect(() => {
    if (status === "unauthenticated") {
      setGate({ kind: "guest" });
      return;
    }
    if (status !== "authenticated" || !uid) {
      setGate({ kind: "loading" });
      return;
    }
    let alive = true;
    setGate({ kind: "loading" });
    adminFetch<AdminMe>("/me", uid)
      .then((me) => alive && setGate({ kind: "admin", me }))
      .catch((e: AdminApiError) => {
        if (!alive) return;
        if (e.status === 401 || e.status === 403) setGate({ kind: "forbidden" });
        else setGate({ kind: "error", message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [status, uid]);

  return { gate, uid };
}

// 게이트 통과 전(로딩·비로그인·권한 없음·오류) 공용 안내 — 통과 시 null을 반환한다.
export function AdminGateFallback({ gate }: { gate: AdminGate }) {
  if (gate.kind === "loading") return <AdminSpinner />;
  if (gate.kind === "guest") {
    return (
      <AdminNotice
        title="로그인이 필요해요"
        body="관리자 콘솔은 로그인 후 이용할 수 있습니다. 우측 상단에서 로그인해 주세요."
      />
    );
  }
  if (gate.kind === "forbidden") {
    return (
      <AdminNotice
        title="관리자 권한이 없어요"
        body="이 계정에는 관리자 권한이 없습니다. 권한이 필요하면 운영자에게 문의하세요. (ADMIN_EMAILS 또는 users.role=admin)"
      />
    );
  }
  if (gate.kind === "error") return <AdminNotice title="콘솔을 불러오지 못했어요" body={gate.message} />;
  return null;
}
