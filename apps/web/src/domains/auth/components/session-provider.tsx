import { SessionProvider } from "@/domains/auth/public/session/auth-session";

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
