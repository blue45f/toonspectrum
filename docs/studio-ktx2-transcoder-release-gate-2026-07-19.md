# Studio KTX2/Basis transcoder release gate — 2026-07-19

## 목적과 보안 경계

기존 `studio-bg3d-ktx2-validation.ts`는 KTX2 header, level index, DFD, KVD, SGD와
Zstandard frame envelope를 디코더 없이 검증한다. 이 검사는 offset·allocation 폭탄과 glTF에서
허용하지 않는 형식을 렌더러 전에 차단하지만, 임의의 ETC1S/UASTC 압축 payload가 실제로
transcode 가능한지까지 증명하지는 않는다.

이번 release gate는 구조 검사와 별도로 다음 경계를 추가한다.

1. Three `0.184.0`에 포함된 공식 `basis_transcoder.js`와 `basis_transcoder.wasm`의 정확한 크기와
   SHA-256을 고정한다.
2. 제품 validation Worker는 upstream JavaScript 원문을 Worker 전용 raw module 값으로 복원하고,
   WASM은 manifest의 정확한 길이로 bounded streaming fetch한다. 같은 Worker realm에서 두 private
   snapshot을 직접 해시한 뒤에만 capability를 발급하며, decoder는 capability가 내주는 verified
   asset copy만 사용한다. Vite 개발 서버가 일반 `.js?url` 요청에 source map을 덧붙이는 경우도
   raw source의 원래 bytes를 해시하므로 개발/배포 환경의 실행 계약이 같다.
3. payload는 private snapshot으로 만든 뒤 구조, source byte ceiling, RGBA8 decoded-memory ceiling,
   선택적 attachment SHA-256을 모두 통과해야 transcode job으로 admission된다. Decoder에는 원본 배열을
   다시 넘기지 않고 admission이 내주는 verified source copy만 전달한다.
4. GLB가 `KHR_texture_basisu`를 필수 확장으로 선언하면 renderer allowlist, attested capability,
   실제 payload preflight callback이 모두 필요하다. 문자열 allowlist만으로는 통과하지 않는다.
   제품 Worker는 optional/required 여부와 관계없이 참조된 모든 ETC1S/UASTC 이미지의 모든 mip를
   RGBA32로 실제 transcode하고, decoder 크기·형식·level 결과가 구조 검사의 보수적 allocation과
   정확히 일치할 때만 GLB를 renderer로 보낸다.
5. capability는 인증 토큰이 아니다. 구조적으로 같은 객체를 만들거나 `postMessage`로 복제해도
   발급 realm의 `WeakSet` proof가 없으므로 거부한다. GLB validation Worker protocol은 capability,
   preflight 함수, runtime provider, digest adapter를 모두 명시적으로 거부하고 Worker가 자체 런타임을 만든다.
   off-main API에 main-realm capability/preflight를 주어도 UI thread로 폴백하지 않고
   `basis-worker-attestation-required`로 거부한다.
6. Worker 한 개 안에서는 WASM job을 직렬화한다. queued/fetch/hash/mip 경계에는 협조적 AbortSignal을
   적용하고, 동기 `transcodeImage()` 실행 중 취소는 해당 Worker를 terminate하는 hard boundary로
   처리한다. 다음 요청은 새 Worker realm과 새 WASM heap에서 복구한다.
7. Basis lazy initialization은 GLB 원문의 raw substring을 검색하지 않는다. GLB hash/container/JSON
   parse 이후 `extensionsUsed`, `extensionsRequired`, `image/ktx2`, texture extension의 parsed-root
   evidence가 있을 때만 Worker 내부 provider를 호출한다. 따라서 `KHR\u005ftexture\u005fbasisu`처럼
   JSON escape로 작성된 유효 문서도 preflight를 건너뛸 수 없고, generator/설명에 이름만 들어간
   문서는 WASM 초기화를 유발하지 않는다. Provider가 실패하면 optional Basis도 fail-closed다.

하드 상한은 단일 KTX2 source 64 MiB와 전체 mip의 보수적 RGBA8 allocation 256 MiB다. GLB의
mobile/desktop texture budget이 더 작으면 기존 문서 예산이 우선한다.

## 실제 decoder corpus

`studio-bg3d-ktx2-transcoder-corpus.test.ts`는 네트워크 없이 아래 Three r184 공식 fixture의 정확한
upstream bytes를 사용한다.

| fixture | encoding | source bytes | mip | decoded RGBA32 bytes |
| --- | --- | ---: | ---: | ---: |
| `2d_etc1s.ktx2` | ETC1S + BasisLZ | 966 | 6 | 8,520 |
| `2d_uastc.ktx2` | UASTC | 2,560 | 6 | 8,520 |
| `valid_R8G8B8A8_SRGB_2D_UASTC_ZSTD_1.ktx2` | UASTC + Zstd | 317 | 1 | 256 |

테스트는 다음을 실제 실행한다.

- JS/WASM asset 크기와 SHA-256 확인
- Emscripten Basis module 초기화
- `KTX2File.isValid()` 및 `startTranscoding()` 확인
- 모든 mip를 portable `RGBA32` target으로 실제 transcode
- 모든 mip를 결합한 출력 길이와 SHA-256 golden 확인
- Khronos UASTC+Zstd의 portable RGBA32 pixel SHA-256 golden과 ETC1/ETC2/BC1/BC3/BC7/ASTC
  compressed-target byte golden 확인
- attestation/admission 직후 caller-owned JS·WASM·payload를 변조해도 private verified snapshot으로 decode
- 한 바이트가 바뀐 WASM, payload checksum drift, shape-equal forged capability 거부
- 성공/실패/취소/폐기에서 `KTX2File.close()`와 `.delete()` 및 live-file 수가 항상 정리되는지 확인
- runtime generation, job/source/decoded bytes, peak mip allocation, 보수적 peak job heap,
  cleanup failure와 Worker create/terminate/recovery 사유 계측 확인

fixture는 [Three r184 KTX2 examples](https://github.com/mrdoob/three.js/tree/r184/examples/textures/ktx2)와
[KTX-Software-CTS](https://github.com/KhronosGroup/KTX-Software-CTS),
실행 자산은 Three 패키지의 `examples/jsm/libs/basis`에서 가져온다. Basis runtime 자산의 upstream
license는 해당 디렉터리 README에 명시된 Apache License 2.0이며, Three repository는 MIT license다.
KTX2/Basis 형식 계약은 [KTX 2.0 specification](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html),
[KHR_texture_basisu](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu),
[Khronos KTX Software](https://github.com/KhronosGroup/KTX-Software)를 기준으로 한다.

## 현재 보장과 의도적으로 남은 경계

- **제품 Worker에서 보장:** 구조 검증, GLB 전체 content hash, exact JS/WASM same-realm attestation,
  참조된 임의 KTX2 payload의 private snapshot admission, 모든 mip의 RGBA32 실제 pretranscode,
  decoder output allocation 일치, 실패 시 renderer 미진입, 직렬 WASM 실행, hard abort 후 새 Worker 복구.
- **release corpus에서 보장:** ETC1S, UASTC, UASTC+Zstd의 실제 decoder 동작과 portable pixel golden,
  여러 GPU compressed target의 결정적 output-byte golden. production Vite build가 JS/WASM 원본과
  같은 길이·SHA-256을 내보내고 실제 Chromium module Worker가 required UASTC+Zstd GLB를
  `execution: worker`, `code: valid`로 통과하는 것도 검증했다.
- **의도적으로 미보장:** ETC/BC/ASTC byte golden은 실제 GPU가 그 block을 그린 pixel golden이 아니다.
  GPU driver별 sampling/color-space 결과와 WebGL/WebGPU context loss는 renderer conformance 영역이다.
  Basis preflight 자체는 CPU/WASM이므로 GPU context를 소유하지 않는다. 또한 `peakEstimatedJobHeapBytes`는
  소유권 경계의 source copy와 한 mip allocation을 보수적으로 계산한 값이며 브라우저 엔진 내부 WASM
  allocator의 실측 telemetry는 아니다. CSP가 attested glue 평가를 금지하거나 asset fetch/hash/init가
  실패하면 required/optional Basis 모두 안전하게 거부된다.
