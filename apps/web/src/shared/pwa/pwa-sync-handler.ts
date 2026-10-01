import type { PwaOutboxItem } from "./pwa-offline-outbox";

export type PwaSyncHandler = (item: PwaOutboxItem) => Promise<void>;

async function defaultSyncOne(): Promise<void> {
  // 실제 전송은 각 도메인이 outbox 항목 kind에 맞는 syncOne을 등록해 처리한다.
  // 기본값은 "동기화 핸들러 없음"으로 두어 조용히 성공 처리하지 않고,
  // 다음 온라인 때 다시 시도하게 한다.
  throw new Error("no-sync-handler");
}

let registeredSyncHandler: PwaSyncHandler = defaultSyncOne;

/**
 * 도메인별 동기화 핸들러 등록.
 * 예: 노트 도메인이 kind="note"인 아웃박스 항목을 서버에 전송하는 함수를 등록한다.
 */
export function registerPwaOutboxSyncHandler(handler: PwaSyncHandler): () => void {
  registeredSyncHandler = handler;
  return () => {
    registeredSyncHandler = defaultSyncOne;
  };
}

/** 현재 등록된 동기화 핸들러 반환 (내부용). */
export function getRegisteredPwaSyncHandler(): PwaSyncHandler {
  return registeredSyncHandler;
}
