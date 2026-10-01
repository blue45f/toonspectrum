/**
 * Rapier ES module Worker 엔트리(브라우저 전용, 브라우저 미검증).
 * 메시지는 rapier-protocol.ts 스키마로 검증해 provider에 적용하고 응답을 postMessage한다.
 * 메인 스레드와 Node에서는 createRapierProvider를 직접 쓴다(Worker 없이 동작).
 */
import { createRapierProvider } from "../rapier-provider";

import { createRapierProtocolHandler } from "./rapier-protocol";

interface WorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
}

const scope = globalThis as unknown as WorkerScope;
const handler = createRapierProtocolHandler(createRapierProvider());

scope.onmessage = (event) => {
  void handler(event.data).then((response) => {
    scope.postMessage(response);
  });
};
