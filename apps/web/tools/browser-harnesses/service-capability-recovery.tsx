import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { ServiceCapabilityRuntime } from "../../src/app/service-state/ServiceCapabilityRuntime";
import { ServiceDegradedBanner } from "../../src/app/service-state/ServiceDegradedBanner";
import { api } from "../../src/platform/api";
import { requestServiceCapabilityRefresh } from "../../src/platform/service-capability-state";
import "../../src/app/styles/globals.css";

// 격리된 localhost의 HTTP 실패·복구 검증 화면이다. 운영 원고나 계정을 변경하지 않는다.
function Harness() {
  return <MemoryRouter>
    <ServiceCapabilityRuntime />
    <ServiceDegradedBanner />
    <main className="p-4 text-fg">
      <h1>드로잉 서비스 상태 복구 검증</h1>
      <p>로컬 테스트 응답으로 상태 표시와 재연결을 확인합니다.</p>
      <button type="button" onClick={requestServiceCapabilityRefresh}>상태 확인 요청</button>
      <button type="button" onClick={() => {
        void api.get("/qa/capability-failure", { retry: 0 }).catch(() => {
          // 제품 API 래퍼의 장애 이벤트가 표시되며 테스트 요청은 여기서 종료한다.
        });
      }}>온라인 요청 실행</button>
    </main>
  </MemoryRouter>;
}
const target = document.getElementById("test-root");
if (!target) throw new Error("검증 화면 루트가 없습니다.");
createRoot(target).render(<Harness />);
