# ToonStudio V12 — storage-recovery 라이선스·배포

## 1. 선택 구성

| Component | Version / License | 배포와 의무 | 제품 역할 |
| --- | --- | --- | --- |
| SQLite core | 3.53.0, public domain | 의무 없음. SBOM에는 엔진/버전을 기록 | SQL·transaction·constraint |
| `@sqlite.org/sqlite-wasm` | 3.53.0-build1, 설치 manifest 기준 Apache-2.0 | LICENSE/NOTICE와 버전 핀을 배포 고지에 포함 | dynamic import WASM/JS wrapper |
| OPFS / File System Access / Web Locks | 웹 표준 | 배포 라이선스 없음. 브라우저 support matrix 필요 | 로컬 파일·single-writer coordination |
| ToonStudio journal/recovery/repository | 내부 코드 | 프로젝트 라이선스 | stable IR 의미·CRC·A/B snapshot·bounded query |
| Vitest/Playwright/Vite 하니스 | dev-only, 각 permissive license | 제품 runtime bundle 제외 | browser evidence 생성 |

wa-sqlite, Yjs, Loro는 후보 비교 대상일 뿐 현재 V12 storage runtime에 새로 번들하지 않는다.
채택 시 각각의 MIT notice와 서버/데이터 흐름을 별도 ADR에 추가한다.

## 2. 배포 경계

```text
/studio main thread
  ├─ React UI: async persistence port만 호출
  └─ render/input hot path: SQLite/OPFS 접근 금지

storage runtime / Dedicated Worker
  ├─ dynamic import @sqlite.org/sqlite-wasm
  ├─ installOpfsSAHPoolVfs({directory:"toonspectrum-studio-sqlite"})
  ├─ OpfsSAHPoolDb("/studio-local-v12.db")
  └─ validated SQL/repository operations

server
  └─ 현재 로컬 저장 경로의 데이터 전송 없음
```

브러시·필터·애니매틱 browser evidence build는 COOP/COEP/CORP와 restrictive CSP에서 실행했다.
SAH-pool 자체는 SharedArrayBuffer가 필수인 동기 OPFS VFS와 다르지만, 실제 앱의 WebGPU/WASM
worker 경계를 위해 배포 헤더를 함께 검증한다. CSP는 `worker-src 'self'`, 자체 script/wasm 로드,
필요한 connect-src만 허용해야 한다.

## 3. 데이터·프라이버시

- `studio-local-v12.db`는 origin-private 로컬 파일이다.
- OPFS는 사용자가 일반 파일 탐색기로 관리하는 문서가 아니므로 export/backup UX가 필요하다.
- 현재 로컬 persistence는 서버 동기화나 cloud backup을 의미하지 않는다.
- 향후 cloud backup을 추가하면 opt-in, 전송/저장 암호화, region, retention, 삭제 요청,
  access control과 incident response를 별도 게이트로 통과해야 한다.
- Translation Memory와 Production Bible에는 창작/용어/인물 정보가 있을 수 있으므로 telemetry나
  오류 로그에 payload를 포함하지 않는다. 오류에는 namespace/key/구조 원인만 남긴다.
- renderer tournament에는 provider ID, fingerprint bucket, 장치 hash, timing만 저장하고 raw scene나
  사용자 픽셀을 저장하지 않는다.

## 4. 외부 창작 포맷

Krita/CSP/G’MIC/GEGL 라이선스를 SQLite에 저장되는 데이터와 혼동하지 않는다.

- 사용자가 명시적으로 고른 SUT/SUTG/KPP/MYB/Krita bundle의 bytes·rights·unsupported 기록은
  데이터다. 저장한다고 GPL/CeCILL 코드를 앱에 link하는 것은 아니다.
- Krita/G’MIC/GEGL 실행 코드는 앱 storage worker에 적재하지 않는다. 필요하면 별도 process/origin
  격리 Provider를 사용한다.
- 권리 정보가 존재한다는 사실은 Marketplace 재배포 허가를 뜻하지 않는다. Rights BOM이 별도로
  승인해야 한다.
- 실제 사용자 asset을 허가 없이 테스트 fixture나 git에 커밋하지 않는다.

## 5. 레거시 폐기 배포

V12는 기존 내부 Studio 데이터를 자동 이전하지 않는다. 새 파일명/namespace는 다음 목적을 가진다.

1. 구 DB `/studio-local.db`를 우연히 재개방하지 않음
2. v1 localStorage/IndexedDB 값을 product boot에서 탐색하지 않음
3. 사용자가 선택한 외부 파일 import와 내부 legacy migration을 분리
4. cutover 삭제를 명시적 triple gate 뒤에서만 실행

삭제 인벤토리는 OPFS roots, IndexedDB databases, CacheStorage names, localStorage/sessionStorage
prefix를 포함하고 dry-run inventory와 실제 삭제 대상을 동일 소스에서 만든다. 삭제 후 복구할 수
없으므로 compile flag, 환경 변수, 확인 문구 중 하나라도 빠지면 작업 전체가 거부된다.

## 6. 배포 전 체크리스트

- [ ] `@sqlite.org/sqlite-wasm` 버전·Apache-2.0 notice가 SBOM/NOTICE와 일치
- [ ] WASM이 static eager main bundle이 아니라 승인된 dynamic worker chunk
- [ ] CSP/COOP/COEP/CORP와 worker URL이 production build에서 통과
- [ ] OPFS/SAH-pool 부재가 `SqliteUnavailableError`와 사용자 메시지로 나타남
- [ ] `studio-local-v12.db` 외 구 DB open 0
- [ ] 제품 boot의 legacy localStorage/IndexedDB read 0
- [ ] memory mode가 “저장 완료”로 표시되지 않음
- [ ] 브러시/필터 UI가 bounded SQL page를 사용
- [ ] journal/snapshot corruption과 migration rollback 테스트 통과
- [ ] destructive cutover triple gate와 inventory drift 테스트 통과
- [ ] cloud sync가 구현되지 않은 상태에서 서버 동기화 문구 0

## 7. 교체·철회

SQLite wrapper의 license 또는 배포 정책이 바뀌면 해당 버전 승격을 멈추고 기존 핀을 유지한다.
보안 결함으로 핀 유지가 불가능하면 공식 패치 버전에서 전체 OPFS/fault/quality gate를 재실행한다.
공식 WASM이 브라우저 지원을 중단할 경우 wa-sqlite 등 대안을 동일 corpus로 비교하되, localStorage
전체 envelope로 되돌아가는 것은 허용 가능한 자동 fallback이 아니다.
