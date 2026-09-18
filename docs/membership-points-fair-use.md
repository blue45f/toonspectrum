# 멤버십 · 활동 포인트 · 공정 사용 정책

## 제품 원칙

현재 ToonSpectrum은 멤버십 결제나 크레딧 판매를 활성화하지 않는다.

서비스 재화는 목적에 따라 **Reward Point**와 **Studio Credit**으로 분리한다.
Reward Point는 작품·커뮤니티·운세·놀이터 등 정상 활동에 대한 보상이며 현금이나 출금 가능한 잔액이 아니다.
Studio Credit은 ToonSpectrum이 비용을 부담하는 AI 생성·서버 렌더처럼 변동원가가 큰 작업의 사용량을 통제하는 소모성 재화다.
현재 운영되는 개인 API 키, 개인/관리형 Creator Runtime 직접 연결, 브라우저 로컬 처리에는 Studio Credit을 차감하지 않는다.
멤버십은 현재 결제 상품이 아니라 저장공간·업로드·협업·보관 정책과 월 Studio Credit 예산을 묶는 **권한 등급**이다.

`creditPurchasesEnabled=false`이므로 현재 Studio Credit을 직접 판매하지 않는다.
멤버십 포함 Credit은 매월 지급되고 이월되지 않으며, 플랜 승급 시 해당 월 목표량까지 차액만 보충한다.
Reward Point와 Studio Credit은 서로 환전하지 않는다.

## 정책의 단일 정본

멤버십 등급, 저장공간, 업로드, 협업, AI 사용량, 활동 포인트 기본값은
`packages/core/src/membership-wallet.ts`를 정본으로 사용한다.

- 공개 정책: `GET /api/membership/catalog`
- 로그인 사용자 현황: `GET /api/membership/overview`
- 현재 사용자 유효 권한: `GET /api/membership/entitlements`
- 클라이언트 확인형 활동 적립: `POST /api/membership/activity/claim`
- 공개 안내: `/membership`
- 운영자 관리: Admin의 플랜 화면 내 `Membership Policy Engine`

운영자 오버라이드는 `membership_policy_override`에 저장하며 공개 정책 API와 사용자 권한 API가
같은 유효 정책을 사용한다. Studio의 정적 안전 검사도 같은 Core 기본값에서 파생한다.

## Creator Level 정책

Creator Level은 결제 멤버십과 분리한다. 자동 산정에는 보너스·관리자 지급 포인트가 아니라
`activity:*` 원장으로 확인된 정상 활동 포인트만 사용한다.

| Creator Level | Creator 인증 | 공개 작품 | 활동 포인트 |
| --- | --- | ---: | ---: |
| New | 미인증 가능 | 0 | 0 |
| Verified | 필수 | 0 | 0 |
| Active Creator | 필수 | 1+ | 300+ |
| Trusted Creator | 필수 | 5+ | 1,500+ |
| Professional | 필수 | 20+ | 5,000+ |
| Partner | 운영 검토 | 운영 검토 | 운영 검토 |

Creator 인증은 `creator_profile.isVerifiedCreator`, 공개 작품은 `published && !hidden`,
활동 포인트는 `wallet_lot.source LIKE 'activity:%'`를 기준으로 계산한다.
관리자가 명시적으로 설정한 Creator Level과 Partner는 자동 계산 결과보다 우선한다.
Trust Level과 Seller Level은 신고·저작권·판매자 검증 등 별도 운영 신호로 유지한다.

## 활동 포인트

| 활동 | 포인트 | 일일 적립 횟수 | 최소 간격 | 확인 주체 |
| --- | ---: | ---: | ---: | --- |
| 새 작품 만들기 | 20 P | 3회 | 60초 | 서버 |
| 작품 공개 | 100 P | 2회 | 300초 | 서버 |
| 커뮤니티 글 작성 | 15 P | 5회 | 60초 | 서버 |
| 댓글 작성 | 3 P | 10회 | 20초 | 서버 |
| 운세 이용 | 2 P | 3회 | 60초 | 서버 |
| 놀이터 이용 | 3 P | 5회 | 120초 | 클라이언트 이용 확인 |

프로필 이름과 소개를 모두 채우면 `profile-complete` 마일스톤을 1회 지급한다.
첫 공개 작품에는 `first-public-work` 마일스톤을 1회 추가 지급한다.

서버 확인 활동은 생성된 실제 레코드 ID를 적립 근거로 사용한다.
동일 근거의 재요청은 지갑 lot의 `sourceKey`로 멱등 처리하고,
사용자·활동별 advisory lock으로 동시 요청이 일일 한도를 우회하지 못하게 한다.
일일 한도는 Asia/Seoul 날짜 경계로 계산한다.

포인트 지급 실패는 작품 저장, 글 작성, 댓글, 운세 결과 같은 원래 제품 동작을 롤백하지 않는다.
Reward Point의 기본 유효기간은 지급일로부터 365일이며, 각 lot 단위 만료와 사용 우선순위를 원장에 보존한다.

## 멤버십 자원 정책

기본 등급은 `Free → Creator → Pro → Team` 순서다.

| 등급 | 저장공간 | 월 Studio Credit | 일일 Credit 한도 |
| --- | ---: | ---: | ---: |
| Free | 10 GB | 500 C | 150 C |
| Creator | 100 GB | 2,000 C | 500 C |
| Pro | 500 GB | 5,000 C | 1,500 C |
| Team | 1 TB | 20,000 C | 5,000 C |

저장공간 80%부터 경고하며 100% 이후의 새 저장은 허용하지 않는 것을 상위 정책으로 삼는다.
Studio Credit 일일 한도는 Asia/Seoul 날짜 경계로 계산하며, 완료된 사용뿐 아니라 아직 처리 중인 예약량도 포함한다.

공개 페이지에 표시하는 파일 한도는 **계정 상위 한도**다.
PSD, 3D, CRDT, 이미지 디코드 메모리처럼 포맷·기능별 기술 안전 한도가 더 낮으면
해당 기능의 더 엄격한 한도가 우선한다.

베타 무료 혜택은 **이용료 면제**를 뜻하며 무제한 자원 소비를 뜻하지 않는다.
저장공간, 업로드 크기·일일량, 동시 처리, 협업 인원 등 공정 사용 및 기술 안전 한도는
무료 기간에도 유지한다.

## Studio Credit 운영 원칙

Studio Credit은 현재 구매 상품이 아니라 멤버십에 포함되는 사용량 예산이다.

1. 월 지급 lot은 해당 KST 월말에 만료되며 다음 달로 이월하지 않는다.
2. 플랜 승급 시 이미 받은 월 지급량을 제외한 차액만 보충한다.
3. 사용 전 `reserve`, 성공 시 `capture`, 실패·취소 시 `release`하여 동시 요청에도 잔액이 음수가 되지 않게 한다.
4. 일일 한도 계산에는 `reserved`와 `captured` 상태를 모두 포함해 병렬 요청 우회를 막는다.
5. 무료·프로모션·멤버십 lot을 구매 lot보다 먼저 소비하도록 우선순위를 유지한다.
6. 실제 구매 기능은 가격·환불·스토어 결제 정책이 확정될 때까지 비활성화한다.
7. Reward Point → Studio Credit 또는 판매자 정산금으로의 직접 환전은 제공하지 않는다.

Marketplace 판매대금과 판매자 정산은 Studio Credit/Reward Point 지갑과 별도 회계 영역으로 유지한다.
