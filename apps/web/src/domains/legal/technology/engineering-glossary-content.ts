import type { LocalizedText } from "./engineering-story-content";

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export type GlossaryCategoryId =
  | "brush"
  | "web"
  | "spatial"
  | "collab"
  | "sound"
  | "ai"
  | "craft";

export interface GlossaryCategory {
  readonly id: GlossaryCategoryId;
  readonly label: LocalizedText;
  readonly hint: LocalizedText;
}

export const GLOSSARY_CATEGORIES: readonly GlossaryCategory[] = [
  {
    id: "brush",
    label: t("브러시 · 렌더링", "Brush · Rendering"),
    hint: t("펜의 움직임이 화면의 선이 되기까지", "From pen movement to pixels"),
  },
  {
    id: "web",
    label: t("웹 플랫폼", "Web platform"),
    hint: t("브라우저의 한계를 넘는 방법", "Pushing past browser limits"),
  },
  {
    id: "spatial",
    label: t("3D · 공간", "3D · Space"),
    hint: t("입체 장면과 캐릭터", "Scenes and characters in 3D"),
  },
  {
    id: "collab",
    label: t("협업 · 연결", "Collaboration · Connectivity"),
    hint: t("함께 작업하고 밖에 공유하기", "Working together and sharing out"),
  },
  {
    id: "sound",
    label: t("사운드 · 모션", "Sound · Motion"),
    hint: t("들리는 분위기와 움직이는 설명", "Atmosphere you hear, explanations that move"),
  },
  {
    id: "ai",
    label: t("AI", "AI"),
    hint: t("기계가 돕고 사람이 정하는 일", "Machines propose, humans decide"),
  },
  {
    id: "craft",
    label: t("개발 문화 · 배포", "Craft · Delivery"),
    hint: t("팀이 코드를 다루는 방식", "How the team treats code"),
  },
];

export interface GlossaryTerm {
  readonly id: string;
  readonly category: GlossaryCategoryId;
  readonly term: LocalizedText;
  /** 한 줄 정의 — 사전처럼 짧게 */
  readonly definition: LocalizedText;
  /** 쉬운 비유 — 청중이 바로 그릴 수 있는 그림 */
  readonly analogy: LocalizedText;
  /** 툰스튜디오에서는 — 실제 파일·숫자·선택 이야기 */
  readonly inToonstudio: LocalizedText;
  /** 더 읽을 챕터 id */
  readonly chapters: readonly string[];
}

/**
 * 발표 Q&A 방어용 기술 용어집.
 * 규칙: 정의는 한 줄, 비유는 일상 사물, "툰스튜디오에서는"은 실제 파일명·숫자·선택 이유.
 * 지어낸 내용은 넣지 않는다 — inToonstudio는 코드에서 확인된 것만.
 */
export const ENGINEERING_GLOSSARY: readonly GlossaryTerm[] = [
  // ── 브러시 · 렌더링 ──────────────────────────────────────────────
  {
    id: "wasm",
    category: "brush",
    term: t("WASM (WebAssembly)", "WASM (WebAssembly)"),
    definition: t(
      "C·Rust 같은 언어로 짠 빠른 코드를 브라우저에서 거의 네이티브 속도로 돌리는 실행 형식입니다.",
      "An execution format that runs fast compiled code (C, Rust, …) in the browser at near-native speed.",
    ),
    analogy: t(
      "외국어 통역사가 아니라, 미리 번역해 둔 책을 읽는 것과 같습니다. 번역(Rust→WASM)은 한 번만 하고, 읽기는 매번 빠릅니다.",
      "Like reading a pre-translated book instead of hiring a live interpreter. Translate once (Rust → WASM), read fast every time.",
    ),
    inToonstudio: t(
      "packages/studio-hokusai-wasm — Rust로 짠 수채화·자연매체 렌더러를 WASM으로 묶었습니다. 무거운 픽셀 연산은 여기서 돌리고, 화면 일꾼(Worker)과 함께 써서 UI를 막지 않습니다.",
      "packages/studio-hokusai-wasm — the watercolor / natural-media renderer written in Rust, shipped as WASM. Heavy pixel math runs here, alongside a Worker, so the UI never stalls.",
    ),
    chapters: ["brush-engine", "worker-architecture"],
  },
  {
    id: "rust",
    category: "brush",
    term: t("Rust", "Rust"),
    definition: t(
      "메모리 실수를 컴파일 단계에서 잡아내는 시스템 프로그래밍 언어입니다. 느린 가비지 컬렉터가 없습니다.",
      "A systems language that catches memory mistakes at compile time. No slow garbage collector.",
    ),
    analogy: t(
      "요리 전에 식재료를 전부 손질해 두는 주방과 같습니다. 손님이 온 뒤(실행 중)에 당황할 일이 없습니다.",
      "Like a kitchen that preps every ingredient before service — no surprises once guests (users) arrive.",
    ),
    inToonstudio: t(
      "Hokusai 렌더러의 본체 언어입니다. 릴리스 빌드는 LTO·panic=abort로 바이트까지 다이어트하고, unsafe_code를 금지(forbid)해서 메모리 안전을 컴파일러에게 맡겼습니다.",
      "The implementation language of the Hokusai renderer. Release builds use LTO and panic=abort for a lean binary, and forbid unsafe_code so the compiler owns memory safety.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "hokusai",
    category: "brush",
    term: t("Hokusai (자연매체 렌더러)", "Hokusai (natural-media renderer)"),
    definition: t(
      "수채화·잉크 같은 아날로그 재료의 번짐·농도·종이 반응을 시뮬레이션하는 렌더링 엔진입니다.",
      "A rendering engine that simulates analog materials — watercolor bleeding, ink density, paper response.",
    ),
    analogy: t(
      "물감을 '칠하는' 게 아니라 '젖은 종이에 떨어뜨리는' 엔진입니다. 색을 입히는 게 아니라 재료의 반응을 계산합니다.",
      "It doesn't paint color on — it drops pigment onto wet paper. It computes the material's reaction, not just the color.",
    ),
    inToonstudio: t(
      "Hokusai 0.3.0을 정확히 고정(=0.3.0)해서 씁니다. 투명도 처리가 핵심이라 upstream 래퍼 대신 직접 래퍼를 만들었고, 바뀐 영역만 다시 그리는 dirty-bounds 방식으로 64px 타일 단위로 갱신합니다.",
      "Pinned to exactly Hokusai 0.3.0. Because transparency handling is critical, we wrote our own wrapper instead of the upstream one, and repaint only changed regions via dirty-bounds in 64 px tiles.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "libmypaint",
    category: "brush",
    term: t("MyPaint / libmypaint", "MyPaint / libmypaint"),
    definition: t(
      "오픈소스 드로잉 프로그램 MyPaint의 브러시 엔진. 수백 가지 브러시 설정을 숫자(세팅 값)로 표현합니다.",
      "The brush engine of the open-source painting app MyPaint. Hundreds of brush behaviors expressed as numeric settings.",
    ),
    analogy: t(
      "붓 한 자루가 아니라 '붓 공장'입니다. 같은 엔진에 다른 숫자 처방전(.myb)을 넣으면 전혀 다른 붓이 됩니다.",
      "Not one brush but a brush factory — feed the same engine a different numeric recipe (.myb) and you get a different brush.",
    ),
    inToonstudio: t(
      "libmypaint v1.6.1을 WASM으로 묶어 씁니다. .myb 문서를 파싱해 주입(injection) 방식으로만 세팅을 넣는데, 문서가 가진 값은 하나도 조용히 버리지 않는다는 '정직 계약'을 지킵니다.",
      "Ships as libmypaint v1.6.1 compiled to WASM. Settings go in only through injection from parsed .myb documents, under an honesty contract: no document value is silently dropped.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "stabilizer",
    category: "brush",
    term: t("스트로크 스태빌라이저 (손떨림 보정)", "Stroke stabilizer"),
    definition: t(
      "손의 미세한 떨림을 걸러내 매끈한 선을 만드는 필터입니다. 강할수록 매끈하지만 펜을 늦게 따라옵니다.",
      "A filter that smooths hand jitter into clean lines. Stronger means smoother — but the line trails the pen more.",
    ),
    analogy: t(
      "줄에 매달린 추와 같습니다. 손이 흔들려도 추는 관성 때문에 부드럽게 따라오죠. 대신 손을 멈추면추가 조금 더 미끄러집니다.",
      "Like a weight on a string: it glides smoothly despite a shaky hand, but slides a little past where you stop.",
    ),
    inToonstudio: t(
      "두 가지 모드를 씁니다. ema(지수이동평균)는 가볍고, spring(스프링)은 길게 끄는 먹선용입니다. 둘 다 '펜을 뗀 자리에서 정확히 끝나야 한다'는 끝점 계약을 지킵니다.",
      "Two modes: ema (exponential moving average) for light smoothing, spring for long inking strokes. Both obey the endpoint contract — the line must end exactly where the pen lifted.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "skia-canvaskit",
    category: "brush",
    term: t("Skia / CanvasKit", "Skia / CanvasKit"),
    definition: t(
      "구글 크롬·안드로이드가 쓰는 2D 그래픽 엔진 Skia를 웹(WASM)에서 돌리는 묶음입니다.",
      "CanvasKit brings Skia — the 2D graphics engine inside Chrome and Android — to the web via WASM.",
    ),
    analogy: t(
      "크롬이 그림을 그리는 '손'을 빌려오는 것입니다. 브라우저마다 손재주가 달라도, 같은 손을 쓰면 같은 그림이 나옵니다.",
      "Borrowing Chrome's own drawing hand. Different browsers have different skills, but the same hand draws the same picture.",
    ),
    inToonstudio: t(
      "벡터 렌더러 후보 중 하나입니다. 무조건 쓰는 게 아니라 렌더러 등록부(renderer registry)에 '누가 어떤 결과를 만들 수 있는지' 적어 두고, 장치·품질 조건에 따라 고릅니다.",
      "One candidate in the renderer registry, which records who can produce which results. The choice depends on device and quality conditions — never unconditional.",
    ),
    chapters: ["brush-render-authority"],
  },
  {
    id: "vello",
    category: "brush",
    term: t("Vello", "Vello"),
    definition: t(
      "GPU에서 벡터 그래픽을 그리는 차세대 렌더러입니다. CPU가 아니라 그래픽카드가 곡선을 계산합니다.",
      "A next-generation vector renderer that draws on the GPU — the graphics card computes the curves, not the CPU.",
    ),
    analogy: t(
      "손으로 한 장씩 뜨개질하던 걸 기계 편직기로 바꾸는 것과 같습니다. 복잡한 곡선이 많아질수록 차이가 벌어집니다.",
      "Like switching from hand-knitting to a machine loom: the more complex the curves, the bigger the gap.",
    ),
    inToonstudio: t(
      "실험 경로로 등록돼 있습니다. 'WebGPU를 썼다'는 말 자체가 품질 보증이 아니라는 원칙 아래, 출력 특성·메모리·색을 따로 측정합니다.",
      "Registered as an experimental path. Under the principle that 'uses WebGPU' is not itself a quality guarantee, output, memory and color are measured separately.",
    ),
    chapters: ["brush-render-authority"],
  },
  {
    id: "thorvg",
    category: "brush",
    term: t("ThorVG", "ThorVG"),
    definition: t(
      "가볍고 빠른 벡터 그래픽 라이브러리입니다. 저사양 기기에서도 벡터를 그릴 수 있게 설계됐습니다.",
      "A lightweight, fast vector graphics library designed to render vectors even on low-end devices.",
    ),
    analogy: t(
      "연비 좋은 경차와 같습니다. 고속도로(고성능 GPU)가 없어도 목적지(벡터 렌더링)까지 갑니다.",
      "Like a fuel-efficient compact car: it reaches the destination (vector rendering) without needing a highway (high-end GPU).",
    ),
    inToonstudio: t(
      "저사양 대응 렌더러 후보입니다. 고사양 경로가 안 되는 기기에서는 조용히 다른 그림을 내는 대신, 지원 범위를 명시하고 검증된 대체 경로를 씁니다.",
      "A low-end fallback candidate. On weak devices we prefer explicit capability notices and validated fallbacks over silently different output.",
    ),
    chapters: ["brush-render-authority"],
  },
  {
    id: "dirty-bounds",
    category: "brush",
    term: t("Dirty bounds (바뀐 영역만 다시 그리기)", "Dirty bounds"),
    definition: t(
      "화면 전체가 아니라 실제로 바뀐 사각형 영역만 다시 그리는 최적화입니다.",
      "An optimization that repaints only the changed rectangle instead of the whole screen.",
    ),
    analogy: t(
      "벽지 전체를 다시 바르는 게 아니라, 낙서된 부분만 도배하는 것과 같습니다.",
      "Like re-wallpapering only the scribbled patch instead of the whole wall.",
    ),
    inToonstudio: t(
      "Hokusai 래퍼가 dirtyFrame()으로 바뀐 영역을 64px 타일 단위로 반환합니다. 지우개로 투명해진 픽셀까지 포함하도록 보수적으로 잡습니다.",
      "The Hokusai wrapper returns changed regions via dirtyFrame() in 64 px tiles — conservatively including pixels erased back to transparent.",
    ),
    chapters: ["brush-engine"],
  },
  // ── 웹 플랫폼 ──────────────────────────────────────────────────
  {
    id: "pwa",
    category: "web",
    term: t("PWA (프로그레시브 웹 앱)", "PWA (Progressive Web App)"),
    definition: t(
      "웹사이트를 앱처럼 설치·실행하게 만드는 기술 묶음입니다. 오프라인 동작과 홈 화면 설치가 핵심입니다.",
      "A bundle of techniques that lets a website install and run like an app — offline support and home-screen install at its core.",
    ),
    analogy: t(
      "푸드트럭이 단골 자리에 가게를 차리는 것과 같습니다. 길(웹)에서 시작했지만, 이제는 자리(홈 화면)가 있습니다.",
      "Like a food truck opening a permanent spot: it started on the road (the web) but now has its own place (the home screen).",
    ),
    inToonstudio: t(
      "오프라인 드로잉 구조와 함께 씁니다. '오프라인 = 전부 된다'가 아니라, 그림 그리기처럼 미리 준비된 범위만 보장한다는 원칙입니다.",
      "Used together with the offline drawing structure. The principle: offline is a prepared scope — like drawing — not a blanket promise.",
    ),
    chapters: ["pwa-continuity", "pwa-safe-update"],
  },
  {
    id: "service-worker",
    category: "web",
    term: t("Service Worker", "Service Worker"),
    definition: t(
      "브라우저가 페이지와 별도로 띄우는 백그라운드 일꾼입니다. 네트워크 요청을 가로채 캐시를 서빙합니다.",
      "A background worker the browser runs separately from pages. It intercepts network requests and serves caches.",
    ),
    analogy: t(
      "가게 앞에 서 있는 점원과 같습니다. 손님(페이지 요청)이 오면 창고(캐시)에 있는 걸 먼저 내주고, 없으면 본사(서버)에 주문합니다.",
      "Like a clerk at the shop entrance: serves from the stockroom (cache) first, orders from HQ (server) only when it's missing.",
    ),
    inToonstudio: t(
      "src/app/service-worker/ — GET 자산만 캐시하고, 업데이트는 사용자 동의 없이 밀어내지 않습니다. 원고 작업 중 업데이트가 덮어쓰는 사고를 막는 게 핵심 설계입니다.",
      "src/app/service-worker/ — caches only GET assets and never pushes updates without consent. The core design goal: an update must never displace an active manuscript.",
    ),
    chapters: ["pwa-continuity", "pwa-safe-update"],
  },
  {
    id: "offline-shell",
    category: "web",
    term: t("오프라인 셸 · 긴급 드로잉", "Offline shell · emergency drawing"),
    definition: t(
      "인터넷이 끊겨도 최소 기능(그리기)이 돌아가도록 미리 저장해 둔 독립 실행 화면입니다.",
      "A self-contained screen saved in advance so core features (drawing) keep working with no internet.",
    ),
    analogy: t(
      "비상용 랜턴과 같습니다. 정전(네트워크 단절) 때 집 전체를 밝힐 순 없지만, 당장 필요한 불은 켤 수 있습니다.",
      "Like an emergency lantern: it won't light the whole house during a blackout, but it lights what you need right now.",
    ),
    inToonstudio: t(
      "/offline-draw/index.html — 서비스워커가 미리 받아 두는 독립 HTML입니다. 로컬 드로잉 구조(local drawing rescue)와 연결돼 작업 중인 그림을 지킵니다.",
      "/offline-draw/index.html — a standalone HTML the service worker precaches, wired to the local drawing rescue so work-in-progress survives.",
    ),
    chapters: ["pwa-continuity"],
  },
  {
    id: "opfs",
    category: "web",
    term: t("OPFS", "OPFS (Origin Private File System)"),
    definition: t(
      "웹사이트 전용 로컬 파일 공간입니다. 브라우저 안에 있지만 파일처럼 읽고 쓸 수 있습니다.",
      "Private local file space for one website. Lives in the browser but reads/writes like files.",
    ),
    analogy: t(
      "호텔 금고와 같습니다. 그 호텔(사이트) 투숙객만 열 수 있고, 체크아웃(데이터 삭제)하면 사라집니다.",
      "Like a hotel safe: only that hotel's (site's) guest opens it, and checkout (data deletion) clears it.",
    ),
    inToonstudio: t(
      "원고·에셋의 로컬 저장 후보입니다. 단, 다운로드 폴더나 영구 백업이 아니라는 점을 사용자에게 숨기지 않습니다.",
      "A candidate for local manuscript/asset storage — with the honest caveat that it is not the Downloads folder or a permanent backup.",
    ),
    chapters: ["storage", "browser-local-first"],
  },
  {
    id: "web-worker",
    category: "web",
    term: t("Web Worker", "Web Worker"),
    definition: t(
      "화면(UI) 스레드와 별도로 돌아가는 자바스크립트 일꾼입니다. 무거운 계산을 옮겨 화면 멈춤을 막습니다.",
      "A JavaScript worker running off the UI thread. Moves heavy computation so the screen never freezes.",
    ),
    analogy: t(
      "주방 보조와 같습니다. 홀(화면)은 손님 응대에 집중하고, 무거운 설거지(연산)는 뒤에서 보조가 합니다.",
      "Like a kitchen assistant: the dining room (UI) serves guests while heavy dishwashing (computation) happens backstage.",
    ),
    inToonstudio: t(
      "렌더·연산·저장을 작업별 Worker로 분리합니다. 단, '보냈다 = 끝났다'가 아니라 작업 ID·문서 버전·취소 처리를 묶은 완료 계약을 둡니다.",
      "Rendering, compute and persistence each get their own worker — bound by a completion contract of job IDs, document versions and cancellation, because sent ≠ done.",
    ),
    chapters: ["worker-architecture", "worker-job-boundary"],
  },
  {
    id: "offscreen-canvas",
    category: "web",
    term: t("OffscreenCanvas", "OffscreenCanvas"),
    definition: t(
      "화면에 붙지 않은 캔버스를 Worker에서 직접 그릴 수 있게 하는 API입니다.",
      "An API that lets a worker draw directly onto a canvas detached from the visible page.",
    ),
    analogy: t(
      "무대 뒤에서 그림을 그려 완성된 것만 무대에 올리는 것과 같습니다. 관객(사용자)은 붓질 과정을 보지 않습니다.",
      "Like painting backstage and revealing only the finished piece — the audience never sees the brushwork.",
    ),
    inToonstudio: t(
      "브러시 렌더링을 Worker로 옮기는 핵심 부품입니다. 메인 스레드는 펜 입력 반응에만 집중합니다.",
      "The key part for moving brush rendering into a worker, leaving the main thread free to react to pen input.",
    ),
    chapters: ["worker-architecture", "brush-render-authority"],
  },
  {
    id: "webgpu",
    category: "web",
    term: t("WebGPU", "WebGPU"),
    definition: t(
      "브라우저에서 GPU에 직접 그래픽·연산 작업을 시키는 최신 API입니다. WebGL의 후계자입니다.",
      "The modern API for GPU graphics and compute in the browser — WebGL's successor.",
    ),
    analogy: t(
      "자전거(WebGL)에서 오토바이(WebGPU)로 바꾸는 것과 같습니다. 빠르지만 면허(장치 지원 확인)와 안전장비(메모리·품질 검증)가 필요합니다.",
      "Like upgrading from bicycle (WebGL) to motorcycle (WebGPU): faster, but you need a license (capability checks) and safety gear (memory/quality validation).",
    ),
    inToonstudio: t(
      "'WebGPU를 썼다'는 사실 자체를 품질 주장으로 쓰지 않습니다. 장치 지원·메모리·출력 색을 경로마다 따로 측정합니다.",
      "We never use 'uses WebGPU' as a quality claim by itself. Capability, memory and output color are measured per path.",
    ),
    chapters: ["brush-render-authority"],
  },
  // ── 3D · 공간 ──────────────────────────────────────────────────
  {
    id: "threejs",
    category: "spatial",
    term: t("Three.js", "Three.js"),
    definition: t(
      "브라우저 3D의 사실상 표준 라이브러리입니다. 장면·카메라·조명·재질을 코드로 다룹니다.",
      "The de-facto standard library for 3D in the browser — scenes, cameras, lights and materials in code.",
    ),
    analogy: t(
      "3D 영화 촬영 세트와 같습니다. 카메라 위치, 조명, 소품을 코드로 배치하고 렌더링 버튼을 누릅니다.",
      "Like a film set: place cameras, lights and props in code, then hit render.",
    ),
    inToonstudio: t(
      "3D 씬의 기반입니다. 가상 스튜디오의 캐릭터·공간 렌더링과 Magic Poser 스타일 포즈 도구가 이 위에서 돕니다.",
      "The foundation of 3D scenes — virtual-studio characters, spaces and Magic Poser-style posing tools build on it.",
    ),
    chapters: ["web-3d-engine", "threejs-r3f"],
  },
  {
    id: "r3f",
    category: "spatial",
    term: t("R3F (React Three Fiber)", "R3F (React Three Fiber)"),
    definition: t(
      "Three.js를 React 컴포넌트처럼 쓰게 해주는 다리입니다. 3D 장면을 JSX로 선언합니다.",
      "A bridge for using Three.js as React components — declare 3D scenes in JSX.",
    ),
    analogy: t(
      "외국 영화에 자막을 입히는 것과 같습니다. 내용(Three.js)은 그대로, 말하는 방식(React)만 바꿉니다.",
      "Like subtitling a foreign film: the content (Three.js) stays, only the language (React) changes.",
    ),
    inToonstudio: t(
      "3D UI를 React 상태와 자연스럽게 묶기 위해 씁니다. 화면(UI) 상태와 3D 장면 상태가 따로 놀지 않게 합니다.",
      "Used to bind 3D UI to React state naturally, so UI state and 3D scene state never drift apart.",
    ),
    chapters: ["threejs-r3f", "web-3d-engine"],
  },
  {
    id: "vrm",
    category: "spatial",
    term: t("VRM", "VRM"),
    definition: t(
      "3D 캐릭터(아바타) 파일의 공개 규격입니다. 누가 만들어도 같은 뼈대 구조를 따릅니다.",
      "An open specification for 3D character (avatar) files — same bone structure no matter who authored it.",
    ),
    analogy: t(
      "캐릭터계의 USB 규격과 같습니다. 어느 회사 옷(VRM 파일)을 입혀도 몸(앱)에 맞습니다.",
      "Like USB for characters: any brand's outfit (VRM file) fits the body (the app).",
    ),
    inToonstudio: t(
      "가상 스튜디오 아바타와 포즈 도구의 캐릭터 규격입니다. 표정·시선·포즈를 표준 뼈대로 주고받습니다.",
      "The character spec for virtual-studio avatars and posing tools — expressions, gaze and poses travel on standard bones.",
    ),
    chapters: ["vrm-standard", "web-3d-engine"],
  },
  {
    id: "gltf",
    category: "spatial",
    term: t("glTF / GLB", "glTF / GLB"),
    definition: t(
      "3D 장면·모델을 주고받는 표준 파일 형식입니다. '3D계의 JPEG'이라 불립니다.",
      "The standard file format for exchanging 3D scenes and models — called the 'JPEG of 3D'.",
    ),
    analogy: t(
      "3D 프린터용 설계도 봉투와 같습니다. 봉투 안에 재료(텍스처)·조립도(씬 구조)가 함께 들어 있습니다.",
      "Like an envelope of blueprints for 3D printing: materials (textures) and assembly instructions (scene graph) inside.",
    ),
    inToonstudio: t(
      "에셋 입출력 형식입니다. 확장 기능·텍스처·스케일 호환성은 glTF Transform 같은 도구로 검사합니다.",
      "The asset interchange format. Extensions, textures and scale compatibility are inspected with tools like glTF Transform.",
    ),
    chapters: ["web-3d-dcc-pipeline"],
  },
  {
    id: "lt-conversion",
    category: "spatial",
    term: t("LT 변환 (Lineart Tone)", "LT conversion"),
    definition: t(
      "3D 렌더를 만화의 선화·톤 느낌으로 바꾸는 변환입니다. 3D를 밑그림으로 쓰는 핵심 기술입니다.",
      "Converts a 3D render into comic-style lineart and tones — the key tech for using 3D as drawing reference.",
    ),
    analogy: t(
      "사진을 먹선 드로잉으로 바꿔주는 필터가 아니라, '밑그림 생성기'입니다. 작가가 그 위에 바로 펜을 댈 수 있습니다.",
      "Not a photo filter but an underdrawing generator — the artist can ink directly on top.",
    ),
    inToonstudio: t(
      "3D 배경·소품을 웹툰 작화 파이프라인에 넣는 연결점입니다. 3D를 보여주기용이 아니라 '그릴 수 있는 재료'로 씁니다.",
      "The joint where 3D backgrounds and props enter the webtoon pipeline — 3D as drawable material, not decoration.",
    ),
    chapters: ["web-3d-engine"],
  },
  {
    id: "ik",
    category: "spatial",
    term: t("IK (역운동학)", "IK (Inverse Kinematics)"),
    definition: t(
      "손·발의 목표 위치를 정하면 팔·다리 관절 각도를 역으로 계산하는 방법입니다.",
      "Given a target for the hand or foot, computes the arm/leg joint angles backwards.",
    ),
    analogy: t(
      "인형의 손을 잡아끌면 팔꿈치가 알아서 구부러지는 것과 같습니다. 어깨부터 정하는 게 아니라 손 위치부터 정합니다.",
      "Like pulling a doll's hand and watching the elbow bend on its own — you set the hand first, not the shoulder.",
    ),
    inToonstudio: t(
      "포즈 도구의 핵심입니다. 작가가 손 위치만 찍으면 자연스러운 팔 자세가 계산됩니다.",
      "The core of the posing tool: the artist places the hand, and a natural arm pose is computed.",
    ),
    chapters: ["vrm-standard"],
  },
  // ── 협업 · 연결 ────────────────────────────────────────────────
  {
    id: "webrtc",
    category: "collab",
    term: t("WebRTC", "WebRTC"),
    definition: t(
      "브라우저끼리 서버를 거치지 않고 음성·영상·데이터를 직접 주고받는 표준입니다.",
      "The standard for browsers to exchange voice, video and data directly, without a server in the middle.",
    ),
    analogy: t(
      "전화 교환원을 거치지 않는 직통 전화와 같습니다. 연결만 도와주면(시그널링), 통화는 둘 사이에서 오갑니다.",
      "Like a direct line with no operator: help with the connection (signaling), then the call flows peer to peer.",
    ),
    inToonstudio: t(
      "가상 스튜디오의 음성·화면 공유용입니다. 단, '대화 연결'과 '문서 동기화'는 같은 선이 아닙니다. 문서는 별도 채널·권한으로 다룹니다.",
      "For voice and screen share in the virtual studio. But the call connection is not the document sync channel — documents travel separately with their own authority.",
    ),
    chapters: ["webrtc-media-authority", "webrtc-standard"],
  },
  {
    id: "crdt",
    category: "collab",
    term: t("CRDT", "CRDT"),
    definition: t(
      "여러 사람이 동시에 고쳐도 정해진 규칙으로 자동 병합되는 데이터 구조입니다.",
      "A data structure that merges simultaneous edits by fixed rules, automatically.",
    ),
    analogy: t(
      "구글 문서의 '충돌 없는 합치기' 뒤에 있는 수학과 같습니다. 누가 먼저 썼는지 따지지 않고 규칙대로 합칩니다.",
      "The math behind Google Docs' conflict-free merging: no arguing over who wrote first, just merge by rule.",
    ),
    inToonstudio: t(
      "협업 편집의 병합 규칙용입니다. 다만 CRDT가 권한(누가 볼 수 있나)이나 모든 파일 충돌을 해결해주지는 않습니다. 의미적 범위를 정해 둡니다.",
      "Used for merge rules in collaborative editing — scoped honestly: it doesn't solve authorization or every file conflict.",
    ),
    chapters: ["collaborative-crdt-boundary", "crdt-semantic-scope"],
  },
  {
    id: "virtual-studio",
    category: "collab",
    term: t("가상 스튜디오", "Virtual studio"),
    definition: t(
      "아바타로 모여 회의·협업하는 2D/3D 가상 공간입니다. Gather·oVice류의 방식입니다.",
      "A 2D/3D virtual space where avatars meet and collaborate — in the style of Gather or oVice.",
    ),
    analogy: t(
      "화상회의가 '전화'라면 가상 스튜디오는 '사무실'입니다. 옆 사람에게 걸어가 말을 거는 식의 거리가 있습니다.",
      "If video calls are phone calls, the virtual studio is an office — you walk over to someone to talk.",
    ),
    inToonstudio: t(
      "8방향 스프라이트·관성 물리·근접 음성·NPC가 들어간 협업 공간입니다. 회의실 입장 시 자동 '회의 중' 전환, 화이트보드·이젤 상호작용이 있습니다.",
      "A collaboration space with 8-direction sprites, inertial physics, proximity voice and NPCs — auto 'in meeting' on room entry, whiteboard/easel interactions.",
    ),
    chapters: ["virtual-studio-world-authority", "spatial-collaboration-products"],
  },
  {
    id: "oauth",
    category: "collab",
    term: t("OAuth · SNS 로그인", "OAuth · Social login"),
    definition: t(
      "구글·카카오 같은 기존 계정으로 로그인하는 표준입니다. 비밀번호를 우리 서버에 주지 않습니다.",
      "The standard for 'log in with Google/Kakao'. Your password never reaches our server.",
    ),
    analogy: t(
      "호텔 프런트에 신분증을 맡기는 것과 같습니다. 방 키(토큰)는 받지만, 집 열쇠(비밀번호)는 주지 않습니다.",
      "Like leaving an ID at a hotel front desk: you get a room key (token) without handing over your house key (password).",
    ),
    inToonstudio: t(
      "소셜 계정 생명주기(연결·해제·탈퇴 시 처리)를 따로 설계했습니다. 로그인 성공 뒤에도 작품 접근 권한은 계속 확인합니다.",
      "The social-account lifecycle (link, unlink, withdrawal) is designed separately. Authorization checks continue even after a successful login.",
    ),
    chapters: ["social-identity-lifecycle", "authentication"],
  },
  {
    id: "share",
    category: "collab",
    term: t("SNS 공유하기", "Social sharing"),
    definition: t(
      "작품을 외부 SNS에 퍼뜨리는 기능입니다. 미리보기 카드(OG 태그)가 클릭을 좌우합니다.",
      "Sharing works to external social apps. The preview card (OG tags) decides the click.",
    ),
    analogy: t(
      "책 표지와 같습니다. 내용이 좋아도 표지(미리보기)가 별로면 집어 들지 않습니다.",
      "Like a book cover: great content still needs a cover (preview card) people want to pick up.",
    ),
    inToonstudio: t(
      "공유 경계(어디까지 내보낼 수 있나)와 원본 권리를 분리합니다. 공유된 이미지가 원본 문서의 권한을 바꾸지 않습니다.",
      "The share boundary (what may leave) is separate from source rights — a shared image never changes the source document's permissions.",
    ),
    chapters: ["share-distribution", "share-distribution-boundary"],
  },
  // ── 사운드 · 모션 ──────────────────────────────────────────────
  {
    id: "procedural-bgm",
    category: "sound",
    term: t("프로시저럴 BGM", "Procedural BGM"),
    definition: t(
      "음악 파일을 재생하는 게 아니라, 코드가 실시간으로 작곡·연주하는 배경음악입니다.",
      "Background music composed and performed live by code — no audio files played back.",
    ),
    analogy: t(
      "CD를 트는 게 아니라 피아니스트를 앉혀 두는 것과 같습니다. 분위기(무드)가 바뀌면 연주도 바뀝니다.",
      "Like seating a pianist instead of playing a CD: when the mood changes, the performance changes.",
    ),
    inToonstudio: t(
      "Web Audio API의 오실레이터+생성형 리버브만 씁니다. 외부 음원 파일이 없어 라이선스 문제가 원천 차단되고, 페이지 무드(home/studio/draw…)마다 스케일·템포 프리셋이 바뀝니다.",
      "Built only on Web Audio oscillators and generative reverb — zero audio files means zero licensing risk. Scale/tempo presets shift per page mood (home, studio, draw, …).",
    ),
    chapters: ["delivery"],
  },
  {
    id: "web-audio",
    category: "sound",
    term: t("Web Audio API", "Web Audio API"),
    definition: t(
      "브라우저에서 소리를 합성·가공하는 표준 API입니다. 오실레이터·필터·이펙트를 노드 그래프로 연결합니다.",
      "The standard API for synthesizing and processing sound in the browser — oscillators, filters and effects wired as a node graph.",
    ),
    analogy: t(
      "모듈러 신디사이저와 같습니다. 소리 나는 상자, 깎는 필터, 울림 통을 케이블로 연결합니다.",
      "Like a modular synthesizer: wire up sound boxes, carving filters and echo chambers with cables.",
    ),
    inToonstudio: t(
      "BGM 엔진의 전부입니다. 자동재생 정책 때문에 AudioContext는 반드시 사용자 클릭/탭 안에서 생성하고, 음성 안내가 나오면 BGM을 살짝 낮추는 덕킹을 겁니다.",
      "The whole BGM engine. Autoplay policy forces AudioContext creation inside a user gesture, and voice guidance ducks the BGM down.",
    ),
    chapters: ["delivery"],
  },
  {
    id: "remotion",
    category: "sound",
    term: t("Remotion", "Remotion"),
    definition: t(
      "React 코드로 영상을 만드는 프레임워크입니다. 디자인을 코드로 짜면 MP4로 렌더링됩니다.",
      "A framework for making videos with React code — design in code, render to MP4.",
    ),
    analogy: t(
      "파워포인트가 아니라 '영상용 프로그래밍'입니다. 슬라이드를 손으로 배치하는 대신, 움직임을 수식으로 씁니다.",
      "Not PowerPoint but programming for video: write motion as formulas instead of placing slides by hand.",
    ),
    inToonstudio: t(
      "브랜드 필름·제품투어 영상의 제작 파이프라인입니다. 프레임·재생 제어·오디오를 코드로 동기화해 같은 영상을 매번 똑같이 뽑아냅니다.",
      "The production pipeline for brand and product-tour films — frames, playback and audio synced in code for byte-identical renders every time.",
    ),
    chapters: ["delivery"],
  },
  // ── AI ─────────────────────────────────────────────────────────
  {
    id: "ai-routing",
    category: "ai",
    term: t("AI 라우팅 (비용 라우터)", "AI routing (cost router)"),
    definition: t(
      "작업 난이도에 따라 무료·저렴·고급 AI를 골라 쓰는 분기 장치입니다.",
      "A dispatcher that picks free, cheap or premium AI per task difficulty.",
    ),
    analogy: t(
      "심부름을 누구에게 맡길지 정하는 반장과 같습니다. 쉬운 일은 동네 형에게, 어려운 일은 전문가에게.",
      "Like a class rep assigning errands: easy ones to the neighbor, hard ones to the specialist.",
    ),
    inToonstudio: t(
      "'무료 우선 설계'의 핵심입니다. 돈이 드는 지점을 숨기지 않고 드러내며, AI 제안과 사람 확정을 나눕니다.",
      "The heart of free-first design: cost boundaries stay visible, and AI proposals stay separate from human approval.",
    ),
    chapters: ["free-ai-routing", "free-ai-cost-router", "cost-engineering"],
  },
  {
    id: "local-ai",
    category: "ai",
    term: t("브라우저 로컬 AI", "In-browser AI"),
    definition: t(
      "서버가 아니라 사용자 브라우저 안에서 직접 돌리는 AI입니다. 데이터가 밖으로 나가지 않습니다.",
      "AI that runs inside the user's browser, not on a server. Data never leaves the device.",
    ),
    analogy: t(
      "집에서 요리하는 것과 같습니다. 식당(서버)에 재료를 맡기지 않으니 빠르고 비밀도 지켜집니다.",
      "Like cooking at home: no handing ingredients to a restaurant (server) — faster and private.",
    ),
    inToonstudio: t(
      "ONNX Runtime Web·MediaPipe 같은 런타임을 검토합니다. 포즈 스캔 같은 가벼운 비전 작업부터 브라우저 안에서 처리하는 게 목표입니다.",
      "Evaluating runtimes like ONNX Runtime Web and MediaPipe — starting with light vision tasks like pose scanning inside the browser.",
    ),
    chapters: ["browser-local-compute"],
  },
  {
    id: "onnx",
    category: "ai",
    term: t("ONNX Runtime Web", "ONNX Runtime Web"),
    definition: t(
      "학습된 AI 모델을 브라우저에서 돌리는 실행기입니다. 파이썬 서버 없이 추론이 됩니다.",
      "A runner for trained AI models in the browser — inference with no Python server.",
    ),
    analogy: t(
      "게임 카트리지를 가정용 게임기에 꽂는 것과 같습니다. 개발기(학습 서버) 없이도 집에서 돌아갑니다.",
      "Like slotting a game cartridge into a home console: it runs at home without the dev kit (training server).",
    ),
    inToonstudio: t(
      "로컬 AI 실행 환경 후보입니다. 모델 크기·WASM/GPU 백엔드·첫 실행 대기시간을 함께 봅니다.",
      "A candidate local-AI runtime. Model size, WASM/GPU backends and first-run latency are evaluated together.",
    ),
    chapters: ["browser-local-compute"],
  },
  {
    id: "mediapipe",
    category: "ai",
    term: t("MediaPipe", "MediaPipe"),
    definition: t(
      "구글의 실시간 비전 AI 파이프라인입니다. 손·얼굴·포즈 추적 등을 브라우저에서도 돌릴 수 있습니다.",
      "Google's real-time vision AI pipeline — hand, face and pose tracking, runnable in the browser.",
    ),
    analogy: t(
      "웹캠을 '보는 눈'으로 바꾸는 안경과 같습니다. 화면 속 사람의 관절 위치를 숫자로 읽어냅니다.",
      "Glasses that turn a webcam into seeing eyes — reading a person's joint positions as numbers.",
    ),
    inToonstudio: t(
      "포즈 스캐너의 비전 백엔드 후보입니다. 카메라 앞에서 포즈를 잡으면 3D 캐릭터 뼈대에 매핑합니다.",
      "A candidate vision backend for the pose scanner: strike a pose in front of the camera, get it mapped onto a 3D character's bones.",
    ),
    chapters: ["browser-local-compute", "vrm-standard"],
  },
  // ── 개발 문화 · 배포 ───────────────────────────────────────────
  {
    id: "adr",
    category: "craft",
    term: t("ADR (아키텍처 결정 기록)", "ADR (Architecture Decision Record)"),
    definition: t(
      "'왜 이렇게 만들었나'를 짧게 남기는 문서입니다. 코드가 이유를 말해주지 않기 때문입니다.",
      "A short note on 'why we built it this way' — because code never explains its reasons.",
    ),
    analogy: t(
      "요리 레시피 옆에 붙은 메모와 같습니다. '소금을 나중에 넣는 이유: …'가 없으면 다음 사람이 함부로 바꿉니다.",
      "Like a margin note on a recipe: without 'why salt goes in late', the next cook changes it carelessly.",
    ),
    inToonstudio: t(
      "스태빌라이저(ADR 0005), libmypaint 레인(ADR-0011)처럼 번호를 붙여 관리합니다. 발표의 '왜 이 기술을 골랐나' 이야기는 전부 ADR에서 나옵니다.",
      "Numbered and maintained — stabilizer (ADR 0005), the libmypaint lane (ADR-0011). Every 'why this tech' story in the talk comes from an ADR.",
    ),
    chapters: ["ai-assisted-engineering"],
  },
  {
    id: "monorepo",
    category: "craft",
    term: t("모노레포", "Monorepo"),
    definition: t(
      "여러 패키지·앱을 하나의 저장소에서 함께 관리하는 방식입니다.",
      "Managing multiple packages and apps together in one repository.",
    ),
    analogy: t(
      "각자 다른 건물에 사는 대신 한 아파트 단지에 사는 것과 같습니다. 엘리베이터(공유 패키지)로 오가기 쉽습니다.",
      "Like living in one apartment complex instead of separate buildings — easy to visit via the elevator (shared packages).",
    ),
    inToonstudio: t(
      "apps/web(앱)와 packages/studio-*(엔진들)가 한 저장소입니다. 브러시 엔진을 고치면 앱에서 바로 검증할 수 있습니다.",
      "apps/web and packages/studio-* live in one repo, so a brush-engine fix can be verified in the app immediately.",
    ),
    chapters: ["architecture"],
  },
  {
    id: "reproducible-build",
    category: "craft",
    term: t("재현 가능 빌드", "Reproducible build"),
    definition: t(
      "누가·언제 빌드해도 바이트 단위로 똑같은 결과물이 나오는 빌드입니다.",
      "A build that produces byte-identical output no matter who builds it or when.",
    ),
    analogy: t(
      "금고 지문과 같습니다. 결과물의 해시(INTEGRITY.sha256)가 하나라도 다르면 '누군가 손댔다'는 증거가 됩니다.",
      "Like a safe's fingerprint: if the artifact hash (INTEGRITY.sha256) differs by one bit, something was tampered with.",
    ),
    inToonstudio: t(
      "Hokusai WASM은 상용 릴리스에서 두 번 독립 빌드해 바이트 일치를 강제합니다. 툴체인·시간·로케일까지 고정합니다.",
      "Hokusai WASM release builds run twice independently and must match byte-for-byte — toolchain, timestamps and locale all pinned.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "i18n",
    category: "craft",
    term: t("i18n (국제화)", "i18n (Internationalization)"),
    definition: t(
      "한 코드로 여러 언어를 지원하는 설계입니다. 한국어·영어 문구를 코드와 분리해 관리합니다.",
      "Designing one codebase to serve many languages — Korean/English copy kept separate from code.",
    ),
    analogy: t(
      "자막 파일과 같습니다. 영화(코드)는 하나, 자막(문구)만 갈아끼웁니다.",
      "Like subtitle files: one movie (code), swappable subtitles (copy).",
    ),
    inToonstudio: t(
      "기술 페이지 전체가 한·영 이중 언어로 쓰여 있습니다. 용어집의 모든 항목도 ko/en 쌍으로 관리됩니다.",
      "Every technology page ships in Korean and English. All glossary entries are maintained as ko/en pairs.",
    ),
    chapters: ["architecture"],
  },
  {
    id: "ci-cd",
    category: "craft",
    term: t("CI / CD", "CI / CD"),
    definition: t(
      "CI(지속 통합)는 코드를 합칠 때마다 자동 검사, CD(지속 배포)는 검사를 통과하면 자동 배포입니다.",
      "CI auto-tests every merge; CD auto-deploys what passes.",
    ),
    analogy: t(
      "공장 컨베이어벨트 위 검수원과 같습니다. 불량이면 벨트가 멈추고, 통과해야 다음 공정(배포)으로 갑니다.",
      "Like inspectors on a factory conveyor: defects stop the belt, only passing goods move to shipping (deploy).",
    ),
    inToonstudio: t(
      "main 머지 전 검증 파이프라인이 돕니다. 용어집·발표 자료를 고쳐도 테스트·타입검사가 깨지면 합쳐지지 않습니다.",
      "A verification pipeline guards the main branch — glossary or deck edits that break tests or typechecks don't merge.",
    ),
    chapters: ["quality"],
  },
  {
    id: "oss-license",
    category: "craft",
    term: t("오픈소스 라이선스", "Open-source licenses"),
    definition: t(
      "오픈소스를 쓸 때 지켜야 하는 이용 조건입니다. MIT·Apache는 관대하고, GPL은 전염성이 있습니다.",
      "Usage terms for open source. MIT/Apache are permissive; GPL is contagious.",
    ),
    analogy: t(
      "레시피 공유 조건과 같습니다. '출처만 밝혀라'(MIT)와 '네 레시피도 공개해라'(GPL)는 전혀 다릅니다.",
      "Like recipe-sharing terms: 'credit me' (MIT) vs 'publish your recipe too' (GPL) are worlds apart.",
    ),
    inToonstudio: t(
      "/about/technology/licenses에 그룹별 의무·주의사항을 공개합니다. '오픈소스'라는 한 단어로 묶지 않고 도구마다 따로 검토합니다.",
      "Obligations and cautions per license group are published at /about/technology/licenses — reviewed tool by tool, never lumped as 'open source'.",
    ),
    chapters: ["licenses"],
  },
];

export const GLOSSARY_TERM_COUNT = ENGINEERING_GLOSSARY.length;
