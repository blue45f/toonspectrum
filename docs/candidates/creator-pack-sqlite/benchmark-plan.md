# Creator Pack SQLite 벤치마크 계획

## 이미 통과한 기반 증거

- 제품 V12 brush repository를 실 Chromium Dedicated Worker + OPFS SAH-pool에서 실행.
- 정확히 10,000행 저장, close/reopen, 39개 keyset page 완전 스캔.
- 중복·누락·예상 밖 ID·순서 불일치·console/network/CSP 오류 모두 0.
- 논리 DB 파일 `/studio-local-v12.db`, memory VFS와 localStorage fallback 사용 0.

원시 수치와 percentile 재계산은
`tests/benchmarks/results/brush-library-opfs-browser.json` 및
`tests/visual/brush-library-opfs-browser-contract.test.ts`를 단일 진실로 사용한다.

## Creator Pack 고유 자동 게이트

1. portable brush pack 설치 후 모든 결정적 entry ID가 SQL에 존재한다.
2. 기존 Studio `BRUSH_LIBRARY_KEY`가 있어도 제품 open 결과에는 유입되지 않는다.
3. 동일 receipt는 `installed`, 부분 행/receipt 누락은 `repair-required`다.
4. 동일 version·상이 fingerprint와 downgrade는 쓰기 전 거부한다.
5. 손상 receipt는 명시적 오류이며 다른 authority로 성공하지 않는다.
6. 제거 후 entry 행과 receipt가 모두 사라진다.
7. library-changed 이벤트 뒤 열린 패널은 bounded SQL page만 다시 읽는다.

## 남은 승격 측정

- pack entry 1/32개, 기존 카탈로그 10k/100k 조건에서 install/update/remove p50/p95/p99.
- 행 commit 직후 강제 종료, receipt commit 직후 강제 종료 fault matrix.
- `commitPack` 단일 transaction 후보와 현재 repair 모델의 쓰기 지연 비교.
- 8h 반복 설치/업데이트/제거 soak와 OPFS quota fault.
- 브러시 실제 stroke preview가 pack 원본 golden과 일치하는 시각·필압 품질 검사.

마지막 항목이 없으면 “설치 파이프라인 완료”는 가능하지만 외부 pack의 CSP 비열위 품질 완료로
표시하지 않는다.
