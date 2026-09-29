import { useCallback, useRef, useState } from "react";

import { toast } from "@/shared/lib/toast-store";

import type { ProductionClientCommand } from "./production-api";

/**
 * 낙관적 협업 명령 실행 — 먼저 화면을 바꾸고, 실패하면 되돌린다.
 *
 * 원칙: 실시간 피드백. 저장·전송·승인마다 즉시 토스트 + 낙관적 UI.
 * - 실행 직후 `applyOptimistic()`으로 화면을 먼저 갱신
 * - 성공하면 성공 토스트, 실패하면 `rollback()` 후 에러 토스트
 * - 중복 실행 방지 (같은 키로 실행 중이면 무시)
 */
export function useOptimisticProductionCommand({
  execute,
}: {
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
}) {
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef(new Set<string>());

  const run = useCallback(
    async ({
      key,
      command,
      message,
      successMessage,
      applyOptimistic,
      rollback,
    }: {
      readonly key: string;
      readonly command: ProductionClientCommand;
      /** 성공 시 토스트에 표시할 문구 (execute의 message와 별개). */
      readonly message: string;
      readonly successMessage?: string;
      /** 서버 응답 전에 화면을 먼저 갱신한다. */
      readonly applyOptimistic?: () => void;
      /** 실패 시 낙관적 변경을 되돌린다. */
      readonly rollback?: () => void;
    }) => {
      if (pendingRef.current.has(key)) return;
      pendingRef.current.add(key);
      setPendingKeys(new Set(pendingRef.current));
      try {
        applyOptimistic?.();
        await execute(command, message);
        toast(successMessage ?? message, { tone: "success" });
      } catch (error) {
        rollback?.();
        const detail = error instanceof Error && error.message ? ` — ${error.message}` : "";
        toast(`실패했습니다. 다시 시도해 주세요${detail}`, { tone: "error" });
        throw error;
      } finally {
        pendingRef.current.delete(key);
        setPendingKeys(new Set(pendingRef.current));
      }
    },
    [execute],
  );

  const isPending = useCallback((key: string) => pendingKeys.has(key), [pendingKeys]);

  return { run, isPending };
}
