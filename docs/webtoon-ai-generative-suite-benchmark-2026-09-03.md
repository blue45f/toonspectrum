# 웹툰 AI 생성·보조 기술 국내외 대형·스타트업 전수 벤치마킹 및 ToonSpectrum 슈퍼 스위트 고도화 보고서 (2026-09-03)

## 1. 개요 (Executive Summary)

웹툰 및 디지털 만화 제작 현장에서 생성형 AI(Generative AI) 및 AI 보조 도구는 단순한 이미지 생성을 넘어 **화풍 일치(Style Consistency), 광원에 따른 입체 셀 음영 계산(Shading Assist), 대본의 컷별 자동 연출 콘티화(Storyboard Auto-Directing), 캐릭터 대사 감정에 맞춘 말풍선 형태 자동 매칭(Emotion-to-Balloon), 작화 붕괴 방지 프롬프트 증강(Prompt Engineering)** 등 창작 파이프라인의 핵심 생산성 솔루션으로 급속히 진화하고 있습니다.

본 프로젝트에서는 국내 대기업(네이버웹툰, 카카오엔터테인먼트), 글로벌 선도 소프트웨어(셀시스 클립스튜디오 페인트), 그리고 국내외 혁신 스타트업(투닝/투ンス퀘어, 오노마에이아이/투낫, 다쉬툰, 크레아 AI, 시나리오, 컴피UI 웹툰 파이프라인)의 AI 핵심 기능을 심층 분석하고, ToonSpectrum 스튜디오에 완전히 통합된 **AI 웹툰 생성 슈퍼 스위트 (Webtoon AI Super Suite)** 엔진 및 통합 모달 UI를 구축하였습니다.

---

## 2. 국내외 대형 및 스타트업 AI 보조 서비스 전수 벤치마킹 분석

### 1) 네이버웹툰 (Naver Webtoon AI)
- **AI 웹툰 페인터 (AI Painter)**:
  - 딥러닝 기반 선화 자동 채색 어시스턴트. 선화에 힌트 점(Point)을 지정하면 자연스러운 그라데이션 및 명암을 도출.
  - 탁한 회색 곱하기(Muddy Shadow)를 방지하고 맑은 색감을 유지하기 위한 쿨톤 색상환 시프트(Hue-Shift) 기술 도입.
- **AI 툰필터 (Toon Filter)**:
  - 실사 사진이나 3D 배경 렌더를 네이버 인기 웹툰 장르 화풍(로맨스 판타지, 학원물, 액션, 좀비 스릴러 등)으로 스타일 트랜스퍼 변환.
- **AI 러프 스케처 / 셰이퍼 (Shaper)**:
  - 3D 포즈 및 텍스트 시놉시스로부터 웹툰 전용 선화 펜터치 추출 및 콘티 러프 자동 생성.

### 2) 셀시스 클립스튜디오 페인트 (Celsys Clip Studio Paint AI)
- **음영 어시스트 (Shading Assist)**:
  - 2D 캐릭터 선화 및 밑색 위에 가상 3D 광원(Light Source) 위치를 360° 나침반으로 지정하면, 1차 및 2차 셀 그림자 레이어를 기하학적으로 자동 생성.
  - 주변 광원의 색온도(새벽, 대낮, 석양, 달빛)에 따른 음영 색상 자동 보정.
- **포즈 스캐너 (Pose Scanner)**:
  - 사진 또는 래스터 이미지에서 인체 관절 랜드마크를 추출하여 3D 마네킹에 실시간 동기화.

### 3) 투닝 (Tooning / Toonsquare)
- **Text-to-Webtoon 감정 분석 기술**:
  - 인공지능이 캐릭터의 대사 문맥을 자연어 처리(NLP)하여 분노, 경악, 속삭임, 독백, 설렘 등 감정 톤을 판별.
  - 분석된 감정에 최적화된 말풍선(외침 톱니바퀴, 은밀한 점선, 몽환적 구름, 핑크빛 타원 등) 및 폰트 두께, 캐릭터 표정을 자동 매칭.

### 4) 오노마에이아이 (Onoma AI / TooNat)
- **웹툰 콘티 자동화 솔루션 (TooNat)**:
  - 소설이나 시나리오 대본 텍스트를 입력하면, 컷 분할(Shot Scale: 익스트림 클로즈업, 바스트, 풀샷, 부감 등)과 카메라 앵글(로우, 하이, 더치 틸트), 추천 효과음(SFX), 배경 프롬프트를 자동으로 구조화하여 콘티를 1초 만에 설계.

### 5) 글로벌 생성 AI 및 스타트업 (Dashtoon, Krea AI, Scenario, Midjourney / ComfyUI LoRA)
- **웹툰 특화 프롬프트 증강기 (Prompt Enhancer)**:
  - 비전문가의 짧은 아이디어("골목에서 싸우는 주인공")를 최고 등급의 웹툰 아티스트 프롬프트(Masterpiece Korean manhwa style, sharp digital ink lineart, dramatic chiaroscuro, dynamic low-angle composition 등)로 실시간 확장.
  - 손가락 기형, 뭉개진 선화, 회색빛 그림자 등 인공지능 작화 붕괴를 원천 차단하는 네거티브 프롬프트 프리셋 자동 주입.

---

## 3. ToonSpectrum AI 웹툰 생성 슈퍼 스위트 아키텍처

| 모듈 파일명 | 담당 기능 및 벤치마크 대상 | 주요 세부 사양 |
|---|---|---|
| [`studio-ai-webtoon-style-filter.ts`](file:///Users/hjunkim/WebstormProjects/toonspectrum/src/domains/creator/ai/studio-ai-webtoon-style-filter.ts) | **화풍 변환 툰필터 엔진**<br>(네이버 툰필터 & Krea AI 벤치마크) | • 4대 핵심 화풍: 로맨스 판타지, 소년 액션 극화체, 판타지 웹소설 표지, 스릴러 누아르<br>• 선화 굵기 계수, 명암비 부스트, 디노이징 강도(0.55~0.70) 합성 |
| [`studio-ai-shading-assist.ts`](file:///Users/hjunkim/WebstormProjects/toonspectrum/src/domains/creator/ai/studio-ai-shading-assist.ts) | **AI 음영 어시스턴트**<br>(클립스튜디오 Shading Assist 벤치마크) | • 8방향 광원 나침반 및 역광 림라이트(Backlight Rim)<br>• 1차/2차 셀 그림자 투명도 및 오프셋 벡터 `(dx, dy)` 계산<br>• 4대 환경광 색온도(새벽, 대낮, 석양, 달빛) 그림자 틴트 결정 |
| [`studio-ai-prompt-enhancer.ts`](file:///Users/hjunkim/WebstormProjects/toonspectrum/src/domains/creator/ai/studio-ai-prompt-enhancer.ts) | **웹툰 프롬프트 증강기**<br>(Midjourney & Dashtoon 벤치마크) | • 자연어 한국어/영어 대사 및 상황 문장 자동 장르 분류<br>• 고품질 웹툰 마스터피스 키워드 및 작화 붕괴 방지 15종 네거티브 프롬프트 주입 |
| [`studio-ai-storyboard-director.ts`](file:///Users/hjunkim/WebstormProjects/toonspectrum/src/domains/creator/ai/studio-ai-storyboard-director.ts) | **콘티 자동 디렉터**<br>(오노마에이아이 TooNat 벤치마크) | • 줄글 대본을 컷별(Shot Scale, Camera Angle, Emotion, SFX, BG Prompt)로 자동 연출<br>• 모바일 세로 스크롤 완독 시간 및 페이싱 스코어 계산 |
| [`studio-ai-emotion-bubble-matcher.ts`](file:///Users/hjunkim/WebstormProjects/toonspectrum/src/domains/creator/ai/studio-ai-emotion-bubble-matcher.ts) | **감정-말풍선 자동 매처**<br>(투닝 Tooning NLP 벤치마크) | • 대사 감정 분석 (외침, 충격, 은밀, 독백, 설렘, 평온)<br>• 외침 톱니바퀴, 찌그러진 테두리, 점선, 구름, 핑크 틴트 말풍선 및 테두리 두께 자동 추천 |
| [`StudioAiSuperSuiteModal.tsx`](file:///Users/hjunkim/WebstormProjects/toonspectrum/src/domains/creator/ai/StudioAiSuperSuiteModal.tsx) | **통합 슈퍼 스위트 모달 UI** | • 5개 탭 실시간 파라미터 제어, 프리뷰, 원클릭 복사 및 스튜디오 캔버스 생성기 즉시 연동 |

---

## 4. UI 및 스튜디오 명령 체계 통합

1. **상단 메뉴바 (Menubar)**:
   - 연출(Comic) 메뉴에 `AI 웹툰 생성 슈퍼 스위트…` (`comic.ai-super-suite`) 등록.
2. **명령 카탈로그 (Command Catalog & ⌘K)**:
   - 전역 190개 메뉴 명령 체계 100% 매핑 (`comic/ai-super-suite`).
   - 별칭 등록: `AI 슈퍼 스위트`, `툰필터`, `AI 음영`, `AI 콘티`.
3. **스튜디오 AI 어시스트 허브 (AI Assist Hub)**:
   - 설정 버튼 하단에 `AI 웹툰 생성 슈퍼 스위트` 원클릭 퀵 런처 버튼 배치.
4. **호스트 바인딩**:
   - `StudioCuttoonEditorHost.tsx`에서 모달 상태 관리 및 AI 생성기 프롬프트 즉시 전달 파이프라인 구축.
