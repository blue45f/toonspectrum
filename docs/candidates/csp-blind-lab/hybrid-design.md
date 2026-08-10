# CSP blind lab hybrid design

## 데이터 흐름

1. 운영자가 최신 안정 CSP와 ToonStudio에서 동일 각본·동일 장치로 결과 자산을 만든다.
2. 사전 등록된 `CspBlindStudy`는 범주, 과제, 비열위 마진, 범주별 최소 응답 수를 고정한다.
3. `createCspBlindPacket`은 평가자별 과제 순서와 A/B 방향을 결정적으로 섞는다.
4. 참가자 packet과 `CspBlindSealedKey`는 분리 보관한다. 참가자에게 ToonStudio/CSP 원본 경로나 source side를 노출하지 않는다.
5. 평가가 끝난 뒤에만 sealed key와 응답을 `analyzeCspBlindResponses`에 결합한다.
6. 모든 평가자·과제 응답이 존재하고, 중복이 없으며, 전체와 5개 범주 각각에서 95% Wilson 하한이 `0.5 - nonInferiorityMargin` 이상일 때만 통과한다.

동률은 ToonStudio 승리로 세지 않고 0.5 favorable로 계산한다. 부분 sealed key, 잘못된 preference, 타 연구의 key, 미배정 응답은 오류다. 응답 누락·중복과 표본 부족은 실패가 아니라 `insufficient-data`이며 출시 통과로 해석하지 않는다.

## 제품과의 경계

블라인드 하니스는 이미지 생성 엔진도 제품 UI도 아니다. 실제 제품 결과는 Vello/CanvasKit/libmypaint/Google Ink 등 승격 후보가 만든다. 자동 pressure·golden·cross-renderer 테스트는 후보를 랩에 보내기 전 회귀를 막고, 사람 랩은 그 자동 증거로 대체할 수 없는 손맛·품질·동선 판정을 소유한다.

현재 구현은 `tests/benchmarks/harness/csp-blind-lab.ts`와 16개 자동 계약 테스트다. 최신 CSP, 펜 태블릿, 평가자 없이 실제 결과를 생성하거나 통과를 주장하지 않는다.
