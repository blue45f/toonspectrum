# ToonStudio V11 — storage-recovery 라이선스·배포 (License & Deployment)

- 담당 서브시스템: **storage-recovery** (E24·E25)
- 상위 정책: V11 §3.1 라이선스·안전성 하드 게이트, §11 라이선스와 배포
- 결론 요약: **storage-recovery 후보군에는 copyleft 후보가 없다.** 전 후보가 permissive·퍼블릭 도메인·웹 표준이므로 V11 §11의 "permissive 엔진은 browser/worker 직접 통합 우선" 원칙을 그대로 적용하며, Local ToonBridge나 copyleft 격리 Provider가 필요한 후보는 이 서브시스템에 존재하지 않는다.

## 1. 후보별 라이선스 의무와 배포 방식

| Candidate | License | 주요 의무 | 배포 방식 | Copyleft 격리 요구 |
| --- | --- | --- | --- | --- |
| 자체 CommandJournal + two-slot snapshot + CRC32 (`project-model-v11`) | 내부 코드 (프로젝트 라이선스) | 없음 (자사 저작). 의존 crate 고지 의무는 아래 각 행 참조 | 직접 WASM 번들 + **Worker 격리** (Storage Island dedicated worker) | 불필요 |
| OPFS / Web Locks / IndexedDB | 웹 표준 API | 없음 (브라우저 구현체 사용, 배포물에 코드 미포함) | 배포 대상 아님 — 런타임 API 사용 | 불필요 |
| SQLite WASM (공식 빌드) | Public Domain[^sqlite] | 의무 없음. 고지 권장만 (attribution 자율) | 직접 WASM 번들 + Worker 격리 (opfs-sahpool은 단일 컨텍스트 배타라 Storage Island 안에서만 로드). opfs VFS 채택 시 배포 프로필에 COOP/COEP 헤더 요구가 추가되므로 배포 설정과 라이선스가 아닌 **호스팅 헤더 정책**을 함께 검토 | 불필요 |
| wa-sqlite | MIT | 저작권·라이선스 고지 포함 | (채택 시) 직접 WASM 번들 + Worker 격리. 공식 빌드와 동시 배포 금지 — 한쪽만 채택 | 불필요 |
| Yjs (+ y-indexeddb / y-websocket 등 provider) | MIT | 저작권·라이선스 고지 포함 | 직접 JS 번들 (main 또는 worker). **y-websocket 릴레이는 서버 배포** — 서버측도 MIT라 의무는 고지뿐. 사용자 문서 데이터가 서버를 경유하므로 §3.1 "사용자 파일의 서버 전송 여부" 게이트에 따라 협업 opt-in·전송 범위 고지 필요 | 불필요 |
| Loro | MIT | 저작권·라이선스 고지 포함 | 직접 WASM 번들 (worker 권장). 릴레이·영속 서버는 자체 구축분이므로 서버 배포 | 불필요 |
| Automerge (비교 후보) | MIT | 저작권·라이선스 고지 포함 | 벤치 하니스 한정 로드 — 프로덕션 번들 미포함 (탈락 시 배포 개입 없음) | 불필요 |
| BLAKE3 (공식 Rust crate) | CC0-1.0 OR Apache-2.0[^blake3] | CC0 선택 시 의무 없음, Apache-2.0 선택 시 고지·NOTICE. 듀얼 중 하나 선택해 SBOM에 명기 | 자체 crate에 정적 링크되어 WASM 번들에 포함 | 불필요 |
| crc32fast 등 CRC crate | MIT OR Apache-2.0 | 고지 포함 | 자체 crate에 정적 링크되어 WASM 번들에 포함 | 불필요 |
| Cloud Backup (S3 호환 오브젝트 스토리지) | 서비스 약관 (라이선스 비대상) + 클라이언트 SDK는 채택 시 개별 확인 | 사용자 데이터의 서버 전송이 발생하는 **유일한 필수 경로 후보** → §3.1 게이트: 백업 opt-in, 암호화(전송·저장), 리전·보존 기간 고지, 삭제 요청 이행 | 서버 배포 (백업 API·스토리지). 클라이언트는 업로더만 Worker 격리 | 불필요 |

## 2. 배포 방식 분류 요약

V11 §11이 정의한 4가지 배포 방식에 후보를 대응시키면 다음과 같다.

```text
직접 WASM/JS 번들   : project-model-v11(저널·스냅샷·CRC·CAS), SQLite WASM, Yjs, Loro, BLAKE3/CRC crate
Worker 격리          : 위 전부를 Storage Island dedicated worker에 격리 (라이선스 요구가 아니라
                       성능·배타 접근·크래시 봉쇄 목적의 아키텍처 격리)
Local ToonBridge     : 해당 없음 — 이 서브시스템에는 필요 후보 없음
서버                 : cloud backup 스토리지·API, CRDT 릴레이(y-websocket 또는 자체 Loro 릴레이)
```

주의: 이 서브시스템의 Worker 격리는 G'MIC/GEGL(E18·E19)의 **라이선스 격리**와 목적이 다르다. storage-recovery의 격리는 순수하게 (1) OPFS sync handle의 Worker 전용 제약, (2) 단일 writer 소유권, (3) 크래시 봉쇄를 위한 것이다. 문서·감사에서 두 격리를 혼동하지 않도록 SBOM에 격리 사유를 구분 표기한다.

## 3. Copyleft 격리 요구 검토

- **이 서브시스템 자체에는 copyleft 의존이 없다.** LGPL(libvips E17, GEGL E19)·CeCILL(G'MIC E18) 격리 정책은 filter/export 서브시스템 소관이다.
- 단, **저장 계층이 copyleft 서브시스템과 접촉하는 지점**은 감시 대상이다: G'MIC/GEGL final 결과물(EffectGraph node·이미지)은 데이터일 뿐 코드 링크가 아니므로 저널·CAS에 저장해도 라이선스 전파가 없다. 반대로 GEGL 연산 코드를 storage worker에 로드하는 형태는 금지하고, 격리 Provider 경계 밖의 결과 blob만 수신한다.
- 클라우드 백업 서버에 향후 서버측 렌더/검증(예: Vello CPU 기준 렌더)을 두는 경우에도 현 후보군은 MIT/Apache라 전파 문제 없음.

## 4. 하드 게이트 체크리스트 (V11 §3.1 대응)

| 게이트 | 판정 |
| --- | --- |
| 상용 배포 가능 여부 | 전 후보 가능 (permissive / public domain / 표준) |
| 사용자 파일의 서버 전송 여부 | 로컬 계층은 전송 없음. 협업(CRDT 릴레이)·클라우드 백업만 전송 발생 → **opt-in + 암호화 + 고지** 조건부 통과 |
| copyleft 격리 요구 | 해당 없음 (§3 참조) |
| codec·asset 별도 라이선스 | 해당 없음 — 미디어 코덱은 E23 소관. 저장 계층은 blob을 불투명 데이터로 취급 |
| 메모리 안전성·sandbox 가능성 | Rust 코어(자체 crate, Loro) + Worker/WASM sandbox. C 계열 대형 의존 없음 (SQLite는 퍼블릭 도메인 C지만 WASM sandbox 내 실행) |
| 원본 데이터 손실 가능성 | 핵심 위험. OPFS는 백업이 아님(E25) → 클라우드 백업·복구 패키지·two-slot·CRC가 완화 장치. `tests/fault-injection` 게이트 통과를 release blocker로 유지 (V11 §10.5) |

## 5. 운영 의무

- **Rights BOM / SBOM**: 채택 확정 후보(버전·commit 고정)를 provider license manifest(Phase 0 산출물)에 등록. BLAKE3 듀얼 라이선스 선택지 명기.
- **고지 파일**: MIT/Apache 계열 고지문을 앱 라이선스 화면과 배포 아티팩트에 포함.
- **버전 고정**: CRDT·SQLite WASM은 저장 포맷 호환성에 직결되므로 pinned version + 포맷 마이그레이션 테스트 없이 업그레이드 금지.
- **백업 데이터 정책**: 보존 기간·암호화 방식·삭제 이행 절차를 제품 정책 문서로 별도 확정 (법무 검토 항목 — V11 §11).

---

[^sqlite]: SQLite 저작권 페이지 — 퍼블릭 도메인 배포. https://www.sqlite.org/copyright.html
[^blake3]: BLAKE3 공식 저장소 — CC0-1.0 OR Apache-2.0 듀얼 라이선스. https://github.com/BLAKE3-team/BLAKE3
