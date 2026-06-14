// react-query Provider — 앱 루트에 1회 마운트한다.
// QueryClient 는 컴포넌트 생애주기 동안 1개로 유지(useState 초기화)해 재생성을 막는다.
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { createAppQueryClient } from "@/src/infrastructure/query-client";

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
