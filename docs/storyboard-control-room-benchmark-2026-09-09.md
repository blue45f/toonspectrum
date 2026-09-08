# ToonSpectrum Studio Storyboard Control Room — 경쟁 제품 벤치마크와 구현 결정

조사·구현일: 2026-09-09  
대상: `apps/web/src/domains/creator/StudioStoryboardGridPanel.tsx` 및 페이지 검토 메타데이터  
원칙: 기능 이름을 복제하지 않고, 웹툰 제작자가 **순서·연출·검토·인계의 병목을 한 화면에서 해결**하도록 제품 가치를 번역한다.

> `toonstudio.cloud/studio`의 배포 편집 화면은 자동화된 문서 수집기에서 직접 열리지 않았다. 따라서 현재
> ToonSpectrum 저장소의 실제 구현을 기준선으로 삼고, 공개된 경쟁 제품의 공식 매뉴얼·제품 문서와
> 인간-AI 스토리보딩 연구를 교차 검증했다.

## 1. 결론

ToonSpectrum에는 이미 다음 전문 기능이 존재한다.

- 경량 썸네일 기반 페이지 그리드와 공유 DnD 재배열
- 샷 유형·카메라 앵글 태그
- 페이지별 작업 중/검토 요청/수정 요청/승인 상태, 담당자, 검토 메모, 잠금
- 시나리오 자동 레이아웃과 AI 스토리보드 디렉터
- 오디오·타이밍·렌더링·로컬 지속성을 갖춘 애니매틱 작업 공간
- 3D 배경, 공간 스토리보드, 캐릭터/마네킹 포저

가장 큰 제품 간극은 새 생성 엔진이 아니라 **흩어진 제작 정보를 한 번에 판독하고 다음 행동을 결정하는
운영 화면**이었다. 기존 그리드는 페이지의 시각적 순서 확인에는 유용하지만, 다음 질문에 즉시 답하기
어려웠다.

1. 승인률과 수정 요청량은 얼마인가?
2. 샷 유형이나 카메라 앵글이 빠진 페이지는 어디인가?
3. 담당자가 없는 페이지와 잠긴 페이지는 어디인가?
4. 연출·작화·외주 담당자에게 현재 검토 목록을 어떻게 전달할 것인가?
5. 검색·필터 중 숨겨진 페이지를 실수로 건너뛰어 재배열하지 않게 할 수 있는가?

이번 구현은 기존 그리드를 **Storyboard Control Room**으로 확장해 이 간극을 해소한다.

## 2. 경쟁 제품에서 검증한 작업 패턴

| 제품/연구 | 공식 자료에서 확인한 패턴 | ToonSpectrum에 번역한 가치 |
| --- | --- | --- |
| Toon Boom Storyboard Pro 25/27 | sequence/scene/panel 구조, 패널 타이밍, 대사·액션·노트 캡션, 오디오와 카메라가 결합된 애니매틱 타임라인, 3D 카메라, PDF·movie·데이터 내보내기. v27은 실제 수행 시간을 기록하는 Panel Timer와 scratch audio를 추가 | 정적인 썸네일만 보지 않고 페이지 상태·샷 메타·검토 진행을 함께 보여 주며, 기존 애니매틱 시스템과 연결 가능한 메타 모델 유지 |
| Boords | 스크립트→프레임·샷리스트, 프레임 재배열과 노트, 캐릭터 일관성 참조, 타이밍·오디오 애니매틱, 프레임 댓글, 버전별 상태, 활동 로그, 승인, review-only 공유 링크, PDF/MP4/이미지 내보내기 | 상태별 검토 큐, 페이지·샷·검토 메타 통합 검색, 승인 진행률, 검토표 내보내기, 향후 버전 승인·공유 링크로 확장 가능한 구조 |
| Adobe Firefly Boards | 텍스트·스크립트·참조 이미지 기반 장면 생성, 패널 간 캐릭터·스타일·배경 일관성, 패널 리믹스·부분 개선, 댓글 협업, 개별 프레임/전체 시퀀스 JPEG·PNG·MP4 내보내기, 패널 카메라 움직임 프리뷰 | 기존 AI 스토리보드 디렉터와 애니매틱을 중복하지 않고, 생성 결과를 사람이 검토 상태·샷 메타·담당자 기준으로 통제하는 운영 계층을 강화 |
| Canva Storyboard | 템플릿, 드래그 앤 드롭, 대규모 스톡 라이브러리, AI 스토리·이미지 생성, 웹툰·영상·광고를 한 프로젝트에 구성, 실시간 공동 편집과 클라이언트 공유 | 범용 디자인 캔버스와 자산 수량 경쟁보다 전문 제작 상태·샷 정보·승인 흐름을 전면에 두되, 검색·밀도 조절·터치 접근성은 소비자 도구 수준으로 단순화 |
| StudioBinder | 스크립트 가져오기, 장면/샷 태그, 위치·촬영일·상태 등의 사용자 정의 그룹, 댓글·작업, 뷰 전용 공유, 커스텀 PDF, 샷리스트·스케줄 연계 | 웹툰에서도 원본 순서와 상태별 작업 큐를 분리해 제공하고, 담당자·상태·잠금을 제작 운영 정보로 승격 |
| Wonder Unit Storyboarder | 매우 빠른 드로잉, shot type·timing·dialogue·details, Photoshop 왕복, export, 3D Shot Generator | 기존 샷 태그와 3D 도구를 유지하고, 그리드에서 누락 여부를 즉시 발견하도록 함 |
| KROCK.io | 프레임 단위 리뷰, 핀·댓글·첨부, 버전 비교, 실시간 동기화, 상태·Kanban·일정·작업, PDF | 검토 상태별 4열 보드, 수정 요청·검토 요청 중심의 운영 필터, 향후 프레임 주석과 버전 diff 우선순위 설정 |
| Milanote | 무한 캔버스, 드래그 재배열, 템플릿, 이미지/영상/PDF 혼합, 댓글·공유·알림, PDF export | 자유 배치보다 ToonSpectrum의 페이지 순서 권위를 유지하되, 탐색 속도를 높이는 검색·밀도 조절·보드 뷰 제공 |
| Animatic.app | 프레임별 notes/dialogue/SFX, 팀·클라이언트 초대, pitch 조절 가능한 오디오와 애니매틱 | 페이지 메모와 검토 메모가 검색·CSV 인계에서 사라지지 않도록 통합하고 기존 애니매틱과 중복 구현하지 않음 |
| 연구: *AnimAgents: Coordinating Multi-Stage Animation Pre-Production with Human-Multi-Agent Collaboration* | 전문 크리에이티브 디렉터·애니메이터 대상 형성 연구에서 분절된 도구 간 산출물 조정, 대량 정보 관리, 단계 간 연속성과 창작 통제 유지가 핵심 문제로 확인됨. 후속 시스템은 기획·각본·디자인·스토리보드별 전용 보드와 단계 인지형 조정을 제공 | AI 생성량을 늘리는 대신 사람이 전체 제작 상태를 판독하는 Control Room을 두고, 기존 AI·작화·3D 결과를 하나의 운영 흐름에서 감독하도록 설계 |

## 3. 경쟁 우위 목표

### 3.1 생성 기능보다 의사결정 속도

경쟁 제품 다수는 AI 이미지 생성과 애니매틱을 전면에 내세운다. ToonSpectrum은 해당 축을 이미 보유하므로,
이번 단계에서는 아래 운영 지표를 첫 화면에 올린다.

- 승인 진행률
- 검토 요청 수
- 수정 요청 수
- 샷 메타 누락 수
- 잠금 수
- 담당자 미지정 수

각 지표는 단순 통계가 아니라 즉시 해당 페이지 집합을 여는 필터다.

### 3.2 원본 시퀀스와 검토 큐의 이중 관점

- **시퀀스 뷰**: 실제 페이지 순서, 썸네일, 샷 유형, 카메라 앵글, 담당자, 검토 상태를 함께 본다.
- **검토 큐 뷰**: 작업 중/검토 요청/수정 요청/승인 네 열로 분류해 제작 병목을 찾는다.
- 두 뷰 모두 같은 원본 페이지와 정규화된 검토 상태를 읽으므로 별도 데이터 복제나 동기화 문제가 없다.

### 3.3 실수 방지형 재배열

검색 또는 필터가 켜진 상태에서 드래그하면, 화면에 보이지 않는 페이지를 건너뛰어 예상하지 못한 위치에
삽입될 수 있다. Control Room은 필터 중 DnD를 명시적으로 잠그고 원본 순서를 유지한다. 사용자는 전체
목록으로 돌아온 뒤에만 재배열할 수 있다.

### 3.4 외주·검토 인계

현재 보이는 검색·필터 결과만 CSV로 내보낸다. 열은 순번, 페이지, 검토 상태, 담당자, 잠금, 샷 유형,
카메라 앵글, 페이지 메모, 검토 메모다. CSV는 다음 안전 조치를 포함한다.

- UTF-8 BOM으로 한국어 Excel 호환성 확보
- 쉼표·인용부호·여러 줄 메모를 RFC 4180 방식으로 이스케이프
- `=`, `+`, `-`, `@`로 시작하는 사용자 문자열 앞에 apostrophe를 붙여 spreadsheet formula injection 방지

## 4. 이번 MR 구현 범위

### 4.1 Control Room 도메인 모델

신규 `studio-storyboard-control-room.ts`는 React와 DOM에 의존하지 않는 순수 계산 계층이다.

- 페이지 이름이 없을 때 원본 인덱스로 안정적인 레이블 생성
- NFKC 정규화와 한국어 locale 소문자 변환
- 공백 토큰 AND 검색
- 페이지 이름·페이지 메모·샷 유형·카메라 앵글·담당자·검토 메모·검토 상태·잠금 검색
- 전체/상태별/잠금/샷 정보 누락/담당자 미지정 필터
- 승인률, 상태별 수량, 잠금, 담당 지정, 메타 누락, 메모 보유량 집계
- 필터링 후에도 원본 인덱스 보존
- formula-safe CSV 직렬화

### 4.2 전체 화면 UI

기존 `StudioStoryboardGridPanel`을 교체하지 않고 같은 lazy boundary와 prop 계약 안에서 확장한다.

- `스토리보드 컨트롤 룸` 헤더와 시퀀스/검토 큐 전환
- 승인·검토·수정·누락·잠금·미지정 지표 버튼
- `/`, `Ctrl+F`, `⌘+F` 검색 포커스
- Esc 순서: 검색어 해제 → 상태 필터 해제 → 패널 닫기
- S/M/L 썸네일 밀도 조절 유지
- 페이지 추가·복제·삭제와 삭제 확인 흐름 유지
- 기존 샷 유형·카메라 앵글 인라인 편집 유지
- 검토 상태·잠금·담당자·메타 누락을 카드에 표시
- 상태별 4열 검토 보드
- 현재 결과 CSV 다운로드
- 44px 터치 타깃, focus-visible, aria-label, aria-live 유지

### 4.3 테스트

순수 모델 테스트는 다음 회귀를 고정한다.

1. 상태별 수량과 승인률 집계
2. 페이지·샷·검토 메타의 AND 검색
3. 수정 요청 필터와 원본 인덱스 보존
4. 잠금·샷 누락·담당 미지정 필터
5. 잘못된 검토 데이터의 안전한 `draft` 정규화
6. CSV 인용부호/줄바꿈 이스케이프와 formula injection 방지

## 5. UX 세부 결정

### 검색

- 검색은 표시용 이름뿐 아니라 검토 메모와 담당자까지 포함한다.
- 여러 단어는 모두 포함해야 하므로 `대치 시선`은 두 단어를 모두 가진 페이지를 찾는다.
- 한글 호환 자모/전각 문자 차이를 줄이기 위해 NFKC 정규화를 적용한다.

### 상태

페이지의 `review`가 없거나 손상된 경우 UI에서 예외를 던지지 않고 `작업 중`, 미잠금으로 정규화한다.
이 규칙은 기존 `normalizePageReviewState`를 재사용하므로 저장·품질 검사·Control Room이 같은 의미를 갖는다.

### 카드

- 작은 카드에서도 상태 배지는 항상 보인다.
- hover가 없는 터치 기기에서는 복제/삭제 버튼을 항상 노출한다.
- 담당자와 샷 정보 누락은 hover에 숨기지 않는다.
- 현재 페이지는 `aria-pressed` 또는 `aria-current=page`와 시각적 테두리로 함께 표시한다.

### 성능

- 썸네일은 기존 `StudioPageThumbnail` 경량 SVG 프록시를 재사용한다.
- 검색·집계는 `useMemo`로 페이지/질의/필터가 바뀔 때만 다시 계산한다.
- 새 Konva Stage나 3D scene을 카드마다 생성하지 않는다.
- 수백~수천 페이지 가상화는 페이지 목록과 그리드를 함께 바꿔야 하는 횡단 과제로 분리한다.

## 6. 후속 고도화 우선순위

### P1 — Control Room에서 직접 검토 변경

- 다중 선택과 상태/담당자/잠금 일괄 변경
- 수정 요청→검토 요청 전환 시 체크리스트와 메모 필수 규칙
- 낙관적 업데이트가 아닌 revision 기반 충돌 검증
- 승인 잠금 페이지를 변경할 때 이유 입력과 감사 로그

### P1 — 계층형 스토리 구조

- episode → sequence → scene → beat → page/panel 계층
- 장면 목적, 감정 비트, 등장인물, 장소, 시간대, 소품 연속성 메타
- 계층 접기/펼치기와 sequence 단위 재배열
- Writer Room의 beat/scene ID를 페이지와 참조 연결하고 텍스트를 복제하지 않음

### P1 — 애니매틱 준비도 통합

- 페이지별 기본 hold duration, dialogue/SFX cue, transition 상태를 Control Room에 읽기 전용으로 표시
- 타이밍·오디오가 없는 페이지 필터
- 선택한 sequence를 기존 Animatic Workspace에서 바로 열기
- 정적 웹툰 검토와 영상용 타이밍을 별도 저장하되 페이지 ID로 연결

### P2 — 프레임 주석과 버전 승인

- 썸네일 좌표에 고정되는 핀 댓글
- 문서 revision과 댓글의 정확한 연결
- 프레임 이미지 revision과 전체 보드 version을 구분
- 이전/현재 썸네일 나란히 비교와 onion diff
- owner/editor/commenter/viewer 권한, 만료 가능한 review-only 링크

### P2 — 자동 품질 감독

- 연속된 동일 shot scale 과다, 180도 축 위반 가능성, 시선 방향 급변 후보 표시
- 대사량·말풍선 밀도·세로 스크롤 리듬 이상치
- 캐릭터 의상·소품·장소 연속성 검사와 근거 페이지 링크
- AI는 수정안을 제안만 하고 페이지를 자동 변경하지 않음

## 7. 수용 기준

- 기존 페이지 추가·복제·삭제·선택·DnD·샷 태그 기능이 그대로 동작한다.
- 검색/필터 중 DnD가 비활성화되고 전체 보기에서 다시 활성화된다.
- 모든 검토 상태가 보드에서 올바른 열에 들어간다.
- 손상된 `review` 값으로 패널이 크래시하지 않는다.
- CSV는 현재 보이는 결과만 포함하고 한국어·인용부호·줄바꿈을 보존한다.
- formula-looking 사용자 데이터가 spreadsheet 수식으로 실행되지 않는다.
- 키보드와 터치 모두에서 핵심 행동을 수행할 수 있다.

## 8. 공식 참고 자료

- Toon Boom Storyboard Pro 27 animatic workflow: https://docs.toonboom.com/fr/help/storyboard-pro-27/storyboard/getting-started/animatic.html
- Toon Boom Storyboard Pro 27 3D camera animation: https://docs.toonboom.com/help/storyboard-pro-27/storyboard/camera/animate-3d-camera.html
- Toon Boom Storyboard Pro 27 release: https://www.toonboom.com/products/storyboard-pro
- Boords storyboard views: https://boords.com/docs/storyboard-views
- Boords feedback and approvals: https://boords.com/collaborate
- Boords animatic: https://boords.com/animatic
- Boords shot list: https://boords.com/shot-list
- Adobe Firefly Boards storyboard: https://www.adobe.com/products/firefly/features/storyboard.html
- Adobe Firefly Boards consistent commercial storyboard workflow: https://helpx.adobe.com/firefly/how-to/create-commercial-storyboard-firefly-boards.html
- Canva storyboard maker: https://www.canva.com/ko_kr/create/storyboards/
- StudioBinder storyboard software: https://www.studiobinder.com/storyboard-creator/
- StudioBinder shot list: https://www.studiobinder.com/shot-list-storyboard/
- Wonder Unit Storyboarder: https://wonderunit.com/storyboarder/
- KROCK.io creative review and storyboard: https://krock.io/
- Milanote storyboard maker: https://milanote.com/product/storyboarding
- Animatic.app: https://www.animatic.app/
- AnimAgents — human/multi-agent animation pre-production: https://arxiv.org/abs/2511.17906
