# 무료 DB 연합 데이터 플레인 운영 기준

상태: **migration — 새 Supabase의 빈 시작용 스키마와 D1 분석 DB 생성 완료, 운영 연결·배포 검증 전**

## 2026-09-26 방향 재검토

사용자 목표는 독립적인 무료 할당량을 함께 써서 동일 기능·품질로 처리할 수 있는 트래픽을
최대화하는 것이다. 2026-09-26 사용자는 **기존 Neon 원본 보존, 기존 데이터 이관 생략,
새 무료 DB에서 빈 시작**을 승인했다. 기존 Neon 데이터와 새 DB의 사용자 데이터를 섞지 않으며,
유료 전환이나 과금되는 초과 사용을 활성화하지 않는다.

아래 16개 공급자·21개 논리 shard·36개 route는 **후보 배치 계획**이다. 라우터의 `plan()`은
SQL이나 document 쓰기를 실행하지 않는다. DB 개수·정책 항목 수·생성된 빈 schema를 실제 분산
처리량으로 계산하지 않는다. 운영 전환 완료는 실제 repository, 권한, 읽기/쓰기, 장애 처리와
배포된 API 검증으로 확인한다.

| 실제 연결 작업 | 유지할 계약 | 전환 기준 |
| --- | --- | --- |
| 새 무료 Supabase PostgreSQL → 핵심 원장 | 계정·권한·주문·작품 revision·승인·영구 멱등성 영수증의 기존 트랜잭션 | 전체 정본 bootstrap, runtime 권한, API readiness·인증·저장 검증 |
| Core → 인증된 분석 Worker → D1 | 페이지 조회·heartbeat·공유 수집과 관리자 overview/pulse를 같은 저장소로 이동 | 중복 이벤트·visitor 경계·역순 heartbeat·통계·retention 동등성 |
| Static Assets/CDN | 기존 공개 카탈로그·정적 파일 전달 | 이미 무료로 처리되는 경로에 불필요한 DB 호출 추가 금지 |
| 기존 실시간·객체 저장소 | Durable Objects의 순간 상태, 목적별 private source/derived/export | 기존 ACL·재접속·객체 위치 계약 유지 |
| Firestore·RTDB·BigQuery 등 추가 공급자 | 독립 workload의 데이터 계약 | 실제 runtime 인증과 repository 검증 후 연결; 빈 자원은 처리량에 미포함 |

무료 분산의 단위는 현재 원자적으로 완료해야 하는 작업의 경계다. 작품 저장, 게시 승인,
계정 병합, 리뷰 완료처럼 여러 테이블을 한 트랜잭션으로 갱신하는 작업은 그 경계를 유지한다.
같은 경계를 다른 공급자로 옮기거나 분리하려면 확정 버전·인가·멱등성·장애 복구 계약을 먼저
구현하고 검증한다. 방문 분석처럼 원장 외래키가 없는 workload부터 분리하고, 이후 독립성이
확인된 도메인을 추가한다. PostgreSQL이나 단일 DB를 영구 조건으로 두지 않는다.

D1 REST 관리 API는 계정 공통 API 호출 제한을 공유하므로 제품 요청 경로로 사용하지 않는다.
분석 Worker의 D1 binding을 사용하며 Core 전용 비밀로 인증한다. 브라우저는 SQL/RPC 비밀을
받지 않는다. D1 실패 시 PostgreSQL에 대신 기록하거나 불명확한 쓰기를 자동 재실행하지 않는다.

**무료 처리량 산정:** 요청 수, 읽은 행 수, 인덱스를 포함한 쓴 행 수, 저장량, 네트워크 전송량을
구분한다. Cloudflare D1은 계정 전체 일일 500만 행 읽기·10만 행 쓰기·총 5GB이므로 DB를 여러
개 만들어도 합계가 늘지 않는다. Worker 실행량 역시 같은 계정에서 공유한다. 각 workload의
요청당 실제 행 비용과 트래픽 비중을 측정한 뒤 예상 수용량을 기록한다.
[D1 공식 가격](https://developers.cloudflare.com/d1/platform/pricing/),
[Workers 공식 가격](https://developers.cloudflare.com/workers/platform/pricing/)

2026-09-26 확인: Cloudflare dashboard Workers Free(US$0, 현재 요금제), Supabase 조직 Free,
GCP 프로젝트 billing 비활성. 로컬 PostgreSQL 17에서 정본 91개 migration 체크섬과 capability
검증을 통과했고, 그 스키마를 새 Supabase에 적용했다. 원격 적용 범위와 아직 검증하지 않은
운영 경계는 아래의 실제 자원 기록으로 구분한다. DB 생성이나 TLS handshake 성공만으로
운영 정상화를 완료했다고 판단하지 않는다.

정본 정책:

- [`config/free-database-federation.json`](../../config/free-database-federation.json)
- [`config/free-infrastructure-policy.json`](../../config/free-infrastructure-policy.json)
- 생성된 런타임 정책: `federated-data-plane-policy.generated.ts`

검증:

```bash
pnpm run verify:free-infrastructure
pnpm run test:federated-data-plane
pnpm run gcp:free-data:check
```

## 목표와 비목표

목표는 서로 독립된 무료 할당량을 데이터 성격별로 사용해 중앙 DB의 저장공간, 연결 수,
읽기·쓰기 처리량을 분산하는 것이다. DB 개수만 늘리는 것은 목표가 아니다. Cloudflare D1처럼
계정 전체에 할당량이 묶인 공급자는 논리 shard를 늘려도 무료 처리량이 늘지 않는다고 간주한다.

다음은 비목표다.

- 요청 한 번에서 여러 공급자에 동기식 쓰기
- quota 소진 시 다른 DB로 권위 쓰기를 자동 전환
- 무료 한도를 넘긴 유료 종량제로 자동 확장
- PostgreSQL 스키마를 모든 공급자에 그대로 복제

## 절대 조건

1. 각 데이터 aggregate에는 정확히 하나의 쓰기 권위가 있다.
2. 기존 데이터의 권위를 이전할 때는 `backfill → 검증 → shadow read → 짧은 쓰기 중지 → cutover`를
   수행한다. 명시적으로 승인된 빈 시작은 원본을 보존하고 `빈 대상 확인 → 정본 스키마·권한 적용 →
   실제 runtime 검증 → API 검증 → cutover`를 수행하며, 데이터 이관 완료로 기록하지 않는다.
3. 권위 DB 장애나 quota 부족은 실패로 반환한다. 다른 엔진으로 자동 dual-write하지 않는다.
4. 파생 데이터는 outbox/queue consumer가 멱등하게 생성하며 언제든 재생성할 수 있어야 한다.
5. quota snapshot이 없거나 오래됐으면 신규 중앙 쓰기를 차단한다.
6. `free-allowance-with-app-cap` 공급자는 공급자 무료량보다 낮은 애플리케이션 cap을 사용한다.
7. 운영 환경의 credential, URL, account id는 정책 파일이나 Git에 기록하지 않는다.

## 장기 후보 권위 배치 — 운영 적용 보류

다음 배치는 초기 초안이며 위 트랜잭션 경계 재검토를 통과하기 전 활성화하지 않는다.

| 논리 shard | 공급자 | 쓰기 권위 데이터 |
|---|---|---|
| `crdb-ledger` | CockroachDB Basic | 결제·entitlement·idempotency 원장 |
| `tidb-identity` | TiDB Starter #1 | 사용자·계정·세션·인가 |
| `tidb-projects` | TiDB Starter #2 | 프로젝트·작품·revision 메타데이터 |
| `tidb-commerce` | TiDB Starter #3 | 마켓·상품·주문 상태 |
| `tidb-community` | TiDB Starter #4 | 커뮤니티·소셜 그래프·반응 |
| `tidb-collaboration` | TiDB Starter #5 | 팀·협업·메시징 메타데이터 |
| `cosmos-project-documents` | Cosmos DB Free | 큰 JSON manifest·snapshot |
| `dynamodb-audit-events` | DynamoDB Free | append-only 감사·전달·사용 이벤트 |
| `firestore-notifications` | Firestore Free | 알림 inbox·activity inbox·device 상태 |
| `firebase-presence` | Firebase RTDB Spark | presence·typing·짧은 room 상태 |
| `atlas-ai-jobs` | MongoDB Atlas M0 | AI job·moderation evidence·provider payload |
| `convex-live-review` | Convex Free | 작은 reactive review workflow |
| `appwrite-feedback` | Appwrite Free | 피드백·지원·사업 문의 |

## 읽기·분석 후보 배치

| 논리 shard | 공급자 | 용도 |
|---|---|---|
| `turso-public-catalog` | Turso | 공개 카탈로그·프로필·검색 read model |
| `d1-edge-index` | Cloudflare D1 | edge index·ranking snapshot·route manifest(8개 shard) |
| `d1-analytics-buffer` | Cloudflare D1 | 온라인 분석 이벤트 buffer(2개 shard) |
| `upstash-hot-cache` | Upstash Redis | rate limit·짧은 idempotency·hot cache |
| `bigquery-analytics` | BigQuery Sandbox | D1 export의 batch load·quota telemetry·offline query |
| `motherduck-analysis` | MotherDuck Lite | Parquet 기반 임시 분석·오프라인 보고서 |
| `neon-legacy-compat` | Neon Free | 보존한 기존 원본; 새 운영 DB로 데이터 이관하지 않음 |
| `supabase-social-compat` | Supabase Free | 보존한 private 전환 schema와 projection checkpoint; 새 핵심 원장과 권한 분리 |

`public-catalog-read`와 `analytics-read`만 `weighted-rendezvous` 분산을 허용한다. 동일 routing key는
같은 공급자를 선택하므로 cache locality를 유지하고, 공급자별 `trafficWeight`와 남은 quota를
함께 반영한다. 모든 권위 쓰기 route는 후보가 하나뿐이다.

## 현재 실제 생성된 무료 자원

### Supabase 빈 시작용 핵심 DB — 스키마 적용 완료, 운영 전환 전

2026-09-26 Supabase PostgreSQL 17의 비어 있던 앱 영역에 정본 스키마를 적용했다.
빈 시작용 bootstrap은 기존 Neon에서 데이터를 추출하거나 삭제하지 않았고, 기존 사용자 행은 복사하지 않았다.
다음 수치는 원격 SQL 적용 직후 운영자가 조회한 값이며 운영 API의 성공을 뜻하지 않는다.

| 확인 항목 | 적용 직후 결과 |
| --- | --- |
| 정본 migration | 91개 검증과 별도 채택 기록을 포함한 원장 92행 |
| 앱 cutover marker | 13개 |
| 사용자 | 0행; 새 가입부터 시작 |
| DB 전체 크기 | 약 25MB; 앱 테이블만의 크기가 아님 |
| runtime role | 전용 제한 역할을 생성하고 `LOGIN` 활성화; 임의 생성 SCRAM 비밀번호는 비밀 저장소에서만 관리 |
| 관리 영역 보존 | Supabase 관리·인증·storage 영역과 `toonspectrum_federation` 기존 3개 테이블 보존 |
| Data API 권한 | 새 앱 영역의 `PUBLIC`, `anon`, `authenticated`, `service_role` 권한과 생성 전 기본 grant 회수 |
| 원격 최종 verifier | 인증된 linked CLI에서 `final-verification.sql` 성공; 검사 transaction 전체 rollback |
| 실제 runtime 인증·권한 | CA와 `verify-full`로 psql TLSv1.3 인증 성공; 사용자 fixture INSERT 후 rollback·잔여 0행, 관리 schema 접근 차단 확인 |
| 앱 repository readiness | 실제 runtime과 CA `verify-full`로 Node `PostgresHealthReadinessRepository` 직접 실행: `database=true`, `schema=true`; 배포된 HTTP 검사와 구분 |
| 아직 남은 검증 | Render의 새 DB·CA 연결 설정, 배포된 API readiness·가입·로그인·저장 |

적용한 SQL 파일의 SHA256은
`bba0c508a680a769fe41f996edeeb7aef7333d47dd35b2af5fb55c080fb0d3f2`다.
이는 SQL 산출물 체크섬이며 배포 Git SHA가 아니다. 생성 도구는
[`prepare-managed-database-bootstrap.mjs`](../../scripts/prepare-managed-database-bootstrap.mjs)다.
검증된 로컬 정본 DB의 schema-only dump에서 구조를 가져오고, migration 원장·cutover marker·정본
초기 정책 행만 구성했다. Supabase의 기존 관리 역할과 다른 schema는 가져오거나 덮어쓰지 않는다.

적용 전 검증에는 PostgreSQL 17의 비superuser `CREATEROLE` 운영자 fixture를 사용했다.
`createrole_self_grant=''` 조건에서 capability 검사에 필요한 임시 `SET ROLE` 권한만 부여하고
기존 membership 상태를 복구했다. 보호 schema 보존, Data API 접근 차단, runtime DML,
중간 실패 시 전체 transaction rollback을 확인했다. 이 로컬 근거와 원격 DB 적용 결과는 별개다.

### Cloudflare D1 분석 DB — 생성·단독 검증 완료, 운영 미연결

현재 실제 생성한 D1 DB는 `toonspectrum-analytics-buffer` 1개다. 분석 테이블과 migration checkpoint를
적용한 뒤 `analytics-buffer-v2`로 원격 upgrade를 완료했다. v2는 검토한 미사용 인덱스 6개를
제거해 쓰기 행 비용을 줄인다. 적용 후 schema SHA256은
`e7beb58add8f451fd08336b92752590f5d8750178e23891ed840f8fd0a9e2120`다.
원격 canary에서 스키마, 중복 이벤트의 단일 반영, heartbeat, overview, pulse와 테스트 행 정리를
검증했다. 이 검사는 단독 DB 검증이며 배포된 Core → Worker → D1 경로의 검증은 아니다.
D1 `meta`에서 새 세션과 page view의 쓴 행 수는 v1의 12행에서 v2의 9행으로 25% 줄었다.
동일한 단일 canary 측정이며 일일 처리량 보장이나 운영 트래픽 수용량으로 환산하지 않는다.

관리자 쿼리는 반복한 범위 조회를 합쳐 읽기 행 수도 줄였다. 실제 workerd/D1의 로컬 인스턴스에
최근 5분의 합성 session 1,000개와 page view 1,000개를 넣어 같은 응답인지 비교했다.
`pulse`는 6,123→3,124행(약 49%), `overview`는 23,332→20,336행(약 12.8%)으로 줄었다.
이 결과는 로컬 고정 fixture의 `meta.rows_read`이며 운영 부하 시험이 아니다. 기존 갱신 주기,
캐시 수명과 응답 계약은 유지했다. PostgreSQL 17과 SQLite의 1·7·30·90일 통계 및 밀리초 경계,
봇·미래 이벤트·중복 방문자 결과도 대조했다.

분석 repository와 인증 Worker는 이 변경에서 구현·검증하는 연결 코드다. Worker 운영 배포와
Core의 `TRAFFIC_ANALYTICS_STORE=d1` 전환이 끝나기 전까지 현재 운영 트래픽의 분산 완료로
계산하지 않는다. `toonspectrum-edge-index`와 manifest의 다른 후보 자원은 이 분석 DB 생성
기록만으로 생성 완료라고 판단하지 않는다. 계정의 D1 무료 할당량은 DB 사이에서 공유한다.

### GCP/Firebase

- GCP 프로젝트: `toonstudio-cloud-20260915`
- 결제 연결: 비활성
- Firestore `(default)`: 서울 `asia-northeast3`, Native, free tier, 삭제 보호 활성
- Firebase RTDB: 싱가포르 `asia-southeast1`, 기본 인스턴스, deny-all rules
- BigQuery dataset: `toonspectrum_analytics`, 서울, 기본 30일 만료
- BigQuery tables: `analytics_event`, `provider_quota_snapshot`
- 두 테이블 모두 일 단위 partition과 partition filter를 강제한다.
- Sandbox는 streaming insert를 허용하지 않으므로 D1 buffer에서 NDJSON/Parquet batch load만 수행한다.

재검증 또는 동일 구성 적용:

```bash
pnpm run gcp:free-data:plan
pnpm run gcp:free-data:check
TOONSPECTRUM_GCP_FREE_DATA_CONFIRMATION=APPLY-TOONSPECTRUM-GCP-FREE-DATA \
  pnpm run gcp:free-data:apply
```

### 보존한 Supabase compatibility schema

새 핵심 DB를 구성한 서울 리전 무료 프로젝트에는 기존 `toonspectrum_federation` private schema가
있다. 빈 시작용 bootstrap은 다음 테이블을 보존했다.

- `provider_quota_snapshot`
- `social_projection`
- `migration_checkpoint`

이 schema와 모든 table은 `anon`, `authenticated`, `PUBLIC` 권한을 회수했고, RLS와 명시적 deny
policy를 사용한다. 생성 당시 Supabase security/performance advisor 결과 0건은 이 compatibility
구성에 대한 기록이다. 이후 적용한 전체 앱 schema의 advisor 결과로 확대 해석하지 않는다.
이 schema는 새 소셜 권위가 아니라 이관 상태와 검증용 projection만 보관한다.

## Supabase CA 배포 결정 — 공개 파일 image 포함, 운영 미반영

Supabase session pooler의 인증서는 일반 Node trust store에 없는 `Supabase Root 2021 CA`로
연결된다. 공식 Studio의
[인증서 URL 설정](https://github.com/supabase/supabase/blob/b044408e79cc25299139c68959863e6f06cc1e4d/apps/studio/hooks/custom-content/custom-content.json#L63)에서
운영 환경 `prod`의 [공개 CA 다운로드](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt)
주소를 확인했다. 이 파일은 공개 trust anchor이며 사용자 비밀번호나 private key를 포함하지 않는다.

- PEM 파일 SHA256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`
- 인증서 DER SHA256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`
- 인증서 만료: `2031-04-26 10:56:53 UTC`
- 2026-09-26 Python과 Node 24에서 session pooler 5432의 체인·hostname 검증 성공.
  이후 실제 runtime의 psql `verify-full` 인증과 TLSv1.3도 별도로 확인했다.

기존 Core의 `Pool`은 별도 `ssl.ca`를 지정하지 않는다. Node 시작 환경의
`NODE_EXTRA_CA_CERTS`로 CA를 추가하고 DB URL의 `sslmode=verify-full`을 유지할 수 있다.
`NODE_EXTRA_CA_CERTS`는 프로세스 시작 시에만 읽으며, 명시적 `ca` 옵션이 있으면 해당 TLS 연결에
적용되지 않는다. [Node 공식 문서](https://nodejs.org/download/release/v22.21.0/docs/api/cli.html#node_extra_ca_certsfile)

| 배포 방식 | 최소 변경 | 검토·전환 조건 |
| --- | --- | --- |
| **선택: 공개 CA를 Docker image에 포함** | 검토한 PEM을 `deploy/trust/supabase-prod-ca-2021.crt`로 관리하고 final stage에 `COPY`; `NODE_EXTRA_CA_CERTS`를 복사한 절대 경로로 설정 | 승인 SHA의 Linux image를 한 번 빌드하고 체크섬·파일 읽기 권한·TLS를 검사. CA 갱신은 image 변경·재배포 필요 |
| 비교한 대안: Render Secret File | PEM을 `supabase-prod-ca-2021.crt`로 등록하고 `NODE_EXTRA_CA_CERTS=/etc/secrets/supabase-prod-ca-2021.crt` 설정 | 기존 image를 유지할 수 있으나 이번 전환에는 사용하지 않음. 파일 저장 시 배포 시작 가능성과 Docker 파일 읽기 권한을 별도로 관리해야 함 |

이번 전환은 공개 CA를 image에 포함하도록 선택했고, 파일·출처 기록과 container workflow 반영을
준비한다. 이 문서의 DB 검증 기록은 해당 image 빌드나 Render 운영 배포의 완료를 뜻하지 않는다.
CA는 비밀이 아니지만 신뢰할 root를 추가하는 설정이므로 다운로드 출처와 체크섬을 검토하고,
시작 시 원격 다운로드에 의존하지 않는다. `/etc/secrets` 대안은 이번 배포 계획에서 제외했다.
[Render Secret Files](https://render.com/docs/configure-environment-variables#secret-files),
[Docker runtime 파일 경로·권한](https://render.com/docs/docker-secrets#accessing-secret-files-at-runtime)

사용자가 승인한 DB 빈 시작 범위와 별도로 운영 환경·배포 범위를 확인하고, 정확한 승인 SHA,
검증한 image와 새 CA 설정을 입력으로 기록한다. 적용 후 실제 제한 runtime으로 인증,
readiness·인가·가입·저장을 확인해야 성공이다. 실패 시 원인을 기록하고 추가 배포를 반복하지
않는다. 이전 Neon은 quota 장애 상태를 재검증하기 전 정상 rollback 대상으로 간주하지 않는다.
새 DB에 쓰기가 시작되면 이전 DB로 자동 전환하거나 두 DB에 함께 쓰지 않는다.

직전 Core image에는 공개 CA와 D1 adapter가 없으므로 새 Supabase·D1 환경변수를 유지한 채
이전 image만 복원하면 TLS 실패 또는 분석 쓰기의 PostgreSQL 회귀가 발생할 수 있다.
기존 Neon의 quota `402`가 해소되지 않은 상태도 정상 rollback 조건을 충족하지 않는다.
새 image에서 TLS readiness와 D1 수집·조회를 먼저 검증한다. 복구 판단과 기록에는 image,
환경변수, DB 쓰기 권위를 함께 포함하고, 새 권위에 기록된 데이터를 보존한다.

## 외부 인증·실제 연결 검증이 필요한 공급자

다음 공급자는 정책·schema manifest까지 준비됐지만 현재 로컬 세션에 유효한 계정 인증이 없어
생성하지 않았다.

- CockroachDB Basic
- TiDB Cloud Starter 5개 instance
- Turso
- Azure Cosmos DB Free
- AWS DynamoDB Free
- MongoDB Atlas M0
- Convex Free
- Appwrite Free
- MotherDuck Lite

미인증 자원을 `provisioned`로 표시하면 안 된다. 연결 후에도 먼저 quota API 또는 dashboard 값을
수집해 `provider_quota_snapshot`을 만든 다음 해당 shard만 `enabledShardIds`에 포함한다.

## 런타임 활성화

후보 라우터의 기본값은 비활성이다. 이것을 켜도 제품 repository가 연결되지는 않는다.
환경변수 snapshot은 부팅 시 고정되므로 900초 뒤 만료된다. 자동 갱신 경로가 검증되기 전에는
이 라우터를 운영 쓰기의 게이트로 사용하지 않는다. 실제 분석 저장소는 별도의
`TRAFFIC_ANALYTICS_STORE` 설정으로 선택하고 수집과 관리자 조회에 동시에 적용한다.

```dotenv
FEDERATED_DATA_PLANE_ENABLED=true
FEDERATED_DATA_PLANE_QUOTA_SNAPSHOTS_JSON={"version":"toonspectrum.federated-data-plane-quota.v1","shards":{}}
```

빈 snapshot으로는 어떤 shard도 활성화되지 않는다. 각 snapshot에는 health, usage ratio,
forecast ratio, 측정 시각, 최대 유효 시간이 있어야 한다. 환경변수에는 credential을 포함하지 않는다.

## 단계별 전환

### 0. 인프라만 생성

후보 공급자의 초기 단계다. schema와 quota guard는 존재하지만 운영 요청은 기존 경로를 사용한다.
새 DB에는 실사용자 데이터를 쓰지 않는다. 위 Supabase 빈 시작은 별도로 승인된 전환이며,
실제 runtime·API 검증을 마친 뒤 신규 쓰기를 시작한다. 기존 데이터의 shadow 단계는 생략한다.

### 1. shadow projection

기존 원장의 outbox를 읽어 새 공급자에 projection을 만든다. 응답에는 사용하지 않고 row count,
aggregate checksum, 최신 source version, 지연 시간을 비교한다. 실패 이벤트는 원장 cursor를
진행하지 않는다.

### 2. read shadow

운영 응답은 기존 원장에서 반환하되 일부 요청에서 새 공급자를 함께 읽고 결과 hash를 비교한다.
불일치는 로그와 `migration_checkpoint`에 기록하며 사용자 응답에는 영향을 주지 않는다.

### 3. 파생 읽기 전환

Turso/D1/BigQuery/MotherDuck처럼 재생성 가능한 읽기 경로부터 전환한다. 오류율·quota·지연이
기준을 넘으면 기존 원장 또는 정적 snapshot으로 읽기만 되돌린다.

### 4. 도메인별 권위 전환

권위 도메인은 한 번에 하나만 전환한다. 쓰기 drain 후 source cursor와 checksum을 고정하고 새 DB를
권위로 지정한다. cutover 직후에는 기존 DB를 read-only rollback source로 유지한다.

## rollback

- 파생 read model: route 후보에서 제거하고 원장 또는 정적 snapshot으로 복귀한다.
- 권위 DB: 새 쓰기를 즉시 중지하고 마지막 검증 cursor 이후 이벤트를 보존한다.
- dual-write로 복구하지 않는다. 역방향 idempotent migration을 수행한 뒤 이전 권위를 재개한다.
- 데이터가 불일치하면 가용성보다 정합성을 우선해 해당 도메인 쓰기를 차단한다.
- provider quota가 80% cap에 도달하면 신규 쓰기를 중지하고 export/read는 유지한다.

## 공급자 schema manifest

- CockroachDB ledger: `deploy/federated-data-plane/cockroachdb/ledger.sql`
- TiDB 5개 authority: `deploy/federated-data-plane/tidb/authority-schema.sql`
- D1 edge index: `deploy/federated-data-plane/d1/edge-index.sql`
- D1 analytics buffer: `deploy/federated-data-plane/d1/analytics-buffer.sql`
- Turso public catalog: `deploy/federated-data-plane/turso/public-catalog.sql`
- Cosmos container contract: `deploy/federated-data-plane/cosmos/containers.json`
- DynamoDB audit table: `deploy/federated-data-plane/dynamodb/audit-events.template.json`
- MongoDB AI job validator: `deploy/federated-data-plane/mongodb/ai-jobs.validator.json`
- Supabase private compatibility schema: `deploy/federated-data-plane/supabase/private-federation.sql`
- GCP/Firebase: `deploy/gcp-free-data`

이 파일들은 credential을 포함하지 않으며 운영 적용은 별도 승인과 연결된 공급자 세션이 필요하다.
