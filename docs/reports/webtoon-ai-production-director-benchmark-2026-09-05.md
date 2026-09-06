# 웹툰 AI 프로덕션 디렉터 경쟁 분석 및 구현 보고서

- 기준일: 2026-09-05
- 대상: ToonStudio / `blue45f/toonspectrum`
- 구현 브랜치: `feat/studio-webtoon-ai-production-director-20260905`
- 범위: 이미지 모델 자체의 벤치마크가 아니라 **웹툰 회차 제작 품질, 기능 연결성, UI/UX, 생성 전 검수**

## 1. 결론

기존 ToonStudio의 AI 기능 수는 적지 않았다. 배경·캐릭터·구도·대사·팔레트, 화풍·음영·프롬프트·콘티·말풍선, 이미지 역할 참조팩, 출처·비용·실패 정책까지 각각 존재했다. 문제는 다음 단계가 끊겨 있었다는 점이다.

1. 슈퍼 스위트 모달과 테스트가 있어도 AI 허브가 `onOpenSuperSuite`를 전달하지 않아 실제 런처가 숨겨졌다.
2. 사용자는 도구별 프롬프트를 이동시켜야 했고, 한 회차의 캐릭터·의상·장소·광원을 하나의 기준으로 고정할 수 없었다.
3. 긴 대사, 모호한 장소, 설명 없는 의상 교체, 반복 구도처럼 재생성 비용을 키우는 문제를 생성 전에 보지 못했다.
4. 몇 컷이 한 요청 실패에 함께 묶이는지, 후보 수를 늘리면 결과 수와 상대 작업량이 얼마나 늘어나는지 한눈에 알 수 없었다.
5. 모델 기능을 나열한 UI는 있었지만, 작가가 실제로 수행하는 `대본 → 기준 고정 → 생성 → 검수` 작업 순서를 중심으로 한 UI는 없었다.

이번 구현은 기존 도구를 폐기하거나 또 하나의 독립 기능을 추가하지 않았다. **회차 단위 프로덕션 디렉터**를 만들고, 결과를 기존 AI 허브로 되돌리는 상위 오케스트레이션 계층을 추가했다.

## 2. 2026 경쟁 제품에서 확인한 기준

| 제품 | 확인한 강점 | ToonStudio에 반영한 원칙 |
| --- | --- | --- |
| Runway Gen-4 References | 한 장 또는 여러 참조에서 캐릭터·오브젝트·환경을 재사용하고, 저장된 참조를 장면마다 호출. 한 생성에 최대 3개 참조와 스케치 기반 구도 제어 | 캐릭터뿐 아니라 의상·장소·광원·화풍·소품을 역할별 잠금으로 분리하고 모든 생성 묶음에 반복 주입 |
| Adobe Firefly / Photoshop | 스타일 참조, 오브젝트/전체 이미지 참조, 선택 영역 생성형 채우기, 모델별 크레딧 표시 | 참조의 역할을 명시하고, 실행 전에 예상 결과 수·상대 작업량·차단 요인을 먼저 표시. 금액을 모를 때 거짓 추정 금지 |
| Midjourney V8.2 Edit Model | 최대 4개 참조, 텍스트 기반 수정, 인페인트·아웃페인트. V7 Omni Reference는 강도 조절과 비용·호환성 제한을 명시 | 후보 수를 명시적인 1/2/4 선택으로 제공하고, 숨은 비용 대신 결과 수와 상대 작업량을 즉시 갱신 |
| Dashtoon | 캐릭터 생성·훈련·저장, 외형·성격·배경 정보와 장면 간 일관성 중심의 만화 제작 흐름 | 이름만 잠그지 않고 얼굴·헤어·체형·식별 특징 및 의상 버전을 프로덕션 바이블로 기록 |
| StoryboardHero | 대본 가져오기, 장면·샷 자동 분해, 저장 캐릭터, 샷 종류·원근·초점·조명·카메라 설정, 공유·댓글 | 장면 제목과 줄바꿈을 우선 파싱하고, 컷별 샷·앵글·감정·대사를 생성 묶음에 기록 |
| LTX Studio | 아이디어에서 시놉시스·캐릭터·스토리보드·장면별 검토까지 하나의 제작 단계로 연결 | 기능 카탈로그보다 작업 순서를 앞세운 4단계 UI와 장면별 검토·생성 묶음 제공 |

### 조사 출처

- Runway, “Creating with Gen-4 Image References”: https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References
- Adobe, “How to use a Style reference image in Adobe Firefly”: https://helpx.adobe.com/uk/firefly/how-to/generate-image-using-reference-image.html
- Adobe, “Use generative fill”: https://helpx.adobe.com/firefly/web/work-with-images/edit-images/generative-fill.html
- Adobe, “Use reference images for consistent results”: https://helpx.adobe.com/in/photoshop/desktop/create-open-import-images/create-images/use-reference-images-for-consistent-results.html
- Midjourney, “Edit Model”: https://docs.midjourney.com/hc/en-us/articles/48495453462797-Edit-Model
- Midjourney, “Omni Reference”: https://docs.midjourney.com/hc/en-us/articles/36285124473997-Omni-Reference
- Dashtoon, “AI Character Generator”: https://dashtoon.com/ai-character-generator
- StoryboardHero, “Features”: https://storyboardhero.ai/features
- LTX Studio, “AI Ad Generator / narrative production workflow”: https://website.ltx.studio/studio/platform/ai-ad-generator

## 3. 구현 내용

### 3.1 회차 프로덕션 엔진

파일: `src/domains/creator/ai/studio-ai-episode-production-director.ts`

입력:

- 회차명과 대본
- 빠른 초안 / 균형 제작 / 품질 우선
- 컷당 후보 1 / 2 / 4개
- 캐릭터·의상·장소·광원·화풍·소품 잠금
- 각 잠금의 명시적 기준 문장

출력:

- 장면·컷 구조
- 장면별 생성 묶음과 묶음 실패 범위
- 모든 묶음에 포함되는 연속성 영수증
- 생성 준비도·연속성·대사 가독성·스크롤 리듬 점수
- 차단·주의·제안으로 구분된 수정 항목
- 예상 결과 수와 제공자 중립적인 상대 작업량
- 마스터 프롬프트, 묶음별 긍정/부정 프롬프트, JSON 매니페스트

엔진은 모델이나 외부 API를 호출하지 않는다. 따라서 검수 자체에는 제공자 과금이 없고, 특정 제공자의 속도·통화 단가를 아는 척하지 않는다.

### 3.2 생성 전 품질 규칙

현재 자동 검사 항목:

- 대본 없음
- 캐릭터 잠금은 켜졌지만 캐릭터 기준 없음
- 의상·장소·광원·화풍·소품 기준 누락
- 장면 내 컷 과밀과 과도한 회차 컷 수
- 여러 장소 후보 중 해당 장면 장소가 모호함
- 전환 설명 없는 시간대 충돌
- 같은 인물의 환복 설명 없는 복수 의상
- 모바일 말풍선에 부담이 되는 긴 대사
- 같은 샷 크기 3회 연속
- 장편 회차의 낮은 샷·앵글 다양성

차단 항목이 있으면 AI 허브 적용 버튼을 비활성화하고 준비도를 49점 이하로 제한한다.

### 3.3 콘티·이미지 프롬프트 품질 보정

파일: `src/domains/creator/ai/studio-ai-storyboard-director.ts`

- `검은 고양이`의 `검`을 무기 동작으로 오인하던 부분 문자열 판정을 경계 인식 패턴으로 교체
- 화자 대사와 시각 묘사를 분리해 대사 문장이 이미지 배경 프롬프트로 유출되지 않게 처리
- 모든 이미지 프롬프트에 `no speech bubbles`, `no readable text`를 포함
- 회차·배치 프롬프트에는 사용자 대본을 상위 지시로 해석하지 말라는 계약과 `한 출력 = 한 컷·한 패널`, 콜라주 금지 규칙을 포함

### 3.4 프로덕션 중심 UI

파일: `src/domains/creator/ai/StudioAiEpisodeProductionModal.tsx`

UI를 다음 네 단계로 고정했다.

1. 대본: 장면 제목·행동·대사를 입력하고 장면/컷 수를 즉시 확인
2. 연속성 잠금: 여섯 기준을 개별 스위치로 켜고 기준 문장을 편집
3. 생성 묶음: 품질 모드와 후보 수에 따라 묶음·결과 수·상대 작업량 즉시 계산
4. 품질 QA: 점수, 수정 이유, 해결 방법, 묶음별 프롬프트와 영수증 확인

접근성·모바일 계약:

- `role="dialog"`, `aria-modal`, 라벨/설명 연결
- 포털, 형제 스크림, Esc 닫기, 포커스 트랩·복귀
- `100dvh` 모바일 시트와 데스크톱 2열 작업면
- 주요 버튼 44px 이상, 키보드 포커스 링
- 색상 토큰만 사용하고 하드코딩한 HEX/RGB 없음
- 복사 성공·실패를 실제 클립보드 결과에 따라 알림

### 3.5 기존 AI 도구와의 연결

파일:

- `src/domains/creator/ai/StudioAiAssistHub.tsx`
- `src/domains/creator/ai/StudioAiToolPopoverBody.tsx`

변경:

- AI 허브 최상단에 `회차 AI 프로덕션` 주 작업 버튼 추가
- 기존에 숨겨졌던 `AI 웹툰 생성 슈퍼 스위트` 버튼을 실제 콜백에 연결
- 두 무거운 모달은 초기 스튜디오 번들에 포함하지 않고 `lazyRetry`와 의도 기반 사전 로딩 사용
- hover/focus/포인터 입력에서 예열하고, 예열 실패는 삼킨 뒤 실제 클릭에서 재시도 가능
- 승인한 첫 생성 묶음은 다중 컷을 안전하게 검토할 수 있는 기존 구도 제안 도구로 전달
- 전달한 프롬프트는 최근 기록에 남고 AI 어시스트 탭으로 복귀
- 슈퍼 스위트 결과는 현재 캐릭터 도구를 사용 중이면 캐릭터로, 그 외에는 배경 도구로 전달

## 4. 검증

추가 테스트:

- `studio-ai-episode-production-director.test.ts`
  - 빈 대본 차단
  - 다중 장면·배치·후보 수 계산
  - 캐릭터 기준 누락 차단
  - 긴 대사와 반복 구도 경고
  - 같은 인물의 의상 전환 설명 감지와 서로 다른 인물 의상 분리
  - 장면 제목·짧은 한국어 명사 오탐 방지
  - 결정적 매니페스트
- `StudioAiEpisodeProductionModal.test.tsx`
  - 닫힌 상태 비렌더링
  - 접근 가능한 모달 계약과 `100dvh`
  - 모드·후보 변경 즉시 재계산
  - 연속성 스위치와 입력 비활성화
  - 빈 대본 적용 차단
  - 첫 배치 프롬프트 전달
  - 실제 클립보드 결과 기반 피드백
- `StudioAiAssistHub.test.tsx`
  - 두 런처의 실제 클릭 경로
  - 최소 터치 높이와 reduced-motion
  - 기존 프롬프트 reveal·실행 preflight 회귀 유지
- `studio-ai-storyboard-director.test.ts`
  - `검은`을 무기 동작으로 오인하지 않음
  - 대사는 구조화 데이터로 분리하고 이미지 프롬프트에는 말풍선·가독 텍스트 제외
- `StudioAiToolPopoverBody.production.test.ts`
  - 모달 지연 로딩
  - 두 런처 wiring
  - 기존 비파괴 구도 도구로의 프롬프트 handoff

## 5. 품질 관점에서 달라지는 점

| 이전 | 이후 |
| --- | --- |
| 컷을 생성한 뒤 얼굴·의상·광원 드리프트 발견 | 생성 전에 기준 누락과 충돌을 차단/경고 |
| 도구마다 서로 다른 프롬프트 컨텍스트 | 회차 잠금 기준을 모든 배치에 동일하게 주입 |
| 후보 수 증가의 영향이 불명확 | 컷당 후보, 총 결과 수, 상대 작업량 즉시 표시 |
| 한 요청 실패가 몇 컷에 영향을 주는지 불명확 | 모드별 3/4/6컷 묶음과 실패 범위 표시 |
| 긴 대사·반복 구도는 수동 검토 | 모바일 말풍선·스크롤 리듬 위험 자동 점검 |
| `검은`·`방향` 같은 부분 문자열이 무기·장소로 오인될 수 있음 | 경계 인식과 인물별 의상 귀속으로 오탐 축소 |
| 생성 프롬프트에 대사가 섞여 가짜 글자가 생길 수 있음 | 대사 분리, 말풍선·가독 텍스트 제외, 단일 패널/비콜라주 계약 |
| 슈퍼 스위트가 코드상 존재해도 사용자 경로 없음 | AI 허브에서 실제 런처·지연 로딩·프롬프트 적용 |

## 6. 의도적으로 과장하지 않은 범위

이번 변경만으로 이미지 모델의 해부학, 손, 얼굴 임베딩 성능 자체가 좋아지는 것은 아니다. 다음은 별도 모델/런타임 작업이다.

1. 생성 결과 이미지의 얼굴·의상·소품 임베딩을 비교하는 시각적 연속성 검사
2. 캐릭터별 LoRA/ID 어댑터 학습과 버전 관리
3. 역할별 다중 참조를 실제 이미지 제공자 요청에 자동 매핑
4. 장면 묶음을 비동기 큐로 실행하고 실패 컷만 재시도하는 배치 런타임
5. 후보 2/4개를 나란히 비교하고 얼굴·손·텍스트 영역만 재생성하는 인페인트 UI
6. 회차 간 누적 설정·용어집·번역 검수

현재 구현은 이 후속 기능들이 들어갈 때 사용할 **프로덕션 매니페스트, 잠금 계약, QA 이슈 형식, 배치 단위**를 먼저 표준화한다. 따라서 다음 단계가 임시 UI를 다시 만드는 방식이 아니라 동일한 회차 데이터 구조 위에 이어질 수 있다.
