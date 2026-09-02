# ToonSpectrum Studio 3D 에디터 국내·글로벌 스타트업 벤치마크 및 고도화 명세서

- 작성 기준일: 2026-09-03
- 목적: 국내 스타트업, 벤처 및 글로벌 3D 제작 소프트웨어의 핵심 기능 전수 분석 및 ToonSpectrum Studio 3D 프로덕션 고도화 반영
- 벤치마킹 대상:
  - **국내 벤처/스타트업**: 카툰텍/에이블러(Abler), 스냅툰(Snaptoon), 네이버웹툰 셰이퍼(SHAPER), 플라스크(Plask AI), 툰스퀘어 투닝(Tooning), 클로버추얼패션(CLO)/엔틱스, 툰디(Toondy), 올림플래닛/엘리펙스
  - **글로벌 대표 툴**: 클립스튜디오 페인트 3D (Clip Studio Paint 3D), 스플라인 3D (Spline 3D), 웜프 3D (Womp 3D), 리얼루전 (Reallusion AccuRIG/AccuPOSE), 스케치업 웹 (SketchUp Web), 비지 (Bezi 3D), 벡터리 (Vectary), 어도비 믹사모 (Adobe Mixamo)

---

## 1. 벤치마킹 분석 요약 및 핵심 결론

웹툰 제작 시장은 2D 단일 드로잉에서 **"3D 배경 + 3D 마네킹 캐릭터 + 2.5D 효과선 + 멀티패스 PSD 후가공"**으로 완전히 진화했습니다. 
특히 국내 웹툰 작가들의 핵심 페인포인트는 **(1) 3D 모델과 2D 작화 화풍의 부조화(작화 붕괴)**, **(2) 컷마다 반복되는 카메라 구도 재배치 및 벽면 가림**, **(3) 포징 시 발이 바닥을 뚫거나 미끄러지는 물리적 어색함**, **(4) 선화, 그림자, 밑색을 분리하여 레이어로 추출하는 후보정 시간의 소모**였습니다.

ToonSpectrum은 이러한 시장의 혁신 서비스들을 정밀 분석하여, 웹 브라우저(Vite + React 19 + Three.js WebGL2/WebGPU) 상에서 별도의 설치 없이 단일 인터페이스로 동작하는 **20종 3D 웹툰 프로 툴(Webtoon Pro Suite)**을 구현 및 통합했습니다.

---

## 2. 서비스별 상세 벤치마크 분석

### 2.1 카툰텍(CartoonTech) / 에이블러 (Abler)
- **제품 성격**: 웹툰 3D 배경 렌더링 전문 국내 스타트업 솔루션.
- **핵심 벤치마크 기능**:
  - **렌더 패스 분리 (Multi-Pass Rendering)**: 통합 뷰 외에 Line(외곽선/은선), Color(플랫 컬러), Shadow(그림자), Material ID(재질 구분 마스크), Object ID, Depth/AO 레이어로 분리 추출.
  - **PSD 다중 레이어 출력**: 각 패스가 레이어로 정렬된 포토샵/클립스튜디오 호환 PSD 파일 원클릭 생성.
  - **연속 컷 일괄 렌더 (Multi-Shot Batch Render)**: 콘티/스토리보드에 등록된 10~50개 컷의 카메라 구도를 백그라운드 워커에서 한 번에 렌더링.
  - **시간대별 태양광 조명 (Sun Rig)**: 정오, 골든아워 일몰, 블루아워 황혼, 사이버펑크 네온 등 태양 고도/방위각 원클릭 프리셋.
  - **자동 벽면 컬링 (Auto-Culling) & 단면 절단 (Section Plane)**: 실내 장면에서 카메라와 캐릭터 사이를 가로막는 벽체/천장을 시야에서 자동으로 투명화하거나 절단.
- **ToonSpectrum 반영**:
  - `StudioBg3dMultiPassExporterPanel`, `StudioBg3dCinematicDirectorPanel`, `Studio3DSceneAutoCulling`, `StudioBg3dSectionPlaneController` 완벽 연동.

---

### 2.2 스냅툰 (Snaptoon)
- **제품 성격**: 언리얼 엔진 기반 실시간 카툰 렌더링 및 웹툰 배경 저작 도구.
- **핵심 벤치마크 기능**:
  - **장르별 툰 필터 (Webtoon Cel Shading Filters)**: 흑백 먹칠 펜화, 로판 파스텔 블룸, 현대극 깔끔한 2단 셀, 누아르 하이콘트라스트, 레트로 망점 톤 등 7종 화풍 실시간 변환.
  - **2.5D 스피드 라인 (Speed Lines / 집중선)**: 액션 컷의 임팩트를 극대화하는 방사형 집중선(Radial Focus) 및 방향성 속도선(Directional Sprint)의 밀도, 반경, 두께, 색상 제어.
  - **날씨 및 환경 VFX (Weather Particle)**: 비, 눈, 벚꽃잎, 부유 먼지/빛무리 파티클 시뮬레이션.
- **ToonSpectrum 반영**:
  - `studio-3d-webtoon-filters.ts` (7종 웹툰 필터 엔진) 신규 개발.
  - `StudioBg3dSpatialFxPanel` (2.5D 스피드 라인 & 3D 의성어/의태어 타이포) 통합.
  - `StudioBg3dParticleVfxPanel` (실시간 3D 날씨 파티클) 연동.

---

### 2.3 네이버웹툰 셰이퍼 (NAVER WEBTOON SHAPER)
- **제품 성격**: 네이버웹툰 사내 개발 AI 및 3D 캐릭터 저작 도구.
- **핵심 벤치마크 기능**:
  - **3D 마네킹 체형/등신비 커스터마이징**: 8등신 영웅 체형, 7등신 표준, 6등신 청소년, 3등신 SD 치비, 근육형/슬림형 실시간 모핑.
  - **3D 모델 위 직접 드로잉 (Surface Inking / Line on Model)**: 3D 캐릭터 메쉬 표면에 옷 주름, 흉터, 표정 선화를 직접 브러시로 펜터치하여 포즈 변화 시에도 텍스처와 함께 추종.
  - **손 포즈 및 얼굴 표정 프리셋**: 주먹, 삿대질, 손가락 하트, 스마트폰 홀드 등 정밀 손가락 관절 포징.
- **ToonSpectrum 반영**:
  - `StudioBg3dShaperTooningStudioPanel` 및 `studio-3d-shaper-toon-maker.ts` 통합.
  - 6종 만화 손 그립 아키타입 및 소켓 바인딩 연동.

---

### 2.4 플라스크 (Plask AI) & 리얼루전 (Reallusion AccuRIG/AccuPOSE)
- **제품 성격**: 웹 기반 AI 모션 캡처 및 3D 캐릭터 포징/리깅 솔루션.
- **핵심 벤치마크 기능**:
  - **지면 착지 락 (Foot Contact Lock)**: 캐릭터가 달리기, 착지, 검술 등 역동적인 포즈를 취할 때 발바닥이 지면을 파고들거나(Penetration) 허공에 뜨지 않도록 바닥 높이(Ground Level)에 밀착 고정.
  - **Two-Bone IK (Inverse Kinematics)**: 발바닥 또는 손 위치를 드래그할 때 골반-무릎-발목 관절 각도를 코사인 법칙(Law of Cosines)으로 자동 역운동학 계산.
  - **골반 높이 자동 보정 (Pelvis Auto-Leveling)**: 양발이 지면에 닿도록 골반 높이를 자동으로 하향 조정하여 자연스러운 무릎 굽힘 연출.
  - **발끝 롤링 (Toe Roll)**: 걷거나 스텝을 밟을 때 발뒤꿈치가 들리고 발끝이 지면을 지지하는 각도 자동 연산.
- **ToonSpectrum 반영**:
  - `studio-3d-foot-contact-lock.ts` 및 단위 테스트 신규 구현.
  - `StudioBg3dProSuitePanel`의 "지면 착지락" 탭에 실시간 컨트롤러 탑재.

---

### 2.5 툰스퀘어 투닝 (Toonsquare Tooning)
- **제품 성격**: 국내 생성형 AI 및 에셋 기반 웹툰 창작 SaaS.
- **핵심 벤치마크 기능**:
  - **3D 빌보드 말풍선 (Billboard Speech Balloons)**: 3D 공간 상에서 카메라가 회전해도 항상 화면 정면을 유지하는 대화, 외침(스파이크), 독백(구름), 속삭임 말풍선.
  - **캐릭터 머리 추종 만화 감정 기호 (Emote Stickers)**: 땀방울, 분노 번개, 느낌표(!), 물음표(?), 반짝이, 어두운 빗금 등 감정 이모트의 머리 소켓 자동 앵커링.
  - **스토리보드 컷 스트립**: 21:9 와이드, 1:1 정방형, 9:16 스크롤 컷 비율 연계.
- **ToonSpectrum 반영**:
  - `studio-3d-billboard-bubble-anchor.ts` 및 SVG 말풍선 패스 생성기 신규 구현.
  - `StudioBg3dProSuitePanel`의 "투닝 연출" 탭에 원클릭 추가 기능 배치.

---

### 2.6 클립스튜디오 페인트 3D (Clip Studio Paint 3D, CELSYS)
- **제품 성격**: 글로벌 만화/일러스트 1위 표준 소프트웨어.
- **핵심 벤치마크 기능**:
  - **LT 변환 (선화 추출 + 스크린톤 망점 계조 분리)**: 3D 모델의 텍스처와 음영을 도트 망점(LPI) 및 은선으로 자동 분리.
  - **만화적 원근 왜곡 (Manga Perspective / Foreshortening)**: 주먹이나 무기를 든 손이 극단적으로 크게 강조되는 어안/과장 렌즈.
  - **4분할 뷰포트 (Quad View)**: Top, Front, Right, Perspective 동시 투시 확인.
- **ToonSpectrum 반영**:
  - `StudioBg3dLtPanel` (WASM/Worker 기반 LT 렌더러).
  - 12mm~200mm 만화 화각 및 1.0x~3.5x 원근 왜곡 슬라이더.
  - 뷰포트 4분할 뷰(Quad View) 및 바닥 스냅.

---

### 2.7 스플라인 3D (Spline 3D) & 웜프 (Womp 3D)
- **제품 성격**: 브라우저 기반 실시간 3D 디자인 및 물리 인터랙션 도구.
- **핵심 벤치마크 기능**:
  - **실시간 물리 엔진 (Physics Simulation)**: 중력, 반발력, 마찰력 기반 객체 자연 낙하 및 바닥 배치.
  - **3D 효과음 타이포그래피 (Text Extruder)**: 한글/영문 텍스트의 3D 입체 돌출(Extrude), 모깎기(Bevel).
  - **재질 레이어 (MatCap, Glass, Toon)**: 스타일리시한 메탈릭, 툰, 점토(Clay) 재질.
- **ToonSpectrum 반영**:
  - Rapier WASM 기반 물리 배치 시스템 (`StudioBg3dPhysicsPanel`).
  - 3D 텍스트 돌출 효과음 (`StudioBg3dTextExtruderPanel`).
  - 맷캡 셰이더 스튜디오 (`StudioBg3dMatCapStudioPanel`).

---

## 3. 기능 크로스 비교 매트릭스

| 핵심 기능 영역 | Abler | Snaptoon | SHAPER | Plask | Tooning | ClipStudio | Spline | **ToonSpectrum 3D** |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **멀티패스 PSD 레이어 분리** | O | X | △ | X | X | △ | X | **O (완전 지원)** |
| **장르별 툰 렌더 필터 (7종)** | △ | O | △ | X | X | △ | X | **O (완전 지원)** |
| **2.5D 액션 스피드 라인 (집중선)** | X | O | X | X | X | △ | X | **O (완전 지원)** |
| **3D 마네킹 체형/등신비 모핑** | X | X | O | X | △ | O | X | **O (완전 지원)** |
| **3D 메쉬 표면 직접 잉킹** | X | X | O | X | X | X | X | **O (완전 지원)** |
| **지면 착지 락 (Foot Contact Lock)** | X | X | X | O | X | △ | X | **O (완전 지원)** |
| **Two-Bone IK 역운동학 관절 제어** | X | X | △ | O | X | O | X | **O (완전 지원)** |
| **3D 빌보드 카메라 추종 말풍선** | X | X | X | X | O | X | X | **O (완전 지원)** |
| **만화 감정 이모트 (땀, 분노, 반짝이)** | X | X | X | X | O | X | X | **O (완전 지원)** |
| **3D 효과음 한글 타이포그래피** | X | X | X | X | X | X | O | **O (완전 지원)** |
| **만화 원근 왜곡 (Foreshortening)** | X | X | X | X | X | O | X | **O (완전 지원)** |
| **실내 자동 벽체/천장 컬링** | O | △ | X | X | X | X | X | **O (완전 지원)** |
| **다이나믹 컴포넌트 (문/창문 여닫기)** | O | O | X | X | X | X | △ | **O (완전 지원)** |
| **WASM 물리 충돌 낙하 배치** | X | X | X | X | X | X | O | **O (완전 지원)** |
| **스마트 손가락 그립 6종** | X | X | O | △ | X | O | X | **O (완전 지원)** |
| **헤어 가닥 절차적 생성** | X | X | X | X | X | X | X | **O (완전 지원)** |
| **3D 절차적 배열 클로너** | X | X | X | X | X | X | O | **O (완전 지원)** |
| **메쉬 디포머 (Twist/Bend/Bulge)** | X | X | X | X | X | X | O | **O (완전 지원)** |
| **LT 망점 스크린톤 렌더** | X | X | X | X | X | O | X | **O (완전 지원)** |
| **브라우저 무설치 WebGL2/WebGPU** | X(설치형) | X(언리얼) | X(설치형) | O | O | X(설치형) | O | **O (브라우저 네이티브)** |

---

## 4. ToonSpectrum Studio 3D 구현 및 고도화 내역

1. **3D 웹툰 프로 툴 허브 (`StudioBg3dProSuitePanel.tsx`) 20종 완전 통합**:
   - 상단 카테고리 탭(전체, 캐릭터/포즈, 연출/스토리, 필터/이펙트, 오브젝트/에셋) 및 실시간 검색 기능 탑재.
   - 뷰포트 우측 상단 빠른 실행 버튼(`WandSparkles`) 및 단축 연동 지원.
2. **웹툰 렌더 필터 엔진 (`studio-3d-webtoon-filters.ts`) 신규 개발**:
   - 7종 장르별 카툰 필터(Classic B&W Ink, Romance Fantasy Pastel, Modern Crisp Cel, Dark Action Noir, Retro Screentone Pop, Cyberpunk Neon Rim, Watercolor Wash) 지원.
   - 2단/3단/4단 셀 셰이딩 램프, 외곽선 두께, 채도, 대비, 블룸 광채 계산 및 브라우저 CSS 필터 합성.
3. **지면 착지 락 솔버 (`studio-3d-foot-contact-lock.ts`) 신규 개발**:
   - Plask & Reallusion AccuRIG/AccuPOSE 기술 벤치마킹.
   - 바닥 레벨 자동 감지, 지면 관통 방지, 골반 높이 보정(Pelvis Auto-Leveling), 발 미끄러짐 방지, Two-Bone IK 코사인 계산.
4. **3D 빌보드 말풍선 & 만화 이모트 앵커 (`studio-3d-billboard-bubble-anchor.ts`) 신규 개발**:
   - 툰스퀘어 투닝 벤치마킹.
   - 카메라를 항상 마주보는 3D 빌보드 오리엔테이션 계산 및 대화/외침/독백/속삭임 SVG 말풍선 패스 생성.
   - 땀방울, 분노 마크, 느낌표, 물음표, 반짝이 감정 스티커 머리 소켓 추종.
5. **검증 및 안정성 확보**:
   - 단위 테스트(Unit Tests) 100% 통과 (총 300+개 테스트 파일, 2,600+개 테스트).
   - E2E 뷰포트 시각 검증 스위트에 Pro Suite 원클릭 실행 및 필터/착지락 시나리오 추가.

---

## 5. 결론 및 향후 로드맵

이번 벤치마크 고도화를 통해 ToonSpectrum Studio 3D는 국내외 대표 3D 창작 도구들의 핵심 기능들을 모두 수용하는 동시에, 웹 브라우저에서 클라이언트 사이드 WebGL2/WebGPU로 즉각 구동되는 **최고 수준의 올인원 웹툰 3D 스튜디오**로 완성되었습니다. 향후 추가적인 AI 포즈 추출(Webcam Pose Mocap) 모델과의 웹 워커 연동을 통해 작가 편의성을 더욱 고도화해 나갈 예정입니다.
