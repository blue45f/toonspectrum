# ToonStudio V12 — 외부 필터 격리 후보 조사

- 기준일: 2026-08-09
- 범위: 브라우저 번들 밖에서 실행하는 G'MIC·GEGL 계열 final 필터와 ToonStudio 사이의 중립 `postMessage` 경계
- 구현 증거: `packages/studio-engine-registry/src/external-filter-bridge.ts`
- 테스트 증거: `packages/studio-engine-registry/src/__tests__/external-filter-bridge.test.ts`
- 원시 측정: `tests/benchmarks/results/external-filter-bridge.json`

이 조사는 실행 엔진의 품질을 대신 판정하지 않는다. 현재 저장소에는 별도 배포된 G'MIC/GEGL 바이너리가 없으므로 실제 시각 품질, 엔진 처리 시간, 프로세스 RSS/WASM memory, 대형 타일 seam은 모두 미실측이다. 브리지의 존재만으로 해당 엔진을 제품 완료 또는 CSP 비열위로 표시하지 않는다.

## 후보 비교

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ToonStudio `ExternalFilterBridge` 중립 프로토콜 | 엔진 의존성 0, strict schema/version/origin/provider/license/fingerprint, ArrayBuffer transfer, 요청 격리, 진행률·취소 ACK·쿼터·크래시 회수를 한 경계에서 강제 | 실제 Worker/ToonBridge adapter와 필터 엔진 없음. 이미지 외 포맷·타일 스트림·HDR은 아직 프로토콜 범위 밖 | 브리지는 픽셀을 변형하지 않으므로 자체 품질 점수 없음. 전달 바이트 왕복은 테스트에서 exact | 결정적 가상 시계 1,000회: **0.110/0.135/0.135ms**. 실제 wall/process/network 수치가 아님 | 동시 1개 32×32 RGBA8에서 예약 peak **8,192B**(입력+예상 출력). JS heap/RSS가 아님 | Studio 번들에는 순수 TS만 추가. 외부 엔진 바이너리 0B | descriptor canonical sort+FNV-1a fingerprint, 요청 ID routing, monotonic progress. 엔진 결정성은 capability 주장 후 별도 검증 | 자체 브리지 코드. 외부 바이너리 라이선스는 provider별 allowlist/notice/source로 분리 | 전체 RGBA 입력+출력 각 1회 transfer. 엔진 프로세스/네트워크 비용은 미측정 | 프로토콜 버전 진화, adapter가 신뢰 origin을 잘못 바인딩할 위험 | **제품 경계 기준선**. 실제 격리 provider가 통과해야만 final lane 활성화 |
| G'MIC 별도 Local ToonBridge / Worker | 600+ 창작·복원·패턴 필터 생태계와 recipe 확장성 | 별도 바이너리 빌드·sandbox·업데이트·source/notice 배포, recipe별 seed/결정성, 실제 취소 연결 필요 | 공식 생태계의 정성 상한은 높으나 ToonStudio golden corpus 실측 없음 | **미실측** — 실제 provider 필요 | **미실측** — libgmic RSS/peak tile memory 필요 | **미실측** — Studio 번들에는 포함 금지, 별도 설치/호스트 비용 | recipe·seed·thread 고정 후 golden hash를 통과해야 함 | CeCILL 계열. 컴포넌트별 정확한 라이선스와 의무는 배포 전 법무/SBOM 재확인 | 프로세스 경계 RGBA transfer와 recipe 직렬화. 대형 문서는 타일 프로토콜 후보 | 버전별 recipe 변화, 커뮤니티 script 권리, 단일 provider 운영 | **창작 필터 final 후보**, 현재 quarantine |
| GEGL 별도 Local ToonBridge / Worker | operation graph와 float 처리로 비파괴 EffectGraph final DAG에 구조적으로 적합 | glib/babl 배포, operation metadata mapping, 실제 cancel/progress adapter, HDR/색관리 프로토콜 필요 | GIMP 계열 정성 근거는 있으나 ToonStudio reference와 비교한 수치 없음 | **미실측** — 실제 provider 필요 | **미실측** — graph cache/RSS/타일 peak 필요 | **미실측** — Studio 번들에는 포함 금지, 별도 프로세스 비용 | operation/version/seed 고정과 reference hash 필요 | GEGL library LGPL, 도구 일부 GPL. 실제 배포 구성요소별 의무 검토 필요 | EffectGraphIR→GEGL chain compile + RGBA/향후 float tile 교환 | operation/version drift, 네이티브 dependency, 자동 UI metadata drift | **비파괴 DAG final 후보**, 현재 quarantine |
| 원격 격리 filter service | 설치 없이 확장 가능하고 copyleft 실행 환경·GPU/CPU를 서버에서 통제 | 사용자 원본 업로드 동의, 암호화, 데이터 보존/지역, 네트워크 취소·재시도·요금·오프라인 문제 | 서버 고정 환경으로 재현 가능하지만 전송 압축/색관리까지 실제 비교 필요 | **미실측** | 클라이언트 peak 미실측, 서버 memory 별도 | Studio 번들 엔진 0B, 네트워크 및 운영 비용 증가 | provider build pin과 response hash 필요 | 서버 배포/네트워크 제공 의무는 법무 검토 필요 | 인코딩·업로드·다운로드가 로컬 bridge보다 큼 | 개인정보·가용성·비용·vendor lock-in | **명시적 동의가 있는 선택형 fallback이 아닌 별도 provider 후보** |

## 구현된 능력 경계

- 프로토콜 토큰은 `toonspectrum.external-filter`, 버전은 `1`로 고정한다. 알 수 없는 필드도 거부해 구버전/신버전 의미가 섞이지 않게 한다.
- transport adapter가 전달한 실제 origin을 exact allowlist로 검사하고, descriptor의 origin과도 일치시킨다. Worker의 빈 `MessageEvent.origin`을 그대로 신뢰하지 않으며 adapter가 생성 시 고정한 synthetic origin(예: `toonbridge://local.gmic`)을 사용해야 한다.
- provider allowlist는 provider ID와 허용 SPDX 목록을 한 항목으로 결합한다. 허용 provider의 라이선스를 다른 provider의 허용 라이선스로 바꾸는 교차조합은 통과하지 않는다.
- descriptor는 capability를 operation ID로 정렬한 canonical JSON의 `efd-v1-*` fingerprint를 handshake에서 대조한다. `binaryBundled=false`, HTTPS source/notice URL을 필수로 한다.
- 실행 입력은 `rgba8/srgb` 전체 프레임만 허용한다. width×height×4와 ArrayBuffer 길이가 정확히 일치해야 하고, 입력·예상 출력 메모리를 실행 전에 함께 예약한다.
- progress는 `[0,1]`의 비감소 수열이다. 회귀·미선언 progress·unknown request·malformed message는 provider 신뢰 위반으로 bridge 전체를 실패시킨다.
- AbortSignal과 runtime timeout은 provider에 cancel을 보내며, ACK 전에는 결과를 완료로 인정하지 않는다. ACK가 제한 시간 안에 없으면 `CANCEL_ACK_TIMEOUT`으로 끝낸다.
- 완료된 요청 ID는 bounded tombstone으로 보관해 늦은 result/progress가 새 작업에 들어가지 않게 한다. crash/messageerror/dispose는 모든 타이머·Abort listener·요청·메모리 예약을 회수한다.
- 이 API에는 자동 provider 교체나 품질 하향 fallback이 없다. 실패는 구조화된 `ExternalFilterBridgeError`로 호출자에게 전달된다.

## 남은 승격 블로커

1. G'MIC과 GEGL 각각의 실제 별도 배포 provider, reproducible build, SBOM, source/notice endpoint.
2. golden corpus reference 이미지와 CSP 동일 작업의 blind visual/feel 평가. bridge round-trip 성공은 품질 증거가 아니다.
3. 실제 브라우저↔Worker 또는 브라우저↔Local ToonBridge에서 p50/p95/p99, peak JS/WASM/native RSS, 8K/웹툰 타일 seam, NaN/overflow, 8h/24h soak.
4. cancel ACK가 실제 엔진 연산을 중단했음을 프로세스 CPU/RSS로 확인하는 fault test.
5. HDR/linear-float/color-profile/tiled streaming은 protocol v2 후보이며 v1 메시지에 임의 필드를 추가하지 않는다.
