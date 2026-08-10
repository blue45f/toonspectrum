# CSP blind lab capability survey

- 기준일: 2026-08-09
- 상태: 하니스 구현·자동 계약 검증 완료, 사람/실기기 비교 결과는 아직 없음
- 권위: ToonStudio V12 §19 CSP 초월 승리 게이트

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 사람 운영 A/B 블라인드 랩 | 손맛·필압·자연스러움·작업 흐름처럼 픽셀 diff로 환원되지 않는 품질을 최신 안정 CSP와 직접 비교 | CSP 라이선스, 펜 태블릿, 평가자와 동일 세션 운영 필요 | 유일한 최종 선호도 근거. 출처를 숨긴 A/B/동률 응답으로 평가 | 외부 고속 촬영/동일 장치 task timing을 별도 기록; 현재 미실측 | 제품 메모리와 무관 | 제품 번들 비용 0; 랩 운영 비용 존재 | `createCspBlindPacket`이 study/evaluator/task 해시로 순서와 A/B를 결정하고 sealed key를 분리 | 내부 하니스; 비교 대상 CSP는 별도 상용 라이선스 필요 | 캡처 자산과 응답을 오프라인 랩 절차로 반입 | 불완전 키·중복 응답·평가자 유출 위험을 운영 절차로 통제해야 함 | **최종 CSP 비열위 출시 게이트** |
| 자동 pressure/visual fidelity 회귀 | CI에서 필압 상관·결정성·교차 렌더 시각 차이를 빠르게 탐지 | 사람의 손맛·선호·CSP UI 동선은 판정 불가 | 엔진 내부 회귀 방어에는 강함; CSP 승리 증거로 대체 불가 | 저장된 벤치 결과에 p50/p95/p99 존재 | 각 하니스 결과에 기록 | CI/WASM 비용 | 고정 corpus·seed·golden으로 결정적 | 저장소와 각 엔진 라이선스 | IR/픽셀 정규화 비용 | proxy를 최종 품질로 오인할 위험 | **사전 회귀 게이트** |
| 외부 task-flow/latency 관찰 | CSP 내부 계측과 ToonStudio 내부 계측을 섞지 않고 동일 카메라·동일 장치에서 비교 | 정밀한 실험 각본과 동기화된 캡처 필요 | 품질 선호와 별개로 반응성·작업 완료 시간을 검증 | G펜 첫 표시, 1000px 브러시, 만화 30·애니 20 동선 p50/p95/p99 | 장치 telemetry를 별도 기록 | 제품 번들 비용 0 | 고정 각본과 원본 캡처를 보존해야 재검증 가능 | 캡처 도구 및 CSP 라이선스 | 사람이 타임스탬프/동선 결과를 결합 | 평가자 학습효과·순서효과 | **블라인드 선호도와 병행하는 성능 게이트** |

자동 proxy는 사람 운영 비교를 통과시키지 않는다. 현재 CSP 상태는 `insufficient-data`이며, 하니스 존재만으로 “CSP 동급/초월”을 표시할 수 없다.
