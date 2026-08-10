# ADR-0013 — V12 외부 복구 패키지와 SHA-256 CAS

- 상태: Accepted
- 결정일: 2026-08-09
- 범위: SQLite/OPFS origin 밖의 명시적 재해 복구 파일
- 관련: ADR-0007, ADR-0012

## 맥락

`studio-local-v12.db`와 OPFS SAH-pool은 같은 origin 안에서 저널·스냅샷·카탈로그를 내구성 있게
보존하지만 백업은 아니다. site data 삭제, 기기 분실, 계정 복구, 브라우저 프로필 손상에는
origin 밖의 독립 파일이 필요하다. 이 경계를 흐리면 “SQLite에 저장됨”을 “복구 가능”으로 잘못
표시하게 된다.

## 결정

V12의 자동 구현 가능한 첫 외부 복구 경계로 deterministic ZIP32/store 패키지를 채택한다.

```text
manifest.json
history/snapshot.json
history/journal-tail.json
attachments/sha256/<64hex>.bin
```

- history 원본은 stable `SnapshotIR`·`JournalEntryIR`이며 renderer/provider 객체를 넣지 않는다.
- import는 ZIP 경계·경로·CRC32·canonical manifest·SHA-256·IR schema·연속 seq·project digest를
  모두 검증한 뒤에만 복원 payload를 반환한다.
- attachment는 기존 `sha256:<hex>` OPFS CAS 주소를 재사용한다.
- destination CAS가 같은 hash를 반환한 뒤에만 비어 있는 destination journal에 history를 쓴다.
- 외부 파일 save/open은 명시적 caller-owned port다. background upload, URL, credential, cloud SDK는
  이 모듈에 넣지 않는다.
- archive 256MB, snapshot/journal 각 64MB, attachment 합 192MB, 단일 attachment 128MB,
  attachment 1,024개, journal 100,000개로 hard bound한다. 호출자는 낮출 수만 있다.

## 해시 후보 판정

8MiB 입력의 동일 장치 실측에서 WebCrypto SHA-256 p50/p95/p99는
**3.527/3.666/4.302ms**, 전이 devDependency `blake3-wasm` 2.1.5는
10.476/10.877/13.420ms였다. SHA-256은 증분 번들 0B이고 기존 프로젝트 archive·OPFS CAS 주소와
호환된다. 따라서 v1은 SHA-256을 선택한다.

BLAKE3는 direct exact pin, lazy browser chunk, 다중 브라우저·OS 처리량/메모리 우위, 기존
`sha256:` 자산을 보존하는 dual-address migration을 함께 증명할 때만 v2 후보로 재검토한다.

## 실측 증거

`tests/benchmarks/results/recovery-package-cas.json`:

| 작업 | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| 1,055,639B recovery ZIP export | 4.545ms | 4.970ms | 5.034ms |
| 전체 import 인증 | 27.922ms | 34.303ms | 40.996ms |
| 새 실제 sqlite-wasm DB restore | 0.298ms | 0.419ms | 0.419ms |

seq 33, project digest `d51567ff40f6da8e`, attachment 8개·1,048,576B가 export→인증→새
SQLite DB 복원 뒤 동일했고 recovery issue는 0이었다. 동일 입력의 ZIP bytes도 동일했다.
Node observed peak RSS/ArrayBuffer delta는 113,590,272/58,019,780B이며 브라우저 peak로
오표기하지 않는다.

자동 fault gate는 traversal, duplicate/case·Unicode collision, ZIP bomb, header 불일치, 숨은
entry, CRC/SHA mismatch, unknown version, torn journal, engine object, 비canonical 순서, abort,
비어 있지 않은 destination, CAS hash mismatch와 CAS 실패 후 history 오염을 거부한다.

## 결과와 격리

외부 content-authenticated 복구 파일 블로커는 닫혔다. 다만 현재 `JournalStore`에 bulk atomic
restore API가 없어 history 기록 중 실패는 `RESTORE_FAILED`와 recoverable prefix로 보고하며
완전 원자적이라고 주장하지 않는다.

다음은 별도 격리다.

- cloud 인증·암호화·key recovery/rotation
- resumable multipart·server hash·retention/delete 정책
- 실제 브라우저 file picker와 128/192MB 경계, Windows/Linux/Safari/Firefox
- OPFS/Worker/WASM peak memory, low-memory/mobile, 외장 디스크·quota fault
- 반복 export/import soak와 provider outage/network fault

따라서 UI와 완료 보고는 “외부 복구 패키지”와 “클라우드 백업”을 구분한다.
