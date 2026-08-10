# Recovery package CAS capability survey

작성일: 2026-08-09
권위 raw data: `tests/benchmarks/results/recovery-package-cas.json`

이 조사의 품질 축은 픽셀 품질이 아니라 **stable IR 의미, recovery frontier, 권리 정보와 첨부
바이트가 외부 파일 왕복 후 정확히 보존되는가**다. 로컬 OPFS/SQLite 내구성은 같은 origin 안의
권위일 뿐 외부 백업이 아니므로, 파일로 꺼낼 수 있는 별도 복구 패키지가 필요하다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WebCrypto SHA-256 + 기존 `sha256:<64hex>` OPFS/project-archive 주소 + deterministic ZIP32/store | 브라우저 기본 API, 제품 증분 JS/WASM 0B, 기존 OPFS asset hash와 `.toonproject.zip` attachment 주소를 그대로 재사용 | SubtleCrypto는 한 호출 안의 취소/streaming hash를 제공하지 않음. 매우 큰 단일 첨부는 현재 128MB 사전 한도로 통제 | **통과**: 1,055,639B 패키지 2회 byte-identical, 8개 첨부 hash 인증, 새 SQLite DB의 seq 33 및 project digest `d51567ff40f6da8e` 동일 | 8MiB hash **3.527/3.666/4.302ms** (40, Node WebCrypto). 패키지 export **4.545/4.970/5.034ms**, 전체 import 인증 **27.922/34.303/40.996ms**, 새 SQLite restore **0.298/0.419/0.419ms** | Node 관측 peak RSS delta **113,590,272B**, ArrayBuffer delta **58,019,780B**. 브라우저 OPFS/WASM peak는 미실측이며 이 수치를 대체값으로 쓰지 않음 | 제품 증분 0B. 기존 archive writer와 WebCrypto 사용 | canonical manifest/history, DOS epoch ZIP, hash 정렬로 동일 입력 byte-identical | WebCrypto는 Web Platform API. 기존 ToonSpectrum writer는 저장소 라이선스 | 기존 content address와 변환 0, 별도 digest namespace 없음 | WebCrypto 지원과 ZIP32 크기 한도. SHA 주소를 바꾸면 기존 모든 자산 참조 migration 필요 | **v1 제품 기준선**. 외부 복구 패키지 integrity와 attachment CAS 소유자 |
| `blake3-wasm` 2.1.5 후보(현재 `wrangler`의 전이 devDependency) | tree hash 구조와 증분 API, 알고리즘상 대용량 병렬 처리 잠재력 | 제품 direct dependency가 아니어서 pnpm strict 환경에서 import 권위 없음. 브라우저 async WASM 초기화·별도 chunk·수명 관리 필요. 기존 SHA 주소와 호환되지 않음 | 동일 8MiB 입력을 실제 설치 후보로 해시했으나 recovery package·브라우저 CAS 왕복에는 통합하지 않음 | 8MiB **10.476/10.877/13.420ms** (40, 현재 Node WASM 후보). 이번 장치/경로에서는 WebCrypto SHA-256보다 느림 | 별도 true peak 미실측. WASM unmanaged state는 digest/dispose 규약을 따라야 함 | 브라우저 WASM 실파일 **34,398B** + glue/lazy chunk. 설치 패키지 전체는 약 1,048KiB. 제품 direct dependency 추가 시 lock/SBOM 필요 | BLAKE3 자체는 결정적이나 SHA 주소와 dual-address migration이 필요 | npm package MIT | 기존 `sha256:` 참조마다 재해시·dual lookup 또는 manifest v2가 필요해 높음 | 전이 의존성 버전 변동, browser bundler/WASM lifecycle, 주소 생태계 분기 | **미채택 challenger**. direct pin과 dual-address migration 증거 없이는 제품 사용 금지 |
| `hash-wasm` 4.12.0 BLAKE3 packaging 후보(미설치) | 유지 중인 multi-hash browser WASM API, BLAKE3 외 hash 실험을 한 패키지에서 제공 | 현재 package/lock에 없음. 이번 corpus에서 실행하지 않았고 recovery 주소 호환성 문제는 동일 | 미실측 | 미실측 | 미실측 | npm registry `dist.unpackedSize` **1,799,970B**; 실제 incremental browser chunk는 미실측 | 알고리즘은 결정적 | MIT | 새 직접 의존성·API adapter·dual-address migration 필요 | 여러 알고리즘을 포함한 공급망/업데이트 표면 | **조사만 수행, 미채택** |

## 선택 판정

SHA-256을 v1로 선택한 이유는 단순히 익숙해서가 아니다.

1. `studio-opfs-asset-store.ts`와 `studio-project-archive.ts`가 이미 압축 전 원본 바이트의
   `sha256:<64hex>`를 안정 주소로 사용한다.
2. WebCrypto는 제품에 이미 존재하며 증분 번들이 0B다.
3. 현재 설치된 BLAKE3 후보는 제품 의존성이 아닌 `wrangler`의 전이 devDependency다.
4. 동일 장치의 8MiB 40회 실측에서 현재 BLAKE3 WASM 경로가 WebCrypto SHA-256보다 빠르지 않았다.
5. BLAKE3로 바꾸면 hash 함수만 바뀌는 것이 아니라 기존 자산 주소·manifest·dedupe 키 전체의
   migration 문제가 생긴다.

## BLAKE3 교체 조건

다음 조건을 모두 충족할 때 manifest v2 후보로 다시 연다.

- 제품 direct dependency exact pin, 라이선스/SBOM/취약점 검토 통과.
- 별도 lazy browser chunk의 실제 gzip/brotli 및 cold init 비용 측정.
- Chromium/Safari/Firefox와 데스크톱 3개 OS에서 8MiB·128MiB p50/p95/p99 및 peak memory 측정.
- 기존 `sha256:` attachment와 충돌 없는 dual-address import/export migration 설계.
- 동일 복구 corpus에서 deterministic bytes, corruption rejection, SQLite digest/seq parity 유지.
- 위 비용을 포함해 대용량 export/import 처리량 또는 메모리가 유의미하게 개선됨.

이 중 하나라도 없으면 BLAKE3 속도 수치 하나만으로 주소 체계를 바꾸지 않는다.
