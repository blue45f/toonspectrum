# PostgreSQL 런타임 안정성 및 운영 점검

- 상태: **구현 및 로컬 검증 완료, 운영 반영 승인 전**
- 기준일: **2026-09-27**
- 적용 범위: Core API의 주 PostgreSQL 풀. 별도 AI/실시간 풀과 운영 DB 전역 설정은 변경하지 않는다.

## 현재 구현

주 풀의 최대 연결 수 기본값 3개와 유휴 반납 10초를 유지한다. 무제한 실행/대기를 피하기 위해
아래 제한과 TCP keepalive, 연결 최대 수명을 적용한다. 쿼리 실패에 자동 재시도를 추가하지 않는다.
쓰기 응답이 유실된 경우에는 성공 여부가 불명확할 수 있으므로 기존 멱등 키·원장으로 판정한다.

| 환경변수 | 기본값 | 의미 |
| --- | --- | --- |
| `WEBDEX_PG_POOL_MAX` | 3 | 풀 최대 연결 수, 기존 설정 유지 |
| `WEBDEX_PG_IDLE_MS` | 10000 | 유휴 연결 반납 |
| `WEBDEX_PG_CONNECT_MS` | 10000 | 새 연결과 풀 대기열 제한 |
| `WEBDEX_PG_QUERY_MS` | 35000 | 클라이언트 쿼리 대기 제한 |
| `WEBDEX_PG_STATEMENT_MS` | 30000 | 직접 연결의 서버 실행 제한 |
| `WEBDEX_PG_LOCK_MS` | 5000 | 직접 연결의 잠금 대기 제한 |
| `WEBDEX_PG_IDLE_TRANSACTION_MS` | 15000 | 직접 연결의 유휴 트랜잭션 제한 |
| `WEBDEX_PG_MAX_LIFETIME_SECONDS` | 300 | 연결 교체 주기 |
| `WEBDEX_PG_SHUTDOWN_MS` | 15000 | HTTP 종료 이후 풀 정리 대기 제한 |
| `WEBDEX_PG_CONNECTION_MODE` | auto | auto / direct / transaction |

직접 연결에서는 클라이언트 대기를 서버 실행 제한보다 최소 1초 길게 유지한다.
빈 값·숫자가 아닌 값에는 기본값을 적용하고, 0으로 안전 제한을 끌 수 없게 범위를 제한한다.

## Transaction pooler와 직접 연결의 구분

`auto`는 Neon의 `-pooler` 호스트를 transaction 모드로 판정한다. 커스텀 PgBouncer 호스트는
`transaction`을 명시한다. Transaction 모드에는 서버 세션 시작 옵션을 보내지 않는다.
클라이언트 시간 초과는 서버 쿼리 취소를 보장하지 않으며, 서버 측 제한은 별도로 승인된
DB 역할 정책으로 검증해야 한다. 이 변경은 `ALTER ROLE`, 운영 환경변수, DB 스키마를 수정하지 않는다.
마이그레이션·백업에는 기존 직접 연결과 checksum/single-writer 절차를 유지한다.

## 운영 진단

`pnpm exec tsx apps/api/tools/inspect-postgres-runtime.mts --dry-run`은 DB에 접속하지 않는다.
운영 대상을 확인하고 자격증명을 안전하게 환경변수로 주입한 다음에만
`pnpm exec tsx apps/api/tools/inspect-postgres-runtime.mts --execute-read-only`를 사용한다.
이 명령은 `BEGIN READ ONLY`, 트랜잭션별 실행/잠금 제한, 최종 `ROLLBACK`으로 보호하며
연결·잠금·트랜잭션 나이·누적 DB 통계·무효 인덱스 개수만 반환한다. 사용자 행, SQL 본문,
계정명, 세션 식별자, 접속 URL을 출력하지 않는다. `visibility_limited`가 0보다 크면
현재 권한으로 일부 세션 상태를 볼 수 없다는 뜻이며 정상 판정의 근거로 사용하지 않는다.
누적 deadlock/rollback 값은 이전 스냅샷과의 차이로 해석한다.

상시 liveness는 DB를 호출하지 않는 `/api/health/live`를 유지한다. 스키마와 외부 의존성을
검사하는 `/api/health/ready`는 승인된 릴리스 점검에서만 호출한다. 반복 호출로 scale-to-zero를
방해하거나 운영 DB에 장애 주입 테스트를 수행하지 않는다.

## 검증 및 복구

`pnpm exec tsx apps/api/tools/verify-postgres-stability.mts`는 명시적인 `TEST_DATABASE_URL`이
필요하다. 숫자 loopback 주소와 `toonstudio_stability_` 접두어의 별도 DB만 허용한다.
실행 제한, 잠금 경합, 유휴 트랜잭션 종료, 풀 포화, 클라이언트 시간 초과, 멱등 종료를 검증한다.
이는 로컬 PostgreSQL 검증이며 실제 Neon PgBouncer·운영 부하·백업 복원을 검증한 것은 아니다.

운영 반영 전에는 대상 프로젝트/브랜치·최근 백업 및 복원 가능 시점·마이그레이션 원장·현재
배포 SHA를 확인한다. PR/CI 통과와 별도로 승인된 main SHA만 수동 배포한다.
DDL 변경이 없으므로 스키마 롤백은 필요하지 않다. 회귀 시 기존 정상 API 배포 SHA로 되돌리고,
환경변수를 조정할 때에도 별도 승인을 받는다. DB 풀 종료 시간 초과는 성공으로 숨기지 않는다.
