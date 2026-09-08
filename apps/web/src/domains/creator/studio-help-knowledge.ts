import {
  normalizeStudioSearchText,
  studioSearchTextMatches,
  tokenizeStudioSearchQuery,
} from "./studio-search-text";

import type { StudioHelpCenterSection } from "./studio-help-center-channel";

export type StudioHelpLocale = "ko" | "en";
export type StudioHelpCategory =
  | "start"
  | "draw"
  | "compose"
  | "organize"
  | "publish"
  | "recover";

export interface StudioHelpLocalizedText {
  readonly ko: string;
  readonly en: string;
}

export interface StudioHelpArticle {
  readonly id: string;
  readonly category: StudioHelpCategory;
  readonly title: StudioHelpLocalizedText;
  readonly summary: StudioHelpLocalizedText;
  readonly keywords: readonly string[];
  readonly readMinutes: number;
  readonly steps: readonly StudioHelpLocalizedText[];
  /** Substrings matched against a command id such as `tool.pen`. */
  readonly toolMatchers: readonly string[];
  readonly technicalSection?: Extract<
    StudioHelpCenterSection,
    "terminology" | "diagnostics" | "recovery" | "bug-report"
  >;
}

export interface StudioHelpGuideStep {
  readonly id: string;
  readonly articleId: string;
  readonly label: StudioHelpLocalizedText;
}

export interface StudioHelpGuide {
  readonly id: string;
  readonly title: StudioHelpLocalizedText;
  readonly summary: StudioHelpLocalizedText;
  readonly outcome: StudioHelpLocalizedText;
  readonly minutes: number;
  readonly steps: readonly StudioHelpGuideStep[];
}

export interface StudioHelpUpdate {
  readonly id: string;
  readonly date: string;
  readonly title: StudioHelpLocalizedText;
  readonly summary: StudioHelpLocalizedText;
  readonly tags: readonly StudioHelpLocalizedText[];
}

const text = (ko: string, en: string): StudioHelpLocalizedText => ({ ko, en });

export const STUDIO_HELP_CATEGORY_LABELS: Readonly<
  Record<StudioHelpCategory, StudioHelpLocalizedText>
> = Object.freeze({
  start: text("시작하기", "Get started"),
  draw: text("그리기 · 채색", "Draw and colour"),
  compose: text("컷 · 글자 · 소재", "Panels, lettering and assets"),
  organize: text("레이어 · 작업 관리", "Layers and workflow"),
  publish: text("내보내기 · 게시", "Export and publish"),
  recover: text("성능 · 복구", "Performance and recovery"),
});

export const STUDIO_HELP_ARTICLES: readonly StudioHelpArticle[] = Object.freeze([
  {
    id: "first-canvas",
    category: "start",
    title: text("첫 캔버스에서 바로 시작하기", "Start on your first canvas"),
    summary: text(
      "도구를 찾느라 흐름을 끊지 않고 선택·그리기·되돌리기·화면 맞춤까지 익힙니다.",
      "Learn select, draw, undo and fit-to-screen without breaking your flow.",
    ),
    keywords: ["처음", "초보", "새 프로젝트", "canvas", "beginner", "quick start"],
    readMinutes: 3,
    toolMatchers: ["select", "pen", "zoom", "hand"],
    steps: [
      text("왼쪽 도구 레일에서 선택(V)과 펜(B)의 위치를 확인합니다.", "Locate Select (V) and Pen (B) in the left tool rail."),
      text("펜으로 짧은 선을 긋고 실행취소(⌘/Ctrl+Z)와 다시실행을 한 번씩 확인합니다.", "Draw a short stroke, then try undo and redo once."),
      text("Space를 누른 채 드래그해 화면을 이동하고, 화면 맞춤으로 전체 원고를 다시 봅니다.", "Hold Space and drag to pan, then use Fit view to see the whole page."),
      text("F1 통합 검색에서 원하는 기능 이름을 입력해 메뉴 위치와 관련 명령을 찾습니다.", "Use F1 command search to find a feature, its menu location and related commands."),
    ],
  },
  {
    id: "navigate-canvas",
    category: "start",
    title: text("화면 이동·확대·회전을 빠르게 다루기", "Navigate, zoom and rotate quickly"),
    summary: text(
      "그림을 바꾸지 않고 시점만 안전하게 이동하는 기본 조작을 정리합니다.",
      "Move the view safely without changing artwork.",
    ),
    keywords: ["화면 이동", "핸드", "줌", "회전", "pan", "zoom", "rotate", "fit"],
    readMinutes: 2,
    toolMatchers: ["hand", "zoom", "rotate"],
    steps: [
      text("Space+드래그는 현재 도구를 바꾸지 않고 화면만 이동합니다.", "Space-drag pans without switching your active tool."),
      text("포인터 주변 확대는 ⌘/Ctrl+휠, 전체 보기 복귀는 화면 맞춤을 사용합니다.", "Use ⌘/Ctrl+wheel to zoom around the pointer and Fit view to return."),
      text("회전 보기는 원고를 회전시키지 않습니다. 내보내기 전 화면 리셋으로 확인합니다.", "Rotate view does not rotate the artwork. Reset the view before export to verify."),
    ],
  },
  {
    id: "clean-lines",
    category: "draw",
    title: text("선화가 떨리거나 끊길 때", "When line art wobbles or breaks"),
    summary: text(
      "필압·보정·브러시 크기·입력 장치를 순서대로 확인해 원인을 좁힙니다.",
      "Narrow the cause by checking pressure, stabilisation, size and input hardware in order.",
    ),
    keywords: ["선화", "필압", "보정", "떨림", "브러시", "stabilizer", "pressure", "stroke"],
    readMinutes: 4,
    toolMatchers: ["pen", "pixel", "brush", "eraser"],
    technicalSection: "diagnostics",
    steps: [
      text("같은 브러시로 천천히 선과 빠른 선을 각각 그어 입력 지연과 보정 차이를 구분합니다.", "Draw one slow and one fast stroke with the same brush to separate lag from stabilisation."),
      text("브러시 크기와 불투명도를 고정한 뒤 보정 값을 한 단계씩만 바꿉니다.", "Lock size and opacity, then change stabilisation one step at a time."),
      text("필압이 일정하게 0 또는 최대값이면 기기 · 브라우저 진단에서 포인터 기능을 확인합니다.", "If pressure stays at zero or maximum, inspect pointer support in Device diagnostics."),
      text("터치가 섞이면 애플리케이션 설정의 펜·터치 차단 옵션을 확인합니다.", "If touch input interferes, review pen and touch blocking in Application settings."),
    ],
  },
  {
    id: "fill-without-gaps",
    category: "draw",
    title: text("빈틈 없이 빠르게 채색하기", "Fill colour without leaks"),
    summary: text(
      "선의 틈, 참조 범위, 임계값을 분리해 채우기 실패를 빠르게 해결합니다.",
      "Separate line gaps, reference scope and tolerance to fix fill failures quickly.",
    ),
    keywords: ["채우기", "페인트 버킷", "틈", "참조 레이어", "fill", "paint bucket", "gap"],
    readMinutes: 4,
    toolMatchers: ["fill", "lasso-fill", "eyedropper"],
    steps: [
      text("선화 레이어와 색 레이어를 분리하고 색 레이어를 활성화합니다.", "Keep line art and colour on separate layers, then activate the colour layer."),
      text("작은 테스트 영역에서 참조 범위와 틈 닫기 값을 조절합니다.", "Tune reference scope and gap closing on a small test area."),
      text("복잡한 경계는 올가미 채우기로 먼저 큰 면을 만든 뒤 일반 채우기로 보완합니다.", "Use Lasso Fill for large complex regions, then regular Fill for corrections."),
      text("경계에 흰 테두리가 남으면 확장·임계값을 조금씩 올리고 100% 보기에서 확인합니다.", "If white halos remain, increase expansion or tolerance gradually and inspect at 100%."),
    ],
  },
  {
    id: "select-transform-safely",
    category: "organize",
    title: text("선택과 변형을 되돌리기 쉽게 사용하기", "Use selection and transform safely"),
    summary: text(
      "선택 범위·대상 레이어·변형 확정을 구분해 실수와 품질 손실을 줄입니다.",
      "Separate selection, target layer and transform commit to reduce mistakes and quality loss.",
    ),
    keywords: ["선택", "올가미", "변형", "크기", "회전", "selection", "lasso", "transform"],
    readMinutes: 3,
    toolMatchers: ["select", "lasso", "marquee", "transform", "crop"],
    steps: [
      text("먼저 레이어 패널에서 바꿀 대상을 확인한 뒤 선택 영역을 만듭니다.", "Confirm the target layer first, then create the selection."),
      text("변형 전 레이어 복제 또는 버전 저장으로 원본을 남깁니다.", "Duplicate the layer or save a version before transforming."),
      text("모서리 핸들로 크기를 조절하고 확정 전 확대해 선명도와 잘림을 확인합니다.", "Resize with corner handles and zoom in before committing to inspect sharpness and clipping."),
      text("작업이 끝나면 선택 해제(⌘/Ctrl+D)해 다음 입력이 선택 범위에 갇히지 않게 합니다.", "Deselect (⌘/Ctrl+D) so later edits are not trapped inside the selection."),
    ],
  },
  {
    id: "layer-workflow",
    category: "organize",
    title: text("레이어를 잃지 않는 작업 구조", "A layer structure you can trust"),
    summary: text(
      "선화·색·효과·글자를 역할별로 나누고 이름·그룹·잠금으로 사고를 예방합니다.",
      "Separate line, colour, effects and lettering, then prevent accidents with names, groups and locks.",
    ),
    keywords: ["레이어", "그룹", "잠금", "클리핑", "마스크", "layer", "group", "mask", "clipping"],
    readMinutes: 5,
    toolMatchers: ["layer", "mask"],
    steps: [
      text("레이어 이름을 역할+장면으로 정합니다. 예: 선화_인물A, 색_배경.", "Name layers by role and scene, such as Line_CharacterA or Colour_Background."),
      text("함께 움직일 레이어는 그룹화하고, 완성된 선화와 기준 레이어는 잠급니다.", "Group layers that move together and lock finished line art and reference layers."),
      text("직접 지우기보다 마스크와 비파괴 효과를 우선 사용합니다.", "Prefer masks and non-destructive effects over erasing source pixels."),
      text("합치기 전 그룹 복제 또는 버전 저장으로 편집 가능한 사본을 남깁니다.", "Before merging, keep an editable copy by duplicating the group or saving a version."),
    ],
  },
  {
    id: "panels-story-flow",
    category: "compose",
    title: text("컷과 스토리보드 흐름 점검하기", "Check panel and storyboard flow"),
    summary: text(
      "읽는 순서·시선 이동·컷 간격을 작은 화면과 전체 보기에서 함께 검수합니다.",
      "Review reading order, eye movement and panel spacing in both overview and small-screen views.",
    ),
    keywords: ["컷", "프레임", "스토리보드", "콘티", "panel", "frame", "storyboard", "webtoon"],
    readMinutes: 4,
    toolMatchers: ["frame", "storyboard", "panel"],
    steps: [
      text("스토리보드에서 장면 목적을 한 문장으로 적고 컷 순서를 먼저 확정합니다.", "Write each scene's purpose in one sentence and confirm panel order in the storyboard."),
      text("전체 보기에서 컷 크기와 여백 리듬을 비교합니다.", "Compare panel scale and spacing rhythm in overview."),
      text("모바일 폭으로 읽으며 대사→표정→행동의 시선 순서가 자연스러운지 확인합니다.", "Read at mobile width and check that dialogue, expression and action guide the eye naturally."),
      text("긴 컷은 정보 단위를 나누고, 강조 컷 앞뒤에는 의도적인 여백을 둡니다.", "Split overloaded long panels and use intentional space around emphasis panels."),
    ],
  },
  {
    id: "lettering-bubbles",
    category: "compose",
    title: text("말풍선과 대사를 읽기 쉽게 다듬기", "Make dialogue and balloons easier to read"),
    summary: text(
      "대사 길이·줄바꿈·꼬리 방향·안전 여백을 실제 독자 화면 기준으로 확인합니다.",
      "Check dialogue length, wrapping, tail direction and safe padding at real reader size.",
    ),
    keywords: ["말풍선", "대사", "텍스트", "폰트", "lettering", "bubble", "dialogue", "text"],
    readMinutes: 4,
    toolMatchers: ["text", "bubble", "lettering"],
    steps: [
      text("대사를 소리 내어 읽고 한 호흡이 너무 길면 두 풍선으로 나눕니다.", "Read the line aloud and split it when one breath is too long."),
      text("글자 크기보다 먼저 풍선 내부 여백과 자연스러운 줄바꿈을 맞춥니다.", "Set comfortable padding and line breaks before shrinking the font."),
      text("꼬리는 화자 쪽을 가리키되 얼굴과 중요한 동작을 가리지 않게 둡니다.", "Point the tail toward the speaker without covering faces or key action."),
      text("모바일 미리보기에서 최소 글자 크기와 대비를 확인합니다.", "Verify minimum type size and contrast in mobile preview."),
    ],
  },
  {
    id: "assets-reference-3d",
    category: "compose",
    title: text("소재·참고 이미지·3D를 보조선처럼 활용하기", "Use assets, references and 3D as guides"),
    summary: text(
      "참고 자료를 그대로 답습하지 않고 구도·비율·빛을 검증하는 보조 도구로 사용합니다.",
      "Use references to verify composition, proportion and light rather than copying them blindly.",
    ),
    keywords: ["소재", "참고 이미지", "3D", "포즈", "배경", "asset", "reference", "3d", "pose"],
    readMinutes: 4,
    toolMatchers: ["image", "reference", "3d", "mannequin", "background"],
    steps: [
      text("참고 이미지는 별도 참고 창에 두고 원고 레이어와 섞이지 않게 합니다.", "Keep references in the reference window so they do not mix with artwork layers."),
      text("3D는 카메라·원근·관절 비율을 정한 뒤 스케치용 기준으로 사용합니다.", "Set camera, perspective and joint proportions before using 3D as a sketch guide."),
      text("소재를 배치한 뒤 작품의 선 굵기·색·광원에 맞게 통일합니다.", "After placement, adapt assets to the work's line weight, palette and lighting."),
      text("게시 전 소재 라이선스와 원본 출처를 확인합니다.", "Check asset licensing and source attribution before publishing."),
    ],
  },
  {
    id: "save-version-safely",
    category: "organize",
    title: text("초안·버전·복구를 함께 준비하기", "Prepare drafts, versions and recovery"),
    summary: text(
      "저장 완료 표시만 믿지 않고 중요한 단계마다 이름 있는 복구 지점을 남깁니다.",
      "Do not rely on one save indicator; leave named recovery points at important milestones.",
    ),
    keywords: ["저장", "초안", "버전", "백업", "자동 저장", "save", "draft", "version", "backup"],
    readMinutes: 3,
    toolMatchers: ["save", "project", "history"],
    technicalSection: "recovery",
    steps: [
      text("콘티 완료·선화 완료·채색 완료처럼 되돌아갈 가치가 있는 지점에 버전을 남깁니다.", "Save versions at meaningful milestones such as storyboard, line art and colour complete."),
      text("큰 가져오기·필터·레이어 합치기 전에는 별도 버전을 만듭니다.", "Create a separate version before large imports, filters or layer merges."),
      text("브라우저 저장소 정리나 기기 변경 전에는 다운로드 가능한 백업을 확인합니다.", "Verify a downloadable backup before clearing browser storage or changing devices."),
      text("저장이 의심되면 새 작업을 이어가기 전에 복구 가이드에서 로컬 상태를 점검합니다.", "If a save looks uncertain, inspect local state in Recovery guide before continuing."),
    ],
  },
  {
    id: "collaboration-check",
    category: "organize",
    title: text("협업 중 충돌과 누락 줄이기", "Reduce conflicts during collaboration"),
    summary: text(
      "역할·작업 구역·동기화 확인 시점을 합의해 같은 대상을 동시에 덮어쓰는 일을 줄입니다.",
      "Agree on roles, work areas and sync checkpoints to avoid overwriting the same content.",
    ),
    keywords: ["협업", "동기화", "댓글", "커서", "충돌", "collaboration", "sync", "comment", "presence"],
    readMinutes: 3,
    toolMatchers: ["comment", "collaboration", "presence"],
    steps: [
      text("세션 시작 전에 담당 컷·레이어·검수 역할을 정합니다.", "Assign panels, layers and review roles before the session."),
      text("상대 커서만 보인다고 작업 내용까지 동기화됐다고 가정하지 않습니다.", "Do not assume artwork is synced just because another cursor is visible."),
      text("큰 변경 뒤에는 양쪽에서 동일한 레이어 수·최근 변경·저장 상태를 확인합니다.", "After major changes, compare layer count, recent edits and save state on both sides."),
      text("재현 가능한 누락은 버그 리포트 패키지와 함께 기록합니다.", "Record reproducible sync gaps with a bug report package."),
    ],
    technicalSection: "bug-report",
  },
  {
    id: "export-quality",
    category: "publish",
    title: text("내보내기 전에 품질과 용량 맞추기", "Balance export quality and file size"),
    summary: text(
      "플랫폼 규격·색·투명도·분할·용량을 원고 원본과 별도로 검수합니다.",
      "Review platform size, colour, transparency, slicing and file weight separately from the source document.",
    ),
    keywords: ["내보내기", "다운로드", "PNG", "JPEG", "해상도", "용량", "export", "download", "quality"],
    readMinutes: 5,
    toolMatchers: ["export", "download"],
    steps: [
      text("게시 플랫폼의 폭·높이·파일 형식·용량 제한을 먼저 확인합니다.", "Check the publishing platform's dimensions, format and file-size limits first."),
      text("투명 배경이 필요하면 PNG, 사진성 배경과 작은 용량이 우선이면 JPEG를 비교합니다.", "Compare PNG for transparency with JPEG when photographic content and smaller files matter."),
      text("분할 내보내기는 컷 경계와 말풍선을 가르지 않는지 확인합니다.", "Ensure sliced export does not cut through panels or balloons."),
      text("다운로드한 실제 파일을 새 탭과 모바일 화면에서 다시 엽니다.", "Open the downloaded file again in a new tab and on a mobile-sized screen."),
    ],
  },
  {
    id: "publish-checklist",
    category: "publish",
    title: text("게시 직전 5분 검수", "A five-minute pre-publish check"),
    summary: text(
      "오탈자·읽는 순서·잘림·색·라이선스·복구 가능성을 짧은 순서표로 확인합니다.",
      "Use a compact pass for spelling, reading order, clipping, colour, licenses and recovery.",
    ),
    keywords: ["게시", "검수", "오탈자", "미리보기", "라이선스", "publish", "review", "proofread"],
    readMinutes: 5,
    toolMatchers: ["publish", "preview"],
    steps: [
      text("모바일 미리보기에서 처음부터 끝까지 멈추지 않고 읽어 흐름을 확인합니다.", "Read from start to finish in mobile preview without editing to check flow."),
      text("대사·효과음·회차 정보의 오탈자와 잘림을 확대해 확인합니다.", "Zoom in to proof dialogue, sound effects, episode metadata and clipping."),
      text("소재·폰트·참고 자료의 사용 권한과 필요한 표기를 확인합니다.", "Verify rights and required attribution for assets, fonts and references."),
      text("최종 원본 버전과 게시용 내보내기 파일을 각각 보관합니다.", "Keep both the final editable version and the exported publishing files."),
    ],
  },
  {
    id: "performance-troubleshooting",
    category: "recover",
    title: text("느려짐·검은 화면·입력 지연을 진단하기", "Diagnose slowness, black canvas and input lag"),
    summary: text(
      "문서 문제와 브라우저·GPU·저장소 문제를 섞지 않고 증상을 재현합니다.",
      "Reproduce the symptom while separating document, browser, GPU and storage causes.",
    ),
    keywords: ["느림", "버벅임", "검은 화면", "GPU", "브라우저", "입력 지연", "slow", "lag", "black screen", "performance"],
    readMinutes: 4,
    toolMatchers: ["performance", "render"],
    technicalSection: "diagnostics",
    steps: [
      text("새 빈 문서에서도 같은 증상이 나는지 확인해 문서별 문제와 기기 문제를 구분합니다.", "Check a new empty document to separate document-specific issues from device issues."),
      text("다른 탭·화면 녹화·무거운 앱을 닫고 같은 동작을 다시 측정합니다.", "Close other tabs, screen recording and heavy apps, then repeat the same action."),
      text("기기 · 브라우저 진단에서 렌더 백엔드·브라우저 지원·저장소 상태를 수집합니다.", "Collect render backend, browser support and storage status in Device diagnostics."),
      text("재현 단계가 일정하면 버그 리포트 패키지를 만들어 함께 전달합니다.", "When the steps are repeatable, include a generated bug report package."),
    ],
  },
  {
    id: "recover-work",
    category: "recover",
    title: text("작업이 사라졌거나 저장이 의심될 때", "When work appears missing or unsaved"),
    summary: text(
      "새 저장으로 흔적을 덮기 전에 로컬 초안·복구 지점·브라우저 저장소를 안전한 순서로 확인합니다.",
      "Check local drafts, recovery points and browser storage before overwriting evidence with a new save.",
    ),
    keywords: ["복구", "사라짐", "저장 실패", "초안", "로컬", "recovery", "missing", "unsaved", "draft"],
    readMinutes: 4,
    toolMatchers: ["recovery", "save"],
    technicalSection: "recovery",
    steps: [
      text("같은 프로젝트에 새 저장을 반복하지 말고 현재 탭을 유지합니다.", "Keep the current tab open and avoid repeated saves to the same project."),
      text("복구 가이드에서 로컬 초안·프로젝트 저장소·공간 부족 신호를 순서대로 검사합니다.", "Use Recovery guide to inspect local drafts, project storage and low-space signals."),
      text("찾은 복구본은 원본을 덮지 않는 새 이름으로 먼저 엽니다.", "Open a recovered copy under a new name before replacing anything."),
      text("복구되지 않으면 발생 시각·마지막 성공 동작·브라우저 정보를 버그 리포트에 남깁니다.", "If recovery fails, record time, last successful action and browser details in a bug report."),
    ],
  },
  {
    id: "offline-work",
    category: "recover",
    title: text("네트워크가 불안정할 때 안전하게 작업하기", "Work safely on an unstable network"),
    summary: text(
      "로컬 편집 가능 여부와 서버 동기화 완료 여부를 구분하고 연결 복귀 뒤 충돌을 점검합니다.",
      "Distinguish local editing from server sync and check conflicts after reconnecting.",
    ),
    keywords: ["오프라인", "네트워크", "동기화", "연결", "offline", "network", "sync", "reconnect"],
    readMinutes: 3,
    toolMatchers: ["sync", "collaboration"],
    technicalSection: "recovery",
    steps: [
      text("연결이 끊기면 저장·협업 상태 표시를 먼저 확인하고 탭을 닫지 않습니다.", "When disconnected, inspect save and collaboration indicators and keep the tab open."),
      text("로컬에서 계속 편집한다면 큰 병합·삭제·프로젝트 전환은 연결 복귀 뒤로 미룹니다.", "If editing locally, postpone large merges, deletion and project switching until reconnect."),
      text("온라인 복귀 뒤 저장 완료와 협업 상대의 최신 상태가 일치하는지 확인합니다.", "After reconnecting, verify save completion and compare the latest state with collaborators."),
      text("반복되는 연결 문제는 기기 진단과 오류 저널을 포함한 버그 리포트로 남깁니다.", "For recurring network issues, include diagnostics and the error journal in a bug report."),
    ],
  },
]);

export const STUDIO_HELP_GUIDES: readonly StudioHelpGuide[] = Object.freeze([
  {
    id: "first-episode",
    title: text("첫 3컷 완성", "Finish your first three panels"),
    summary: text("빈 캔버스에서 컷·선화·채색·대사·내보내기까지 한 번 순환합니다.", "Complete one loop from blank canvas through panels, line, colour, dialogue and export."),
    outcome: text("읽을 수 있고 다시 편집 가능한 3컷 원고", "A readable, editable three-panel comic"),
    minutes: 35,
    steps: [
      { id: "canvas", articleId: "first-canvas", label: text("기본 조작 확인", "Learn core controls") },
      { id: "panels", articleId: "panels-story-flow", label: text("컷 순서 구성", "Build panel order") },
      { id: "lines", articleId: "clean-lines", label: text("선화 만들기", "Create line art") },
      { id: "lettering", articleId: "lettering-bubbles", label: text("대사 배치", "Place dialogue") },
      { id: "export", articleId: "export-quality", label: text("내보내기 검수", "Review export") },
    ],
  },
  {
    id: "clean-colour-workflow",
    title: text("깔끔한 선화·채색", "Clean line and colour workflow"),
    summary: text("브러시 입력부터 레이어 구조와 채우기 경계까지 품질 저하 원인을 줄입니다.", "Reduce quality loss from brush input through layer structure and fill boundaries."),
    outcome: text("수정 가능한 선화·색 분리 원고", "Editable artwork with separated line and colour"),
    minutes: 25,
    steps: [
      { id: "line", articleId: "clean-lines", label: text("선 입력 안정화", "Stabilise line input") },
      { id: "layers", articleId: "layer-workflow", label: text("레이어 역할 분리", "Separate layer roles") },
      { id: "fill", articleId: "fill-without-gaps", label: text("틈 없는 채색", "Fill without leaks") },
      { id: "transform", articleId: "select-transform-safely", label: text("비파괴 수정", "Make safe adjustments") },
    ],
  },
  {
    id: "tablet-workflow",
    title: text("태블릿·펜 작업 안정화", "Stabilise a tablet and pen workflow"),
    summary: text("화면 이동, 필압, 터치 간섭, 오프라인 상황을 먼저 점검합니다.", "Check navigation, pressure, touch interference and offline behaviour first."),
    outcome: text("입력 실수가 적고 복구 가능한 이동 작업 환경", "A mobile workflow with fewer input mistakes and safer recovery"),
    minutes: 18,
    steps: [
      { id: "navigate", articleId: "navigate-canvas", label: text("제스처 대신 안전한 화면 조작 확인", "Confirm safe view controls") },
      { id: "input", articleId: "clean-lines", label: text("필압·보정 확인", "Check pressure and stabilisation") },
      { id: "offline", articleId: "offline-work", label: text("연결 끊김 대비", "Prepare for disconnection") },
      { id: "versions", articleId: "save-version-safely", label: text("복구 지점 만들기", "Create recovery points") },
    ],
  },
  {
    id: "publish-safely",
    title: text("안전하게 게시하기", "Publish safely"),
    summary: text("원본 보존, 모바일 검수, 라이선스, 출력 파일을 한 체크리스트로 묶습니다.", "Combine source preservation, mobile review, licensing and output checks."),
    outcome: text("원본과 게시본이 모두 남는 검수 완료 패키지", "A reviewed package containing both editable source and publishing files"),
    minutes: 15,
    steps: [
      { id: "version", articleId: "save-version-safely", label: text("최종 원본 버전 저장", "Save the final editable version") },
      { id: "proof", articleId: "publish-checklist", label: text("5분 최종 검수", "Run the five-minute review") },
      { id: "export", articleId: "export-quality", label: text("실제 파일 재확인", "Re-open the exported files") },
    ],
  },
]);

export const STUDIO_HELP_UPDATES: readonly StudioHelpUpdate[] = Object.freeze([
  {
    id: "help-hub-v2",
    date: "2026-09-09",
    title: text("통합 도움말 홈", "Unified help home"),
    summary: text("검색·현재 도구 추천·학습 경로·문제 해결을 작업 화면 안에서 한 번에 찾습니다.", "Find search, current-tool recommendations, guided learning and troubleshooting in one surface."),
    tags: [text("도움말", "Help"), text("탐색", "Discovery")],
  },
  {
    id: "guided-progress",
    date: "2026-09-09",
    title: text("기기 안에 저장되는 단계별 체크리스트", "Device-local guided checklists"),
    summary: text("완료한 단계와 북마크를 계정 전송 없이 현재 브라우저에 저장합니다.", "Keep completed steps and bookmarks in the current browser without sending account data."),
    tags: [text("학습", "Learning"), text("개인화", "Personalisation")],
  },
  {
    id: "offline-support",
    date: "2026-09-09",
    title: text("오프라인 상태 안내", "Offline-aware guidance"),
    summary: text("연결이 끊기면 외부 문서보다 복구·로컬 작업 안전 수칙을 먼저 제안합니다.", "When disconnected, prioritise recovery and local-work safety over external documentation."),
    tags: [text("복구", "Recovery"), text("신뢰성", "Reliability")],
  },
]);

export function studioHelpText(value: StudioHelpLocalizedText, locale: StudioHelpLocale): string {
  return value[locale];
}

export function findStudioHelpArticle(id: string | null | undefined): StudioHelpArticle | null {
  if (!id) return null;
  return STUDIO_HELP_ARTICLES.find((article) => article.id === id) ?? null;
}

function articleSearchFields(article: StudioHelpArticle): readonly string[] {
  return [
    article.title.ko,
    article.title.en,
    article.summary.ko,
    article.summary.en,
    STUDIO_HELP_CATEGORY_LABELS[article.category].ko,
    STUDIO_HELP_CATEGORY_LABELS[article.category].en,
    ...article.keywords,
    ...article.steps.flatMap((step) => [step.ko, step.en]),
  ];
}

function searchScore(article: StudioHelpArticle, query: string, locale: StudioHelpLocale): number {
  const tokens = tokenizeStudioSearchQuery(query);
  if (tokens.length === 0) return 0;
  const title = normalizeStudioSearchText(studioHelpText(article.title, locale));
  const summary = normalizeStudioSearchText(studioHelpText(article.summary, locale));
  const keywords = article.keywords.map(normalizeStudioSearchText);
  const normalizedQuery = normalizeStudioSearchText(query);
  let score = title === normalizedQuery ? 120 : title.startsWith(normalizedQuery) ? 70 : 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 18;
    if (summary.includes(token)) score += 8;
    if (keywords.some((keyword) => keyword.includes(token))) score += 12;
  }
  return score;
}

export function searchStudioHelpArticles(
  query: string,
  locale: StudioHelpLocale,
): StudioHelpArticle[] {
  if (tokenizeStudioSearchQuery(query).length === 0) return [...STUDIO_HELP_ARTICLES];
  return STUDIO_HELP_ARTICLES
    .filter((article) => studioSearchTextMatches(query, articleSearchFields(article)))
    .map((article) => ({ article, score: searchScore(article, query, locale) }))
    .sort((left, right) => right.score - left.score || left.article.readMinutes - right.article.readMinutes)
    .map(({ article }) => article);
}

export function recommendStudioHelpArticles(input: {
  readonly toolCommandId?: string | null;
  readonly online?: boolean;
  readonly limit?: number;
}): StudioHelpArticle[] {
  const tool = normalizeStudioSearchText(input.toolCommandId ?? "");
  const limit = Math.max(1, input.limit ?? 4);
  const scores = STUDIO_HELP_ARTICLES.map((article, index) => {
    let score = Math.max(0, 10 - index * 0.2);
    if (tool && article.toolMatchers.some((matcher) => tool.includes(normalizeStudioSearchText(matcher)))) {
      score += 100;
    }
    if (input.online === false && (article.id === "offline-work" || article.id === "recover-work")) {
      score += 140;
    }
    return { article, score };
  });
  return scores
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ article }) => article);
}

export function validateStudioHelpKnowledge(): readonly string[] {
  const issues: string[] = [];
  const articleIds = new Set<string>();
  for (const article of STUDIO_HELP_ARTICLES) {
    if (articleIds.has(article.id)) issues.push(`duplicate article id: ${article.id}`);
    articleIds.add(article.id);
    if (article.steps.length === 0) issues.push(`article without steps: ${article.id}`);
  }
  const guideIds = new Set<string>();
  for (const guide of STUDIO_HELP_GUIDES) {
    if (guideIds.has(guide.id)) issues.push(`duplicate guide id: ${guide.id}`);
    guideIds.add(guide.id);
    const stepIds = new Set<string>();
    for (const step of guide.steps) {
      if (stepIds.has(step.id)) issues.push(`duplicate guide step: ${guide.id}/${step.id}`);
      stepIds.add(step.id);
      if (!articleIds.has(step.articleId)) issues.push(`missing article: ${guide.id}/${step.articleId}`);
    }
  }
  return issues;
}
