# ToonSpectrum Studio — Storyworld Causality Lab

기준 저장소: `blue45f/toonspectrum`
기준 리비전: `843794a8a1c3de67d9c84b6e3116175d77e4b17b`
설계·구현일: 2026-09-05

## 1. 제품 가설

일반적인 만화 제작 도구는 픽셀, 벡터, 3D, 애니메이션, 생성형 이미지, 캐릭터 일관성을 강화한다. Storyworld Causality Lab은 그 위에 **작품 자체를 실행 가능한 세계 모델로 다루는 편집 계층**을 추가한다.

작가는 다음 항목을 명시적인 문서 데이터로 보유한다.

- 세계 사실과 장면 전제·효과
- 인물별로 알고 있는 사실과 비밀
- 독자에게 공개된 사실과 예정 공개 시점
- 복선 설치·회수 계약과 반복 모티프
- 시간·장소·감정 상태
- 번역 길이·접근성 근거
- 장면별 제작 시간과 사용 자산 리비전
- 라이선스·동의·생성 출처 영수증

엔진은 장면 순서대로 이 데이터를 실행해 “좋은 이야기”를 판정하지 않는다. 대신 **성립 불가능한 인과, 인물이 알 수 없는 정보, 깨진 공개 계약, 제작·현지화·권리 위험**을 재현 가능한 근거와 함께 반환한다.

## 2. 구현된 수직 슬라이스

### 결정적 인과 엔진

`studio-storyworld-causality.ts`는 외부 AI 공급자나 브라우저 API에 의존하지 않는 순수 TypeScript 엔진이다.

- 캐논 상태 머신과 장면별 세계 프레임
- 중복 ID·끊어진 참조·의존성 순환
- 비활성 선행 장면·후행 원인 장면
- 미성립·모순 전제와 잘못된 증감 연산
- 인물 지식 누출과 독자 공개 시점 위반
- 복선 설치·회수·기한 및 고아 회수
- 모티프 빈도와 실제 ‘사이 장면 수’ 간격
- 시간 역행과 동일 시간대 불가능 이동
- 인물 감정 급변
- 번역 말풍선 오버플로
- 읽기 순서·비색상 단서·대체 텍스트·소리 시각화·감소 동작 근거
- 자산 라이선스·동의·생성 출처
- 제작 가용량과 장면 복잡도 병목
- 축별 점수, 비파괴 수선 intent, 결정적 증거 영수증

### 반사실 멀티버스

`simulateStoryworldCounterfactual`은 원본을 변경하지 않고 다음 가상 변경을 실행한다.

- 장면 활성·비활성
- 장면 순서 변경
- 초기 사실 변경
- 특정 독자·인물 공개 제거

결과에는 기준/분기 점수, 새 문제, 해결된 문제, 의존성 기반 영향 원뿔이 포함된다.

### 파레토 분기 보드

`rankStoryworldParetoFrontier`는 임의의 숨은 가중치로 전개를 한 줄 순위화하지 않는다. 9개 품질 축에서 다른 후보보다 하나도 나쁘지 않으면서 하나 이상 나은 비지배 후보를 표시한다.

### 전용 작업대 UI

`StudioStoryworldLabPage.tsx`는 다음 탭을 제공한다.

1. 통합 건전성 대시보드
2. 모순·위험 필터와 비파괴 수선 제안
3. 장면 제거 반사실 실험과 파레토 비교
4. 인물 지식 행렬과 세계 실행 로그
5. 복선·회수 원장, 모티프 DNA, 스포일러 방화벽
6. 50개 창의 기능 성숙도 지도
7. 구조화 JSON 편집기

로컬 초안은 문서 정체성별 `localStorage`에 저장하며 JSON 가져오기·내보내기와 분석 영수증 내보내기를 제공한다. 서버 문서 저장과 Studio History/Undo 연결은 아래의 어댑터 경계를 통해 별도 원자 명령으로 통합해야 한다.

## 3. 50개 기능 포트폴리오

기능 카탈로그는 버튼 나열이 아니라 동일 문서 모델을 공유하는 포트폴리오다.

- **엔진 포함 23개**: 현재 코드만으로 분석 결과를 생성한다.
- **기존 기능 연계 23개**: 캔버스·대사·3D·협업·게시·자산 시스템 어댑터가 필요하다.
- **실험실 4개**: 별도 정확도·안전성 벤치마크를 통과하기 전까지 옵트인이다.

대표 차별화 기능:

- 플롯 물리 엔진, 캐논 상태 머신, 반사실 멀티버스
- 인물별 믿음 행렬, 초능력 대사 탐지, 추론 거리 지도
- 체호프 원장, 스포일러 방화벽, 폭로 안무가
- 소품 생애 원장, 의상·상처 연속성, 배경의 기억
- 독자 기억 감쇠, 지식 기반 맞춤 리캡, 커뮤니티 선택지 포크
- 제작 디지털 트윈, 가상 재촬영 비용, 분기 예산 가지치기
- 번역 형태 스트레스, 의미 보존 레터링, 접근성 스토리 레이어
- 권리·동의 원장, 캐논 잠금 토큰, 서사 회귀 테스트

전체 목록과 안전 경계는 `studio-storyworld-catalog.ts` 및 작업대의 **창의 기능 지도** 탭에 있다.

## 4. 라우팅 계약

패치는 기존 Studio 라우터의 문서 정체성 정규화 규칙을 재사용한다.

| 입력 | 정규 경로 | lifecycle key |
|---|---|---|
| `/studio/storyworld` | `/studio/storyworld` | `/studio/draft/storyworld` |
| `/studio/storyworld?id=work-1` | `/studio/work/work-1/storyworld` | `/studio/work:work-1/storyworld` |
| `/studio/work/work-1/storyworld` | 동일 | `/studio/work:work-1/storyworld` |
| `/studio/remix/source-1/storyworld` | 동일 | `/studio/remix:source-1/storyworld` |

`mode=upload`, 중복 ID, 작품/리믹스 정체성 충돌은 기존 워크스페이스 파서와 동일하게 실패 폐쇄한다. 페이지는 `lazyRetry`와 `Suspense`로 분리 로드된다.

## 5. 문서·History 통합 경계

현재 수직 슬라이스는 안전하게 독립 실행된다. 제품 본선에 병합할 때 다음 규칙을 지켜야 한다.

1. Storyworld 데이터는 작품 문서의 버전 필드로 저장하고 마이그레이션을 제공한다.
2. UI에서 승인한 `StoryworldRepairProposal.intent`만 Studio command로 변환한다.
3. 하나의 승인 제안은 하나의 원자 History operation과 하나의 협업 operation이 된다.
4. 분석은 문서 스냅샷을 읽을 뿐 캔버스 모델을 직접 변경하지 않는다.
5. AI가 보조하는 어댑터는 전송 컨텍스트, 공급자, 보존 정책, 비용을 실행 전에 표시한다.
6. 권리·동의가 불명확한 자산은 승인으로 추정하지 않는다.
7. proof receipt의 FNV-1a 값은 회귀 지문이며 전자서명으로 표시하지 않는다.

## 6. 검증

독립 검증 스크립트:

```bash
node scripts/verify-storyworld-lab.mjs
```

저장소 적용 후 권장 게이트:

```bash
pnpm exec vitest run \
  src/domains/creator/storyworld/studio-storyworld-causality.test.ts \
  src/domains/creator/studio-router/studio-route-manifest.test.ts
pnpm run typecheck
pnpm run lint:quick
pnpm run validate:architecture
pnpm run build
```

현재 전달물에서 실행한 **31개 독립 검증**:

- 순수 엔진·카탈로그 `tsc --strict`
- UI·Vitest 소스의 독립 `tsc --strict` 타입 검사
- 결정적 영수증 재실행 일치
- 정상 프로젝트 100점·문제 0개
- 비활성 원인 장면의 후속 영향 원뿔
- 모티프 간격 회귀 테스트
- 50개 기능 ID 유일성·성숙도 합계
- TSX에서 사용한 Storyworld CSS 클래스 셀렉터 커버리지
- 기준 라우터 모의 저장소에서 전체 패치 `git apply --check --whitespace=error`

## 7. 적용 파일

새 파일:

- `src/domains/creator/storyworld/studio-storyworld-causality.ts`
- `src/domains/creator/storyworld/studio-storyworld-catalog.ts`
- `src/domains/creator/storyworld/StudioStoryworldLabPage.tsx`
- `src/domains/creator/storyworld/studio-storyworld-lab.css`
- `src/domains/creator/storyworld/studio-storyworld-causality.test.ts`
- `scripts/verify-storyworld-lab.mjs`
- `docs/studio-storyworld-causality-lab-2026-09-05.md`

수정 파일:

- `src/domains/creator/studio-router/studio-route-manifest.ts`
- `src/domains/creator/studio-router/StudioRouter.tsx`
- `src/domains/creator/studio-router/studio-route-manifest.test.ts`

## 8. 완료 정의

이 전달물에서 완료된 것은 **실행 가능한 차별화 엔진, 전용 UI, 로컬 저장·입출력, 라우팅 패치, 테스트와 50개 기능 계약**이다.

아직 완료로 오표시하지 않는 항목:

- 서버 작품 문서 스키마와 마이그레이션
- Studio 공용 Undo/Redo·CRDT 어댑터
- 캔버스 요소·말풍선·3D 자산 자동 연결
- 실제 번역·게시·댓글·음성 공급자 연동
- 브라우저 실기기 E2E와 운영 배포

이 구분은 기능 성숙도를 숨기지 않고, 엔진 결과를 기반으로 후속 어댑터를 독립적으로 출시·회귀 검증할 수 있게 한다.
