# 관련 정보(Related Info) — 데이터 출처·수집·법적 고려

작품 상세의 **"관련 정보 더 보기"** 섹션은 작품별로 실제 목적지(유튜브 영상·나무위키 문서·네이버
뉴스/블로그 글)로 직접 연결되는 링크 목록이다. 데이터는 웹툰 카탈로그와 동일한 **크롤 → JSON →
정적 서빙** 파이프라인으로 관리한다.

## 파이프라인

```
scripts/crawl-related-info.mjs   # 작품별 실링크 수집
  → data/related-info.json       # { [titleId]: RelatedInfoItem[] } (git 소스, 커밋됨)
  → pnpm catalog:gen             # build-static-catalog 가 detail 샤드(TitleDetailExtra.r)에 주입
  → public/data/detail/*.json    # 웹 정적 서빙(런타임 API 호출 불필요)
  → components/title-external.tsx # 카테고리 탭 + 카드(클릭 시 원본으로 이동)
```

- **주기 갱신:** `pnpm related:update`(로컬) 또는 `.github/workflows/related-info-update.yml`(주 1회).
- **additive·resumable·원자적:** 인기 상위부터 넓혀가며, 중단돼도 진행분 보존(tmp→rename).
- **YouTube 스로틀:** 스크래핑 모드는 Google 이 IP당 ~5~10회 후 `/sorry/` 봇체크로 차단 → best-effort
  (쿨다운으로 최대화). **공식 API 키를 쓰면 스로틀이 없다**(아래).

## 저장하는 것 / 안 하는 것

- **저장:** 링크 URL + 제목 + 출처명 + (유튜브)썸네일 URL·조회수 같은 **메타데이터**뿐.
- **저장 안 함:** 영상·기사·문서의 **본문/콘텐츠는 복제·저장하지 않는다.** 사용자는 카드를 눌러
  **원본 사이트로 이동**한다(검색엔진·링크 디렉터리와 유사한 아웃바운드 링크 모델).

## 법적 고려 (요약, 법률 자문 아님)

- 공개 콘텐츠로의 **아웃바운드 링크 + 메타데이터**는 콘텐츠 원문 복제보다 위험이 낮다.
- 다만 **네이버·유튜브 검색 페이지 HTML 스크래핑은 각 사 이용약관 위반 소지**가 있다. 상업 서비스는
  아래 **공식 API 사용을 권장**한다. 나무위키는 CC 라이선스라 링크는 무방.
- 출처는 카드에 표기한다("유튜브", "네이버 뉴스" 등). robots.txt 존중·레이트리밋 적용.

## 공식 API 전환(권장) — 환경변수만 설정하면 자동 우선

키가 설정돼 있으면 크롤러가 **ToS 준수 공식 API 를 우선 사용**하고, 없으면 스크래핑으로 폴백한다.
코드 변경 없이 env 만 추가하면 된다(로컬 `.env`·CI Secrets).

| 소스 | 환경변수 | 발급 | 비고 |
|---|---|---|---|
| 네이버 뉴스/블로그 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | https://developers.naver.com (검색 API) | 무료, 즉시 발급 |
| 유튜브 | `YOUTUBE_API_KEY` | https://console.cloud.google.com (YouTube Data API v3) | 일 1만 쿼터 무료, **스로틀 없음** |

```bash
# 로컬 예시
NAVER_CLIENT_ID=xxx NAVER_CLIENT_SECRET=yyy YOUTUBE_API_KEY=zzz pnpm related:update
```

크롤러는 시작 시 소스별 모드(공식 API / 스크래핑)를 로그로 표시한다.

## 커버리지 랭킹(알려진 특성)

크롤 대상은 인기 상위 N개를 `popScore = views + likes*5 + bookmarks*4 + ratingCount*3`(scripts/crawl-related-info.mjs)
로 고른다. 단 원시 `views` 는 플랫폼·연식에 따라 스케일 차가 크다(예: 오래된 네이버 데일리 웹툰은
수십억, 카카오/최신작은 수백만) → **조회수 상위 = 오래된 고조회 네이버작에 치우친다.** 그래서
글로벌 히트라도 플랫폼 집계 조회수가 낮은 작품(예: '나 혼자만 레벨업' 카카오 엔트리)은 top-N 밖에
있을 수 있다. 이런 유명작은 `CURATED_DB`(수동 큐레이션 백업) 또는 나무위키 폴백으로 처리된다.

커버리지를 넓힐 때(공식 API 키 설정 후 `--limit` 상향), 필요하면 랭킹 신호를 조정할 수 있다
(예: 조회수 로그 스케일링, rating/bookmark 비중↑, 플랫폼 내 순위 블렌딩). 정답은 "실제로 상세를
많이 보는 작품"인데 이는 실사용 로그가 있어야 검증되므로, 지금은 조회수 기준을 기본으로 둔다.
