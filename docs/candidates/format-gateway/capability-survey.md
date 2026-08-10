# ToonStudio V12 — FormatGateway 외부 브러시 포맷 능력 조사

- 기준일: 2026-08-09
- 범위: Clip Studio Paint `.sut`/`.sutg`, Krita `.bundle`/`.kpp`, bundle 내부 `.myb`
- 권위 문서:
  - `docs/architecture/ToonStudio_최종공유본_초확장_멀티엔진_제품기능_UIUX_성능품질_아키텍처_V5_2026-08-07.md` §14.8~14.12 및 포맷 매트릭스 SUT/SUTG/KPP-BUNDLE 행
  - `docs/architecture/ToonStudio_기존스튜디오_인플레이스전면교체_하이브리드최종아키텍처_V11.1_2026-08-07.md`
  - `docs/architecture/ToonStudio_Vello차세대엔진_공격적활용_CSP초월_인플레이스최종아키텍처_V12_2026-08-08.md`
  - `docs/adr/0008-license-isolation-policy.md`
- 판정 원칙: 공개·검증 가능한 구조만 의미 객체로 내리고, 나머지는 원본 바이트와 구조화된 `unsupported` 기록으로 보존한다. 폐쇄 포맷의 부분 해석을 완전 호환으로 표시하지 않는다.

## 1. 착수 시점 감사 결과

| 포맷 | 착수 전 상태 | 이번 수직 슬라이스 결과 | 정직한 지원 등급 |
| --- | --- | --- | --- |
| MYB v3 | 직접 파서와 `BrushProgramIR` lowering 존재 | Krita bundle 내부 `.myb`에 재사용 | F1에 가까운 구조형 import. 미매핑 setting은 별도 기록 |
| ABR | v1/v2 직접 파서 존재, v6+ 명시 거부 | 범위 외, 회귀만 보존 | 버전 제한 F2 |
| KPP | PNG 청크 + `preset` XML, paintbrush/mypaintbrush 부분 lowering 존재 | Krita bundle resource lane에 연결, MD5·권리·태그·원본 bundle 보존 추가 | F2 부분 구조형 |
| Krita `.bundle` | 없음 | 공식 bundle container 구조에 맞춘 bounded ZIP/manifest/meta/resource import 구현 | F2 부분 구조형. KPP/MYB만 의미 lowering |
| CSP `.sut` | 없음 | SQLite container 검사 + 주입형 sandbox reader + 검증 필드 부분 lowering + 원본 보존 구현 | 기본 F5, 검증된 행만 F2 부분 구조형 |
| CSP `.sutg` | 없음 | SUT와 같은 보존/검사 경로, reader가 제공한 결정적 행 순서로 다중 preset import | F3/F5 혼합. 공식 그룹 스키마·관계는 미검증 |

## 2. 후보 조사

수치는 `tests/format-gateway/results/external-format-import.json`의 Apple M2 Max/Node 24 단일 프로세스 소형 자가 제작 corpus 결과다. 실제 대형 사용자 bundle이나 CSP 버전 corpus 결과로 확대 해석하지 않는다. Peak Memory는 300회 루프 동안 `heapUsed`가 강제 GC 기준선보다 증가한 최대치이며, 네이티브 SQLite·WASM RSS는 포함하지 않는다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ToonStudio clean-room gateway: bounded ZIP/XML/PNG/MD5 + `BrushProgramIR` lowering | 새 npm 의존성 없이 stable IR, 원본 payload, rights, 구조화된 손실 보고를 한 경계에서 보장. Krita KPP/MYB의 기존 검증 파서를 그대로 재사용 | Krita의 모든 resource 종류·엔진별 옵션·bundle export/reopen 미구현. SUT proprietary 관계 스키마를 추측하지 않음 | KPP 실제 Hokusai 렌더 결정성 통과: 192×96 alpha mass 169,219, 1,700 inked px, SHA-256 고정. Krita 앱 픽셀 parity는 실제 외부 asset 부재로 미측정 | Krita authored 3,339B all-deflate bundle: **0.4598/0.7690/0.9962ms** | 18,596,552B JS heap delta/300회. 단일 import peak가 아님 | 신규 외부 bundle 0B. 패키지 로컬 TS 파서와 호출자 제공 raw-DEFLATE adapter. UI thread가 아닌 Worker 실행 필요 | 경로+resource bytes 기반 ID, code-point sort, 같은 입력 결과 deep-equal; 렌더 SHA-256 고정 | 자체 코드. ZIP/MD5/XML 구현은 리포 내부 코드. Krita core 미결합 | KPP/MYB → stable IR 1회. 원본 bundle base64 보존 비용 있음 | 공개 bundle 구조·Krita 버전 변화, 독립 MD5/XML/ZIP 유지보수 | **주력 직접 경로**: Krita bundle inventory/rights/KPP/MYB import |
| `@sqlite.org/sqlite-wasm` Worker + clean-room SUT semantic adapter | 공식 `sqlite3_deserialize` API로 원본 복사본을 `FREEONCLOSE \| READONLY` in-memory DB로 열고, table/column/row/text/BLOB 한도를 Worker 안에서 강제한다. Worker 불가/오류는 preserve-only | CELSYS가 table/column/관계·버전 계약을 공개하지 않음. tip/material 결합, dual brush, texture, tilt/velocity, color mixing, 그룹 taxonomy 미검증 | 자가 제작 verified subset을 Hokusai로 실제 렌더: pressure-alpha Pearson **0.905894**, high/low mass **337.828916×**, 5단계 단조 증가, 재실행 SHA-256 고정. CSP 원본 앱 비교는 미측정 | Node reader authored SUTG 12,288B: **1.3508/1.5272/1.6353ms**. 실제 Chromium에서 production code-path Vite module Worker cold 2회: **127.80~160.20ms**(dev transform, Worker 생성+WASM 초기화 포함); 표본이 작아 p50/p95는 미산출 | Node 측정 16,746,008B JS heap delta/300회. 브라우저 Worker WASM peak/RSS는 미측정 | 설치된 `@sqlite.org/sqlite-wasm` 3.53.0-build1을 dynamic import하며 전용 Vite module Worker에서만 실행. production build 산출 chunk 크기는 미측정 | 파일 hash+table+row index 기반 ID. PK/rowid 결정 순서, 원본 JS bytes 불변, READONLY 실제 UPDATE 거부·export byte-equal 통과 | SQLite core public domain; npm wrapper 3.53.0-build1 `Apache-2.0`. 테스트 `node:sqlite`는 제품 번들 아님 | DB bytes→WASM heap copy→typed snapshot 1회. 한 import 후 Worker 종료 | 비공개 스키마 오판과 127.80~160.20ms cold start가 현재 위험. alias 승격은 실제 CSP 양방향 증거 필수 | **활성 조건부 경로**: production Worker+verified field lowering, 나머지 F5 보존 |
| Krita headless / local ToonBridge validator | 실제 Krita가 bundle/KPP를 재개방하고 렌더하므로 엔진별 의미와 resource dependency 검증에 가장 강함 | 브라우저 직접 실행 불가, Qt/Krita 설치·버전 관리·sandbox 필요, Web bundle에 결합 불가 | 잠재 기준선이나 이 슬라이스에서는 미측정 | 미측정 | 미측정 | 별도 로컬 프로세스/서비스. 앱 전체 설치 비용 | 버전·폰트·색관리·브러시 엔진에 따라 결과 고정 필요 | Krita GPL-3.0-or-later. 제품 웹 번들에는 혼합하지 않고 프로세스 경계/reference-only | 파일 IPC + 렌더 reference 반환 | 설치 유무, 버전 drift, GPL 경계, 공격성 입력 sandbox | **선택형 검증 bridge**. 직접 파서의 승격 증거 생성용이며 제품 주력 parser 아님 |
| Clip Studio Paint 공식 import/export + 선택형 ToonBridge verifier | 폐쇄 SUT/SUTG 의미를 판단할 수 있는 유일한 실제 기준 앱. 그룹 순서·재질 링크·획 결과를 검증 가능 | 공개 machine-readable schema/SDK 없음. 사용자 라이선스·설치·UI 자동화 제약. 이 슬라이스에는 실제 corpus 없음 | 최종 CSP 비열위 판단의 필수 기준선이나 현재 **미측정** | 미측정 | 미측정 | 제품에 라이브러리로 번들하지 않음. 사용자가 설치한 앱과 명시적 opt-in 경계 필요 | CSP 버전·장치·설정 고정 corpus 필요 | CELSYS proprietary application 및 사용자 asset 권리 준수 | export/import 자동화 또는 사람이 승인한 캡처 비용 큼 | 비공개 포맷 변화, 자동화 취약성, 재배포 금지 | **필수 외부 검증 후보**. 스키마 추측 대신 승격/교체 조건의 증거 공급 |

## 3. 구현된 정확한 subset

### 3.1 Krita resource bundle

- ZIP32의 stored/raw-DEFLATE entry를 읽는다. 암호화, ZIP64, data descriptor, 경로 탈출, 중복 canonical path, CRC 불일치, 압축 비율·총량·entry 수·경로 길이 초과는 거부한다.
- `META-INF/manifest.xml`과 `meta.xml`을 필수로 하고, 외부 entity·DTD·비표준 entity·과도한 XML 깊이/노드/속성을 거부한다.
- 검증 기준은 manifest 1.2, bundle metadata version 1이다. 다른 버전은 조용히 통과시키지 않고 `manifest-version-unverified`/`bundle-version-unverified`로 기록한다.
- manifest resource MD5를 독립 RFC MD5 구현으로 확인한다. 불일치는 해당 resource를 `rejected`로 표시하고 의미 import하지 않는다.
- metadata의 author, creator, initial creator, license, website, email, title, description, creation/modified date, tag를 `rights`/metadata로 보존한다. 알 수 없는 metadata field도 원문 값과 `metadata-field-unsupported`를 함께 남긴다.
- `paintoppresets/*.kpp`는 기존 KPP parser로, `.myb`는 MYB v3 parser로 lowering한다. KPP의 unmapped field와 MYB의 unmapped setting은 resource path를 포함한 구조화 record다.
- pattern, gradient, palette, workspace, template, gamut mask, font, unknown media type은 inventory와 전체 source payload에는 보존하지만 의미 변환하지 않는다.
- `preview.png`는 선택 사항이며 부재는 warning이다. manifest에 없는 ZIP entry는 `unmanifested-resource`다.

### 3.2 CSP SUT/SUTG

- CELSYS 공식 문서가 세부 schema를 공개하지 않으므로, SQLite 3 signature/header 검사는 container 식별일 뿐 전체 형식 인증으로 간주하지 않는다.
- 기본 동작은 원본 전체 base64 보존이다. sandboxed `CspSutSqliteReader`가 없거나 읽기에 실패하면 `preserve-only`로 끝나며 지원 완료로 표시하지 않는다.
- reader snapshot에는 table 수, column 수, 총 row 수, text/blob 길이와 값 타입 제한을 다시 적용한다. reader가 UI/main thread와 신뢰 경계를 공유한다고 가정하지 않는다.
- clean-room 확인 subset은 이름, direct-draw output process, brush size, hardness, spacing, normalized opacity, normalized stabilization, size/opacity pressure graph, author/license/website/email이다.
- pressure graph는 정확히 version 1, stride 8, big-endian header 7×u32, reserved 4개가 0, 2~4,096개의 big-endian finite f64 `[0,1]` tap, 정확한 전체 길이만 허용한다.
- 결과는 round tip, raster-tiles/flatten, Hokusai preference의 `BrushProgramIR`이다. 검증 범위를 벗어난 scalar scale은 추정 변환하지 않고 unsupported로 남긴다.
- `FileData` BLOB에서 CRC와 dimensions가 유효한 PNG를 발견해 자산 inventory에는 넣는다. 공개 관계 schema가 없으므로 특정 brush tip/texture에 붙이지 않고 `sut-material-link-unverified`로 남긴다.
- SUTG의 group/category tree, material foreign key, tool ordering key의 의미는 아직 검증되지 않았다. 현재 순서는 reader가 보장하는 결정적 PK/rowid 순서일 뿐 “CSP 그룹 의미 보존 완료”가 아니다.

## 4. 현재 미지원·승격 차단 항목

| Surface | 현재 상태 | 필요한 승격 증거 |
| --- | --- | --- |
| 실제 CSP SUT/SUTG 버전 matrix | 외부 저작권 asset 없이 authored SQLite만 테스트 | 사용자가 제공하거나 재배포 허가된 여러 CSP 버전 corpus, 공식 앱 재개방, table/field provenance |
| CSP tip/material 관계·dual brush·texture·mixing·tilt/velocity | PNG inventory만 보존, 의미 연결 안 함 | 동일 asset의 관계 키와 CSP 획 시트로 필드별 인과 검증 |
| CSP 그룹 계층·정확한 순서 | row 순서만 결정적 | `.sutg` 공식 앱 import 결과와 category/order 대조 |
| Krita non-KPP/MYB resources | inventory+원본 보존 | 각 공개 resource spec, dependency resolver, target-app reopen corpus |
| Krita engine-specific KPP semantics | 기존 parser가 paintbrush/mypaintbrush subset만 lowering | Krita 렌더 reference와 센서 sweep, color-space 고정 visual diff |
| Krita bundle export/round-trip | import-only | exporter, manifest/MD5 재생성, Krita 재개방 및 semantic diff |
| 브라우저 Worker 실제 통합 비용 | 실제 Chromium + Vite module Worker(dev transform) cold 2회 127.80~160.20ms, SQLite 3.53.0, authored SUTG snapshot 통과. 취소/프로토콜/격리 실패 테스트 통과 | production build에서 충분한 반복 cold/warm p50/p95/p99, peak WASM/RSS, 1MB·128MB 크기 행렬, chunk byte size |
| CSP 비열위 gate | 통과 주장 안 함 | 같은 태블릿·같은 입력 스트림·같은 brush의 blind visual/feel 평가 |

## 5. 근거와 재현 경로

- 기능/보안 테스트: `packages/studio-format-gateway/src/__tests__/csp-sut.test.ts`, `krita-bundle.test.ts`
- 자가 제작 corpus: `tests/corpus/formats/csp-sut-fixtures.ts`, `krita-bundle-fixtures.ts`
- 제품 Worker/SQLite 실측: `src/domains/creator/studio-csp-sut-sqlite-reader-{runtime,client,browser}.test.ts`
- `/studio` SQLite catalog vertical slice: `src/domains/creator/studio-external-brush-product-import.test.ts`, `StudioBrushLibraryPanel.test.tsx`
- 실제 Hokusai 렌더 게이트: `tests/format-gateway/external-brush-format-fidelity.test.ts`
- 품질 원시 결과: `tests/format-gateway/results/external-brush-fidelity.json`
- 성능 하니스/원시 결과: `tests/format-gateway/format-import-benchmark.ts`, `tests/format-gateway/results/external-format-import.json`
- Krita 공식 참고:
  - <https://docs.krita.org/en/user_manual/resource_management.html>
  - <https://invent.kde.org/graphics/krita/-/blob/master/libs/resources/KoResourceBundle.cpp>
  - <https://invent.kde.org/graphics/krita/-/blob/master/libs/resources/KoResourceBundleManifest.cpp>
- SQLite container 참고: <https://www.sqlite.org/fileformat.html>
- Clip Studio `.sut`/`.sutg`의 존재와 공식 앱 import/export 동작은 CELSYS 공식 도움말만 권위로 삼는다. 내부 schema는 공식 규격으로 간주하지 않는다.
