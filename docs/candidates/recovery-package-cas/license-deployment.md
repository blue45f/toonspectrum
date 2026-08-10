# Recovery package CAS license and deployment

## 구성과 라이선스

| Component | Deployment role | License / notice action |
| --- | --- | --- |
| WebCrypto `SubtleCrypto.digest("SHA-256")` | v1 content digest | 브라우저 Web Platform API라 별도 JS/WASM 배포물 없음. 브라우저 binary를 앱에 포함하지 않음 |
| ToonSpectrum `studio-package-archive` writer와 recovery reader | deterministic ZIP32/store container, CRC/path/bounds | 저장소 프로젝트 라이선스 적용. 새 외부 라이브러리 없음 |
| `@sqlite.org/sqlite-wasm 3.53.0-build1` | source/destination local history authority | SQLite core public domain. 기존 exact pin·SBOM·notice 정책 유지 |
| `blake3-wasm 2.1.5` | 비교 challenger, 제품 미사용 | MIT. 현재 `wrangler`의 전이 devDependency라 제품 import/배포 권위 없음. direct 채택 시 exact pin·notice·security review 필요 |
| `hash-wasm 4.12.0` | registry 조사 후보, 미설치·미실행 | MIT. 채택 전 실제 browser chunk와 공급망 검토 필요 |

이 문서는 법률 의견이 아니다. 실제 배포 SBOM, notice generator와 보안 audit가 최종 권위다.

## 배포 비용 판정

- 선택된 SHA-256: 증분 runtime JS/WASM **0B**.
- 현재 BLAKE3 후보의 browser WASM 파일: **34,398B**, glue/lazy chunk 별도.
- `blake3-wasm` 설치 디렉터리 관측 크기: 약 1,048KiB. 이 값은 gzip network chunk가 아니다.
- npm registry의 `hash-wasm 4.12.0` unpacked size: **1,799,970B**. 실제 제품 chunk는 미측정.

성능 한 항목보다 기존 주소 호환성, cold init, CSP WASM, license/SBOM과 migration 비용을 함께
통과해야 challenger를 제품에 넣을 수 있다.

## 브라우저 요구사항

- Secure Context의 `globalThis.crypto.subtle`.
- Blob/ArrayBuffer/Uint8Array와 AbortSignal.
- 파일 저장/열기 UX는 caller 제공 port. File System Access API가 필수 계약은 아니며 브라우저별
  picker 또는 download/upload input adapter를 별도로 구현할 수 있다.
- ZIP은 compression 없이 생성하므로 deflate native/WASM dependency가 없다.
- 최대 archive 256MB를 위한 충분한 JS heap. 현재 writer는 deterministic byte output을 위해
  output buffer를 소유하므로 low-memory 장치에서 사전 한도를 더 낮춰야 한다.

## 데이터·권리 경계

manifest는 package/project identity와 첨부별 권리를 포함한다.

- owner, SPDX-ish license token, attribution, notice.
- attachment name/kind/source format/tags.
- stable IR snapshot/journal과 opaque content bytes.
- 엔진 객체, GPU handle, 인증 토큰, 서버 URL은 허용하지 않는다.

권리 정보가 있다는 사실이 사용 허가를 자동 승인한다는 뜻은 아니다. unknown/custom license를
제품의 rights gate가 별도로 판단해야 한다. 복구 패키지는 받은 선언을 canonical하게 보존하는
역할만 가진다.

## 외부 파일 port와 서버 경계

`StudioV12RecoveryPackageExportFilePort.save`와
`StudioV12RecoveryPackageImportFilePort.open`만 제공한다. 구현 모듈에는 `fetch`, cloud SDK,
credential 또는 자동 background upload가 없다. 사용자가 파일을 명시적으로 선택하거나 저장하는
호스트 UX가 있어야만 origin 밖으로 bytes가 이동한다.

## cloud upload 릴리스 블로커

cloud backup으로 승격하려면 별도 provider 후보 조사와 다음 증거가 필요하다.

- client-side encryption과 key recovery/rotation.
- resumable multipart, retry/idempotency, 서버 측 SHA-256 재검증.
- retention/version/delete/export 정책, 지역·개인정보·저작권 검토.
- 계정 인증/탈취 대응과 감사 로그.
- quota/billing 및 provider outage fault injection.
- 다운로드 후 동일 manifest/history/attachment 인증과 새 DB recovery parity.

이 블로커가 남아 있으므로 현재 기능명은 “외부 복구 패키지”이며 “클라우드 백업 완료”가 아니다.
