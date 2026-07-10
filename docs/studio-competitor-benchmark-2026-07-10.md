# 창작 스튜디오 경쟁 벤치마크 — 2026-07-10

> 공식 제품 페이지·도움말·약관만 확인했다. 마케팅 페이지의 생성 품질·속도 주장은 검증된 성능 수치가
> 아니라 해당 제품이 공식적으로 제공한다고 밝힌 기능 범위로만 해석한다.

## 시장 구도

| 제품군 | 대표 제품 | 강점 | ToonSpectrum이 가져갈 부분 |
|---|---|---|---|
| 쉬운 템플릿·에셋 편집 | Canva, Pixton, Storyboard That | 빠른 시작, 방대한 에셋, 저학습곡선 | 완성 초안→국소 수정 흐름, 템플릿, 쉬운 캐릭터·장면 조립 |
| 프로 만화 제작 | Clip Studio Paint EX | 페이지·레이어·벡터·3D·레터링·출판 정밀도 | 세로툰/페이지 이중 편집, 페이지 잠금, 고급 말풍선·내보내기 |
| AI-first 만화 제작 | Dashtoon, Adobe Express Comic Creator, Anifusion | 각본→장면→일관된 캐릭터→패널 생성 | 구조화 작가실, 캐릭터 바이블, 장면별 재생성, provenance |
| 배포·수익화 | WEBTOON CANVAS, Tapas | 예약 공개, 정책 심사, 분석, 댓글, 수익화 | 목적지별 Publish Pack, 정책 사전검사, 배포 후 피드백 루프 |

현재 확인한 경쟁사 중 **AI 각본→캐릭터 연속성→프로 웹툰 편집→목적지 정책 검사→배포 성과 피드백**을
한 문서 모델로 연결한 제품은 없다. ToonSpectrum의 제품 북극성은 다음 조합이다.

> Dashtoon식 AI 속도 + Clip Studio식 편집 정밀도 + Adobe식 버전·검토·AI provenance +
> WEBTOON식 배포·분석 + 플랫폼별 정책 사전검사

## 제작 기능 비교

| 제품 | 기획·각본 | 캐릭터·스타일 | 패널·레터링 | AI 생성·편집 |
|---|---|---|---|---|
| Canva | Comic 템플릿, Magic Write/Design | 스톡·업로드·Brand Kit, photo-to-cartoon | 멀티페이지, 프레임, 말풍선, 100+ 글꼴 | 텍스트→이미지/영상/그래픽, Magic Edit/Eraser, 배경제거 |
| Pixton | Story Starters, AI Activity Maker | 다양성 높은 아바타, 포즈·표정·의상 | 패널 CRUD/재정렬, 말풍선·SFX, STT/TTS, 대형 에셋 카탈로그 | 문장형 Magic Search로 장면 에셋 조합 제안 |
| Storyboard That | Plot Diagram, Book Creator 템플릿 | 내장 캐릭터 포즈·색 변경 | 최대 100셀, 레이어·정렬·잠금·멀티선택, 셀 오디오 | 전용 생성형 이미지 기능은 공식 문서에서 확인하지 못함 |
| Clip Studio Paint EX | 페이지 매니저, Story Editor | 브러시·벡터, 3D 인체·손·소품, 대형 소재 생태계 | 컷 분할·거터, 멀티페이지, 세로툰 미리보기, 고급 벌룬·타이포 | 포즈 스캔·Shading Assist 등 보조형 AI |
| Dashtoon Studio | Story-to-Comic, Storyboard2Comic | 캐릭터 학습·세부 조정·장면 간 일관성 | 패널 템플릿, 스케치/작품 import, 말풍선·폰트 | 패널 생성, inpaint/segmentation, erase, face fix, upscale, auto-color |
| Adobe Express Comic Creator | 주제·스토리 구조·어휘 수준→멀티패널 초안 | 내장/업로드/custom character와 장면 간 일관성 | 생성된 패널·말풍선·제목을 모두 편집 | 패널 재생성, 이미지 생성, 오브젝트 삽입·삭제 |
| Anifusion | 자연어 story→scene break·패널·대사 | character sheet + LoRA/identity adaptation | manga/webtoon/4-koma, 읽기 방향, 세로쓰기·SFX·screentone | 페이지/패널 생성·재생성, sketch/img2img, custom model, 짧은 영상 |

## 협업·배포·권리 비교

| 제품 | 협업·버전 | 배포·분석 | 안전·IP 시사점 |
|---|---|---|---|
| Canva | 실시간 공동편집, 댓글, 링크 권한 | 이미지/PDF/print/social | 입력·출력 권리, moderation, privacy training control, C2PA 정책 |
| Storyboard That | 교육판 실시간 공동편집, autosave/revision history | PNG/GIF/PPT/PDF/링크 | 원본 에셋과 사용자 composition 권리가 다르므로 라이선스 UX 중요 |
| Clip Studio Paint EX | 페이지 담당·잠금, 역할, 동기화 로그, 이전 버전 | 긴 웹툰 분할, PSD/PSB/PDF/EPUB/CMYK | 동일 페이지 동시편집 대신 명시적 페이지 잠금 모델 |
| WEBTOON CANVAS | 시리즈·댓글 통합 관리 | 예약/미리보기, PV·구독·회차 분석, 수익화, 7개 언어 | 창작자 소유권, 등급·심사·이의제기, AI 번역 opt-in·용어집 |
| Tapas | draft/예약·댓글 관리 | 일일 성장 데이터, 광고·Ink 수익 | **현재 AI-generated content 게시 금지** — 목적지 preflight 필수 |
| Adobe Express | 실시간 co-edit, edit/comment 역할, 오브젝트 댓글, version restore | 링크/다운로드/social/print | Firefly 안전 필터, Content Credentials, 사용자 콘텐츠 비학습 정책 |
| Anifusion | collaborative workspace(세부 역할 문서는 제한적) | 4K·PNG/PDF·CMYK·플랫폼용 출력 | custom model 학습자료 권리 확인, commercial rights, DMCA/NSFW 정책 |

## 우선 구현 백로그

### P0 — 출시 안전성과 문서 내구성

- 비공개 초안과 종속 좋아요·댓글 API 가시성 통합
- 서버 비용형 AI kill switch·사용자 quota·분산 usage ledger
- 업로드 작품 형식 보존 편집
- 작품별 자동 저장·충돌 복구·버전 마이그레이션
- 완전한 프로젝트 백업과 대용량 blob/object storage

### P1 — 구조화 AI 작가실

- premise→synopsis→캐릭터 bible→episode outline→beats/scenes→panel plan→dialogue/SFX JSON 파이프라인
- 전체 재생성 대신 필드·비트·장면별 제안, accept/reject, undo
- 캐릭터 외형·의상·색상·말투·관계·소품·금지 변형 lock
- 시간·장소·의상·소품·대사 정보의 continuity lint
- 모델·프롬프트 버전·사용량·생성 시각 provenance

DeepSeek 또는 Z.ai GLM은 이 텍스트 구조화·검사 경로에 사용한다. 래스터 이미지 생성·인페인트·업스케일은
텍스트 Chat capability와 분리하고 기존 이미지 제공자 경로를 유지한다.

### P1 — 장면 생성 검토 루프

- 이미지 생성 전 장면 텍스트 편집 단계
- 장면별 재시도·교체·건너뛰기, 전체 재생성 없이 부분 수정
- AbortController 기반 실제 네트워크 취소
- 현재 페이지/새 페이지 선택
- reference image·seed·model·prompt를 에셋 provenance로 보존

### P1 — Publish Pack·정책 사전검사

- WEBTOON/Tapas/일반 PNG·PDF 목적지 프리셋
- thumbnail 생성, 폭·높이·파일 크기·순서·거터·모바일 safe-area 검사
- AI 사용 disclosure manifest와 생성·수정 이력
- Tapas 목적지에서 AI 생성 이력이 있으면 현재 정책 경고/차단 옵션
- age-rating 질문지, 저작권·reference 자료 권리 확인

### P2 — 팀 운영·배포 후 개선

- named snapshot/restore, contextual comment, editor/commenter/viewer 역할
- Clip Studio식 페이지/패널 assignment·lock + Adobe식 승인 후 export
- 플랫폼 API 부재 시 CSV/manual analytics import
- 댓글 inbox·질문/감정 요약과 다음 회차 아이디어 제안(자동 결정 금지)

## 2026-07-10 구현 반영

- 서버 전용 Z.ai/DeepSeek 텍스트 transport와 `/api/studio-ai` capability/chat 경로. 제공자 명시 선택과
  auto 순서를 지원하되, 네트워크 단절은 이중 과금 위험 때문에 다른 제공자로 자동 재전송하지 않음
- `nestjs-zod` task allowlist·길이 제한·고정 모델/토큰/응답 형식, 로그인·rate limit·timeout
- 기존 구도/장면/대사/번역/팔레트는 Z.ai/DeepSeek 서버 또는 기존 BYOK 텍스트 transport를 선택
- 이미지 생성/채색/참고 이미지 편집은 기존 BYOK 이미지 provider에 그대로 분리
- 전체화면 모달 4종을 `document.body` portal로 이동해 사이트 헤더 가림 해결
- 초안 상세·좋아요·댓글 공개 차단, 소유자 조회수 제외
- 서버 비용형 이미지 생성 opt-in kill switch + 사용자별 제한
- 업로드 작품을 형식 보존 편집기로 라우팅·hydrate·update
- 사용자·작품별 v2 autosave와 레거시 복구, 프로젝트 v2 백업 스키마
- Storyboard That·Adobe·Dashtoon 흐름을 결합한 AI 비트 시트 검토 게이트: 텍스트 장면 설계와 이미지
  생성을 분리하고, 비트 역할·변화 요약·그림 프롬프트·대사를 장면별 편집한 뒤 빈 장면만 일괄 생성하거나
  한 장면만 재생성·삭제·적용
- AI 생성/편집 provenance를 이미지·프레임 문서에 보존하고 WEBTOON/Tapas/일반 Publish Pack 사전검사,
  Tapas AI 생성 콘텐츠 차단, AI 고지·이력·세로 스크롤 구조 검증과 JSON 검사 보고서 제공
- Adobe/Storyboard That식 이름 있는 복구 지점: 사용자·작품별 최신 10개 로컬 스냅샷 생성·복원·삭제,
  손상 데이터 격리와 JSON 백업 병행 안내
- Dashtoon/Anifusion식 **캐릭터 바이블**: 이름·역할·외형·의상·대표 색·말투·목표·관계·소품을 작품
  문서에 저장하고, 필드별 잠금 값을 `[고정]` 제약으로 DeepSeek/BYOK 시나리오와 이미지 프롬프트에 전달.
  바이블은 자동저장·게시 문서·프로젝트 JSON·이름 있는 복구 지점에 함께 포함
- AI 장면 JSON에 등장인물·장소·시간·캐릭터별 의상·소품 상태와 필드별 전환 이유를 추가. 이미지 생성 전
  장면별로 구조화 값을 검토·수정하고, 적용 뒤에도 프레임 속성에서 같은 메타를 계속 편집
- 자유문장 의미를 임의 추론하지 않는 **결정적 continuity lint**: 중복/미등록 캐릭터, 바이블 필수 정보,
  마지막 명시 값 기준 장소·시간·의상·소품 변화를 검사하고 전환 설명이 있는 의도된 변화는 제외. 결과에서
  관련 장면으로 바로 이동
- Clip Studio/Adobe식 **페이지 검토·로컬 잠금**: 작업 중/검토 요청/수정 요청/승인, 담당자·검토 메모,
  승인 시 자동 잠금. 잠긴 페이지의 요소·배경·대사·삭제·일괄 변경은 커밋 관문에서 차단하되 페이지 재정렬과
  새 페이지 삽입은 허용. 이는 서버 권한/실시간 공동편집 잠금이 아닌 문서 내 사고 방지 워크플로임을 명시
- 장면 설계·일괄 이미지·개별 이미지 재생성에 `AbortController`를 끝까지 전달해 취소 버튼이 다음 루프만
  멈추는 것이 아니라 현재 `fetch`와 응답 본문 읽기도 즉시 중단. 이미 완성된 장면은 검토 초안에 보존
- AI 장면 초안을 **현재 페이지 아래** 또는 **현재 페이지 다음 새 페이지**에 적용하는 대상을 검토 단계에서
  선택. 새 페이지 적용은 기존 페이지를 변경하지 않고 페이지 생성+컷/말풍선 배치를 한 히스토리 단계로 커밋
- Publish Pack에 독자 등급, 성적·폭력·강한 언어의 명시적 포함 여부, 원본·참고 자료 권리, 제3자 소재
  라이선스·출처, AI 고지, 최신 목적지 정책 검토를 추가. 문서 자동저장·게시 문서·프로젝트 백업·복구 지점에
  체크리스트를 보존하고 필수 답변 또는 권리 확인이 없으면 실제 게시 진입을 차단하되 법률 인증/승인을
  보장하지 않는 자체 점검임을 명시
- AI 텍스트 장면 설계에 provider·model·server/BYOK transport·prompt version·생성 시각·토큰 사용량을
  키·전체 프롬프트·응답 본문 없이 기록. 검토 UI와 적용된 프레임의 이야기 비트, Publish Pack provenance에
  이어져 모델 교체와 비용 감사가 가능
- Canva/Adobe식 **문맥 댓글**의 로컬 우선 버전: 페이지·컷·요소 앵커, 답글, 담당자, 해결/다시 열기,
  현재 위치/전체/열림/해결 필터. 실시간 동기화·알림·서버 권한이 아님을 명시하고 자동저장·게시 문서·프로젝트
  백업·복구 지점에 함께 포함
- 게시된 작품의 공개 상세 응답에는 소유자 편집 문서를 그대로 노출하지 않고 공개용 투영을 적용: 문서 댓글
  원문/작성자/담당자, 캐릭터 내부 기획, 권리 자체 점검 답변, 페이지 검토 담당·메모를 제거하고 렌더 구조와
  명시적 AI 사용 고지만 유지. 소유자가 스튜디오에서 다시 열 때는 전체 문서를 그대로 반환
- WEBTOON식 제작 피드백 루프의 선행 단계인 **프로덕션 인사이트**: 페이지·컷·대사·내레이션 분량과 공개된
  계산식 기반 읽기 시간 추정, 검토/잠금 커버리지, AI 생성·편집 에셋, 연속성·게시·권리·댓글 이슈를 로컬
  문서 구조만으로 집계. 독자 행동·조회·완독 또는 원격 텔레메트리가 아님을 UI에서 명확히 구분
- WEBTOON/Tapas식 연재 운영을 외부 API 없이 안전하게 보완하는 **로컬 릴리스 일정**: 회차/마일스톤,
  목적지, 현지 날짜·시간·IANA 시간대, 검토 상태를 저장하고 DST 중복·존재하지 않는 시간, 중복 슬롯,
  과거 예약과 목적지 정책 재확인을 결정적으로 검사. 외부 자동 게시를 주장하지 않으며, 선택한 일정만
  비공개 RFC 5545 캘린더로 내보낼 수 있음
- 플랫폼 API가 제공되지 않는 현실을 반영한 **CSV/수동 성과 가져오기**: WEBTOON/Tapas/기타 출처별
  조회·좋아요·댓글·신규 구독·통화별 수익을 로컬 문서에서 정규화하고 합계·비율·시계열·기간 비교를 계산.
  CSV 따옴표/줄바꿈/열 불일치·수식 주입·크기 한도·중복·잘못된 지표를 진단하며 서로 다른 통화를 합산하지
  않고, 원격 텔레메트리나 플랫폼 API 접근으로 오인되지 않게 데이터 근거를 표시
- 헤드리스 브라우저 왕복 검증: 캐릭터 필드 잠금이 실제 AI 요청에 포함되고, 구조화 continuity 응답이
  검토 UI→프레임 문서→자동저장으로 보존되며, 의도하지 않은 네 종류의 장면 변화가 경고로 연결되는 것을
  확인. 페이지 잠금 뒤 패널 추가가 차단되고, 375px 모바일 캐릭터 바이블에 가로 넘침이 없음을 확인
- 추가 브라우저 검증: 체크리스트 7개 필수 누락→입력 완료 통과, AI 2컷을 빈 다음 페이지에 적용해 기존
  페이지 요소 수 0 유지, 모델/프롬프트 v1/200-token 이력의 프레임 자동저장, 컷 앵커 댓글·답글·해결의
  자동저장, 프로덕션 인사이트 집계, 375px 체크리스트/인사이트 무가로넘침을 확인
- 연재 운영 브라우저 왕복: Tapas/WEBTOON 예약 기록에 최신 정책 직접 확인 경고가 붙고, 비공개 메모가
  기본 제외된 `.ics` 1건을 생성함을 확인. 수동 1,200조회/80좋아요/12댓글/24구독/통화별 수익과 Tapas CSV를
  병합해 게시처·날짜별 비교를 계산하고, CSV 수식 시작값을 리터럴로 중립화했으며 일정·성과 정규화 결과가
  작품별 자동저장에 함께 남는 것을 확인. 375px에서 문서·다이얼로그 가로 넘침 0, 새 세션 콘솔 오류 0

## 공식 출처

- Canva: <https://www.canva.com/create/comic-strips/>, <https://www.canva.com/newsroom/news/magic-studio/>,
  <https://www.canva.com/policies/ai-product-terms/>, <https://www.canva.com/safe-ai-canva-shield/>
- Pixton: <https://help.pixton.com/comics>, <https://help.pixton.com/subscription-options>,
  <https://help.pixton.com/collaborate-group-project>, <https://www.pixton.com/terms-of-use>
- Storyboard That: <https://www.storyboardthat.com/>,
  <https://help.storyboardthat.com/students-classes/can-more-than-one-student-work-on-the-same-storyboard-at-once>,
  <https://help.storyboardthat.com/download-export/what-are-the-download-options>,
  <https://help.storyboardthat.com/sharing-storyboards/can-i-publish-a-storyboard>
- Clip Studio Paint: <https://www.clipstudio.net/en/comics-manga/>,
  <https://www.clipstudio.net/en/functional_list/>,
  <https://support.clip-studio.com/en-us/faq/articles/20210034>
- WEBTOON CANVAS: <https://webtooncanvas.zendesk.com/hc/en-us/articles/48452348349332>,
  <https://webtooncanvas.zendesk.com/hc/en-us/articles/47592439172884-WEBTOON-Entertainment-Announces-Unified-International-CANVAS-Platform-and-FAQ>,
  <https://webtooncanvas.zendesk.com/hc/en-us/articles/18556588863380-How-do-I-start-publishing-on-CANVAS>
- Tapas: <https://www.creators.tapas.io/creating-a-series>,
  <https://help.tapas.io/hc/en-us/articles/115005323707-Content-and-Community-Guidelines>
- Dashtoon: <https://dashtoon.com/ai-comic-generator>, <https://dashtoon.com/comic-creator-studio>,
  <https://dashtoon.com/publish>, <https://dashtoon.com/terms-and-conditions>
- Adobe Express/Firefly: <https://www.adobe.com/express/create/comic-strip>,
  <https://helpx.adobe.com/express/web/invite-collaborate/invite-collaborator.html>,
  <https://helpx.adobe.com/express/web/arrange-layers-and-pages/version-history.html>,
  <https://www.adobe.com/ai/overview/firefly/gen-ai-approach.html>
- Anifusion: <https://anifusion.ai/all-features/>, <https://anifusion.ai/manga-creator/>,
  <https://anifusion.ai/tos/>
- DeepSeek: <https://api-docs.deepseek.com/>,
- Z.ai: <https://docs.z.ai/api-reference/llm/chat-completion>,
  <https://docs.z.ai/guides/capabilities/struct-output>,
  <https://docs.z.ai/guides/overview/pricing>,
  <https://api-docs.deepseek.com/api/create-chat-completion/>,
  <https://api-docs.deepseek.com/guides/json_mode/>,
  <https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html>
