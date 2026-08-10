# ADR-0012 — V12 SQLite/OPFS 로컬 데이터 권위와 legacy 폐기

- 상태: Accepted
- 결정일: 2026-08-09
- 범위: 기존 `/studio` 내부 구현의 로컬 저장·복구·카탈로그
- 대체/구체화: ADR-0007의 물리 저장 계층을 V12 제품 경로로 승격

## 맥락

기존 Studio는 기능마다 localStorage, IndexedDB, OPFS 파일, 메모리 상태를 서로 다른 방식으로
사용했다. 작은 UI preference에는 적합하지만 브러시·필터 무제한 카탈로그, 명령 저널,
애니매틱·번역 메모리·Production Bible·사용자 글꼴과 대형 3D 자산 같은 창작 데이터에서는
다음 문제가 있었다.

- 전체 JSON envelope 역직렬화와 main-thread 동기 I/O
- 기능별 원자성·버전·오염 처리의 불일치
- localStorage/IndexedDB 이중 미러가 어느 쪽이 권위인지 모호함
- 검색·정렬·bounded pagination 부재
- 레거시 데이터를 우연히 다시 읽어 `LEGACY_DATA_MIGRATION=FALSE`를 위반할 위험

V12 문서는 stable IR과 append journal/two-slot recovery를 요구하고, 사용자는 localStorage보다
고도화 가능한 표면을 로컬 SQLite로 전환하도록 명시했다.

## 결정

V12 로컬 제품 데이터의 구조화 metadata/manifest 권위는 다음 SQLite/OPFS stack으로 통일한다.
대형 immutable bytes와 autosave journal은 아래에서 정한 별도 OPFS CAS/journal 경계가 소유한다.

```text
@sqlite.org/sqlite-wasm 3.53.0-build1
  + OPFS SAH-pool directory: toonspectrum-studio-sqlite
  + database: /studio-local-v12.db
  + app-lifetime shared handle: acquireStudioLocalDatabase()
```

### 책임 분리

- ToonStudio 소유: stable IR/JSON schema, command sequence, CRC32, A/B snapshot 선택, 손상 절단,
  generation fencing, 제품별 의미 검증.
- SQLite 소유: transaction, constraint, index, keyset query, 단일 행 upsert, OPFS 파일 내구성.
- renderer/provider 객체는 저장하지 않는다. provider ID·fingerprint·실측 비용처럼 안정된 descriptor만
  저장한다.

### schema

순차 `PRAGMA user_version` migration을 버전당 `BEGIN IMMEDIATE` transaction으로 적용한다.

| Version | Tables |
| --- | --- |
| v1 | `kv`, `tournament_winners`, `cost_samples` |
| v2 | `journal_entries`, `snapshots` |
| v3 | `brush_library_records` + keyset/category indexes |
| v4 | `filter_library_records` + keyset/engine/category/package indexes |
| v5 | `crdt_outbox_v12_entries`, `crdt_outbox_v12_acknowledgements` + order/ACK indexes |

검색·정렬·부분 조회가 필요한 브러시/필터는 구조화 테이블을 사용한다. bounded canonical document는
검증된 KV namespace를 사용한다. 현재 namespace에는 `studio-animatic-v12`,
`studio-translation-memory-v12`, `studio-production-bible-v12`, `studio-creator-pack-v12`와
`studio-emeres-library-v12`, `studio-scene-snapshots-v12` 및
`studio-vrm-custom-poses-v12`, `studio-vrm-full-poser-states-v12`,
`studio-vrm-pose-materials-v12`, `studio-named-palettes-v12`,
`studio-brand-kits-v12`, `studio-saved-clips-v12`,
`studio-bg3d-shot-batch-recovery-v12`와
`studio-named-checkpoints-v12`, `studio-crdt-recovery-vault-v12`,
`studio-mannequin-state-v12`, `studio-bg3d-lt-user-presets-v12`,
`studio-marketplace-package-library-v12`,
`studio-asset-library-v12`, `studio-vrm-model-assets-v12`,
`studio-vrm-texture-paint-assets-v12`, `studio-bg3d-libraries-v12`,
`studio-custom-font-library-v12`의 `manifest-v1`,
autosave/workspace/history lease가 포함된다.

대형 payload는 SQLite TEXT/base64로 저장하지 않는다. 일반 Studio asset은
`toonspectrum-studio-assets`를 사용하며 사용자 글꼴도 owner-scoped manifest와 함께 이 CAS를
공유한다. VRM 모델·texture-paint는
`toonspectrum-studio-vrm-assets-v12`, BG3D GLB·thumbnail은
`toonspectrum-studio-bg3d-libraries-v12` OPFS SHA-256 CAS에 저장하고 SQLite manifest를
마지막 authority switch로 commit한다.

autosave payload의 durable primary는 SQLite KV가 아니라
`toonspectrum-studio-autosave-v3/recovery-journals` native OPFS journal이다. 문서별 Web Lock이
writer를 직렬화한다. current-version lifecycle sidecar는 독립 권위나 legacy 자동 migration이
아니며, OPFS snapshot보다 최신이고 schema 검증을 통과할 때만 OPFS로 승격한다. durable clear
tombstone은 stale primary와 sidecar보다 우선하고 둘을 제거한다.

### 제품 UI

- 브러시 초기 256행, 필터 초기 128행만 읽고 keyset “더 불러오기”를 사용한다.
- 검색·category/engine·pinned/favorite 조건은 SQL로 실행한다.
- hydration/save는 async queue와 generation fencing을 사용한다.
- SQLite 실패 후 편집을 메모리에 유지할 수 있으나 “메모리 임시·저장되지 않음”을 표시한다.
- 손상된 canonical document는 빈 정상 문서로 바꾸거나 일반 저장으로 덮지 않는다.
- 사용자 글꼴 list/load는 manifest↔CAS metadata, byte length, SHA-256을 모두 검증한다. missing 또는
  same-length corrupt blob과 metadata mismatch는 부분 목록·대체 글꼴 없이 실패한다.

### legacy 정책

- `/studio-local.db`를 열지 않는다.
- 제품 boot에서 이전 localStorage/IndexedDB key를 탐색·복사하지 않는다.
- 테스트/embed 호환 adapter와 legacy parser는 명시적 `import-explicit` seam에만 남긴다.
- 사용자가 파일 선택기로 고른 SUT/SUTG/KPP/MYB/Krita bundle/ABR/JSON import는 내부 자동
  migration이 아닌 외부 FormatGateway 작업이다.
- 기존 내부 데이터 삭제는 compile flag + `RESET_EXISTING_STUDIO_DATA=YES` +
  `REPLACE_CURRENT_TOONSTUDIO_IN_PLACE_V12` 확인 문구를 모두 요구한다.

## 비교한 후보

| 후보 | 판정 |
| --- | --- |
| 공식 SQLite WASM + OPFS SAH-pool | 선정. 실제 Chromium 제품 경로·close/reopen·10k 카탈로그 통과 |
| localStorage JSON envelope | 제품 기본 기각. 동기 I/O·낮은 quota·전체 역직렬화·검색/transaction 부재 |
| IndexedDB | 제품 기본 기각. Production Bible의 기존 이중 권위 제거; explicit legacy import만 유지 |
| wa-sqlite | 보류. 공식 빌드보다 우위 증거와 중복 번들 정당화가 없음 |
| memory DB/repository | 단위 테스트·명시적 임시 세션만. 내구성 저장으로 표시 금지 |

## 증거

- 브러시 10,000개 actual Chromium OPFS:
  `tests/benchmarks/results/brush-library-opfs-browser.json`
- 필터 10,000개 actual Chromium OPFS:
  `tests/benchmarks/results/filter-library-opfs-browser.json`
- 애니매틱 최대 799,973B, 120 save/load, close/reopen SHA equality:
  `tests/benchmarks/results/animatic-sqlite-opfs-browser.json`
- Translation Memory 512개·296,700B, 제품 factory·Dedicated Worker·close/reopen 검색 의미 보존:
  `tests/benchmarks/results/translation-memory-sqlite-opfs-browser.json`
- Production Bible strict canonical 저장, 정상 close/reopen와 강제 Worker 종료 후 재개방:
  `tests/benchmarks/results/production-bible-sqlite-opfs-browser.json`
- journal/two-slot/fault recovery:
  `src/domains/creator/studio-pages-history-sqlite-recovery.test.ts`
- V12 파일명/namespace/legacy 차단 drift gate:
  `src/domains/creator/studio-v12-data-discard-policy.test.ts`
- Emeres·장면 스냅샷 제품 SQLite authority/fail-closed gate:
  `src/domains/creator/studio-remaining-creative-sqlite-authority-contract.test.ts`
- VRM custom pose·full poser state·pose-material 제품 SQLite authority:
  `src/domains/creator/studio-vrm-creative-sqlite-product-boundary.test.ts`
- named palette·Brand Kit·saved clip 제품 SQLite authority:
  `src/domains/creator/studio-palette-brand-clip-sqlite-authority-contract.test.ts`
- CRDT outbox의 구조화 SQLite queue/ACK tombstone과 retry metadata:
  `src/domains/creator/studio-crdt-outbox-sqlite.test.ts`
- BG3D shot recovery의 canonical catalog + OPFS SHA-256 CAS:
  `src/domains/creator/studio-bg3d-shot-batch-recovery-store.test.ts`
- 이름 있는 프로젝트 체크포인트의 제품 SQLite authority, 동시 생성 직렬화, 손상 fail-closed:
  `src/domains/creator/studio-checkpoints-sqlite.test.ts`
- 영구 거절 CRDT frontier/marker의 제품 SQLite authority, bounded chunk, 손상 fail-closed:
  `src/domains/creator/studio-crdt-recovery-vault-sqlite.test.ts`
- Community share 후보의 brush/filter/palette SQLite hydration과 legacy 자동 발견 차단:
  `src/domains/creator/studio-v12-data-discard-policy.test.ts`
- 마네킹 상태·BG3D LT 사용자 프리셋의 canonical SQLite repository와 제품 boundary:
  `src/domains/creator/studio-mannequin-bg3d-preset-sqlite-product-boundary.test.ts`
- 원본 에셋 마켓 설치 manifest의 SQLite 제품 권위, 동시 writer 병합, overflow 무축출:
  `src/domains/creator/studio-marketplace-library-sqlite-repository.test.ts`
- 일반 Studio asset의 strict SQLite manifest + OPFS SHA-256 CAS, manifest-last rollback:
  `src/domains/creator/studio-asset-library-sqlite-opfs-repository.test.ts`
- VRM/GLB·thumbnail·texture-paint의 strict SQLite manifest + 전용 OPFS CAS:
  `src/domains/creator/studio-vrm-asset-sqlite-opfs-repository.test.ts`
- BG3D model/template/metadata 제품 API의 SQLite/OPFS 권위와 legacy IndexedDB 격리:
  `src/domains/creator/studio-bg3d-libraries-sqlite-opfs.test.ts`
- 사용자 글꼴 실제 Vite production module Worker, SQLite OPFS SAH-pool, shared OPFS CAS,
  FontFace/canvas, 정상·강제 종료 복구와 fail-closed raw artifact:
  `tests/benchmarks/results/custom-font-sqlite-opfs-browser.json`,
  `tests/visual/custom-font-sqlite-opfs-browser-contract.test.ts`,
  `tests/benchmarks/harness/custom-font-sqlite-opfs-browser.ts`
- autosave native OPFS/Web Locks, reload, lifecycle-sidecar 승격, durable clear tombstone gate:
  `scripts/verify-studio-autosave-opfs-session.mts`,
  `scripts/verify-studio-autosave-opfs-session.test.ts`,
  `src/domains/creator/studio-autosave-opfs-session.test.ts`,
  `src/domains/creator/studio-autosave-opfs-product-boundary.test.ts`
- VRM asset의 actual production Worker SQLite/OPFS CAS close/reopen와 terminate recovery:
  `tests/benchmarks/results/vrm-asset-sqlite-opfs-browser.json`,
  `tests/visual/vrm-asset-sqlite-opfs-browser-contract.test.ts`
- BG3D library의 actual production Worker SQLite/OPFS CAS, Web Lock contention와 terminate recovery:
  `tests/benchmarks/results/bg3d-libraries-sqlite-opfs-browser.json`,
  `tests/visual/bg3d-libraries-sqlite-opfs-browser-contract.test.ts`
- 후보 비교와 raw 수치 해석:
  `docs/candidates/storage-recovery/`

브러시와 필터는 각각 10,000행을 close/reopen한 뒤 39개 keyset page로 전수 읽어 누락·중복·
정렬 불일치 0을 증명했다. 두 하니스 모두 memory VFS와 localStorage fallback 사용 0이다.
애니매틱은 799,973B canonical 문서의 exporter 결과, close 전 raw SQLite 값, reopen 후 loader/export
값의 bytes와 SHA-256이 모두 일치했다.
Translation Memory는 512개 항목의 canonical 296,700B를 재개방한 뒤 exact/fuzzy 검색 의미와
언어쌍 격리를 보존했고, save/load p95는 각각 13.860/9.915ms였다. Production Bible은 정상
close/reopen뿐 아니라 `close()`를 호출하지 않은 Dedicated Worker 강제 종료 후 새 Worker가 같은
`/studio-local-v12.db`를 열어 canonical bytes를 복구했으며, save/load p95는 2.885/0.385ms였다.

사용자 글꼴 제품 repository는 Chromium 140에서
`/System/Library/Fonts/Supplemental/Arial Unicode.ttf` 23,278,008B와
`/System/Library/Fonts/Supplemental/Songti.ttc` 66,933,080B를 각각 30회 저장·검증 로드했다.
save p95는 143.310/396.450ms, load p95는 80.000/234.320ms이고 mismatch는 0이었다. 새 Worker
정상 재개방 30회의 total recovery p95는 321.795ms였다. commit 직후 Worker terminate 1회는
internal/page recovery 384.210/738.860ms에 exact bytes/SHA를 복구했다. `FontFace` decode는
33.015/47.855ms였고 두 번의 한·중·일 canvas pixel SHA-256이 동일했다. localStorage,
IndexedDB, memory DB/CAS fallback과 console/page/network/CSP 오류는 모두 0이었다.

이 글꼴은 로컬 macOS system font를 benchmark 입력으로만 읽었다. 소스 저장소에 복사·커밋하지
않았고 production bundle에도 넣지 않았으며, 격리된 benchmark origin의 OPFS CAS에만 제품
시나리오로 저장했다. 이 증거는 재배포 또는 embedding 권리를 부여하지 않는다.

autosave production gate는 Chromium 140에서 native `getDirectory` 5회와 동일한 문서 Web Lock
요청 11회를 관측했다. checkpoint는 실제 reload 후 seq 1로 복구됐고, 더 최신인 lifecycle
sidecar는 OPFS seq 2로 승격됐으며, durable clear tombstone seq 3은 stale primary와 sidecar를
제거했다. console/page/request/5xx/CSP 오류는 0이었다.

VRM gate는 재개방 뒤 102 models와 100 textures의 SHA/bytes mismatch 0, BG3D gate는 1/32/100MiB
model CAS와 100 templates/101 metadata를 검증했다. 둘 다 제품 경로의 localStorage/IndexedDB/
memory fallback 0이었다. BG3D의 1MiB commit 뒤 Worker terminate recovery는 64.315ms였고,
250ms Web Lock holder에 대해 product writer의 실제 wait는 250.515ms였다.

## 결과

### 긍정적

- 무제한 카탈로그가 React/localStorage 전체 envelope와 분리된다.
- 모든 주요 로컬 창작 문서가 동일 transaction·오염 정책·파일 권위를 공유한다.
- stable IR 복구 계약과 SQL 질의 엔진의 강점을 조합한다.
- 대형 font/VRM/BG3D bytes는 content-addressed OPFS에 두고 SQLite에는 검증 가능한 manifest만 둔다.
- autosave의 OPFS journal, reconciliation, tombstone 순서가 production browser에서 검증된다.
- V12 legacy 폐기가 파일명·namespace·source contract로 검증된다.

### 비용과 한계

- SQLite WASM/Worker chunk와 초기화 비용이 추가된다.
- OPFS는 cloud backup이 아니며 site-data 삭제·기기 분실에 취약하다.
- SAH-pool 단일 owner와 다중 탭 writer 정책을 유지해야 한다.
- Chromium에서는 같은 SAH-pool을 두 Dedicated Worker가 직접 소유할 때
  `NoModificationAllowedError`가 발생했다. 단일 storage Worker + Web Lock 경계를 유지한다.
- 현재 실제 브라우저 증거는 Chromium/macOS 중심이다.
- Worker/WASM peak memory는 브라우저 API 미노출 항목이 있어 `null`이다.
- system font 실측은 저장 무결성·decode 증거일 뿐 재배포/embedding 라이선스 승인이 아니다.

## 후속 게이트

1. ~~Translation Memory와 Production Bible의 actual Chromium OPFS close/reopen artifact~~ —
   **2026-08-09 통과**. 두 제품 모두 Vite production build·Chromium 140 Dedicated Worker·실제
   OPFS SAH-pool을 사용했고 memory/localStorage fallback 0, canonical digest 일치, legacy key
   미독해를 증명했다. Production Bible은 강제 Worker 종료 후 재개방까지 통과했다.
2. ~~사용자 글꼴 actual production Worker SQLite/OPFS/CAS/FontFace gate~~ — **2026-08-09 통과**.
   23,278,008B TTF와 66,933,080B TTC의 30회 save/load, 30회 fresh Worker reopen, 1회 terminate
   recovery와 손상 fail-closed를 통과했다. system font 재배포/embedding 권리는 별도다.
3. ~~autosave native OPFS reload/reconciliation/tombstone gate~~ — **2026-08-09 통과**. 실제
   `navigator.storage.getDirectory`, origin-wide Web Locks, reload, sidecar promotion, clear tombstone와
   브라우저 오류 0을 확인했다.
4. ~~VRM/BG3D actual production Worker SQLite/OPFS CAS gate~~ — **2026-08-09 통과**. 정상
   재개방·Dedicated Worker terminate·fallback 0을 확인했다. BG3D dual direct Worker ownership은
   지원하지 않고 단일 storage Worker 경계로 격리한다.
5. Windows/Linux/Safari/Firefox capability matrix
6. quota/browser-process crash/OS power loss 및 다중 탭 장기 fault injection
7. creator-pack resource+receipt를 한 SQLite transaction으로 합치는 개선
8. ~~origin 밖의 content-addressed 복구 파일~~ — **2026-08-09 통과**(ADR-0013,
   `recovery-package-cas.json`). cloud upload·client-side encryption·key recovery와 서버 보존
   정책은 별도 opt-in 격리로 유지

후속 게이트가 남아 있어도 이미 통과한 V12 SQLite 로컬 권위를 localStorage 기본으로 되돌리지
않는다. 미지원 환경에서는 실패와 내구성 수준을 정직하게 표시한다.
