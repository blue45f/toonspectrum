# ToonSpectrum Studio — 상용 창작 도구 공식 매뉴얼 벤치마크

조사일: 2026-07-10
원칙: 마케팅 문구보다 공식 매뉴얼·도움말에 실제 사용 절차가 적힌 기능을 우선한다. 기능 이름을 복제하는
것이 아니라 웹툰 작가가 반복 작업, 오조작, 파일 손실, 검수 누락, 플랫폼 정책 위반을 줄이는 데 주는
가치를 ToonSpectrum의 Vite/React/Nest/Postgres 구조로 번역한다.

## 조사 제품과 검증된 작업 패턴

| 제품 | 공식 매뉴얼에서 확인한 핵심 | ToonSpectrum에 주는 설계 원칙 |
| --- | --- | --- |
| Clip Studio Paint EX | 다중 페이지 작품, Cloud Teamwork, 스마트폰까지 포함한 페이지 단위 분업. Companion Mode는 스마트폰을 Quick Access·색상환·제스처 패드·서브뷰·색 혼합·세로 웹툰 미리보기·modifier 원격으로 사용 | 작품 전체를 페이지/컷 단위로 배정·검토하고, 모바일에는 전체 데스크톱 UI 대신 빠른 명령·색상·미리보기 중심 역할 제공 |
| MediBang Paint | 모바일 Comic 프로젝트/페이지 목록, WEB용 진행 방향, draft layer, 패널 분할, 말풍선·cloud material, comic guide/crop mark. Cloud annotation은 버전과 연결되고 PC/iOS/Android 간 공유 | 콘티→밑그림→선화→톤/채색 단계를 문서 메타로 보존하고, 댓글은 정확한 문서 버전·페이지·컷에 연결 |
| ibisPaint | 한 손가락 Frame Divider, 수평/수직 거터, 스크린톤 레이어, 집중선 필터, manga manuscript. 두 손가락 undo·세 손가락 redo, 두 손가락 이동/회전/확대, 모바일 키보드 단축키 | 모바일에서 컷 분할과 자주 쓰는 만화 효과를 1~2단계로 노출하고 제스처에는 취소 가능성과 설정 안내 제공 |
| Procreate | 완전 사용자 지정 가능한 6방향 QuickMenu와 touch-drag 선택 | 모바일 캔버스 장기 누름/엄지 제스처로 사용자 지정 빠른 작업을 호출하고, 현재 도구 문맥에 맞는 기본 세트 제공 |
| Adobe Fresco | 좌/우 도구막대 배치, Touch Shortcut의 primary/secondary/lock, haptic alignment, 1px/10px nudge, 숫자 입력 가능한 slider, 통합 brush panel·필터·즐겨찾기·재정렬 | 왼손/오른손 모드, hold-to-temporary-tool, 정밀 수치 조절, 즐겨찾기 우선 자산/브러시를 모바일 핵심으로 채택 |
| Photoshop Mobile/iPad | Contextual Task Bar, touch selection, grouped layers, adjustment/generative layers, variation 선택, version history, content-aware/clone/object selection | 선택 대상 바로 옆에 가장 관련 높은 후속 행동만 보여주고 AI 결과는 비파괴 variant로 검토·교체 가능하게 유지 |
| Toon Boom Storyboard Pro | sequence/scene/panel 계층, panel timing, audio/video/camera/layer animation/transition의 animatic timeline. Action/Dialog/Slugging/Notes caption, PDF profile·preview, panel별 PDF override, snapshot, 이미지/PDF/movie/CSV/EDL/AAF/XML export | 웹툰용으로 scene/page/frame/beat/caption을 연결하고, 대표 컷 선택·검토용 PDF profile·manifest·선택 내보내기를 지원. 영상/오디오는 정적 웹툰 핵심 이후 선택 확장 |
| Storyboard That | 다양한 storyboard layout, cell별 title/description, image pack/고해상도 PNG/GIF/PPT/PDF, autosave/revision history, privacy와 comments | 템플릿 변경 전 손실 미리보기, 검토용 설명 포함 export, 목적지별 공개 범위·권리/출처 확인 |
| Pixton | 캐릭터 외형·의상·자세·표정·시선, 손에 든 prop, visual SFX, speech-to-text/read-aloud, 패널 복제/재정렬, asset favorite/search | 캐릭터 바이블과 pose/expression/prop 상태를 컷 메타에 연결하고, SFX·말풍선·접근성 낭독을 작가실 산출물로 포함 |
| Canva | templates/layout, bulk create, layers/guides/margins/version history, text translate, collaboration, brand assets, AI media | 반복 회차는 data-driven template로 만들고 브랜드/작품 자산·용어집·버전을 재사용 |
| WEBTOON CANVAS / Tapas | 예약·미리보기·정책 심사·회차 분석·댓글/수익. Tapas는 현재 AI-generated content 제한을 별도로 확인해야 함 | 외부 API가 없으면 거짓 직접 게시 대신 검증된 export pack·로컬 일정·CSV/manual 성과 가져오기와 최신 정책 재확인 제공 |

## 공식 근거

- Clip Studio Paint: [Companion Mode](https://help.clip-studio.com/en-us/manual_en/840_options/Companion_Mode.htm),
  [Teamwork](https://help.clip-studio.com/en-us/manual_en/570_pages/Teamwork.htm),
  [공식 Teamwork FAQ](https://support.clip-studio.com/en-us/faq/articles/20210034)
- MediBang Paint: [Android 만화 제작 흐름](https://medibangpaint.com/en/use/2022/08/how-to-make-a-comic-1-android/),
  [Comic 제작 도구](https://medibangpaint.com/en/tutorial/pc/create-comics/),
  [Cloud annotation·version](https://medibangpaint.com/en/use/2016/02/using-canvas-annotations-in-medibang-paint-android/)
- ibisPaint: [모바일 제스처·단축키](https://ibispaint.com/lecture/index.jsp?no=151),
  [Manga 기능](https://ibispaint.com/lecture/index.jsp?no=185)
- Procreate: [QuickMenu](https://help.procreate.com/procreate/handbook/5.0/interface-gestures/quickmenu)
- Adobe: [Fresco UI·Touch Shortcut](https://helpx.adobe.com/fresco/using/getting-started-with-user-interface.html),
  [Fresco brush panel](https://helpx.adobe.com/in/fresco/using/brushes.html),
  [Photoshop Mobile 기능 색인](https://helpx.adobe.com/photoshop/mobile.html),
  [Photoshop Contextual Task Bar](https://helpx.adobe.com/uk/photoshop/desktop/get-started/learn-the-basics/boost-workflows-with-the-contextual-task-bar.html),
  [iPad Generative Fill](https://helpx.adobe.com/photoshop/using/generative-fill-ipad.html)
- Toon Boom: [Storyboard Pro Timeline](https://docs.toonboom.com/help/storyboard-pro-25/storyboard/reference/views/timeline-view.html),
  [PDF profile](https://docs.toonboom.com/help/storyboard-pro-25/storyboard/reference/dialogs/pdf-profile-dialog.html),
  [panel PDF options](https://docs.toonboom.com/help/storyboard-pro-25/storyboard/export/set-up-pdf-export.html),
  [Snapshots](https://docs.toonboom.com/help/storyboard-pro-25/storyboard/export/about-snapshots.html),
  [export 범위](https://docs.toonboom.com/help/storyboard-pro-20/storyboard/export/about-export.html)
- Storyboard That: [layout](https://help.storyboardthat.com/storyboard-layouts/change-storyboard-layout),
  [download options](https://help.storyboardthat.com/download-export/what-are-the-download-options),
  [privacy](https://help.storyboardthat.com/security/storyboard-security-settings)
- Pixton: [Comic Maker 기능 색인](https://help.pixton.com/comics),
  [asset favorites](https://help.pixton.com/how-to-bookmark-your-favorite-content)
- Canva: [Editing and designing Help](https://www.canva.com/help/editing-designing/)
- Z.ai: [Chat Completion API](https://docs.z.ai/api-reference/llm/chat-completion),
  [Structured Output](https://docs.z.ai/guides/capabilities/struct-output),
  [GLM-5.1](https://docs.z.ai/guides/llm/glm-5.1),
  [가격표](https://docs.z.ai/guides/overview/pricing)

## 웹툰 작가 불편을 기준으로 재구성한 올인원 흐름

```text
아이디어
  → premise / synopsis / episode outline
  → 캐릭터 바이블·말투·관계·의상·소품 lock
  → beats / scenes / panel plan / dialogue / SFX
  → 모바일 콘티·컷 분할·참고자료·빠른 도구
  → 선화·톤·채색·배경·말풍선·효과
  → continuity / 맞춤법 / 말풍선 overflow / 검토·댓글
  → 목적지별 thumbnail·slice·manifest·권리·AI 고지
  → 로컬 릴리스 캘린더
  → CSV/manual 성과·댓글 회고
  → 다음 회차 제안(자동 적용 금지)
```

핵심은 도구 수가 아니라 단계 사이의 재입력 제거다. 캐릭터 이름·말투·의상·소품, 장면 목적, 대사,
SFX, 검토 상태, 권리/출처, AI 사용 이력을 한 번 입력해 이후 컷·게시 패키지·성과 회고에서 재사용한다.

## 구현 우선순위

### P0 — 모바일에서 실제 제작 가능한 인터랙션

1. 44px 이상 touch target, safe-area, 키보드가 올라온 visual viewport, 가로 overflow 0을 모든 주요 패널에
   자동 검사한다.
2. 모바일 bottom dock에는 선택/펜/지우개/말풍선/실행취소만 고정하고 나머지는 검색 가능한 도구 sheet로
   이동한다.
3. 선택한 컷·말풍선·이미지 바로 위에 Photoshop식 context actions를 띄우되 캔버스를 가리지 않도록
   위/아래 자동 배치한다.
4. Procreate식 사용자 지정 6방향 Quick Actions와 Fresco식 hold-to-eraser/eyedropper를 제공한다.
5. 왼손/오른손 dock 위치, slider 숫자 입력·reset, 짧은 햅틱(`navigator.vibrate` 지원 시에만)을 제공한다.
6. 두 손가락 canvas pan/pinch/rotate와 브라우저 scroll을 명확히 분리하고, 제스처 끄기·도움말·키보드
   대체 경로를 둔다.

### P0 — 비용·개인정보·문서 안전

- 서버 AI disconnect abort, timeout, 분산 UTC 일일 request/token quota, 최소 usage ledger.
- DeepSeek/Z.ai provider 선택·장애 전환은 사용자에게 표시하고, provider별 사용량/모델을 provenance에 기록.
- 프롬프트 원문은 기본 저장하지 않고 SHA-256+내용 비포함 요약만 로컬 문서에 보존.
- 비소유자 공개 문서에서 comments, 내부 bible, 일정/성과, 권리 답변, AI prompt hash/target/request ID 제거.

### P1 — 단계형 Writer Room

- `premise → synopsis → episode outline → beats → scenes → panel plan → dialogue/SFX` 버전형 문서.
- AI 결과는 `{targetPath,currentValue,proposedValue,rationale,status}` suggestion이며 필드별 accept/reject와
  한 단계 undo를 거쳐야 적용된다.
- 기존 캐릭터 바이블·continuity·SFX preset을 참조하고 복제하지 않는다.
- 각 단계는 GLM/DeepSeek structured output을 Zod로 다시 검증하며 부분 JSON·비정상 길이를 거부한다.

### P1 — Publish Pack을 실제 전달물로 완성

- 첫 페이지/선택 컷/사용자 이미지 기반 목적지별 thumbnail crop.
- 실제 render Blob의 폭·높이·byte size, text safe-area, gutter, overlap, 잘림 검사.
- slice 이미지 + thumbnail + `manifest.json` + 검증 보고서 + AI 공개 projection + 라이선스/출처를 ZIP으로
  묶고 생성 중 문서 revision이 바뀌면 stale 경고.
- Storyboard Pro식 대표 snapshot과 검토용 PDF profile(컷 이미지 + beat/dialogue/note 선택)을 제공.

### P2 — 협업·성과 피드백

- owner/editor/commenter/viewer ACL과 base revision 충돌 방지부터 구현하고, 실시간 cursor/presence는 CRDT
  인프라가 준비된 뒤 추가한다.
- 외부 댓글은 명시적 동의로만 가져오고 원 댓글 ID를 유지한다. AI 요약은 질문/칭찬/혼란/요청 분류의
  제안일 뿐 원문을 대체하지 않는다.
- ToonSpectrum 자체 예약 공개는 UTC `scheduledAt`과 고정 revision을 사용한다.

## 구현하지 않았다고 명확히 표시할 것

- WEBTOON/Tapas 공식 Creator API 승인 없이 직접 게시·예약·수익 동기화를 주장하지 않는다.
- DeepSeek/GLM text model을 이미지 생성, LoRA character training, face fix, 정확한 inpaint로 표현하지 않는다.
- JSON manifest를 서명된 C2PA credential이라고 부르지 않는다.
- RGB 변환을 ICC 기반 CMYK/인쇄 교정이라고 부르지 않는다.
- 로컬 댓글/잠금을 실시간 협업 ACL이라고 부르지 않는다.

## Z.ai 확인 결과

공식 일반 API의 현재 최신 모델 목록은 `glm-5.1`, `glm-5-turbo`, `glm-5`이며 `glm-5.2` 모델 코드는
문서에 없다. 일반 앱은 `https://api.z.ai/api/paas/v4/chat/completions`를 사용하고 Coding Plan 전용 endpoint를
우회 사용하지 않는다. 제공받은 키로 `glm-5.1` 최소 호출을 확인했으나 API는 인증 형식 오류가 아니라
`1113`(잔액 또는 resource package 부족)을 반환했다. 따라서 서버 연동·테스트 대역·provider 선택 UI는
구현할 수 있지만, 실모델 생성은 해당 계정에 일반 API 잔액/패키지가 준비될 때까지 차단 상태로 표시한다.
