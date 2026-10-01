import type { LocalizedText } from "./engineering-story-content";

/**
 * 세미나 기본 발표(30분) 원본 데이터.
 *
 * - 모든 기술 주장은 저장소의 실제 파일·설정으로 확인한 것만 쓴다(`evidence` 경로).
 * - 상태(운영/설정/실험)는 슬라이드가 아니라 `chapterId`가 가리키는 기술 스토리 챕터가 소유한다.
 * - 구간 시간 예산은 슬라이드별 `seconds`의 합으로만 계산한다(중복 원본 금지).
 * - 저장소 규모 수치는 `TALK_FACTS_REVIEWED_AT` 시점에 git으로 센 값이며, 추정치를 쓰지 않는다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export const TALK_FACTS_REVIEWED_AT = "2026-09-30";

export type TalkSectionId =
  | "opening"
  | "product"
  | "architecture"
  | "core"
  | "quality"
  | "operations"
  | "lessons"
  | "qa";

export interface TalkSection {
  readonly id: TalkSectionId;
  readonly title: LocalizedText;
}

export type TalkSlideLayout =
  | "cover"
  | "agenda"
  | "statement"
  | "modules"
  | "demo"
  | "diagram"
  | "tech"
  | "metrics"
  | "lessons"
  | "qa";

export type TalkModuleIcon = "canvas" | "character" | "space" | "collab" | "ai" | "publish";

export interface TalkModule {
  readonly id: string;
  readonly icon: TalkModuleIcon;
  readonly title: LocalizedText;
  readonly body: LocalizedText;
  readonly href?: string;
}

export interface TalkDemoStep {
  readonly href: string;
  readonly action: LocalizedText;
  readonly expected: LocalizedText;
  readonly fallback: LocalizedText;
}

export interface TalkFact {
  /** 숫자·설정값은 문자열 그대로, 말로 된 값은 번역 쌍으로 둔다. */
  readonly value: string | LocalizedText;
  readonly label: LocalizedText;
}

export interface TalkLink {
  readonly href: string;
  readonly label: LocalizedText;
}

/** 슬라이드에 곁들이는 브랜드 콘셉트 아트. 실제 편집 화면이 아니라는 표기를 항상 함께 보여준다. */
export interface TalkArt {
  readonly src: string;
  readonly alt: LocalizedText;
}

export interface TalkSlide {
  readonly id: string;
  readonly section: TalkSectionId;
  readonly layout: TalkSlideLayout;
  readonly eyebrow: LocalizedText;
  readonly title: LocalizedText;
  readonly lead: LocalizedText;
  readonly points: readonly LocalizedText[];
  /** 발표자가 읽는 대본. 청중 화면에는 나오지 않는다. */
  readonly notes: LocalizedText;
  /** 계획한 발표 시간(초). 구간 예산은 이 값의 합이다. */
  readonly seconds: number;
  readonly flow?: readonly LocalizedText[];
  readonly stack?: readonly string[];
  readonly facts?: readonly TalkFact[];
  readonly modules?: readonly TalkModule[];
  readonly demoSteps?: readonly TalkDemoStep[];
  readonly links?: readonly TalkLink[];
  readonly art?: TalkArt;
  readonly question?: LocalizedText;
  readonly chapterId?: string;
  /** 슬라이드에 현재 상태 배지로 보여줄 기술 스토리 챕터. 상태 값은 챕터 데이터가 소유한다. */
  readonly statusChapterIds?: readonly string[];
  readonly evidence?: readonly string[];
}

export const TALK_SECTIONS = [
  { id: "opening", title: t("문제 정의", "The problem") },
  { id: "product", title: t("제품과 데모 동선", "Product and demo route") },
  { id: "architecture", title: t("전체 아키텍처", "Architecture") },
  { id: "core", title: t("핵심 기술", "Core technology") },
  { id: "quality", title: t("품질과 검증", "Quality and verification") },
  { id: "operations", title: t("운영과 비용", "Operations and cost") },
  { id: "lessons", title: t("배운 점과 한계", "Lessons and limits") },
  { id: "qa", title: t("질의응답", "Q&A") },
] as const satisfies readonly TalkSection[];

export const TALK_SLIDES = [
  {
    id: "talk-cover",
    section: "opening",
    layout: "cover",
    eyebrow: t("TOONSTUDIO 기술 세미나", "TOONSTUDIO ENGINEERING SEMINAR"),
    title: t("브라우저 하나로 웹툰을 그리고, 함께 만들기까지", "Drawing and co-creating webtoons in one browser tab"),
    lead: t(
      "드로잉·로컬 저장·실시간 협업·가상 스튜디오·3D·AI를 하나의 제작 흐름으로 연결한 과정을 코드 근거와 함께 공유합니다.",
      "How drawing, local-first storage, realtime collaboration, a virtual studio, 3D and AI were connected into one production flow, with code evidence.",
    ),
    points: [
      t("30분 발표 + 질의응답", "30-minute talk + Q&A"),
      t("실제 코드·설정으로 확인한 사실만", "Only facts verified in code and config"),
      t("운영 중·설정 필요·실험을 구분", "Live, configured and experimental kept apart"),
    ],
    art: {
      src: "/brand/illustrated-20260928/hero-640.webp",
      alt: t("브랜드 콘셉트 아트: 네온 도시의 웹툰 주인공", "Brand concept art: a webtoon heroine in a neon city"),
    },
    notes: t(
      "인사와 함께 자기소개를 짧게 합니다. 오늘 30분 동안 ‘브라우저가 창작 작업을 어디까지 지켜줄 수 있는가’를 한 제품의 실제 구현으로 보여준다고 약속합니다.\n모든 기술 주장은 저장소의 파일과 설정으로 확인한 것이며, 아직 실험 중인 기능은 실험이라고 말하겠다고 먼저 밝혀 신뢰를 얻습니다.",
      "Introduce yourself briefly. Promise that the next 30 minutes show, through one real product, how far a browser can protect creative work.\nState up front that every claim is backed by repository files and configuration, and that experimental features will be called experimental.",
    ),
    seconds: 45,
  },
  {
    id: "talk-agenda",
    section: "opening",
    layout: "agenda",
    eyebrow: t("오늘의 순서", "TODAY'S ROUTE"),
    title: t("문제에서 시작해 한계로 끝나는 30분", "30 minutes from the problem to the limits"),
    lead: t(
      "기술 목록을 읽지 않고, 한 컷이 만들어지는 흐름을 따라 필요한 기술을 설명합니다.",
      "Instead of reading a technology list, we follow one panel being made and explain the technology it needs.",
    ),
    points: [],
    notes: t(
      "화면의 구간과 시간을 가리키며 전체 흐름을 20초 안에 설명합니다. 데모는 제품 구간에서 한 번만 하고, 나머지 구간에서는 다이어그램과 코드 근거로 설명한다고 알립니다.\n질문은 마지막 질의응답 구간에서 받되, 용어가 막히면 바로 손을 들어 달라고 요청합니다.",
      "Point at the sections and timings and explain the route in 20 seconds. Say the live demo happens once in the product section; the rest uses diagrams and code evidence.\nTake questions at the end, but invite the audience to raise a hand immediately if a term is unclear.",
    ),
    seconds: 45,
  },
  {
    id: "talk-problem",
    section: "opening",
    layout: "statement",
    eyebrow: t("01 · 문제 정의", "01 · THE PROBLEM"),
    title: t("웹툰 한 화는 여러 도구를 거치며 맥락을 잃습니다", "One webtoon episode loses context across many tools"),
    lead: t(
      "대본·콘티·드로잉·3D 밑그림·검수·연재가 서로 다른 도구와 파일에 흩어지면, 수정할 때마다 어느 버전이 원본인지부터 다시 확인해야 합니다.",
      "When script, boards, drawing, 3D underdrawing, review and release live in different tools and files, every revision starts by asking which version is the source.",
    ),
    points: [
      t("도구를 옮길 때마다 레이어·버전·의도가 끊깁니다", "Layers, versions and intent break at every tool handoff"),
      t("함께 작업하면 ‘누가 무엇을 확정했는가’가 흐려집니다", "In teams, who committed what becomes unclear"),
      t("설치·라이선스·고사양 장비가 시작의 장벽이 됩니다", "Installs, licenses and high-end hardware block the first step"),
    ],
    question: t("그리던 파일을 다른 도구로 옮기다 레이어를 잃은 적 있으신가요?", "Have you ever lost layers moving a file between tools?"),
    art: {
      src: "/brand/illustrated-20260928/storyboard-640.webp",
      alt: t("브랜드 콘셉트 아트: 흑백 콘티 예시", "Brand concept art: a monochrome storyboard example"),
    },
    notes: t(
      "청중에게 질문을 던지고 손을 들게 합니다. 수치로 과장하지 말고, 경험으로 공감을 만듭니다.\n핵심 문장: ‘툰스튜디오는 모든 전문 프로그램을 대체했다는 이야기가 아니라, 브라우저 안에서 작업의 연결을 어디까지 책임질 수 있는지 보여주는 사례입니다.’",
      "Ask the question and let people raise hands. Build empathy from experience rather than exaggerated numbers.\nKey line: ‘ToonStudio does not claim to replace every professional tool; it shows how far a browser can take responsibility for keeping work connected.’",
    ),
    chapterId: "product-intent",
    evidence: ["apps/web/src/app/routes", "PRODUCT.md"],
    seconds: 90,
  },
  {
    id: "talk-product",
    section: "product",
    layout: "modules",
    eyebrow: t("02 · 제품 한 장 요약", "02 · THE PRODUCT ON ONE PAGE"),
    title: t("ToonStudio: 브라우저 안의 웹툰 제작실", "ToonStudio: a webtoon studio inside the browser"),
    lead: t(
      "기획부터 발행까지 한 프로젝트 안에서 이어지도록 여섯 개 작업 공간을 연결했습니다.",
      "Six workspaces are connected so a project flows from planning to publishing in one place.",
    ),
    points: [],
    modules: [
      { id: "canvas", icon: "canvas", title: t("캔버스 편집기", "Canvas editor"), body: t("브러시·레이어·컷·말풍선으로 원고 작업", "Brushes, layers, panels and balloons"), href: "/studio/new" },
      { id: "character", icon: "character", title: t("캐릭터 셰이퍼", "Character shaper"), body: t("3D 체형·포즈로 그리기 위한 밑그림", "3D body and pose as underdrawing"), href: "/studio/assets/characters/new" },
      { id: "space", icon: "space", title: t("가상 스튜디오", "Virtual studio"), body: t("아바타로 걷고 만나는 2D 협업 공간", "A 2D space to walk and meet as avatars"), href: "/studio/space" },
      { id: "collab", icon: "collab", title: t("실시간 협업", "Realtime collaboration"), body: t("같은 문서 편집·접속 상태·근접 허들", "Shared editing, presence and huddles") },
      { id: "ai", icon: "ai", title: t("AI 보조", "AI assistance"), body: t("제안은 AI, 확정은 사람", "AI proposes, people decide") },
      { id: "publish", icon: "publish", title: t("발행·공유", "Publish and share"), body: t("내보내기·공유 링크·미리보기", "Export, share links and previews") },
    ],
    notes: t(
      "여섯 공간을 왼쪽 위부터 한 문장씩 소개합니다. 중요한 점은 각각이 별도 앱이 아니라 같은 프로젝트·권한·저장 계약을 공유한다는 것입니다.\n‘오늘 기술 이야기는 이 여섯 공간이 서로 망가뜨리지 않고 연결되게 만든 방법입니다’로 다음 슬라이드로 넘어갑니다.",
      "Introduce the six spaces one sentence each, starting top-left. The key point: they are not separate apps; they share one project, permission and storage contract.\nTransition: ‘Today’s engineering story is how these six spaces connect without breaking each other.’",
    ),
    chapterId: "product-intent",
    evidence: ["apps/web/src/domains/creator/studio-route-registry.ts", "apps/web/src/app/routes/groups/creator.routes.tsx"],
    seconds: 75,
  },
  {
    id: "talk-demo",
    section: "product",
    layout: "demo",
    eyebrow: t("02 · 데모 동선", "02 · DEMO ROUTE"),
    title: t("한 컷이 만들어지는 라이브 데모", "Live demo: one panel being made"),
    lead: t(
      "이 순서로 시연하고, 한 단계가 실패하면 대체 화면으로 넘어가 무엇까지 확인됐는지 말합니다.",
      "Follow this order; if a step fails, switch to its fallback and state exactly what was verified.",
    ),
    points: [],
    demoSteps: [
      {
        href: "/studio/new",
        action: t("새 작품 만들기에서 결과물 형식 고르기", "Pick an output format in Create new"),
        expected: t("형식을 고르면 작품 구조와 작업실이 함께 준비됩니다", "Choosing a format prepares the work structure and workspace"),
        fallback: t("제품 투어 영상의 제작 시작 장면으로 대체", "Use the getting-started chapter of the product tour"),
      },
      {
        href: "/studio",
        action: t("선을 그린 뒤 새로고침해 복구 확인", "Draw a few strokes, reload and confirm recovery"),
        expected: t("브라우저 로컬 저장(OPFS)에서 작업이 돌아옵니다", "Work returns from browser-local storage (OPFS)"),
        fallback: t("로컬 우선 저장 슬라이드로 설명을 이어가기", "Continue with the local-first storage slide"),
      },
      {
        href: "/studio/assets/characters/new",
        action: t("캐릭터 셰이퍼에서 체형·포즈 조정", "Adjust body and pose in the character shaper"),
        expected: t("3D 뷰포트에서 캐릭터가 바로 반응합니다", "The character reacts instantly in the 3D viewport"),
        fallback: t("기술 스토리의 3D 챕터로 대체", "Use the 3D chapter of the engineering story"),
      },
      {
        href: "/studio/space",
        action: t("가상 스튜디오에 입장해 이동하기", "Enter the virtual studio and walk around"),
        expected: t("아바타가 걷고, 가까워지면 대화 힌트가 뜹니다", "The avatar walks; approaching others shows a chat hint"),
        fallback: t("가상 스튜디오 슬라이드의 흐름도로 설명", "Explain with the virtual studio flow slide"),
      },
    ],
    notes: t(
      "데모는 새 탭에서 미리 열어 둡니다. 각 단계는 40초 이내로 끝내고, 실패하면 30초 안에 대체 화면으로 넘어갑니다.\n데모 중에는 기능보다 ‘형식을 고르면 작업실이 준비됨’, ‘새로고침해도 남는 작업’, ‘3D가 그리기 재료가 됨’, ‘공간에서 만남’이라는 네 가지 관찰 포인트만 말합니다.\n로그인 전에도 탐색과 로컬 작업은 바로 할 수 있다는 점을 강조하되, 협업 기능은 서버 연결이 필요하다는 점도 함께 말합니다.",
      "Pre-open each demo in its own tab. Keep each step under 40 seconds and switch to the fallback within 30 seconds on failure.\nDuring the demo, narrate only four observations: a format prepares the workspace, work survives reloads, 3D becomes drawing material, and people meet in space.\nStress that browsing and local work are available before sign-in, and be clear that collaboration features do need a server connection.",
    ),
    chapterId: "storage",
    evidence: ["apps/web/src/domains/creator/studio-opfs-filesystem.ts", "scripts/verify-studio-autosave-opfs-session.mts"],
    seconds: 165,
  },
  {
    id: "talk-architecture",
    section: "architecture",
    layout: "diagram",
    eyebrow: t("03 · 전체 아키텍처", "03 · ARCHITECTURE"),
    title: t("원본은 기기에, 원장은 서버에, 실시간은 엣지에", "Sources on the device, ledgers on the server, realtime at the edge"),
    lead: t(
      "브라우저·Cloudflare·Render·PostgreSQL이 각자 한 가지 권위만 가지도록 나눴습니다.",
      "Browser, Cloudflare, Render and PostgreSQL each own exactly one kind of authority.",
    ),
    points: [],
    notes: t(
      "왼쪽 브라우저부터 설명합니다. 그림 원본과 무거운 계산은 사용자 기기(OPFS·Worker·WASM)에 있습니다.\n가운데 Cloudflare는 정적 SPA를 직접 제공하고, API·Socket.IO 경로만 Render의 NestJS Core API로 전달합니다. Durable Objects는 접속 상태와 시그널링 같은 임시 실시간 상태를 맡습니다.\n오른쪽 Core API는 인증·권한·원장 트랜잭션을, PostgreSQL(Neon)은 동적 데이터와 마이그레이션 원장을 맡습니다. 음성·영상은 브라우저 사이 WebRTC로 직접 연결됩니다.",
      "Start on the left: artwork sources and heavy computation live on the user's device (OPFS, Workers, WASM).\nIn the middle, Cloudflare serves the static SPA directly and forwards only API and Socket.IO paths to the NestJS Core API on Render. Durable Objects hold transient realtime state such as presence and signaling.\nOn the right, the Core API owns authentication, permissions and ledger transactions, and PostgreSQL (Neon) holds dynamic data and the migration ledger. Voice and video connect browser to browser over WebRTC.",
    ),
    chapterId: "architecture",
    evidence: ["DEPLOY.md", "render.yaml", "deploy/cloudflare-realtime/wrangler.jsonc", "apps/api/package.json"],
    seconds: 120,
  },
  {
    id: "talk-authority",
    section: "architecture",
    layout: "statement",
    eyebrow: t("03 · 설계 원칙", "03 · DESIGN PRINCIPLE"),
    title: t("모든 데이터에는 주인이 하나뿐입니다", "Every piece of data has exactly one owner"),
    lead: t(
      "한 공급자가 다른 공급자의 전체 폴백이 되지 않도록, 작업 종류마다 권위를 하나로 정했습니다.",
      "No provider silently becomes a full fallback for another; each workload has one authority.",
    ),
    points: [
      t("작품 원본(레이어·타일) → 사용자 기기의 OPFS", "Artwork sources (layers, tiles) → OPFS on the user's device"),
      t("계정·권한·거래 원장 → Core API + PostgreSQL", "Accounts, permissions, ledgers → Core API + PostgreSQL"),
      t("접속 상태·시그널링 → Durable Objects(임시 상태)", "Presence and signaling → Durable Objects (transient)"),
      t("음성·영상 → 브라우저 간 WebRTC, 메모리 전용 세션", "Voice and video → browser-to-browser WebRTC, memory-only sessions"),
    ],
    notes: t(
      "이 원칙 하나가 협업·오프라인·AI가 서로를 망가뜨리지 않게 만든 핵심이라고 말합니다.\n예시: 서버가 잠들어도(Render 무료 플랜) 그림은 계속 그려지고, 실시간 서버가 재시작돼도 원본은 기기에 남습니다.",
      "Say this single principle is what keeps collaboration, offline work and AI from breaking each other.\nExample: when the server sleeps (Render free plan) drawing continues; when the realtime server restarts, sources stay on the device.",
    ),
    chapterId: "infrastructure",
    evidence: ["DEPLOY.md", "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts"],
    seconds: 60,
  },
  {
    id: "talk-drawing",
    section: "core",
    layout: "tech",
    eyebrow: t("04 · 드로잉 캔버스·브러시 엔진", "04 · CANVAS AND BRUSH ENGINE"),
    title: t("손의 움직임이 문서의 획이 되기까지", "From a hand movement to a document stroke"),
    lead: t(
      "포인터 입력을 바로 픽셀로 칠하지 않고, 보정·경로·재료·합성·타일 커밋 단계로 나눕니다.",
      "Pointer input is not painted straight to pixels; it passes through smoothing, path, material, compositing and tile commit.",
    ),
    flow: [
      t("포인터 샘플(압력·기울기)", "Pointer samples (pressure, tilt)"),
      t("안정화·예측", "Stabilize and predict"),
      t("브러시 팁·재료", "Brush tip and material"),
      t("합성·미리보기", "Composite and preview"),
      t("타일 커밋·기록", "Tile commit and history"),
    ],
    points: [
      t("미리보기와 저장 결과가 같은 획 ID·렌더러 역할 계약을 따릅니다", "Preview and saved output share one stroke identity and renderer-role contract"),
      t("GPU·Canvas·WASM 경로를 같은 계약 뒤에서 교체합니다", "GPU, Canvas and WASM paths are swapped behind that contract"),
      t("고급 자연 재료는 기기 편차가 있어 단계적으로 켭니다", "Advanced natural media vary by device, so they roll out gradually"),
    ],
    stack: ["Pointer Events", "perfect-freehand", "CanvasKit (Skia)", "WebGPU", "Rust / WASM"],
    notes: t(
      "‘같은 손 움직임도 연필·펜·수채화는 달라야 합니다’로 시작합니다. 네 단계를 나눴기 때문에 렌더러를 바꿔도 저장 결과가 흔들리지 않습니다.\n정직하게: 브러시 엔진의 고급 재료는 ‘실험’ 상태입니다. 미리보기와 확정 결과의 동일성을 검증 스크립트로 비교하고 있습니다.",
      "Open with: ‘The same hand motion must feel different for pencil, pen and watercolor.’ Because the stages are separated, swapping renderers does not change the saved result.\nBe honest: advanced media in the brush engine are experimental; preview-versus-commit parity is compared by verification scripts.",
    ),
    chapterId: "brush-engine",
    evidence: [
      "packages/studio-engine-registry/src/renderer-roles.ts",
      "scripts/verify-studio-brush-latency.mts",
      "scripts/verify-studio-gpu-committed-parity.mts",
    ],
    seconds: 110,
  },
  {
    id: "talk-local-first",
    section: "core",
    layout: "tech",
    eyebrow: t("04 · 로컬 우선 저장", "04 · LOCAL-FIRST STORAGE"),
    title: t("서버가 잠들어도 작품은 기기에 남습니다", "The work stays on the device even when the server sleeps"),
    lead: t(
      "대형 원본은 OPFS, 검색용 메타데이터는 SQLite WASM, 무거운 계산은 Worker에 둡니다.",
      "Large sources go to OPFS, searchable metadata to SQLite WASM, heavy computation to Workers.",
    ),
    flow: [
      t("편집 명령", "Edit command"),
      t("Worker로 전달", "Hand off to a Worker"),
      t("OPFS에 기록", "Write to OPFS"),
      t("SQLite WASM 색인", "Index in SQLite WASM"),
      t("내보내기·개인 클라우드 백업", "Export or personal-cloud backup"),
    ],
    points: [
      t("SQLite WASM은 필요할 때 동적으로 불러와 첫 화면을 가볍게 유지합니다", "SQLite WASM is loaded dynamically, keeping the first screen light"),
      t("Service Worker는 원고 저장소가 아니라 앱 셸 복구 계층입니다", "The Service Worker restores the app shell; it is not the manuscript store"),
      t("브라우저 저장소 삭제·기기 분실은 내보내기와 개인 클라우드로 대비합니다", "Storage eviction and lost devices are covered by export and personal cloud"),
    ],
    stack: ["OPFS", "SQLite WASM", "Dedicated Worker", "Web Locks", "Service Worker"],
    notes: t(
      "‘정전 때 집 전체는 못 밝혀도 랜턴 하나는 켤 수 있어야 한다’는 비유를 씁니다. 인터넷이 끊겨도 미리 준비된 범위의 그리기는 계속됩니다.\n주의: ‘모든 기능이 오프라인’이 아닙니다. 협업·AI·게시는 연결이 필요하고, 브라우저 저장소는 영구 백업이 아니라서 내보내기를 안내합니다.",
      "Use the lantern analogy: a blackout cannot light the whole house, but one lantern should work. Drawing within the prepared scope continues offline.\nCaution: not everything is offline. Collaboration, AI and publishing need a connection, and browser storage is not a permanent backup, so export is recommended.",
    ),
    chapterId: "browser-local-compute",
    evidence: [
      "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
      "apps/web/src/domains/creator/studio-local-database.ts",
      "apps/web/src/domains/creator/studio-local-database.worker.ts",
    ],
    seconds: 110,
  },
  {
    id: "talk-collaboration",
    section: "core",
    layout: "tech",
    eyebrow: t("04 · 실시간 협업", "04 · REALTIME COLLABORATION"),
    title: t("CRDT에는 편집의 의미를, 서버에는 권한을", "Edit meaning in the CRDT, permissions on the server"),
    lead: t(
      "Yjs가 레이어·벡터 편집을 수렴시키고, Socket.IO와 Cloudflare Durable Objects가 참가·접속 상태·시그널링을 맡습니다.",
      "Yjs converges layer and vector edits; Socket.IO and Cloudflare Durable Objects handle joining, presence and signaling.",
    ),
    flow: [
      t("편집 → Yjs 의미 연산", "Edit → Yjs semantic operation"),
      t("Socket.IO 방 참가·전달", "Socket.IO room join and relay"),
      t("Durable Objects 접속 상태", "Durable Objects presence"),
      t("PostgreSQL 영수증", "PostgreSQL receipt"),
    ],
    points: [
      t("CRDT는 권한·저장·미디어를 자동으로 해결하지 않아 경계를 따로 둡니다", "A CRDT does not solve permissions, storage or media, so those stay separate"),
      t("PSD·GLB 같은 대형 파일은 CRDT에 넣지 않고 해시와 영수증으로 참조합니다", "Large files such as PSD or GLB are referenced by hash and receipt, not stored in the CRDT"),
      t("실시간 방은 API가 발급한 티켓으로만 접속합니다", "Realtime rooms accept only API-issued tickets"),
    ],
    facts: [
      { value: "64", label: t("방당 최대 동시 연결(설정값)", "Max connections per room (config)") },
      { value: "10s", label: t("재접속 재개 허용 창(설정값)", "Reconnect resume window (config)") },
    ],
    stack: ["Yjs", "Socket.IO", "NestJS 11", "Cloudflare Durable Objects", "PostgreSQL"],
    notes: t(
      "‘여러 명이 같이 그리면 충돌 안 나나요?’라는 질문을 먼저 던지고 답합니다. CRDT는 정해진 규칙으로 병합하지만, 누가 수정할 수 있는지는 서버가 정합니다.\n숫자는 Durable Objects 설정 파일의 값입니다(방당 연결 64, 재개 창 10초). 부하 테스트 결과로 말하지 않습니다.\n상태는 ‘실험’입니다. 스키마 마이그레이션과 스냅샷 압축은 운영 과제로 남아 있습니다.",
      "Pose ‘Doesn’t co-editing cause conflicts?’ and answer it. The CRDT merges by fixed rules, but the server decides who may edit.\nThe numbers are configuration values from the Durable Objects config (64 connections per room, 10-second resume window), not load-test results.\nStatus is experimental: schema migration and snapshot compaction remain operational work.",
    ),
    chapterId: "collaborative-crdt-boundary",
    evidence: [
      "apps/web/src/domains/creator/live/studio-crdt-document.ts",
      "apps/web/src/domains/creator/live/studio-live-socket-connection-factory.ts",
      "deploy/cloudflare-realtime/wrangler.jsonc",
      "deploy/cloudflare-realtime/src/room.ts",
    ],
    seconds: 110,
  },
  {
    id: "talk-virtual-studio",
    section: "core",
    layout: "tech",
    eyebrow: t("04 · 가상 스튜디오", "04 · VIRTUAL STUDIO"),
    title: t("걸어가서 말을 거는 협업 공간", "A collaboration space you walk up to"),
    lead: t(
      "Phaser로 그린 2D 공간에서 아바타가 가까워지면 인사·대화 힌트가 뜨고, 근접 허들은 브라우저 간 WebRTC로 연결합니다.",
      "In a Phaser-rendered 2D space, approaching avatars trigger greetings and chat hints, and proximity huddles connect over browser-to-browser WebRTC.",
    ),
    flow: [
      t("아바타 이동(Phaser)", "Avatar movement (Phaser)"),
      t("거리 계산·히스테리시스", "Distance with hysteresis"),
      t("대화 반경 진입", "Enter chat radius"),
      t("허들 제안", "Offer a huddle"),
      t("P2P 음성·영상", "P2P voice and video"),
    ],
    points: [
      t("공간은 화면일 뿐, 프로젝트·권한·미디어 수신자는 기존 도메인이 소유합니다", "The space is only UI; projects, permissions and media recipients stay with existing domains"),
      t("세션 시작만으로 카메라·마이크를 요청하지 않습니다", "Starting a session never requests camera or microphone"),
      t("키보드 이동·모션 감소·목록 대체 경로를 유지합니다", "Keyboard movement, reduced motion and list fallbacks remain available"),
    ],
    facts: [
      { value: "160 / 220px", label: t("인사 진입 / 이탈 반경", "Greet enter / leave radius") },
      { value: "200px", label: t("대화 힌트 반경", "Chat hint radius") },
      { value: "3", label: t("허들 원격 참가자 상한", "Remote huddle peer limit") },
    ],
    stack: ["Phaser 3", "WebRTC", "RTCDataChannel", "Socket.IO signaling"],
    notes: t(
      "게더타운 같은 공간 경험을 만들었지만, 공간이 새로운 권한 시스템이 되지 않게 했다는 점이 핵심입니다.\n진입·이탈 반경을 다르게 둔 이유(160/220px)는 경계에서 인사가 깜빡이지 않게 하는 히스테리시스입니다.\n정직하게: 현재 P2P 허들은 원격 참가자를 3명으로 제한합니다. 대규모 방송은 TURN·SFU가 필요한 별도 과제입니다. Phaser는 가상 스튜디오에 들어갈 때만 불러옵니다.",
      "We built a Gather-like spatial experience, but the key is that space never became a new permission system.\nThe different enter/leave radii (160/220px) are hysteresis so greetings do not flicker at the boundary.\nBe honest: the P2P huddle currently limits remote peers to three; large broadcasts need TURN and an SFU. Phaser loads only when entering the virtual studio.",
    ),
    chapterId: "virtual-studio-world-authority",
    evidence: [
      "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx",
      "apps/web/src/domains/creator/virtual-space/studio-virtual-space-proximity.ts",
      "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts",
      "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts",
    ],
    seconds: 110,
  },
  {
    id: "talk-3d",
    section: "core",
    layout: "tech",
    eyebrow: t("04 · 3D 캐릭터", "04 · 3D CHARACTERS"),
    title: t("3D는 보여주기가 아니라 그리기 위한 밑그림", "3D as underdrawing, not decoration"),
    lead: t(
      "three.js 뷰포트에서 캐릭터 체형·포즈를 잡고, VRM 표준 뼈대로 포즈 도구와 선화 변환으로 이어집니다.",
      "Shape the body and pose in a three.js viewport; the VRM skeleton carries it into posing tools and lineart conversion.",
    ),
    flow: [
      t("캐릭터 셰이퍼", "Character shaper"),
      t("VRM 휴머노이드 뼈대", "VRM humanoid skeleton"),
      t("포즈·카메라 구도", "Pose and camera framing"),
      t("선화 변환", "Lineart conversion"),
      t("캔버스 위에 펜", "Ink on the canvas"),
    ],
    points: [
      t("상호작용·휴머노이드·정밀 형상을 엔진 하나에 몰지 않고 역할별로 나눕니다", "Interaction, humanoids and precise geometry are split by role, not forced into one engine"),
      t("웹캠 포즈 추적은 브라우저 안의 MediaPipe로 처리합니다", "Webcam pose tracking runs in-browser with MediaPipe"),
      t("좌표계·단위·재질 변환은 왕복 검증이 필요한 실험 영역입니다", "Coordinate, unit and material conversion still needs round-trip validation"),
    ],
    stack: ["three.js", "React Three Fiber", "@pixiv/three-vrm", "MediaPipe", "OpenCascade WASM"],
    notes: t(
      "‘3D를 왜 넣었냐고요? 보여주려고가 아니라 그리기 위해서입니다’로 시작합니다. 3D 포즈를 잡고 선화로 바꿔 바로 위에 펜을 댑니다.\nVRM 표준 뼈대를 쓰기 때문에 캐릭터 셰이퍼·포즈 도구·웹캠 추적이 같은 골격을 공유합니다.\n상태는 ‘실험’입니다. 엔진 간 좌표계·재질 변환은 계속 검증 중이라고 말합니다.",
      "Open with: ‘Why 3D? Not to show off, but to draw on.’ Pose in 3D, convert to lineart and ink directly over it.\nBecause of the VRM standard skeleton, the character shaper, posing tools and webcam tracking share one rig.\nStatus is experimental; coordinate and material conversion between engines is still being validated.",
    ),
    chapterId: "web-3d-engine",
    evidence: [
      "apps/web/src/domains/creator/character-shaper/StudioCharacterShaper.tsx",
      "apps/web/src/domains/creator/vrm/StudioVrmPoserViewport.tsx",
      "apps/web/src/domains/creator/vrm/use-studio-vrm-webcam-session.ts",
      "apps/web/src/domains/creator/lt-convert/studio-lt-convert.ts",
    ],
    seconds: 110,
  },
  {
    id: "talk-ai",
    section: "core",
    layout: "tech",
    eyebrow: t("04 · AI 보조", "04 · AI ASSISTANCE"),
    title: t("제안은 AI가, 확정은 사람이", "AI proposes, people decide"),
    lead: t(
      "브라우저 로컬 추론과 무료 우선 라우팅을 쓰되, 비용이 드는 경로는 사용자가 명시적으로 승인합니다.",
      "Browser-local inference and free-first routing are used; paid paths require explicit user approval.",
    ),
    flow: [
      t("요청 분류", "Classify the request"),
      t("로컬 추론 가능 여부", "Can it run locally?"),
      t("무료 모델 허용 목록", "Free-model allowlist"),
      t("명시적 승인", "Explicit approval"),
      t("결과는 제안으로 표시", "Show the result as a proposal"),
    ],
    points: [
      t("무료 경로가 끝나도 품질을 몰래 낮추거나 결제를 자동으로 켜지 않습니다", "When free paths run out, quality is never silently lowered and billing never auto-enables"),
      t("시간 초과·5xx처럼 결과가 모호한 실패는 자동으로 다시 보내지 않습니다", "Ambiguous failures such as timeouts or 5xx are not retried automatically"),
      t("운영 공급자 키와 예산 반영은 승인 배포를 기다리는 ‘설정 필요’ 상태입니다", "Production provider keys and budgets are still ‘configured’, awaiting an approved release"),
    ],
    stack: ["onnxruntime-web", "MediaPipe", "OpenAI-compatible API", "BYOK", "Quota ledger"],
    notes: t(
      "AI는 결과를 확정하지 않고 제안만 합니다. 작가가 받아들이거나 버립니다.\n비용 원칙: 무료 우선이란 공짜라는 뜻이 아니라 돈이 드는 지점을 숨기지 않는다는 뜻입니다.\n정직하게: 운영 환경의 AI 공급자 키·예산 값은 다음 승인 배포에 반영될 예정인 ‘설정 필요’ 상태입니다.",
      "AI never commits results; it proposes, and the artist accepts or discards.\nCost principle: free-first does not mean free; it means cost boundaries stay visible.\nBe honest: production AI provider keys and budgets are ‘configured’ and scheduled for the next approved release.",
    ),
    chapterId: "free-ai-routing",
    evidence: [
      "apps/web/src/shared/ai/free-ai-policy.ts",
      "apps/web/src/shared/ai/free-ai-runtime-budget.ts",
      "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
    ],
    seconds: 110,
  },
  {
    id: "talk-quality",
    section: "quality",
    layout: "metrics",
    eyebrow: t("05 · 품질과 검증", "05 · QUALITY AND VERIFICATION"),
    title: t("좋은 데모를 반복 가능한 증거로 바꿉니다", "Turning a good demo into repeatable evidence"),
    lead: t(
      "타입·린트 → 단위·컴포넌트 → 브라우저 E2E·접근성 → 성능·보안·라이선스 순서로 게이트를 나눴습니다.",
      "Gates are layered: types and lint → unit and component → browser E2E and accessibility → performance, security and licenses.",
    ),
    facts: [
      { value: "4,800+", label: t("웹 테스트 파일(Vitest)", "Web test files (Vitest)") },
      { value: "49", label: t("E2E 스펙(Playwright)", "E2E specs (Playwright)") },
      { value: "97", label: t("GitHub Actions 워크플로", "GitHub Actions workflows") },
      { value: "0", label: t("앱 간 직접 import(래칫)", "Cross-app imports (ratchet)") },
    ],
    points: [
      t("아키텍처 래칫: 레거시 경계 위반 수는 늘어나면 CI가 실패합니다", "Architecture ratchet: CI fails if legacy boundary violations grow"),
      t("axe 기반 접근성 스모크와 키보드·모션 감소·강제 색상 점검", "axe-based accessibility smoke plus keyboard, reduced-motion and forced-colors checks"),
      t("외부 QA 포털은 보조일 뿐, 병합 판단의 정본은 CI입니다", "External QA portals assist; CI stays the source of truth for merges"),
    ],
    stack: ["Vitest", "Testing Library", "Playwright", "@axe-core/playwright", "GitHub Actions"],
    notes: t(
      "숫자는 2026-09-30 저장소를 git으로 센 값입니다(웹 테스트 파일 4,808개, E2E 스펙 49개, 워크플로 97개). 커버리지나 통과율로 부풀리지 않습니다.\n래칫 설명: 앱 간 직접 import는 0으로 고정, 레거시 shared→domain(25)과 도메인 간 깊은 import(58)는 상한으로 묶여 늘어나면 CI가 실패합니다.\n데모에서 찾은 버그는 반드시 회귀 테스트로 남긴다는 원칙을 말합니다.",
      "The numbers are git counts of the repository on 2026-09-30 (4,808 web test files, 49 E2E specs, 97 workflows); no coverage or pass-rate inflation.\nRatchet: cross-app imports are pinned at 0, and legacy shared→domain (25) and cross-domain deep imports (58) are capped so CI fails if they grow.\nState the rule that every bug found in a demo becomes a regression test.",
    ),
    chapterId: "quality",
    evidence: [
      "config/architecture-boundary-ratchet.json",
      "scripts/validate-app-boundaries.mjs",
      "playwright.a11y.config.ts",
      "e2e/a11y-smoke.spec.ts",
    ],
    seconds: 110,
  },
  {
    id: "talk-performance",
    section: "quality",
    layout: "statement",
    eyebrow: t("05 · 성능 예산", "05 · PERFORMANCE BUDGETS"),
    title: t("성능은 느낌이 아니라 기능 계약입니다", "Performance is a feature contract, not a feeling"),
    lead: t(
      "번들·메인 스레드·GPU 메모리·저장 지연·복구 시간을 각각 측정 가능한 예산으로 관리합니다.",
      "Bundles, main thread, GPU memory, save latency and recovery time are each managed as measurable budgets.",
    ),
    points: [
      t("라우트 지연 로딩으로 무거운 엔진은 필요한 화면에서만 받습니다", "Lazy routes load heavy engines only where needed"),
      t("스튜디오 번들 검사가 청크 경계를 지킵니다", "A studio bundle check guards chunk boundaries"),
      t("성능 수치는 장비·브라우저·커밋과 함께 기록합니다", "Performance figures are recorded with device, browser and commit"),
    ],
    stack: ["Lazy routes", "Web Workers", "WASM", "Bundle budget"],
    notes: t(
      "성능 숫자를 말할 때는 반드시 측정 장비·브라우저·커밋을 함께 말해야 한다는 원칙을 강조합니다. 오늘 발표에서는 벤치마크 수치를 인용하지 않습니다.\n예시로 가상 스튜디오의 Phaser와 SQLite WASM이 필요할 때만 동적으로 로드된다는 점을 연결합니다.",
      "Stress that any performance number must come with device, browser and commit. This talk quotes no benchmark numbers.\nConnect to examples: Phaser for the virtual studio and SQLite WASM load dynamically only when needed.",
    ),
    chapterId: "performance",
    evidence: ["scripts/check-studio-bundle.mjs", "vitest.perf.config.ts", "tests/benchmarks"],
    seconds: 70,
  },
  {
    id: "talk-operations",
    section: "operations",
    layout: "statement",
    eyebrow: t("06 · 운영과 비용", "06 · OPERATIONS AND COST"),
    title: t("무료 우선, 유료 전환은 사람이 승인", "Free-first; paid upgrades need human approval"),
    lead: t(
      "정적 SPA는 Cloudflare, 동적 API는 Render, 원장은 Neon PostgreSQL, 실시간은 Durable Objects — 자동 과금·자동 배포는 쓰지 않습니다.",
      "Static SPA on Cloudflare, dynamic API on Render, ledger on Neon PostgreSQL, realtime on Durable Objects — no automatic billing or deploys.",
    ),
    points: [
      t("Cloudflare가 정적 트래픽과 생존 확인에 응답해 API 서버를 깨우지 않습니다", "Cloudflare answers static traffic and liveness without waking the API"),
      t("승인된 main 커밋 하나만 수동으로 배포하고, 실패하면 이전 버전으로 되돌립니다", "Only one approved main commit is deployed manually; failures roll back"),
      t("대가: 무료 플랜은 콜드 스타트가 있고 SLA가 없습니다", "Trade-off: free plans have cold starts and no SLA"),
    ],
    facts: [
      { value: t("무료 플랜", "Free plan"), label: t("Render Core API(유휴 시 슬립)", "Render Core API (sleeps when idle)") },
      { value: t("수동 배포", "Manual deploys"), label: t("자동 배포 꺼짐(autoDeployTrigger off)", "Auto-deploy off (autoDeployTrigger off)") },
    ],
    stack: ["Cloudflare Static Assets", "Workers", "Durable Objects", "Render", "Neon PostgreSQL"],
    notes: t(
      "render.yaml에 Core API가 free 플랜이고 autoDeployTrigger가 꺼져 있다는 점을 근거로 말합니다. 헬스 체크 경로는 DB를 깨우지 않도록 분리되어 있습니다.\n‘무료는 영구 0원이나 SLA를 뜻하지 않는다. 필요하면 비용과 운영 책임을 함께 승격한다’로 마무리합니다.",
      "Cite render.yaml: the Core API is on the free plan and autoDeployTrigger is off; the liveness path is kept from waking the database.\nClose with: ‘Free never means permanently zero cost or an SLA; when needed, cost and operational responsibility are upgraded together.’",
    ),
    chapterId: "cost-engineering",
    evidence: ["render.yaml", "DEPLOY.md", "docs/operations/minimum-cost-deployment-policy.md"],
    seconds: 120,
  },
  {
    id: "talk-lessons",
    section: "lessons",
    layout: "lessons",
    eyebrow: t("07 · 배운 점", "07 · LESSONS"),
    title: t("기능보다 경계, 데모보다 증거", "Boundaries over features, evidence over demos"),
    lead: t(
      "다른 서비스에도 그대로 가져갈 수 있는 네 가지 교훈입니다.",
      "Four lessons you can take to any other product.",
    ),
    points: [
      t("데이터마다 주인을 하나로 정하면 협업·오프라인·AI가 서로를 망가뜨리지 않습니다", "One owner per data type keeps collaboration, offline work and AI from breaking each other"),
      t("상태를 정직하게 표시합니다: 운영 중·설정 필요·실험을 섞지 않습니다", "Label status honestly: never mix live, configured and experimental"),
      t("모호한 실패는 몰래 재시도하지 않고 사용자에게 보여줍니다", "Show ambiguous failures instead of silently retrying"),
      t("데모에서 찾은 버그는 회귀 테스트로 남깁니다", "Every bug found in a demo becomes a regression test"),
    ],
    notes: t(
      "네 가지를 천천히 읽고, 각 교훈에 오늘 발표의 예시를 하나씩 연결합니다(로컬 우선 저장, 상태 배지, AI 재시도 금지, 품질 게이트).\n청중에게 ‘여러분 서비스에서 가장 먼저 주인을 정해야 할 데이터는 무엇인가요?’라고 묻습니다.",
      "Read the four slowly and tie each to an example from today (local-first storage, status badges, no AI retries, quality gates).\nAsk: ‘Which data in your product needs a single owner first?’",
    ),
    chapterId: "troubleshooting-evidence",
    evidence: ["apps/web/src/shared/ai/free-ai-runtime-budget.test.ts", "apps/web/src/app/service-worker/studio-service-worker-continuity.test.ts"],
    seconds: 60,
  },
  {
    id: "talk-limits",
    section: "lessons",
    layout: "lessons",
    eyebrow: t("07 · 한계와 다음 단계", "07 · LIMITS AND NEXT STEPS"),
    title: t("아직 실험 중인 것을 먼저 말합니다", "Saying what is still experimental, first"),
    lead: t(
      "아래 상태는 기술 스토리 챕터의 현재 상태를 그대로 가져온 것입니다.",
      "The statuses below come directly from the engineering story chapters.",
    ),
    points: [
      t("실험 기능은 검증 기준을 먼저 정하고, 근거가 쌓이면 ‘운영 경로’로 올립니다", "Experimental features get verification criteria first and move to ‘live’ as evidence accumulates"),
      t("P2P 허들은 원격 3명까지이며, 대규모 방송은 TURN·SFU가 필요합니다", "P2P huddles cap at three remote peers; large broadcasts need TURN and an SFU"),
      t("무료 인프라는 콜드 스타트가 있어, SLA가 필요하면 승인 후 승격합니다", "Free infrastructure has cold starts; an SLA requires an approved upgrade"),
      t("브라우저 저장소는 영구 백업이 아니므로 내보내기를 안내합니다", "Browser storage is not a permanent backup, so export is recommended"),
    ],
    notes: t(
      "한계를 먼저 말하면 질문이 공격이 아니라 대화가 됩니다. 각 항목이 어떤 챕터 상태에서 왔는지 화면의 배지를 가리킵니다.\n다음 단계: 실험 기능은 검증 기준을 먼저 정하고, 근거가 쌓이면 ‘운영 경로’로 올립니다.",
      "Naming limits first turns questions into a conversation. Point at the badges to show which chapter each status comes from.\nNext steps: define verification criteria for experimental features, then promote them to ‘live’ as evidence accumulates.",
    ),
    chapterId: "webrtc-media-authority",
    statusChapterIds: [
      "brush-engine",
      "collaborative-crdt-boundary",
      "webrtc-media-authority",
      "web-3d-engine",
      "virtual-studio-world-authority",
    ],
    evidence: ["docs/studio-p2p-huddle.md", "render.yaml"],
    seconds: 60,
  },
  {
    id: "talk-qa",
    section: "qa",
    layout: "qa",
    eyebrow: t("08 · 질의응답", "08 · Q&A"),
    title: t("질문 받겠습니다", "Questions welcome"),
    lead: t(
      "답은 구현된 경로, 실제로 검증한 결과, 아직 확인하지 않은 범위로 나눠 드립니다.",
      "Answers are split into the implemented path, what was actually verified and what is not yet verified.",
    ),
    points: [],
    links: [
      { href: "/about/technology/story", label: t("제작 스토리 — 31개 챕터와 근거", "Engineering story — 31 chapters with evidence") },
      { href: "/about/technology/guides", label: t("적용 가이드 — 우리 서비스에 옮기기", "Guides — apply it to your product") },
      { href: "/about/technology/glossary", label: t("용어집 — 쉬운 말로 다시 듣기", "Glossary — terms in plain language") },
    ],
    notes: t(
      "모르는 질문에는 ‘기술 스토리의 근거를 확인하고 답변드리겠습니다’라고 답합니다. 추측으로 수치를 말하지 않습니다.\n예상 질문과 답변 요지는 발표 준비 패널의 ‘예상 질문’에 있습니다. 시간이 남으면 청중에게 자신의 서비스에서 먼저 분리하고 싶은 경계를 묻습니다.",
      "For unknown questions: ‘Let me verify against the engineering story evidence and follow up.’ Never guess numbers.\nAnticipated questions and answer briefs are in the prep panel. If time remains, ask which boundary the audience would separate first in their own product.",
    ),
    seconds: 120,
  },
] as const satisfies readonly TalkSlide[];

export type TalkSlideId = (typeof TALK_SLIDES)[number]["id"];

export interface TalkSectionPlan {
  readonly id: TalkSectionId;
  readonly title: LocalizedText;
  readonly order: number;
  readonly seconds: number;
  readonly startSeconds: number;
  readonly firstSlideIndex: number;
  readonly slideCount: number;
}

/** 슬라이드 순서대로 구간 예산을 계산한다. 구간 시간은 슬라이드 시간의 합이다. */
export function planTalkSections(
  slides: readonly Pick<TalkSlide, "section" | "seconds">[] = TALK_SLIDES,
): readonly TalkSectionPlan[] {
  let elapsed = 0;
  return TALK_SECTIONS.map((section, order) => {
    const firstSlideIndex = slides.findIndex((slide) => slide.section === section.id);
    const members = slides.filter((slide) => slide.section === section.id);
    const seconds = members.reduce((sum, slide) => sum + slide.seconds, 0);
    const plan: TalkSectionPlan = {
      id: section.id,
      title: section.title,
      order: order + 1,
      seconds,
      startSeconds: elapsed,
      firstSlideIndex,
      slideCount: members.length,
    };
    elapsed += seconds;
    return plan;
  });
}

/** 각 슬라이드가 시작되어야 하는 누적 시간(초). */
export function talkSlideStartSeconds(
  slides: readonly Pick<TalkSlide, "seconds">[] = TALK_SLIDES,
): readonly number[] {
  let elapsed = 0;
  return slides.map((slide) => {
    const start = elapsed;
    elapsed += slide.seconds;
    return start;
  });
}

export const TALK_TOTAL_SECONDS = TALK_SLIDES.reduce((sum, slide) => sum + slide.seconds, 0);
