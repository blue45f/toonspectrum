# ToonStudio V12 — 외부 필터 격리 하이브리드 설계

## 결정

G'MIC·GEGL 같은 copyleft 인접 엔진은 Studio Vite 번들, Studio Worker 번들, Vello/CanvasKit WASM 링크 단위에 넣지 않는다. interactive preview는 기존 CanvasKit/WGSL/OpenCV provider가 소유하고, 실제로 승격된 외부 provider가 있을 때만 final filter island를 `ExternalFilterBridge`로 실행한다. 외부 provider 부재·실패 시 성공처럼 보이는 근사 결과로 조용히 대체하지 않는다.

```text
EffectGraphIR (stable document truth)
  ├─ interactive preview island → CanvasKit / WESL-WGSL / OpenCV
  └─ explicit high-quality final request
       → ExternalFilterBridge v1
       → trusted-origin adapter
       → separately deployed G'MIC or GEGL provider
       → transferred RGBA8 result
       → quality/metadata gate
       → final image cache (engine object is never persisted)
```

## 프로토콜 수명주기

1. **Handshake**: client가 nonce성 `handshakeId`와 protocol v1을 보낸다. provider는 ID를 반사하고 canonical capability/license descriptor와 fingerprint를 돌려준다.
2. **Admission**: bridge가 event origin, descriptor origin, provider별 license allowlist, `binaryBundled=false`, HTTPS source/notice, descriptor fingerprint를 모두 검증한다.
3. **Reservation**: `run` 전에 dimensions, input/output bytes, parameter bytes, runtime, concurrent request, total reserved bytes를 검사한다. 입력과 동일 크기 출력이 동시에 존재할 수 있으므로 둘 다 예약한다.
4. **Transfer**: 입력 ArrayBuffer를 transfer list로 보내 원본 thread의 ownership을 제거한다. 결과도 provider가 transfer한 ArrayBuffer만 수용한다.
5. **Progress**: provider capability가 선언한 경우에만 비감소 `[0,1]` progress를 전달한다. request ID별로 격리한다.
6. **Completion**: operation/dimensions/pixel format/color space/byte length가 원 요청과 정확히 일치할 때만 성공한다.
7. **Cancellation**: AbortSignal 또는 runtime limit이 `cancel`을 보내고 `cancel-ack`를 기다린다. ACK 전 result/progress는 late로 무시한다. ACK timeout은 명시 실패다.
8. **Retirement**: 타이머, Abort listener, reservation을 회수하고 bounded tombstone에 ID를 넣어 늦은 메시지를 억제한다.
9. **Fatal isolation**: malformed/unknown/version/provider/origin/progress-regression/messageerror/crash는 신뢰 경계 손상으로 보고 모든 요청을 실패·회수한 뒤 port를 닫는다.

## 메시지 집합

| Direction | Type | 핵심 필드 | Transfer |
| --- | --- | --- | --- |
| Studio → provider | `client-hello` | protocol, version, handshakeId | 없음 |
| provider → Studio | `provider-ready` | handshakeId, descriptor, descriptorFingerprint | 없음 |
| Studio → provider | `run` | providerId, requestId, operationId, dimensions, rgba8/srgb, params, seed, runtimeLimitMs | input ArrayBuffer |
| provider → Studio | `progress` | requestId, monotonic progress, phase | 없음 |
| provider → Studio | `result` | requestId, original operation/dimensions, rgba8/srgb | output ArrayBuffer |
| provider → Studio | `provider-error` | requestId, code, message, retryable, JSON details | 없음 |
| Studio → provider | `cancel` | requestId, abort/runtime/callback reason | 없음 |
| provider → Studio | `cancel-ack` | requestId | 없음 |
| Studio → provider | `dispose` | providerId | 없음 |

알 수 없는 키를 forward-compatible로 해석하지 않는다. 새 색공간, tiled stream, float format, multi-output은 새 protocol version과 양쪽 adapter 승격으로 추가한다.

## origin adapter 계약

- `ExternalFilterMessagePort`는 raw `MessagePort`를 흉내 내지만 event에 trusted `origin`을 필수로 공급한다.
- Window/remote transport는 브라우저가 제공한 실제 origin을 그대로 전달한다.
- Dedicated Worker처럼 표준 event origin이 비어 있는 transport는 Worker URL을 생성할 때 검증한 origin/provider를 adapter에 닫아 두고 synthetic origin을 붙인다. message payload가 주장하는 origin을 사용하면 안 된다.
- Local ToonBridge는 인증된 channel을 연 뒤 고정 scheme/host를 adapter에 바인딩한다. 임의 WebSocket peer의 self-declared provider ID는 allowlist 증거가 아니다.

## one-primary-surface와 품질 우선 선택

외부 필터는 primary interactive surface owner가 아니다. 펜다운·슬라이더 드래그 중에는 CanvasKit/WGSL preview island가 화면을 소유한다. 사용자가 final 적용을 명시하고 provider가 다음 게이트를 통과했을 때만 전체 filter island 결과를 교체한다.

- 동일 EffectGraphIR/seed/profile의 golden reference 시각 gate 통과
- preview 대비 허용 가능한 의미 차이를 UI에서 명시
- 실제 provider p95/runtime/memory/tile seam/NaN/overflow/cancel/soak 통과
- provider descriptor build ID, engine version, operation capability를 프로젝트 결과 metadata에 기록
- RemoteKillSwitch가 provider를 내리면 새 작업은 즉시 거부하고 진행 중 작업은 명시 실패

현재 실제 provider가 없으므로 G'MIC/GEGL final island는 **quarantine**이다. 브리지 자체의 성공 테스트를 provider 승격으로 해석하지 않는다.

## 오류와 fallback

모든 실패는 `ExternalFilterBridgeError`의 stable code, request ID, retryable, JSON details로 전달한다. 제품 planner가 다른 provider를 시도하려면 사용자가 볼 수 있는 별도 결정과 품질 gate를 거쳐야 하며 브리지 내부에는 자동 fallback이 없다. 특히 timeout·crash·license rejection을 CanvasKit preview 결과로 완료 처리하지 않는다.
