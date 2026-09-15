# KMAS 오픈 API 연동 설계 (승인 후 구축)

> 목적: 크롤 의존을 **공식 공공데이터**로 대체/보강하기 위한 KMAS(한국만화영상진흥원 만화규장각)
> 오픈 API 연동 계획. **인증키(prvKey) 승인(신청 완료, 대기 중) 후** 실제 응답을 보고 구축한다.
> 필드명은 공개 문서에 정확히 없어 아래 매핑은 **승인 후 실응답으로 확정**한다(추측 구현 금지).

## 1. KMAS API 스펙 (확인됨)

- **엔드포인트**(REST, JSON):
  - `https://www.kmas.or.kr/openapi/search/dcmtDtaList` — 소장 도서·웹툰·잡지·영상 등 통합 조회
  - `https://www.kmas.or.kr/openapi/search/bookAndWebtoonList` — 도서·웹툰 조회(제목/ISBN 검색)
- **인증**: `prvKey`(발급 인증키) 쿼리 파라미터 필수.
- **요청 파라미터**: `pageNo`, `viewItemCnt`(최대 100), `startDate`/`endDate`, `title`, `isbn`, 작가명, 출판사명.
- **제공 데이터**: 작품명·작가(글/그림)·출판사·ISBN·장르·줄거리·`imageDownloadUrl`·가격·페이지수 등.
- **한도**: 일 1,000회 · 활용기간 승인일로부터 12개월.
- **성격**: 공공데이터(공신력). 신청 시 활용목적/활용내용 심의 후 승인.
- **전체 목록 호출 제약**: 2026-07 실응답 기준 `bookAndWebtoonList?prvKey=...`와
  `dcmtDtaList?prvKey=...`처럼 인증키만 붙인 무조건 목록 호출은 `resultState=error`,
  `resultMessage=데이터가 없습니다.`를 반환한다. `KMAS_UPDATE_MODE=full-list` 검증 경로는 유지하되,
  운영 병합은 기존 카탈로그 제목/ISBN을 검색 조건으로 사용한다.

## 2. 아키텍처 — KMAS는 "읽는 플랫폼"이 아니라 "메타데이터 보강 공식 소스"

기존 카탈로그는 크롤러(`scripts/crawlers/*`) → `Title[]` → `merge-catalog.mjs`(mergeTitle/
mergeAvailability) → `apps/api/data/catalog.json.gz` → `catalog:gen` → 정적 서빙 파이프라인이다.
KMAS는 사용자가 회차를 읽는 유통 플랫폼이 아니라 **메타데이터·시놉시스·썸네일 URL 보강 소스**이므로,
availability(보러가기) 플랫폼이 아니라 **enrichment(보강) 소스**로 붙인다.

```
scripts/kmas-fetch.mjs / scripts/kmas-update-catalog.mjs
  → KMAS API 응답 조회(prvKey, 기본은 기존 카탈로그 제목 기반 검색; full-list 검증 모드 제공)
  → 응답 itemList → Title 호환 객체 매핑(§3, imageDownloadUrl은 URL 문자열로만 저장)
  → data/kmas-catalog.json (or stdout)
  → merge-catalog.mjs 로 base 카탈로그에 병합
     · 매칭: ISBN 우선, 없으면 정규화 제목(norm)
     · 보강: 썸네일 URL·시놉시스·작가·출판사·장르를 KMAS 값으로 우선(공식)
     · 신규: 크롤에 없던 KMAS 작품 추가
  → catalog:gen → 정적 서빙
```

## 3. 필드 매핑 (승인 후 실응답으로 확정 — TODO)

KMAS item(정확한 JSON 키는 실응답 확인) → `Title`(packages/core/src/types.ts):

| Title 필드 | KMAS 소스(추정, 확정 필요) | 비고 |
|---|---|---|
| `id` | `kmas-${ISBN 또는 자료ID}` | 안정적 고유키 |
| `title` | 작품명 | |
| `author` / `artist` | 글작가 / 그림작가 | |
| `synopsis` | 줄거리 | **공식 시놉시스 → 크롤 원문 대체**(COMPLIANCE §2 갭 해소) |
| `coverImage` | `imageDownloadUrl` | 기존 크롤 썸네일 URL과 같은 메타데이터로 저장. 이미지 바이너리 저장·서버 프록시 중계 금지 |
| `genres` | 장르 | 기존 taxonomy로 매핑 |
| `type` | 도서/웹툰 구분 | webtoon/webnovel |
| `availability` | (KMAS는 유통 아님) | 기존 크롤 availability 유지, KMAS는 미설정 |

`stats`(조회수·평점 등)는 KMAS 미제공 → 기존 크롤/추정값 유지, `statsEstimated` 규약 준수.

## 4. 수동 보강 경계

KMAS는 작품의 유통 플랫폼(`availability`)이 아니라 공식 메타데이터 보강 소스입니다. 별도 런타임
소스 레지스트리나 스케줄러에 등록하지 않고, 운영자가 필요할 때 로컬 명령으로만 실행합니다.
`scripts/kmas-update-catalog.mjs`가 기존 작품 제목을 공식 API로 조회해 시놉시스·연령등급·썸네일 URL을
병합하며, 이미지 바이너리는 저장하지 않습니다.

## 5. 활성화

```bash
# 공식 응답을 별도 JSON으로 확인
KMAS_PRV_KEY=<발급키> pnpm kmas:fetch

# 기존 catalog.json.gz에 선택적으로 병합하고 정적 파일 재생성
KMAS_PRV_KEY=<발급키> pnpm kmas:update-catalog
```

`KMAS_PRV_KEY`는 로컬 실행 환경 또는 서버의 공식 API 보강 기능에만 둡니다. 카탈로그 파일 변경은
결과를 검토한 뒤 커밋·재배포하며, KMAS 갱신을 실행하는 GitHub Actions나 주기 작업은 없습니다.

## 6. 컴플라이언스 효과

- KMAS 소스 작품은 **시놉시스가 공식 API 응답** → 크롤 시놉시스의 저작권 리스크 완화.
- `imageDownloadUrl`은 URL 문자열만 `coverImage` 메타데이터로 저장하고, 이미지 바이너리는 저장하지 않으며 서버 프록시로도 중계하지 않는다.
- 데이터 출처가 정당(공식 오픈API) → DB제작자권리·성과도용 리스크의 근본 완화(COMPLIANCE §2 ③).
- 커버리지: KMAS로 채운 작품은 공식, 미커버 작품은 기존 크롤(점진 대체). 출처 표기 유지.
