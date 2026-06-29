import { MemberAuthControl } from "./member-auth-control";

import { AuthProvider } from "@/lib/firebaseAuth/AuthProvider";

export function MemberAuthIsland({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <AuthProvider>
      <MemberAuthControl defaultOpen={defaultOpen} />
    </AuthProvider>
  );
}
