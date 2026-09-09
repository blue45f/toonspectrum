import type {
  CreatorLaunchGoal,
  CreatorLaunchPace,
} from "@/shared/lib/creator-continuity";

export interface CreatorLaunchpadCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly goalLabel: string;
  readonly paceLabel: string;
  readonly recommendation: string;
  readonly start: string;
  readonly share: string;
  readonly reset: string;
  readonly saved: string;
  readonly privacy: string;
  readonly recentEyebrow: string;
  readonly recentTitle: string;
  readonly recentEmpty: string;
  readonly recentClear: string;
  readonly installEyebrow: string;
  readonly installTitle: string;
  readonly installBody: string;
  readonly install: string;
  readonly installReady: string;
  readonly installed: string;
  readonly installHelp: string;
  readonly installAccepted: string;
  readonly installDismissed: string;
  readonly installUnavailable: string;
  readonly shareDone: string;
  readonly shareFailed: string;
  readonly online: string;
  readonly offline: string;
  readonly offlineReady: string;
  readonly updateReady: string;
  readonly goals: Readonly<Record<CreatorLaunchGoal, {
    readonly label: string;
    readonly description: string;
    readonly result: string;
    readonly steps: readonly [string, string, string];
  }>>;
  readonly paces: Readonly<Record<CreatorLaunchPace, {
    readonly label: string;
    readonly description: string;
  }>>;
}

export const CREATOR_LAUNCHPAD_COPY: Record<"ko" | "en", CreatorLaunchpadCopy> = {
  ko: {
    eyebrow: "CREATOR LAUNCHPAD",
    title: "당신의 다음 작업을 기억하고,\n가장 빠른 시작점으로.",
    body: "하고 싶은 일과 작업 호흡을 고르면 알맞은 작업 공간, 준비 순서와 최근 흐름을 한곳에서 이어줍니다.",
    goalLabel: "무엇을 만들고 싶나요?",
    paceLabel: "이번 작업의 호흡은 어떤가요?",
    recommendation: "추천 시작점",
    start: "이 계획으로 시작하기",
    share: "시작 링크 공유",
    reset: "선택 초기화",
    saved: "이 기기에서 선택을 기억합니다.",
    privacy: "작품 내용이나 문서 ID는 저장하지 않고, 허용된 메뉴 경로와 시작 방식만 보관합니다.",
    recentEyebrow: "CONTINUE CREATING",
    recentTitle: "최근 흐름 이어가기",
    recentEmpty: "아직 기록된 창작 흐름이 없습니다. 첫 작업을 시작하면 여기에 안전한 바로가기가 생깁니다.",
    recentClear: "최근 기록 지우기",
    installEyebrow: "APP READY",
    installTitle: "더 빠르게 툰스튜디오 열기",
    installBody: "지원되는 브라우저에서는 홈 화면이나 앱 목록에 설치하고, 서비스 워커 상태와 온라인 연결을 함께 확인할 수 있습니다.",
    install: "앱으로 설치",
    installReady: "설치 준비됨",
    installed: "앱으로 실행 중",
    installHelp: "설치 방법 보기",
    installAccepted: "설치 요청을 완료했습니다.",
    installDismissed: "설치를 나중으로 미뤘습니다. 브라우저 메뉴에서도 다시 설치할 수 있습니다.",
    installUnavailable: "브라우저 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 사용해 주세요.",
    shareDone: "시작 링크를 공유하거나 복사했습니다.",
    shareFailed: "링크를 공유하지 못했습니다. 주소창의 링크를 사용할 수 있습니다.",
    online: "온라인",
    offline: "오프라인",
    offlineReady: "오프라인 준비 완료",
    updateReady: "새 버전 준비됨",
    goals: {
      draw: { label: "자유롭게 그리기", description: "스케치·표지·한 장면부터", result: "드로잉 캔버스", steps: ["캔버스 규격 선택", "브러시와 레이어 준비", "첫 선과 색 기록"] },
      comic: { label: "컷으로 이야기하기", description: "4컷부터 세로 웹툰까지", result: "컷툰 작업 공간", steps: ["컷 흐름 정하기", "장면과 대사 배치", "읽기 순서 점검"] },
      character: { label: "캐릭터와 포즈", description: "비율·표정·구도를 빠르게", result: "캐릭터 셰이퍼", steps: ["체형과 실루엣 선택", "표정·포즈 조정", "장면 구도로 내보내기"] },
      materials: { label: "자료와 재료 모으기", description: "배경·소품·레퍼런스부터", result: "에셋·리서치 데스크", steps: ["장면 목적 정리", "이용 조건과 출처 확인", "작업 보드에 연결"] },
    },
    paces: {
      quick: { label: "빠른 시작", description: "10분 안에 첫 결과 보기" },
      project: { label: "프로젝트", description: "연재·완성 작업으로 이어가기" },
    },
  },
  en: {
    eyebrow: "CREATOR LAUNCHPAD",
    title: "Remember your next move,\nand start from the right place.",
    body: "Choose what you want to make and how deep this session should go. ToonStudio connects the workspace, preparation steps and your recent flow.",
    goalLabel: "What would you like to make?",
    paceLabel: "How deep is this session?",
    recommendation: "Recommended starting point",
    start: "Start with this plan",
    share: "Share start link",
    reset: "Reset choices",
    saved: "Your choices stay on this device.",
    privacy: "No artwork or document IDs are stored—only allow-listed destinations and launch preferences.",
    recentEyebrow: "CONTINUE CREATING",
    recentTitle: "Continue your recent flow",
    recentEmpty: "There is no recent creative flow yet. Safe shortcuts appear here after your first visit.",
    recentClear: "Clear recent history",
    installEyebrow: "APP READY",
    installTitle: "Open ToonStudio faster",
    installBody: "Install from supported browsers and see service-worker and connection readiness in one place.",
    install: "Install app",
    installReady: "Ready to install",
    installed: "Running as an app",
    installHelp: "View install help",
    installAccepted: "The install request was accepted.",
    installDismissed: "Installation was postponed. You can retry from your browser menu.",
    installUnavailable: "Use Install app or Add to Home Screen from your browser menu.",
    shareDone: "The start link was shared or copied.",
    shareFailed: "The link could not be shared. You can still use the address bar.",
    online: "Online",
    offline: "Offline",
    offlineReady: "Offline ready",
    updateReady: "Update ready",
    goals: {
      draw: { label: "Draw freely", description: "Sketches, covers and single scenes", result: "Drawing canvas", steps: ["Choose a canvas format", "Prepare brushes and layers", "Capture the first line and color"] },
      comic: { label: "Tell it in panels", description: "From four panels to vertical comics", result: "Comic workspace", steps: ["Set the panel rhythm", "Place scenes and dialogue", "Review the reading order"] },
      character: { label: "Shape a character", description: "Proportion, expression and pose", result: "Character shaper", steps: ["Choose body and silhouette", "Adjust expression and pose", "Send the composition to a scene"] },
      materials: { label: "Gather materials", description: "Backgrounds, props and references", result: "Asset and research desk", steps: ["Define the scene need", "Check rights and sources", "Connect it to the work board"] },
    },
    paces: {
      quick: { label: "Quick start", description: "See a first result in ten minutes" },
      project: { label: "Project mode", description: "Continue toward a finished or serialized work" },
    },
  },
};
