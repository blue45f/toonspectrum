import { createContext, useContext, type ReactNode } from "react";

type Session = {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
  };
} | null;

const SessionContext = createContext<Session>(null);

export function SessionProvider({ children, session = null }: { children: ReactNode; session?: Session }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession():
  | {
      data: NonNullable<Session>;
      status: "authenticated";
      update: () => Promise<NonNullable<Session>>;
    }
  | {
      data: null;
      status: "unauthenticated";
      update: () => Promise<null>;
    } {
  const data = useContext(SessionContext);
  if (data?.user) {
    return {
      data,
      status: "authenticated",
      update: async () => data,
    };
  }
  return {
    data: null,
    status: "unauthenticated",
    update: async () => null,
  };
}

export async function signIn(...args: unknown[]) {
  return {
    ok: false,
    error: "auth-unavailable-in-vite-spa",
    status: 501,
    url: args.length ? null : null,
  };
}

export async function signOut() {
  return undefined;
}
