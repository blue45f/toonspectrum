# ToonStudio V12 — 외부 필터 라이선스·배포 경계

이 문서는 엔지니어링 배포 경계를 기록하며 법률 자문이 아니다. 실제 G'MIC/GEGL 배포물의 구성요소별 라이선스, 수정 여부, 네트워크 제공·소스 제공·고지 의무는 릴리스 전에 법무와 SBOM 감사로 확정한다.

## 강제 원칙

1. G'MIC, GEGL, 관련 GPL/CeCILL/LGPL 바이너리와 코드는 Studio Vite bundle, Studio Worker bundle, Vello/CanvasKit WASM, 공통 링크 단위에 포함하지 않는다.
2. Studio 저장소에는 엔진 중립 TypeScript protocol만 둔다. 외부 실행기는 별도 artifact/repository/build pipeline/release manifest를 갖는다.
3. handshake descriptor의 `binaryBundled`는 반드시 `false`다. `true`, 누락, 알 수 없는 키는 license/protocol 실패다.
4. provider ID별로 허용 SPDX 목록을 묶어 allowlist한다. 전역 license union으로 다른 provider의 라이선스를 차용하지 않는다.
5. descriptor에는 exact provider/engine/build version, HTTPS source URL, HTTPS notice URL, capability 목록, origin을 포함하고 canonical fingerprint로 고정한다.
6. Studio가 받는 것은 중립 파라미터와 이미지 데이터뿐이다. 엔진 객체·plugin handle·C ABI pointer·recipe interpreter 코드를 프로젝트 원본에 저장하지 않는다.
7. 외부 provider 실패를 permissive provider의 결과로 조용히 바꿔 성공 처리하지 않는다. planner의 명시적 교체는 별도 품질·권리 gate다.

## 후보별 배포

| Provider | 알려진 라이선스 경계 | V12 기본 배포 | Studio bundle | 필수 release evidence |
| --- | --- | --- | --- | --- |
| G'MIC / libgmic | CeCILL 계열이며 구성요소별 차이가 있을 수 있음 | 별도 Local ToonBridge/격리 Worker 또는 법무 승인된 remote service | **0B, 금지** | exact component SBOM, license text, corresponding source/commit/build script, recipe rights, notice/source URL |
| GEGL | library LGPL, 도구 일부 GPL, babl/glib 등 의존성 개별 확인 | 별도 Local ToonBridge/격리 Worker 또는 법무 승인된 remote service | **0B, 금지** | linked component SBOM, relink/source obligations 검토, source/build/notice, operation plugin 목록 |
| ToonStudio bridge | 저장소 자체 라이선스 | Studio registry package의 순수 TS | 허용 | protocol tests, dependency graph에 외부 엔진 0건, bundle scan |

## 배포 형태

### Local ToonBridge

- 별도 설치·서명·업데이트 채널과 sandbox profile을 사용한다.
- 앱이 검증한 endpoint에서 연결한 channel에 synthetic origin/provider를 닫아 두며, payload가 주장하는 origin을 신뢰하지 않는다.
- source/notice UI와 설치 artifact hash를 provider descriptor/build ID에 연결한다.
- 파일시스템·network 접근은 operation에 필요한 최소 권한만 허용한다. 원본 문서 경로 대신 transfer된 buffer를 사용한다.

### Dedicated Worker

- Worker script 자체가 외부 엔진 바이너리를 포함한다면 Studio app bundle과 동일 배포물로 보지 않도록 별도 origin/artifact/cache namespace가 필요하고, 이 분리가 실제 의무를 충족하는지는 법무 검토가 필요하다.
- Worker 생성 URL과 artifact hash를 host가 검증한 뒤 adapter에 synthetic origin을 바인딩한다.
- 표준 Worker message의 빈 origin을 allowlist 우회 수단으로 허용하지 않는다.

### Remote service

- 사용자 이미지 전송 전 명시 동의, 보존 기간, 암호화, 지역, 삭제, telemetry 정책을 별도 제품 gate로 둔다.
- 네트워크 실패는 로컬 preview를 final 성공으로 표시하지 않는다.
- server binary/source/notice 의무와 서비스 제공 모델의 법적 해석을 별도 검토한다.

## CI·릴리스 감사

- Studio dependency graph, JS/WASM chunks, source maps, notices에서 G'MIC/GEGL/GPL/CeCILL binary signature와 symbol을 스캔한다.
- 외부 provider descriptor의 build ID, engine version, SPDX, source/notice URL, capability fingerprint를 release manifest에 핀한다.
- allowlist 변경은 license 검토와 provider visual/performance/fault evidence를 함께 요구한다.
- source/notice URL의 가용성과 artifact hash를 릴리스 및 정기 감사에서 확인한다.
- provider를 제거해도 프로젝트의 EffectGraphIR과 원본 이미지가 열려야 한다. final cache는 재생성 가능 데이터다.

## 현재 quarantine

실제 별도 배포 provider artifact가 저장소에 없으므로 G'MIC/GEGL visual quality, provider memory, 실제 IPC/Worker overhead, source-offer delivery, target binary SBOM은 검증되지 않았다. 따라서 bridge protocol만 활성 기준선이고 두 엔진 실행 lane은 quarantine이다. 이 상태에서 필터 카탈로그 수나 CSP 비열위를 완료로 보고하지 않는다.
