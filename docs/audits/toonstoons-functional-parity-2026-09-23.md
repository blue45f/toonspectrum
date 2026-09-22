# Toonstoons → ToonStudio 기능 내재화 분석

- 분석 일자: 2026-09-23
- 분석 대상: `https://www.toonstoonsweb.com/`
- 분석 방식: 공개 화면·네트워크 동작·정적 자산이 드러내는 사용자 기능을 기준으로 한 clean-room 분석
- 구현 원칙: 대상 서비스의 소스 코드, 비공개 API 구현, 브랜드 자산, 문구·트레이드 드레스, 생성 결과물을 복사하지 않고 ToonStudio의 고유 UI·데이터 모델·보안 경계로 재설계한다.

## 1. 결론

대상 서비스의 핵심 가치는 개별 생성 버튼이 아니라 **대본 → 캐릭터 기준 → 장면 이미지 → 나레이션·대사 → 음성 → 30초 영상 → 산출물 다운로드**를 하나의 프로젝트로 묶는 제작 흐름이다.

ToonStudio에는 이미 다음 네이티브 엔진이 존재한다.

- AI 코믹 디렉터: 이야기 분해, 컷 선택, 이미지 후보, 부분 수리, 품질 분석, 레이어 분리, 비파괴 적용
- 작품 바이블·AI 이미지 참조 팩: 캐릭터·구도·화풍 역할 분리, revision, 외부 전송 권리 확인
- 캐릭터·말풍선·레터링·브라우저 TTS: 편집 가능한 네이티브 객체와 음성 검수
- 애니매틱·영상: 타임라인, 원고 캡처, 오디오 트랙, WebM 영상 내보내기, 작업 ZIP

따라서 경쟁 서비스의 개별 페이지를 복제하지 않고, 기존 엔진을 하나의 **Toon Automation 작업대**와 **AI 코믹 디렉터 세션 payload**로 묶었다. 새 기능은 별도 문서 섬이 아니라 로컬 자동 저장, 클라우드 revision, 낙관적 잠금, 충돌 복구, Studio 편집기 인계를 그대로 상속한다.

## 2. 공개 기능 분석과 내재화 매핑

| 영역 | 공개 서비스에서 확인한 동작 | ToonStudio 내재화 | 구현 증거 | 상태 |
|---|---|---|---|---|
| 프로젝트 | 새 작업, 프로젝트 자동 저장·불러오기, 단계별 진행 | AI 코믹 디렉터 세션 안에 `automation` 문서를 저장하고 local/cloud revision을 공유 | `studio-ai-comic-director-session.ts`, `studio-ai-comic-director-api.ts` | 완료 |
| 제작 모드 | 웹툰과 30초 애니메이션 작업 분리 | 한 프로젝트에서 `webtoon` / `animation` 모드 전환 | `studio-toon-automation.ts`, `StudioToonAutomationWorkspace.tsx` | 완료 |
| 이야기 | 시나리오 입력, 장면 구성, 이전 이미지 재사용 | 기존 코믹 디렉터의 대본·장면 배열과 자동화 준비도 연결 | `StudioAiComicDirectorPanel.tsx`, `StudioToonAutomationWorkspace.tsx` | 완료 |
| 장면 제작 보드 | 장면 카드, 이전·다음 이동, 이미지 미리보기, 장면 속성 수정 | 세션 장면을 단일 보드에서 탐색하고 요약·이미지 프롬프트·나레이션/대사·비율을 revision에 직접 반영 | `StudioToonProductionBoard.tsx` | 완료 |
| 이미지 검토 | 확대·축소·맞춤, 생성 결과와 상태 확인 | 50~160% 미리보기, 전체/그림/승인/오류 집계, 후보 보드 연결 | `StudioToonProductionBoard.tsx` | 완료 |
| 일괄 후보 생성 | 컷 선택, 품질·다양성·후보 수 설정, 일괄 생성 | 선택 컷만 1/2/4개 후보, draft/balanced/final 품질, subtle/directorial/coverage 연출로 작업면에 인계하고 1회 24요청 상한을 사전 검증 | `StudioScenarioCandidateDesk.tsx`, `studio-toon-production-board.ts` | 완료 |
| 장면 연속 확장 | 마지막 장면에서 새 전개 방향과 수량을 지정해 구간 확장 | 최대 10개씩, 프로젝트 총 50컷까지 연속성 메타데이터와 생성 선호를 이어받는 편집 초안을 추가하며 기존 이미지·후보·승인은 복제하지 않음 | `extendStudioToonProductionScenes` | 완료 |
| 시나리오 참조 | 최대 5개 이미지 참조 | Studio 자산 ID를 최대 5개 연결하고 이미지 bytes는 세션 JSON에서 제외 | `STUDIO_TOON_AUTOMATION_MAX_SCENARIO_REFERENCES` | 완료 |
| 프롬프트 설정 | 집필 지침, JSON 템플릿, 기본 이미지 프롬프트, 생성 규칙, 나레이션·대사·표시 규칙, 최종 참고 | 동일 범주의 프로젝트 규칙을 공급자 중립 모델로 저장·편집·TXT 내보내기 | `StudioToonAutomationPromptRules`, `studioToonAutomationPromptBundle` | 완료 |
| 캐릭터 후보 | 텍스트·스타일·첨부 이미지 기반 후보 생성, 여러 캐릭터 관리 | 후보 자산 ID 목록, 설명, Studio 캐릭터 작업대 연결 | `StudioToonAutomationCharacter`, 캐릭터 탭 | 완료 |
| 3면 기준 | Character / Style 1 / Style 2 기준 이미지 | 캐릭터별 세 개의 canonical asset ID를 필수 준비 항목으로 관리 | `canonicalReferences` | 완료 |
| 작품 기준 | 캐릭터·스타일 정보를 프로젝트에 고정 | 기존 작품 바이블 revision과 자동화 캐릭터 기준을 함께 준비도에 반영 | `StudioAiVisualBibleDocument`, `studioToonAutomationReadiness` | 완료 |
| 장면 이미지 | 장면별 이미지 생성, 재생성, 후보 선택, 다운로드 | 1/2/4개 후보 생성 선호, 선택·승인, 재생성, 부분 수리, 픽셀 품질 분석 | `StudioScenarioCandidateDesk.tsx`, `StudioAiComicDirectorPanel.tsx` | 완료 |
| 이미지 수정 | 잘못된 영역 수정, 장면 확장 | 마스크 기반 부분 수리, outpaint 대상, 전경·배경 레이어 분리 | `studio-ai-comic-director-media.ts`, `StudioAiComicDirectorPanel.tsx` | 기존 기능 재사용 |
| 나레이션 디자인 | 프리셋, 모양·배경·테두리·글자·글꼴, 사용자 PNG | 프리셋 ID, 사용자 자산 ID, 색·글꼴·투명도를 프로젝트에 저장 | `StudioToonAutomationDesignPreset` | 완료 |
| 말풍선 디자인 | 프리셋, 사용자 PNG, 자동 꼬리, 모양·색·폰트 | 자동 꼬리와 사용자 자산을 자동화 문서에 저장하고 네이티브 말풍선 편집기로 인계 | `speechBubble`, `StudioBubbleStylePresetPanel` | 완료 |
| 나레이션 음성 | 공급자·음성 선택 | browser, Gemini, ElevenLabs, Typecast, 업로드 음원을 공급자 중립 설정으로 관리 | `StudioToonAutomationVoiceAssignment` | 완료 |
| 캐릭터 음성 | 캐릭터별 공급자·voice ID | 캐릭터 단위 provider / voice / locale / rate / pitch / audio asset 저장 | `StudioToonAutomationCharacter.voice` | 완료 |
| 즉시 음성 검수 | 생성 전 TTS 확인 | Web Speech API 어댑터로 대본 일부를 즉시 읽어 검수 | `studio-dialogue-read-aloud.ts`, 스타일·음성 탭 | 완료 |
| 외부 음성 보안 | 공급자 API 호출 | 클라이언트는 provider/voice/asset 참조만 저장한다. 공유 자격 증명은 서버 환경에만 둔다 | `apps/api/src/modules/studio-ai/README.md` 정책 유지 | 보안 경계 유지 |
| BGM | 배경 음악 연결·볼륨 | BGM 자산 ID, BGM/대사 볼륨, loudness 정규화 설정 | `StudioToonAutomationAudioSettings` | 완료 |
| 애니메이션 길이 | 30초 고정 작업 | 목표 길이를 30,000ms로 고정하고 기본 6개 × 5초 구간 생성 | `STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS` | 완료 |
| 화면 비율 | 출력 화면 비율 선택 | 9:16, 16:9, 1:1, 4:3 | `STUDIO_TOON_AUTOMATION_ASPECT_RATIOS` | 완료 |
| 콘티·3D 프리뷰 | Blender 프리뷰, 프롬프트, 재생·구간 수정 | preview asset, Blender asset, 수정 지시를 저장하고 기존 애니매틱·3D 작업대로 연결 | 애니메이션 탭, `StudioAnimaticWorkspacePanel` | 완료 |
| 구간 편집 | 시간점 선택, 구간 추가·삭제·초기화 | 0~30초 구간별 이름·시작·종료·움직임·카메라·참조 자산 편집, 추가 시 자동 재분배 | `StudioToonAutomationAnimationSegment` | 완료 |
| 프롬프트 보조 | 장면별 영상 프롬프트 작성 | 비어 있는 구간을 작품 규칙·캐릭터 이름·연속성 기준으로 채우는 작업 | `fillAnimationPrompts` | 완료 |
| 진행 상태 | 단계별 진행·중단·복구 | 기존 durable job, operation ID, lease, progress, cancel, unknown recovery 사용 | `studio-ai-comic-director` API/DB | 기존 기능 재사용 |
| 스토리 시트 | 스토리 시트 생성·다운로드 | Studio 자산 ID로 결과를 연결하고 원고/애니매틱 작업대로 인계 | `storySheetAssetId` | 완료 |
| 프레임 시트 | 프레임 시트 생성·다운로드 | Studio 자산 ID 연결 | `frameSheetAssetId` | 완료 |
| 캐릭터 시트 | 캐릭터별 시트와 통합 그리드 | 캐릭터 통합 시트 자산 ID와 캐릭터 플랫폼 작업대 연결 | `characterGridAssetId` | 완료 |
| 영상 파일 | 최종 영상 생성·다운로드 | 최종 영상 자산 ID, 기존 애니매틱 WebM 내보내기와 홍보영상/모션툰 경로 연결 | `finalVideoAssetId`, `StudioAnimaticWorkspacePanel` | 완료 |
| 프롬프트 파일 | TXT 다운로드 | 공급자 중립 프롬프트 번들을 UTF-8 TXT로 다운로드 | `studioToonAutomationPromptBundle` | 완료 |
| 프로젝트 백업 | 설정·작업 결과 보존 | 설정/자산 참조/프롬프트를 JSON manifest로 다운로드 | `studioToonAutomationManifest` | 완료 |
| 계정·사용량 | 로그인, 토큰/사용량, 결제·추천 | 제작 보드에서 기존 `/membership`의 잔액·Studio 크레딧·최근 원장으로 바로 이동한다. 경쟁 서비스의 고정 토큰 단가·추천 보상 경제는 복제하지 않고 ToonStudio wallet/admission 정책을 단일 진실원으로 유지 | `MembershipPolicyPage.tsx`, `apps/api/src/modules/membership-wallet`, `studio-ai` | 기존 플랫폼 재사용 |
| 설치·업데이트 | PWA 설치·업데이트 | ToonSpectrum 기존 웹앱/PWA와 배포 체계 유지 | `apps/web/public/manifest.webmanifest`, 서비스 워커 검증 | 기존 플랫폼 재사용 |

## 3. 상태 모델

`StudioToonAutomationDocument`는 다음을 한 revision으로 저장한다.

1. 웹툰/애니메이션 모드
2. 시나리오 참조 자산
3. 캐릭터 후보와 3면 기준, 캐릭터별 음성
4. 프로젝트 프롬프트 규칙
5. 이미지 화풍, 나레이션, 말풍선 디자인
6. 나레이션 음성, BGM, 음량 정책
7. 30초 애니메이션 구간, 프리뷰·Blender 자산, 수정 지시
8. 스토리·프레임·캐릭터 시트, 프롬프트, 최종 영상 자산

Hydrator는 외부/구버전 payload를 신뢰하지 않고 다음을 제한한다.

- 참조 이미지: 최대 5개
- 캐릭터: 최대 24명
- 애니메이션 구간: 최대 24개
- 텍스트 길이와 asset ID 길이
- 지원하지 않는 enum은 안전한 기본값으로 복구
- 30초 target은 변경 불가
- 이미지·오디오·영상 bytes는 JSON에 저장하지 않음

## 4. UX 동선

### Studio 내부

`AI 도구 → 제작 흐름으로 시작 → 웹툰·30초 애니메이션 통합 제작 자동화 열기`

### 전용 세션

`/studio/compose/:sessionId?view=automation`

작품 또는 리믹스 범위에서는 기존 scope를 보존한다.

- `/studio/work/:workId/compose/:sessionId?view=automation`
- `/studio/remix/:remixSourceWorkId/compose/:sessionId?view=automation`

상단 토글로 AI 코믹 디렉터와 Toon Automation 작업대를 즉시 전환한다. query 변경은 세션을 다시 불러오지 않으므로 저장하지 않은 로컬 revision을 덮어쓰지 않는다.

통합 작업대의 기본 동선은 다음과 같다.

`제작 개요 → 장면 제작 → 캐릭터 → 프롬프트 → 스타일·음성 → 30초 애니메이션 → 산출물`

장면 제작 탭에서는 장면 이동·미리보기·속성 편집, 연결 장면 확장, 후보 일괄 생성 사전검사, 후보 선택·승인을 한 화면에서 수행한다. 생성 버튼은 유료 공급자를 브라우저에서 직접 호출하지 않고 선택 장면과 품질 선호를 기존 Studio 작업면으로 인계한다.

## 5. 준비도·완료 기준

최종 제작 가능 여부는 다음 일곱 항목을 계산한다.

1. 대본과 컷 구성
2. 시나리오 또는 작품 바이블 참조
3. 모든 캐릭터의 Character / Style 1 / Style 2 기준
4. 핵심 프롬프트 규칙
5. 화풍·말풍선·나레이션 디자인
6. 음성 공급자 설정 또는 업로드 음원
7. 0초~30초 연속 타임라인과 구간별 프롬프트

작업대는 누락을 숨기지 않고 항목별 상태와 준비 비율을 표시한다.

## 6. 보안·권리·비용 경계

- 외부 공급자 비밀 키는 자동화 문서와 브라우저 저장소에 넣지 않는다.
- 캐릭터·시나리오·스타일 참조는 기존 작품 바이블의 권리 상태와 외부 전송 동의를 따른다.
- 대용량 media bytes 대신 서버 자산 ID만 저장한다.
- 유료 공급자 호출은 기존 AI admission, idempotency, quota/billing 실패 분류를 거친다.
- 결제·wallet·추천 코드는 제작 기능과 분리해 기존 플랫폼 서비스를 재사용한다.
- JSON/TXT 내보내기는 공급자 중립이며 비밀 정보를 포함하지 않는다.

## 7. 검증

### 단위 테스트

- 기본 타임라인이 6개 구간, 총 30초인지 확인
- 신뢰하지 않는 payload의 enum, 시간, 참조 개수 복구 확인
- 전체 준비도 계산 확인
- JSON manifest와 TXT prompt bundle 확인
- 연결 장면이 기존 이미지·후보·승인을 복제하지 않는지 확인
- 프로젝트 50컷 상한과 1회 확장 수 제한 확인
- 선택 장면, 품질, 다양성, 후보 수만 Studio handoff에 포함되는지 확인
- 일반 제작 계속 시 빈 프롬프트 장면도 누락 없이 인계되는지 확인
- 기존 AI 코믹 디렉터 세션 저장·복구 회귀 확인

### UI 테스트

- 웹툰/애니메이션 모드 전환
- 시나리오 참조 추가
- 캐릭터 추가와 기본 이름
- 모든 프롬프트 설정 진입
- 30초 구간 표시
- 장면 요약 편집과 연결 장면 추가 후 활성 장면 이동
- 사용량·포인트 화면 연결
- 선택 컷 생성 요청 payload의 인덱스·품질·연출·후보 수 확인
- 웹툰·캐릭터·애니매틱 네이티브 작업대 인계
- Studio AI 시작 패널의 직접 진입 링크

### 정적 검증

- 자동화 문서가 local/cloud session payload 모두에 포함되는지 확인
- route query가 `new` 세션의 실제 ID 전환 뒤에도 유지되는지 확인
- query 토글 때문에 클라우드 재동기화가 발생해 로컬 편집을 덮지 않는지 확인
- 외부 provider key 문자열이 새 클라이언트 코드에 없는지 확인

## 8. 의도적으로 하지 않은 것

- 대상 서비스의 화면을 픽셀 단위로 복제하지 않았다.
- 대상 서비스의 비공개 API endpoint를 ToonStudio 런타임에서 호출하지 않는다.
- 특정 공급자 이름을 최종 산출물 포맷에 강제하지 않는다.
- 외부 생성 결과를 검수 없이 원고에 자동 적용하지 않는다.
- 결제·토큰 지갑을 제작 세션 안에 중복 구현하지 않는다.

이 원칙 덕분에 기능 범위는 내재화하되 ToonStudio의 편집 가능성, 비파괴 적용, provider 교체 가능성, 보안·권리 경계를 유지한다.
