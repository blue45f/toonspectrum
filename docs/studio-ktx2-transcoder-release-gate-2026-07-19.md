# Studio KTX2/Basis transcoder release gate — 2026-07-19

## 목적과 보안 경계

기존 `studio-bg3d-ktx2-validation.ts`는 KTX2 header, level index, DFD, KVD, SGD와
Zstandard frame envelope를 디코더 없이 검증한다. 이 검사는 offset·allocation 폭탄과 glTF에서
허용하지 않는 형식을 렌더러 전에 차단하지만, 임의의 ETC1S/UASTC 압축 payload가 실제로
transcode 가능한지까지 증명하지는 않는다.

이번 release gate는 구조 검사와 별도로 다음 경계를 추가한다.

1. Three `0.184.0`에 포함된 공식 `basis_transcoder.js`와 `basis_transcoder.wasm`의 정확한 크기와
   SHA-256을 고정한다.
2. Worker 또는 실행 realm은 사용할 두 자산의 private snapshot을 직접 해시한 뒤에만 same-realm
   capability를 발급하고, decoder는 그 capability가 내주는 verified asset copy만 사용한다.
3. payload는 private snapshot으로 만든 뒤 구조, source byte ceiling, RGBA8 decoded-memory ceiling,
   선택적 attachment SHA-256을 모두 통과해야 transcode job으로 admission된다. Decoder에는 원본 배열을
   다시 넘기지 않고 admission이 내주는 verified source copy만 전달한다.
4. GLB가 `KHR_texture_basisu`를 필수 확장으로 선언하면 renderer allowlist와 attested capability가
   모두 필요하다. 문자열 allowlist만으로는 통과하지 않는다.
5. capability는 인증 토큰이 아니다. 구조적으로 같은 객체를 만들거나 `postMessage`로 복제해도
   발급 realm의 `WeakSet` proof가 없으므로 거부한다. 현재 GLB validation Worker protocol도 이
   필드를 명시적으로 거부한다. 제품 import 경로는 아직 capability를 전달하지 않아 required Basis를
   거부하며, off-main validation API도 main-realm capability를 UI thread로 폴백하지 않고
   `basis-worker-attestation-required`로 명시적으로 거부한다.

하드 상한은 단일 KTX2 source 64 MiB와 전체 mip의 보수적 RGBA8 allocation 256 MiB다. GLB의
mobile/desktop texture budget이 더 작으면 기존 문서 예산이 우선한다.

## 실제 decoder corpus

`studio-bg3d-ktx2-transcoder-corpus.test.ts`는 네트워크 없이 아래 Three r184 공식 fixture의 정확한
upstream bytes를 사용한다.

| fixture | encoding | source bytes | mip | decoded RGBA32 bytes |
| --- | --- | ---: | ---: | ---: |
| `2d_etc1s.ktx2` | ETC1S + BasisLZ | 966 | 6 | 8,520 |
| `2d_uastc.ktx2` | UASTC | 2,560 | 6 | 8,520 |

테스트는 다음을 실제 실행한다.

- JS/WASM asset 크기와 SHA-256 확인
- Emscripten Basis module 초기화
- `KTX2File.isValid()` 및 `startTranscoding()` 확인
- 모든 mip를 portable `RGBA32` target으로 실제 transcode
- 모든 mip를 결합한 출력 길이와 SHA-256 golden 확인
- attestation/admission 직후 caller-owned JS·WASM·payload를 변조해도 private verified snapshot으로 decode
- 한 바이트가 바뀐 WASM, payload checksum drift, shape-equal forged capability 거부

fixture는 [Three r184 KTX2 examples](https://github.com/mrdoob/three.js/tree/r184/examples/textures/ktx2),
실행 자산은 Three 패키지의 `examples/jsm/libs/basis`에서 가져온다. Basis runtime 자산의 upstream
license는 해당 디렉터리 README에 명시된 Apache License 2.0이며, Three repository는 MIT license다.
KTX2/Basis 형식 계약은 [KTX 2.0 specification](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html),
[KHR_texture_basisu](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu),
[Khronos KTX Software](https://github.com/KhronosGroup/KTX-Software)를 기준으로 한다.

## 의도적으로 남은 경계

이 gate가 임의의 사용자 payload를 renderer 전에 전부 실제 decode한다는 뜻은 아니다. 현재 보장 범위는
다음과 같이 구분한다.

- **보장:** 구조 검증, GLB 전체 content hash, 선택적 KTX2 payload hash, 해시한 JS/WASM 및 payload
  private snapshot과 corpus decode 입력의 소유권 결합, 알려진 ETC1S/UASTC corpus의 실제 decoder
  동작과 출력 checksum.
- **미보장:** 모든 임의 payload의 사전 transcode 성공, GPU별 compressed target의 pixel golden,
  브라우저 Worker의 장시간 heap 회수·context-loss 복원, UASTC+Zstd 실제 decode corpus.

따라서 decoder는 각 mip의 `transcodeImage()` 실패를 계속 최종 실패로 처리해야 하며, capability만으로
payload semantics가 검증됐다고 간주하면 안 된다. 다음 단계는 validation Worker가 동일 자산을 직접
fetch·attest한 후 사용자가 올린 KTX2를 제한된 RGBA32 또는 기기 target으로 사전 transcode하고,
시간·heap·취소·Worker 재생성까지 계측하는 것이다.
