# ToonStudio V12 — FormatGateway 라이선스·권리·배포 설계

- 기준일: 2026-08-09
- 대상: SUT/SUTG/Krita bundle/KPP/MYB import
- 상위 정책: `docs/adr/0008-license-isolation-policy.md`

## 1. 코드·규격 provenance

| 항목 | 사용 방식 | 라이선스/권리 경계 | 배포 판정 |
| --- | --- | --- | --- |
| ToonStudio clean-room parser | bounded ZIP/XML/PNG/MD5, SUT semantic adapter, stable IR | 리포 자체 코드. 공개 문서·파일 형식 행동을 독립 구현 | 웹/Worker 직접 배포 가능 |
| SQLite file format | header inspection 및 reader port | SQLite 문서는 공개, SQLite core는 public domain. 이 패키지는 core를 정적 포함하지 않음 | parser 직접 배포 가능 |
| `@sqlite.org/sqlite-wasm` 3.53.0-build1 | 제품 `CspSutSqliteReader`; dedicated module Worker에서 dynamic import, 공식 deserialize API 사용 | 설치 package manifest 실측 `Apache-2.0`; SQLite core 자체는 public domain. 배포 NOTICE/SBOM에 package/version/license 고정 | **제품 Worker 활성**; 메인 스레드 fallback 금지, 실패 시 preserve-only |
| Node 24 `node:sqlite` | authored fixture 생성·테스트 reader | Node test runtime API | 제품 브라우저 bundle에 포함 안 됨 |
| Krita source/manual | bundle container/metadata 행동의 공식 reference | Krita GPL-3.0-or-later core를 link/copy하지 않음. 공식 소스의 구조를 참고하되 구현 코드는 독립 작성 | reference-only, ADR-0008 준수 |
| Krita headless bridge | 미래 target-app verifier | GPL 앱은 별도 프로세스·사용자 설치 또는 격리 서비스. 웹 JS/WASM bundle에 혼합하지 않음 | 선택형 격리 후보 |
| Clip Studio Paint | 미래 target-app verifier | CELSYS proprietary 앱·EULA·사용자 라이선스. 파일 asset 권리는 사용자/제작자에게 있음 | 제품 라이브러리로 재배포 안 함 |
| 연구용 제3자 SUT extractor | container/field 가설을 세우는 연구 참고만 가능 | GPL/AGPL 코드를 복사·번역·link·vendor하지 않는다. 가설은 독립 fixture와 실제 CSP 결과로 재검증해야 함 | 제품 dependency 0, 소스 유입 금지 |

## 2. 테스트 asset 정책

이번 corpus는 전부 코드로 직접 생성했다.

- SQLite SUT/SUTG는 `node:sqlite`로 schema와 데이터를 직접 작성한다.
- Pressure graph는 문서화된 테스트 계약에 맞춰 숫자 tap에서 생성한다.
- KPP/PNG/XML/MYB/Krita bundle은 리포의 synthetic builder가 생성한다.
- 이름, 색, 곡선, metadata와 preview는 ToonSpectrum QA의 자가 제작 데이터다.
- 실제 CSP/Krita 사용자 brush, vendor logo, thumbnail, texture는 포함하지 않는다.

향후 제3자 corpus를 추가할 때 필요한 필드:

```text
assetId
sourceApplication/version
owner/author
license or explicit testing permission
redistributionAllowed
commercialUseAllowed
attribution
sourceUrl or vault reference
sha256
retention/deletion policy
```

`redistributionAllowed=false`인 파일은 repository/CI artifact에 넣지 않고 접근 제어 vault에서만 사용한다.

## 3. Imported rights BOM

Krita bundle importer는 다음 metadata를 보존한다.

```text
author, creator, initialCreator, license,
website, email, title, description,
creationDate, modifiedDate, tags
```

SUT/SUTG는 검증 alias로 발견된 author/creator, license/licence, website/url, email을 중복 제거한 aggregate로 반환한다. 이 값들은 **정보 보존**이지 사용 허가 판정이 아니다.

Marketplace/Team 공유 전에는 별도 Rights BOM gate가 다음을 판정해야 한다.

1. license 식별 가능 여부.
2. 상업 이용·재배포·수정 허용 여부.
3. attribution/NOTICE 요구.
4. bundle 안 각 resource의 서로 다른 license.
5. 원본이 누락한 권리 정보와 사용자의 보충 증명.

권리 불명은 개인 로컬 import까지 막지 않되 Team/Marketplace publish는 막는다.

## 4. 배포 경계

```text
Browser UI
  → dedicated Format Worker
       ├─ package-local ZIP/XML/KPP/MYB/SUT adapter
       ├─ raw-DEFLATE codec
       └─ SQLite WASM read-only provider
  → typed ImportResult
  → encrypted/local asset store + Rights BOM

Optional local bridge
  ├─ Krita process
  └─ CSP process
```

- parser를 main UI thread에서 실행하지 않는다.
- bridge는 localhost라는 이유로 신뢰하지 않는다. 명시적 pairing, origin/auth token, file allowlist, size/time limit가 필요하다.
- 외부 URL/resource는 import 중 fetch하지 않는다. XML external entity와 network reference는 거부한다.
- archive entry를 executable code로 로드하지 않는다.
- SUT SQLite extension loading, ATTACH, write, trigger 실행은 provider에서 금지한다. snapshot은 read-only inventory query만 허용한다.
- 로그/telemetry에 raw preset bytes, email, author metadata를 넣지 않는다. issue code와 비식별 size/timing만 기본 수집한다.

## 5. NOTICE/SBOM 체크리스트

직접 parser는 신규 runtime dependency를 추가하지 않았다. 실제 SQLite/DEFLATE provider를 제품 Worker에 연결하는 PR은 다음을 필수로 첨부한다.

- 정확한 package/version/commit과 integrity hash.
- SPDX license expression과 LICENSE/NOTICE 파일.
- WASM binary의 transitive dependency/SBOM.
- Worker bundle compressed/uncompressed byte size.
- CSP/Krita core 또는 GPL/AGPL 연구 코드가 binary/source map에 포함되지 않았다는 scan.
- source map이 제3자 원본 asset 또는 절대 로컬 경로를 포함하지 않는지 검사.
- replacement/fallback 조건.

## 6. 보존·삭제·개인정보

- 전체 source payload 보존은 사용자가 원본 호환성/재시도를 위해 선택한 프로젝트 자산이다.
- email/website/author는 creator metadata일 수 있으므로 UI에서 공개 여부를 별도 선택하게 한다.
- source payload를 Team cloud로 올릴 때는 조직 정책·quota·암호화·삭제 전파를 적용한다.
- import 취소 또는 hard validation 실패 시 임시 inflated bytes와 SQLite Worker 메모리를 즉시 폐기한다.
- 프로젝트에서 preset을 삭제해도 shared/marketplace asset 참조가 있으면 참조 계수/retention 정책을 따른다.

## 7. 금지·격리 상태

| Surface | 상태 | 이유 |
| --- | --- | --- |
| Krita core를 웹 bundle에 link/vendor | 금지 | ADR-0008 GPL reference-only 경계 |
| GPL/AGPL SUT parser 코드 복사/기계 번역 | 금지 | clean-room provenance와 상용 배포 경계 훼손 |
| 실제 CSP/Krita brush를 허가 없이 fixture로 커밋 | 금지 | 저작권·재배포 권리 불명 |
| SUT unknown field를 이름 유사성만으로 의미 변환 | 격리 | proprietary schema 오판과 숨은 손실 위험 |
| 권리 metadata가 있다는 이유만으로 Marketplace publish | 금지 | metadata는 허가 검증이 아님 |
| target-app parity 미측정 상태에서 “CSP/Krita 완전 지원” 표시 | 금지 | 품질·상호운용 release gate 미통과 |

## 8. 재검토 조건

- CELSYS가 SUT/SUTG machine-readable 규격 또는 SDK를 공개한다.
- Krita가 bundle/KPP conformance corpus와 stable schema를 제공한다.
- 사용 허가가 명확한 실사용 corpus와 target-app reference를 확보한다.
- 제품 Worker provider의 정확한 라이선스/SBOM/성능 수치가 준비된다.
- export/round-trip 기능을 착수한다.

이 조건 중 하나가 발생하면 capability survey와 ADR-0008 경계를 함께 재검토한다.
