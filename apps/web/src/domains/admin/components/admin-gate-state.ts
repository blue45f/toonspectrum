import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { adminFetch, type AdminApiError, type AdminMe } from "./admin-client";

import { useSession } from "@/compat/auth-session-store";

export type AdminGate =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "admin"; me: AdminMe };

export interface AdminGateState {
  gate: AdminGate;
  uid: string | undefined;
}

const AdminGateOverrideContext = createContext<AdminGateState | null>(null);

/**
 * Reuses an already verified gate inside the routed Admin shell. Legacy member
 * and community pages continue to work standalone, but no longer repeat the
 * database-backed `/admin/me` check when embedded in AdminRouter.
 */
export function AdminGateOverrideProvider({
  value,
  children,
}: {
  value: AdminGateState;
  children: ReactNode;
}) {
  return createElement(AdminGateOverrideContext.Provider, { value }, children);
}

export function useAdminGate(): AdminGateState {
  const override = useContext(AdminGateOverrideContext);
  const { data: session, status } = useSession();
  const uid = session?.user?.id;
  const [gate, setGate] = useState<AdminGate>({ kind: "loading" });

  useEffect(() => {
    if (override) return;
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
      .then((me) => {
        if (alive) setGate({ kind: "admin", me });
      })
      .catch((error: AdminApiError) => {
        if (!alive) return;
        if (error.status === 401 || error.status === 403) {
          setGate({ kind: "forbidden" });
        } else {
          setGate({ kind: "error", message: error.message });
        }
      });
    return () => {
      alive = false;
    };
  }, [override, status, uid]);

  return override ?? { gate, uid };
}
