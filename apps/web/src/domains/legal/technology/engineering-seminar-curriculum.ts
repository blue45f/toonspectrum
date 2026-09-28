import type { LocalizedText } from "./engineering-story-content";

export type SeminarDuration = 15 | 30 | 45;
export interface SeminarLesson {
  readonly id: string;
  readonly chapterId: string;
  readonly minimumMinutes: SeminarDuration;
  readonly section: LocalizedText;
  readonly title: LocalizedText;
  readonly takeaway: LocalizedText;
  readonly points: readonly LocalizedText[];
  readonly flow: readonly LocalizedText[];
  readonly script: LocalizedText;
  readonly question: LocalizedText;
  readonly technologies: readonly string[];
  readonly demo?: { readonly href: string; readonly action: LocalizedText; readonly expected: LocalizedText; readonly fallback: LocalizedText };
}
const t = (ko: string, en: string): LocalizedText => ({ ko, en });
const product = t("01 · 창작자의 문제", "01 · The creator's problem");
const drawing = t("02 · 입력에서 한 장의 그림까지", "02 · From input to a drawing");
const local = t("03 · 브라우저의 한계 넘기", "03 · Beyond browser constraints");
const spatial = t("04 · 3D를 작품의 일부로", "04 · 3D as part of the artwork");
const ai = t("05 · 협업과 AI의 역할", "05 · Collaboration and AI");
const delivery = t("06 · 시연, 검증, 재사용", "06 · Demonstration, evidence and reuse");

/** 발표용 요약과 발표자가 읽을 설명을 분리한다. 도입 상태와 코드 근거는 공개 챕터에서 가져온다. */
export const SEMINAR_LESSONS = [
  {
    id: "seminar-opening", chapterId: "product-intent", minimumMinutes: 15, section: product,
    title: t("웹페이지를 넘어, 작업이 이어지는 제작실로", "Beyond a webpage: a studio that keeps work connected"),
    takeaway: t("오늘의 질문은 ‘기능이 몇 개인가’가 아니라 ‘브라우저에서 작업을 어떻게 끝까지 지키는가’입니다.", "Today's question is not how many features exist, but how a browser can protect the whole creative journey."),
    points: [t("창작 흐름을 먼저 보고 기술을 설명합니다.", "Start with the creative journey, then explain the technology."), t("드로잉·3D·저장·AI를 하나의 사례로 연결합니다.", "Connect drawing, 3D, persistence and AI through one example."), t("구현된 경로, 설정이 필요한 기능, 실험을 구분합니다.", "Distinguish implemented paths, required setup and experiments.")],
    flow: [t("아이디어", "Idea"), t("한 장면", "A scene"), t("다시 열 수 있는 작품", "A work you can reopen")],
    script: t("먼저 청중에게 ‘그리던 파일을 다른 도구로 옮기다가 레이어나 맥락을 잃은 경험이 있나요?’라고 질문합니다. 툰스튜디오는 모든 전문 프로그램을 한 번에 대체했다는 이야기가 아닙니다. 브라우저 안에서 작업의 연결을 어디까지 책임질 수 있는지 보여주는 사례입니다.\n브랜드 필름은 분위기를 전달하는 24초 소개로만 사용합니다. 이어지는 발표에서는 실제 제품 화면과 구현 근거를 나눠 보여주고, 라이브 데모가 실패하면 무엇까지 확인되었는지 그대로 설명합니다.", "Ask whether anyone has lost layers or context while moving work between tools. ToonStudio is not a claim that every professional application has been replaced. It is a case study in how far a browser can preserve a creative workflow. Use the 24-second brand film for orientation, then distinguish live product behavior from architectural evidence. When a demo fails, explain exactly what was and was not verified."),
    question: t("오늘 듣고 나서 설명할 수 있어야 하는 것: 왜 로컬 저장, Worker, 렌더러 경계를 나눴을까요?", "By the end: why separate local storage, workers and rendering boundaries?"),
    technologies: ["React", "TypeScript", "Browser-native workflows"],
    demo: { href: "/brand-film#creator-film", action: t("브랜드 필름 24초로 시작", "Open the 24-second brand film"), expected: t("제품이 연결하려는 창작 흐름을 먼저 이해합니다.", "Establish the creative workflow before the technical detail."), fallback: t("영상을 재생하지 못하면 같은 페이지의 스토리보드로 소개합니다.", "Use the storyboard on the same page when playback is unavailable.") },
  },
  {
    id: "seminar-problem", chapterId: "product-intent", minimumMinutes: 15, section: product,
    title: t("도구를 옮길 때마다, 작업의 설명서가 사라집니다", "Every tool handoff can lose the explanation of the work"),
    takeaway: t("파일 하나보다 중요한 것은 장면의 의도, 원본, 수정 이력과 다음 행동입니다.", "A scene's intent, source, revision history and next action matter as much as its file."),
    points: [t("기획 → 콘티 → 드로잉 → 3D → 검수의 단절", "Gaps between planning, boards, drawing, 3D and review"), t("그림과 함께 출처·버전·담당 맥락을 유지", "Keep source, version and ownership alongside the artwork"), t("같은 프로젝트에서 다음 작업으로 이동", "Move to the next task within the same project")],
    flow: [t("흩어진 파일", "Scattered files"), t("프로젝트로 연결", "Connect by project"), t("맥락을 유지한 전달", "A handoff with context")],
    script: t("‘카페에서 주인공이 대화하는 컷’ 하나를 끝까지 따라가 보겠습니다. 대본을 쓰고, 카페 배경을 고르고, 인물 포즈를 잡고, 대사와 그림을 합친 뒤 검수를 받습니다. 각각의 도구가 좋아도 이 과정에서 어떤 버전이 원본인지 모르면 수정할 때마다 일을 반복합니다.\n따라서 프로젝트와 문서의 관계를 먼저 정하고 기능을 그 안에 연결했습니다. 다음 슬라이드부터는 이 한 컷이 입력, 메모리, 저장소, 3D와 AI를 어떻게 통과하는지 설명합니다.", "Follow one panel: a character talking in a cafe. Write the script, choose a background, pose the character, combine drawing and dialogue, then review. Good individual tools do not solve confusion over which revision is authoritative. Establish the relationship between project and document first, then attach capabilities. Follow this panel through input, memory, persistence, 3D and AI."),
    question: t("우리 제품에서 사용자가 맥락을 다시 입력하는 지점은 어디인가요?", "Where does your product make users re-enter their context?"), technologies: ["Project", "Document", "Asset provenance"],
  },
  {
    id: "seminar-workflow", chapterId: "product-intent", minimumMinutes: 30, section: product,
    title: t("한 컷을 만드는 순서가, 페이지를 잇는 순서입니다", "The order of making one panel should connect the pages"),
    takeaway: t("서비스 소개는 ‘무엇’, 제품투어는 ‘어떻게’, 기술 발표는 ‘왜’를 담당합니다.", "The introduction explains what, the product tour how, and the engineering talk why."),
    points: [t("소개·필름: 어떤 문제를 해결하는가", "Introduction and film: which problem is being solved?"), t("제품투어: 작업자가 어떤 순서로 사용하는가", "Product tour: in what order does a creator work?"), t("기술·참고 자료: 선택의 이유와 한계를 설명", "Engineering and references: choices, evidence and limits")],
    flow: [t("서비스 소개", "Introduction"), t("제품 동작", "Product behavior"), t("설계 이유", "Design rationale"), t("재사용 자료", "Reusable references")],
    script: t("여러 페이지를 모두 처음부터 읽으면 같은 소개를 반복하게 됩니다. 세미나에서는 소개를 짧게 하고 제품투어는 드로잉, 3D, AI의 필요한 구간만 보여줍니다. 기술 발표에서는 방금 본 행동의 내부 흐름을 설명합니다.\n참고 자료와 상세 기술 스토리는 발표 중 전부 읽는 페이지가 아니라 질문에 답하거나 발표 후 찾아보는 근거 자료입니다. 데모 링크는 새 탭에서 열어 현재 슬라이드 위치를 유지합니다.", "Reading every page from the beginning repeats the introduction. Keep orientation brief and show only the drawing, 3D and AI sections needed for the talk. Explain the internal flow of the action the audience just saw. References and the detailed engineering story support questions and later study rather than becoming a second spoken presentation. Open demos in a separate tab so the slide position is retained."),
    question: t("이 페이지의 다음 행동이 앞에서 설명한 문제와 연결되나요?", "Does the page's next action connect to the problem just explained?"), technologies: ["Route registry", "Chapter deep links", "Progressive disclosure"],
  },
  {
    id: "seminar-architecture", chapterId: "architecture", minimumMinutes: 15, section: product,
    title: t("화면, 작업 엔진, 서버의 책임을 나눕니다", "Separate the responsibilities of UI, engines and server"),
    takeaway: t("React는 작업을 조작하는 화면이지, 모든 픽셀과 파일의 저장소가 아닙니다.", "React is the interface for manipulating work, not the storage for every pixel and file."),
    points: [t("화면: 메뉴·도구·선택 상태", "UI: menus, tools and selection state"), t("문서·엔진: 편집 명령·렌더링·로컬 저장", "Document and engines: commands, rendering and local persistence"), t("서버: 계정·권한·공유·외부 서비스 경계", "Server: accounts, authorization, sharing and external services")],
    flow: [t("사용자 입력", "User input"), t("편집 명령", "Edit command"), t("문서와 엔진", "Document and engine"), t("저장·공유", "Persist and share")],
    script: t("식당에 비유하면 React 화면은 주문을 받는 곳이고, 문서와 렌더러는 실제 요리를 만드는 주방입니다. 주문 상태와 모든 재료를 한 곳에 몰아두면 변경이 서로 영향을 줍니다. 상태관리 라이브러리 하나를 고르는 문제보다 무엇을 누가 소유하는지 정하는 일이 먼저입니다.\n툰스튜디오는 앱과 패키지 경계를 두고, 편집 명령과 문서 계약을 중심에 둡니다. 이 구조 덕분에 화면을 바꾸거나 전문 엔진을 추가할 때 원본 문서를 무심코 다른 표현으로 덮어쓰는 일을 줄일 수 있습니다.", "Think of the UI as a restaurant's order counter and the document and renderer as its kitchen. Putting orders and every ingredient in one place couples unrelated changes. Decide who owns each state before choosing a state library. Application and package boundaries put editing commands and document contracts at the center, reducing accidental source replacement when the UI changes or another engine is added."),
    question: t("이 상태는 UI, 원본 문서, 캐시 중 어디에 있어야 할까요?", "Does this state belong to the UI, the source document or a cache?"), technologies: ["React", "TypeScript", "Zustand", "Command / document contracts"],
  },
  {
    id: "seminar-document", chapterId: "brush-render-authority", minimumMinutes: 30, section: drawing,
    title: t("빠르게 보이는 그림과, 저장할 원본은 다릅니다", "A fast preview is not the source we commit"),
    takeaway: t("미리보기는 빠르게, 확정 결과는 다시 열어도 같은 의미로 남깁니다.", "Make previews responsive; preserve the meaning of committed results when reopened."),
    points: [t("입력 중에는 지연을 줄이는 임시 표시", "Use a low-latency preview while drawing"), t("입력 종료 후 검증된 경로로 결과 확정", "Commit through the validated rendering path"), t("Undo·저장·내보내기는 확정 문서를 기준으로", "Undo, persistence and export use the committed document")],
    flow: [t("펜 이동", "Pen movement"), t("즉시 미리보기", "Immediate preview"), t("확정", "Commit"), t("다시 열기", "Reopen")],
    script: t("펜을 움직일 때는 바로 따라오는 느낌이 중요합니다. 하지만 그 임시 화면을 그대로 원본으로 저장하면 예측 좌표나 미완성 합성이 영구 데이터가 될 수 있습니다. 그래서 입력 중 보이는 것과 확정할 때 남기는 것을 구분합니다.\n이때 정본이라는 말은 ‘최종 판단의 기준이 되는 데이터’라는 뜻입니다. 원본 문서는 한 곳에서 관리하고, 썸네일·미리보기·캡처는 그 결과물로 취급합니다. 실패했을 때 다른 엔진으로 조용히 덮어쓰는 것보다 지원하지 않는 이유를 보여주는 편이 안전한 경우도 있습니다.", "A stroke must follow the pen immediately, but saving a temporary screen can commit predicted coordinates or unfinished compositing. Separate preview from commit. An authoritative document is the data used as the final reference; thumbnails and captures are derived outputs. In some cases explicitly reporting unsupported rendering is safer than silently replacing the result with another engine."),
    question: t("미리보기와 내보내기 결과가 다를 때 어느 쪽이 기준인가요?", "Which result is authoritative when preview and export differ?"), technologies: ["Pointer prediction", "Tile commit", "Undo / redo", "Document authority"],
  },
  {
    id: "seminar-input", chapterId: "brush-engine", minimumMinutes: 15, section: drawing,
    title: t("손의 움직임은 점이고, 브러시는 그 점을 해석합니다", "Your hand produces samples; a brush interprets them"),
    takeaway: t("자연스러운 선은 좌표를 잇는 것만으로 만들어지지 않습니다.", "Natural strokes need more than joining coordinates."),
    points: [t("Pointer Events에서 좌표·압력·시간을 수집", "Collect position, pressure and time with Pointer Events"), t("안정화와 보간으로 흔들림·간격을 조절", "Control jitter and spacing through stabilization and interpolation"), t("선의 형상과 질감·색 혼합을 구분", "Separate stroke geometry from texture and color mixing")],
    flow: [t("입력 샘플", "Input samples"), t("안정화", "Stabilization"), t("선·브러시 자국", "Geometry and marks"), t("레이어 합성", "Layer compositing")],
    script: t("같은 마우스 이동이라도 연필, 펜, 수채화가 달라야 합니다. 좌표와 압력은 재료이고, 안정화는 손 떨림을 다루는 단계이며, 브러시는 선의 외곽이나 반복되는 자국을 만드는 단계입니다. 그 뒤에 색과 투명도를 합성합니다.\n지나친 안정화는 선을 매끈하게 하지만 손보다 늦게 따라옵니다. 입력 예측은 지연을 줄여도 확정 데이터와 구분해야 합니다. 시연에서는 빠른 선과 천천히 그린 선을 비교하고 브러시를 바꿨을 때 결과가 실제로 달라지는지 보여줍니다.", "Pencil, pen and watercolor should not look identical for the same movement. Samples are the raw material; stabilization handles jitter; the brush creates geometry or repeated marks; compositing combines color and opacity. Too much smoothing increases perceived lag. Prediction can reduce lag but must remain distinct from committed data. Compare fast and slow strokes and show whether changing the brush changes the result."),
    question: t("지연을 줄이면서도 저장 결과를 유지하려면 무엇을 분리해야 할까요?", "What should be separated to reduce latency without changing saved output?"), technologies: ["Pointer Events", "perfect-freehand", "Google Ink", "Brush platform"],
    demo: { href: "/product-tour?t=108&player=mp4#product-tour-video", action: t("1:48 드로잉 구간 보기", "Open the drawing chapter at 1:48"), expected: t("브러시 선택과 그리기 흐름을 확인합니다. 영상은 제품 동작의 소개이며 성능 측정은 아닙니다.", "Observe brush selection and drawing. This video demonstrates the workflow, not a performance measurement."), fallback: t("제품투어 아래 드로잉 설명 또는 기술 스토리의 입력 파이프라인을 사용합니다.", "Use the drawing description or the engineering story's input pipeline.") },
  },
  {
    id: "seminar-brush-libraries", chapterId: "brush-engine", minimumMinutes: 30, section: drawing,
    title: t("드로잉 라이브러리는 경쟁자가 아니라 역할 분담입니다", "Drawing libraries solve different parts of the problem"),
    takeaway: t("외곽선, 벡터 연산, 자연매체와 화면 편집은 서로 다른 문제입니다.", "Outlines, vector operations, natural media and scene editing are different problems."),
    points: [t("perfect-freehand·Google Ink: 입력을 선의 형상으로", "perfect-freehand and Google Ink: samples to stroke geometry"), t("Paper.js·곡선 도구: 경로와 기하 연산", "Paper.js and curve utilities: paths and geometry"), t("p5.brush·Hokusai: 자연매체 표현 경로", "p5.brush and Hokusai: natural-media rendering paths")],
    flow: [t("어떤 결과인가?", "What output?"), t("역할에 맞는 도구", "A role-specific tool"), t("공통 문서로 연결", "Connect to the document")],
    script: t("perfect-freehand는 압력이 있는 선의 외곽을 만드는 도구이지 수채화 물리 엔진이 아닙니다. Paper.js는 벡터 경로를 다루고, p5.brush와 Hokusai는 자연매체 표현이라는 다른 문제를 다룹니다. Konva·React Konva 같은 화면 편집 도구도 브러시 물리 자체와 구분해야 합니다.\n저장소에 패키지가 있다는 사실이 모든 도구가 동시에 주 렌더러로 사용된다는 뜻은 아닙니다. 실제 선택은 provider 등록, 지원 기능과 품질 조건에 따라 달라집니다. 발표에서는 각 라이브러리가 맡은 일을 먼저 말하고 주 경로·보조 경로·실험 여부는 근거 페이지에서 확인합니다.", "perfect-freehand creates pressure-sensitive outlines, not watercolor physics. Paper.js works with vector paths; p5.brush and Hokusai address natural media. Scene-editing tools such as Konva and React Konva are another layer. A dependency does not mean it is the active renderer for every tool. Provider registration, supported capabilities and quality conditions decide the selected path. Explain each role and use implementation evidence to distinguish primary, supporting and experimental paths."),
    question: t("이 라이브러리를 교체하면 문서 형식도 함께 바뀌어야 하나요?", "Would replacing this library require changing the document format?"), technologies: ["perfect-freehand", "Google Ink", "Paper.js", "p5.brush", "Hokusai", "Konva / React Konva"],
  },
  {
    id: "seminar-natural-media", chapterId: "brush-engine", minimumMinutes: 45, section: drawing,
    title: t("수채화는 투명한 선이 아니라, 재료의 반응입니다", "Watercolor is a material response, not just a transparent line"),
    takeaway: t("색 혼합, 종이 질감, 젖음과 가장자리 표현은 따로 검증해야 합니다.", "Color mixing, paper texture, wetness and edge behavior need separate validation."),
    points: [t("형상·색 혼합·표면 질감을 독립적으로 판단", "Evaluate geometry, color mixing and surface texture separately"), t("Mixbox·spectral.js 등 혼색 도구도 적용 범위를 확인", "Check the actual integration scope of mixing tools such as Mixbox and spectral.js"), t("다른 엔진으로 바뀌어도 같은 색이라는 보장은 없음", "Changing engines does not guarantee equivalent color")],
    flow: [t("안료·압력", "Pigment and pressure"), t("재료 모델", "Material model"), t("종이와 합성", "Surface and composite")],
    script: t("빨강과 파랑의 RGB 평균이 물감을 섞은 결과와 항상 같지는 않습니다. 디지털 브러시에서 ‘자연스럽다’는 말은 색뿐 아니라 가장자리, 번짐, 농도 변화까지 포함합니다. 저장소의 혼색 도구와 자연매체 provider는 이 문제를 역할별로 나눠 다룹니다.\n시각적으로 비슷해 보이는 한 장의 데모만으로 품질을 확정하지 않습니다. 같은 입력을 다시 실행한 결과, 작은 화면과 내보내기의 차이, 메모리 비용을 함께 봅니다. 도구마다 라이선스와 배포 조건도 다르므로 오픈소스라는 한 단어로 묶지 않습니다.", "An RGB average does not necessarily resemble mixing physical pigments. Natural media includes edges, diffusion and concentration as well as color. Mixing tools and natural-media providers divide these concerns. A single attractive demo is not sufficient evidence: inspect repeatability, preview/export differences and memory costs. Licensing and distribution terms must also be reviewed individually."),
    question: t("우리 품질 기준은 ‘예쁜 한 장’인가요, ‘반복 가능한 결과’인가요?", "Is quality one attractive image or a repeatable result?"), technologies: ["Hokusai / WASM", "p5.brush", "Mixbox", "spectral.js", "Material brush providers"],
  },
  {
    id: "seminar-renderers", chapterId: "brush-render-authority", minimumMinutes: 30, section: drawing,
    title: t("렌더러를 늘리는 것보다, 결과를 섞지 않는 게 중요합니다", "More renderers matter less than keeping their results coherent"),
    takeaway: t("Canvas2D·WebGL·WebGPU·WASM은 각각 도구이며, 품질 보증 자체는 아닙니다.", "Canvas2D, WebGL, WebGPU and WASM are tools, not quality guarantees."),
    points: [t("CanvasKit/Skia·Vello·ThorVG 등의 역할을 등록부에서 관리", "Manage roles of CanvasKit/Skia, Vello and ThorVG in the registry"), t("장치 지원과 출력 특성에 맞춰 경로 선택", "Select paths by device capability and output characteristics"), t("미지원 시 명시적 안내·검증된 대체 경로", "Expose unsupported cases and use validated fallbacks")],
    flow: [t("문서·요청", "Document and request"), t("기능·품질 확인", "Capability and quality check"), t("선택된 렌더러", "Selected renderer"), t("확정 결과", "Committed output")],
    script: t("WebGPU를 썼다는 사실만으로 앱 전체가 빨라지거나 모든 브러시가 동일하게 지원되지는 않습니다. CanvasKit은 Skia를 웹에서 사용하는 경로이고, 다른 벡터 엔진과 GPU 경로는 각자 출력 특성과 비용이 다릅니다. 등록부는 누가 어떤 결과를 만들 수 있는지 설명하는 메뉴판입니다.\n따라서 엔진을 더 붙이기 전에 입력 계약, 최종 결과의 소유권, 지원하지 않는 효과의 처리 방식을 정해야 합니다. 대체 경로가 원래 선을 다른 형태로 바꾸는 경우에는 조용히 성공한 척하지 않고 기능 제한을 알리는 것이 낫습니다.", "Using WebGPU does not automatically accelerate every part of an application or support every brush identically. CanvasKit exposes Skia to the web; other vector and GPU paths have different output characteristics and costs. A registry describes who can produce which results. Define input contracts, output ownership and unsupported-effect handling before adding engines. Explicit restrictions can be safer than a fallback that silently changes the original stroke."),
    question: t("대체 경로가 결과를 바꾼다면 사용자에게 어떻게 알려야 할까요?", "How should users be informed when a fallback changes the output?"), technologies: ["Canvas2D", "CanvasKit / Skia", "WebGL2", "WebGPU", "Vello", "ThorVG", "Renderer registry"],
  },
  {
    id: "seminar-workers", chapterId: "worker-architecture", minimumMinutes: 15, section: local,
    title: t("무거운 작업을 옮겨도, UI는 같은 작업을 기다립니다", "Moving work off-thread still requires a clear completion contract"),
    takeaway: t("Worker는 별도 작업자입니다. 시작·취소·진행·완료를 연결하는 설계가 필요합니다.", "A worker is another executor. It needs a contract for start, cancellation, progress and completion."),
    points: [t("메인 스레드는 입력과 화면 반응을 우선", "Prioritize input and UI response on the main thread"), t("렌더·연산·저장은 작업별 Worker로 분리", "Separate rendering, compute and persistence by workload"), t("이전 요청의 늦은 결과는 최신 문서를 덮지 않음", "Late results must not overwrite a newer document")],
    flow: [t("명령 + 작업 ID", "Command and job ID"), t("Worker 실행", "Worker execution"), t("버전 확인", "Version check"), t("결과 반영", "Apply result")],
    script: t("Worker는 일꾼을 하나 더 둔 것과 비슷합니다. 하지만 작업을 보냈다는 사실과 작업이 끝났다는 사실은 다릅니다. 사용자가 이미 다른 장면으로 이동했다면 늦게 도착한 결과를 현재 문서에 붙이면 안 됩니다. 작업 ID, 문서 버전과 취소 처리가 필요합니다.\nWebAssembly는 연산 코드를 웹에서 실행하는 형식이고 Worker는 실행 위치를 분리하는 도구입니다. 두 용어는 같은 뜻이 아니며 WASM을 메인 스레드에서 오래 실행하면 여전히 화면을 막을 수 있습니다. 데이터 복사 비용과 메모리 사용도 함께 측정해야 합니다.", "A worker is like an additional employee, but sending a job is not completing it. A result arriving after the user switches scenes must not be attached to the current document: use job IDs, document versions and cancellation. WebAssembly is an execution format; a worker separates the execution context. WASM running too long on the main thread can still block the UI. Measure transfer and memory costs too."),
    question: t("사용자가 취소한 작업의 결과가 늦게 도착하면 어떻게 되나요?", "What happens when a cancelled job returns late?"), technologies: ["Web Workers", "OffscreenCanvas", "Transferable", "WebAssembly", "Job identity"],
  },

  {
    id: "seminar-local-store", chapterId: "storage", minimumMinutes: 15, section: local,
    title: t("저장 버튼보다 먼저, 데이터가 어디에 남는지 묻습니다", "Before the save button, ask where the data actually lives"),
    takeaway: t("로컬 저장과 서버 동기화는 같은 성공 메시지로 묶을 수 없습니다.", "Local persistence and server synchronization are different success states."),
    points: [t("OPFS: 이 사이트 전용 파일 공간", "OPFS: an origin-private file space"), t("SQLite WASM·IndexedDB: 구조화된 로컬 데이터", "SQLite WASM and IndexedDB: structured local data"), t("서버 업로드·다른 기기 복구는 별도 확인", "Verify upload and cross-device recovery separately")],
    flow: [t("편집", "Edit"), t("기기 안에 저장", "Persist on device"), t("동기화 대기", "Queue synchronization"), t("서버 확인", "Server acknowledgement")],
    script: t("문서를 저장했다고 표시해도 실제로는 메모리에만 있거나 업로드가 대기 중일 수 있습니다. 로컬 우선은 먼저 현재 기기의 작업을 지키고, 서버와의 연결을 별도의 단계로 관리하는 방식입니다. OPFS는 사용자의 다운로드 폴더가 아니라 사이트 전용 공간입니다. SQLite WASM은 그 공간을 활용해 구조화된 데이터를 다루는 경로에 사용됩니다.\n사이트 데이터 삭제, 비공개 모드, 용량 제한은 여전히 제약입니다. 로컬 저장 성공을 영구 백업이나 다른 기기에서의 복구 성공으로 설명하지 않습니다. 사용자가 이해할 수 있는 ‘기기에 저장됨’과 ‘동기화됨’의 구분이 기술 자체만큼 중요합니다.", "A saved indicator might only mean data exists in memory or an upload is queued. Local-first protects work on the current device and treats server synchronization as a separate phase. OPFS is private to the site, not the Downloads folder; SQLite WASM can use local storage for structured data. Site-data deletion, private mode and quotas remain constraints. Do not describe local persistence as permanent backup or successful cross-device recovery. Clear saved-on-device and synchronized states are part of the design."),
    question: t("인터넷을 끊고 새로 열었을 때, 어디까지 복구되어야 하나요?", "What must recover when the network is disconnected and the work is reopened?"), technologies: ["OPFS", "SQLite WASM", "IndexedDB", "Checkpoint", "Sync acknowledgement"],
  },
  {
    id: "seminar-offline", chapterId: "pwa-continuity", minimumMinutes: 15, section: local,
    title: t("오프라인은 기능 이름이 아니라, 준비된 범위입니다", "Offline is a prepared scope, not a blanket promise"),
    takeaway: t("앱 화면, 작업 데이터, 브러시·모델 파일이 함께 준비되어야 작업이 이어집니다.", "App code, document data and brush or model assets all need to be available."),
    points: [t("Service Worker: 준비된 앱·정적 파일 응답", "Service Worker: serve prepared app and static assets"), t("로컬 DB: 내 작업의 내용과 복구 지점", "Local database: document content and recovery checkpoints"), t("서버 AI·새 자산·공동 접속은 연결이 필요할 수 있음", "Remote AI, new assets and live sessions may still require a network")],
    flow: [t("온라인에서 준비", "Prepare online"), t("앱·자산 캐시", "Cache app and assets"), t("로컬 작업", "Work locally"), t("재연결 확인", "Check reconnection")],
    script: t("앱을 설치했다는 것과 모든 기능이 오프라인이라는 것은 다릅니다. 앱 셸만 캐시되어 있고 선택한 브러시나 3D 모델이 없다면 편집 화면이 열려도 작업은 멈출 수 있습니다. 그래서 오프라인 데모는 한 번 방문한 뒤 인터넷을 끄는 것만으로 끝내지 않습니다.\n시연할 문서와 자산을 먼저 준비하고, 연결을 끊은 뒤 새로 열기·편집·저장·다시 열기를 확인합니다. 새 서버 요청과 AI 생성은 별도로 표시합니다. 발표 자료의 오프라인 HTML은 텍스트 발표의 대안이며 서비스 전체를 오프라인으로 만드는 기능은 아닙니다.", "Installing an app does not make every capability offline. The shell may be cached while a selected brush or 3D model is missing. Prepare the exact document and assets, disconnect, then verify reopening, editing, saving and reopening again. Distinguish remote requests and AI generation. The downloadable offline presentation is a text-only presentation fallback, not an offline copy of the full service."),
    question: t("‘오프라인 지원’을 어떤 작업 단위로 검증할까요?", "Which user task defines the boundary of offline support?"), technologies: ["PWA", "Service Worker", "Cache Storage", "OPFS", "Offline readiness"],
  },
  {
    id: "seminar-recovery", chapterId: "pwa-continuity", minimumMinutes: 45, section: local,
    title: t("업데이트가 작업 중인 원고를 밀어내면 안 됩니다", "An application update must not displace an active manuscript"),
    takeaway: t("새 버전 배포, 캐시 교체, 두 탭의 저장 충돌을 함께 생각합니다.", "Consider version deployment, cache replacement and multi-tab writes together."),
    points: [t("작업 중 새 Service Worker를 무조건 활성화하지 않음", "Do not blindly activate a new service worker during editing"), t("자산·문서 버전과 복구 지점을 함께 확인", "Check asset versions, document versions and recovery checkpoints"), t("두 탭·저장 실패·용량 부족도 성공 기준에 포함", "Include multiple tabs, failed writes and storage pressure in acceptance criteria")],
    flow: [t("새 버전 감지", "Detect update"), t("현재 작업 보존", "Preserve current work"), t("전환", "Switch"), t("복구 확인", "Verify recovery")],
    script: t("웹은 새 버전을 빨리 배포할 수 있지만 작업 도구에서는 그 장점이 위험이 될 수도 있습니다. 앱 코드와 캐시 자산의 버전이 어긋나거나 다른 탭이 오래된 상태를 저장하면 사용자의 작업이 뒤로 돌아갈 수 있습니다.\n그래서 업데이트 알림, 저장 완료 확인, 복구 지점과 다중 탭의 작성 권한을 함께 설계합니다. 캐시를 모두 지우라는 안내는 마지막 수단이어야 합니다. 발표 데모에서도 개인 원고가 아닌 별도의 샘플을 사용하고 사용자 데이터 삭제를 복구 절차로 자동 실행하지 않습니다.", "Fast web deployments can become a risk for an authoring tool. Code and cached asset versions may diverge, or another tab may write an older state. Design update notifications, save acknowledgement, checkpoints and multi-tab write ownership together. Clearing all site data should be a last resort. Use a separate sample for demonstrations and never automatically delete user data as a recovery step."),
    question: t("새 버전과 오래된 문서가 동시에 존재할 때 누가 전환을 결정하나요?", "Who controls the transition when new code and an older document coexist?"), technologies: ["Service Worker lifecycle", "Versioned assets", "Checkpoint", "Multi-tab ownership"],
  },
  {
    id: "seminar-scene3d", chapterId: "web-3d-engine", minimumMinutes: 15, section: spatial,
    title: t("3D는 보여주는 물체가 아니라, 수정 가능한 장면입니다", "3D is an editable scene, not merely a displayed object"),
    takeaway: t("모델, 카메라, 조명과 포즈를 분리해야 같은 장면으로 여러 컷을 만들 수 있습니다.", "Separate models, cameras, lighting and poses to reuse a scene across panels."),
    points: [t("장면 문서: 무엇이 어디에 있는가", "Scene document: what exists and where"), t("카메라·조명: 어떻게 보이는가", "Camera and lighting: how it is seen"), t("2D 연결: 어떤 컷과 레이어에 쓰이는가", "2D link: which panel and layer use it")],
    flow: [t("모델·포즈", "Model and pose"), t("카메라·조명", "Camera and light"), t("장면 결과", "Scene output"), t("2D 컷에 연결", "Link to the 2D panel")],
    script: t("카페 모델을 띄우는 것만으로 제작용 3D 도구가 완성되지는 않습니다. 주인공의 위치와 포즈, 카메라 구도와 조명을 바꾸고 같은 장면을 다른 컷에서 다시 써야 합니다. 저장할 것은 완성 이미지뿐 아니라 그 이미지를 다시 만들 수 있는 장면의 상태입니다.\nThree.js는 장면을 렌더링하는 기반이고 React Three Fiber·Drei는 React 환경에서 장면을 구성하고 조작하는 도구입니다. 이 역할과 실제 장면 문서의 소유권을 구분해야 UI를 교체해도 작업을 유지할 수 있습니다.", "Displaying a cafe model is not a complete production tool. Creators need positions, poses, cameras and lighting that can be reused across panels. Persist the scene state that can reproduce the output, not just the image. Three.js provides rendering foundations; React Three Fiber and Drei help construct and manipulate scenes in React. Keep these roles distinct from ownership of the scene document."),
    question: t("3D 결과를 그림으로 넣은 뒤, 원래 구도를 다시 수정할 수 있나요?", "Can the original composition still be edited after inserting the 3D output into a drawing?"), technologies: ["Three.js", "React Three Fiber", "Drei", "Scene document", "Linked layers"],
    demo: { href: "/product-tour?t=228&player=mp4#product-tour-video", action: t("3:48 캐릭터·포즈·3D 보기", "Open character, pose and 3D at 3:48"), expected: t("모델·포즈·장면 편집의 연결을 확인합니다.", "Observe the connection between model, pose and scene editing."), fallback: t("3D 기술 스토리에서 장면 문서와 캡처 경계를 설명합니다.", "Explain the scene-document and capture boundary using the engineering story.") },
  },
  {
    id: "seminar-3d-toolkit", chapterId: "web-3d-engine", minimumMinutes: 30, section: spatial,
    title: t("3D 라이브러리를 기능별 공구함으로 읽습니다", "Read the 3D stack as a task-specific toolbox"),
    takeaway: t("렌더링, 충돌, 선택, 파일 최적화는 같은 3D라도 서로 다른 작업입니다.", "Rendering, collision, selection and asset optimization are different workloads."),
    points: [t("Three.js·Babylon.js: 역할별 렌더링·런타임 경로", "Three.js and Babylon.js: role-specific rendering and runtime paths"), t("Rapier·BVH·CSG: 물리·빠른 탐색·형상 연산", "Rapier, BVH and CSG: physics, spatial queries and geometry operations"), t("glTF Transform·Meshoptimizer·KTX2: 자산 변환과 최적화", "glTF Transform, Meshoptimizer and KTX2: asset conversion and optimization")],
    flow: [t("파일 가져오기", "Import asset"), t("검사·최적화", "Validate and optimize"), t("편집·렌더", "Edit and render"), t("자원 해제", "Release resources")],
    script: t("Three.js와 Babylon.js가 함께 설치되어 있다고 모든 장면을 두 번 그리는 것은 아닙니다. 장면 유형과 전문 기능에 맞춰 연결된 경로를 구분해야 합니다. Rapier는 물리, BVH는 공간 탐색을 빠르게 하기 위한 구조, CSG는 도형을 합치거나 빼는 작업에 관련됩니다.\n모델 최적화는 다운로드 크기만의 문제가 아닙니다. 압축 해제 시간, GPU에 올린 텍스처 크기, 실제 화면 품질까지 봅니다. 저장소의 등록·연동 경로와 현재 장치에서 활성화된 기능은 별도이며, 이름만 나열하지 않고 입력과 출력의 역할로 설명합니다.", "Having Three.js and Babylon.js installed does not mean every scene is rendered twice. Distinguish the paths associated with scene types and specialist capabilities. Rapier addresses physics, BVH accelerates spatial queries, and CSG combines or subtracts geometry. Asset optimization includes decode time, GPU texture footprint and visible quality, not only download size. Registered integrations and capabilities active on the current device are separate facts."),
    question: t("파일 크기는 작아졌는데 왜 첫 화면은 더 느려질 수 있을까요?", "Why might a smaller file make the first frame slower?"), technologies: ["Three.js", "Babylon.js", "Rapier", "three-mesh-bvh", "three-bvh-csg", "glTF Transform", "Meshoptimizer", "KTX2"],
  },
  {
    id: "seminar-avatar", chapterId: "web-3d-engine", minimumMinutes: 30, section: spatial,
    title: t("캐릭터의 포즈는 뼈대를 움직이는 약속입니다", "A pose is a contract for moving a character's skeleton"),
    takeaway: t("모델의 형태, 뼈대, 표정과 포즈의 호환성을 각각 확인해야 합니다.", "Validate model geometry, skeleton, expressions and pose compatibility separately."),
    points: [t("VRM·three-vrm: 캐릭터의 구조와 런타임", "VRM and three-vrm: character structure and runtime"), t("IK: 손·발의 목표에서 관절 자세를 계산", "IK: derive joint positions from hand or foot targets"), t("표정·스프링본·접지의 결과는 모델마다 검증", "Verify expressions, spring bones and grounding per model")],
    flow: [t("캐릭터 불러오기", "Load character"), t("뼈대·표정 확인", "Check skeleton and expressions"), t("포즈 조작", "Manipulate pose"), t("컷에서 검수", "Review in the panel")],
    script: t("인물의 손을 컵 가까이 옮긴다는 행동은 내부적으로 여러 관절의 회전을 조절하는 일입니다. IK는 끝점의 목표를 주고 관절의 자세를 계산하는 방법입니다. 다만 관절 제한, 발의 접지와 표정은 모델마다 다를 수 있습니다.\nVRM 파일을 열었다는 사실과 모든 포즈가 자연스럽다는 것은 다릅니다. 실제 포즈 조작, 저장 후 재열기, 카메라 변경, 2D 출력까지 확인해야 합니다. 카탈로그에 등록된 모델의 라이선스와 기술적 호환성도 서로 다른 체크 항목입니다.", "Moving a hand toward a cup changes several joint rotations. Inverse kinematics starts from an endpoint target and solves joint positions. Joint limits, grounding and expressions can differ by model. Opening a VRM file does not prove every pose is natural. Verify manipulation, save/reopen, camera changes and 2D output; licensing and technical compatibility are separate checks."),
    question: t("모델이 열리는 것과 작품에 쓸 수 있는 것 사이에는 어떤 검사가 필요할까요?", "Which checks separate loading a model from using it in production?"), technologies: ["VRM", "@pixiv/three-vrm", "IK", "Morph targets", "Pose presets"],
  },
  {
    id: "seminar-3d-performance", chapterId: "performance", minimumMinutes: 30, section: spatial,
    title: t("빠른 3D는 FPS보다 먼저, 기다림과 메모리를 봅니다", "Before frame rate, inspect waiting time and memory"),
    takeaway: t("다운로드 → 해석 → GPU 업로드 → 첫 조작의 시간을 따로 봅니다.", "Measure download, parsing, GPU upload and first interaction separately."),
    points: [t("LOD·압축·지연 로딩으로 필요한 자원부터", "Prioritize resources using LOD, compression and lazy loading"), t("뷰어를 닫으면 GPU·이벤트·Worker도 정리", "Release GPU resources, listeners and workers when a viewer closes"), t("모바일과 인앱 브라우저는 독립적으로 검증", "Validate mobile and in-app browsers independently")],
    flow: [t("다운로드", "Download"), t("해석·업로드", "Parse and upload"), t("첫 조작", "First interaction"), t("닫기·재진입", "Close and reopen")],
    script: t("장면이 열린 뒤 FPS가 높아도 첫 화면을 오래 기다리거나 두 번째 실행에서 메모리가 부족하면 사용성은 나쁩니다. 텍스처는 압축 파일 크기보다 GPU에 올라간 크기가 중요할 수 있고, 닫힌 뷰어가 자원을 계속 붙잡으면 누수가 쌓입니다.\n그래서 로딩 단계를 나누고 작은 자산부터 준비하며, 장면을 열고 닫는 수명주기를 테스트합니다. 모바일에서는 터치 조작과 화면 공간도 성능의 일부입니다. 이 발표에서는 측정하지 않은 FPS나 경쟁 제품 대비 우위를 수치로 주장하지 않습니다.", "High FPS after loading is not enough if the first frame takes too long or the second session runs out of memory. Decoded GPU textures can be much larger than compressed files, and closed viewers can retain resources. Separate loading stages, prioritize assets and test repeated open/close lifecycles. Touch controls and screen space also affect mobile usability. Do not invent unmeasured FPS or competitor performance claims."),
    question: t("측정 지표가 사용자가 실제 기다리는 순간과 일치하나요?", "Do your metrics reflect the moments users actually wait?"), technologies: ["LOD", "Lazy loading", "Texture compression", "Resource ownership", "Device capability checks"],
  },
  {
    id: "seminar-blender", chapterId: "blender-mcp-boundary", minimumMinutes: 30, section: spatial,
    title: t("브라우저 밖의 전문 도구는, 명확한 출입구로 연결합니다", "Connect specialist desktop tools through an explicit boundary"),
    takeaway: t("Blender·MCP·로컬 브리지는 웹의 권한 밖에서 실행되는 별도 경로입니다.", "Blender, MCP and a local bridge run in a separate permission and execution boundary."),
    points: [t("웹: 작업 요청과 결과 확인", "Web: request work and inspect the result"), t("로컬 도구: 설치된 Blender 등으로 전문 작업", "Local tools: specialist work in installed applications such as Blender"), t("복귀: 결과 파일·출처·검증 기록을 프로젝트에 연결", "Return: attach output, provenance and validation to the project")],
    flow: [t("사용자 승인", "User approval"), t("로컬 도구 작업", "Local tool execution"), t("결과 검사", "Validate output"), t("프로젝트 반영", "Apply to project")],
    script: t("웹의 한계를 넘는다는 것은 브라우저 보안을 몰래 우회한다는 뜻이 아닙니다. Blender와 같은 전문 도구가 필요한 작업은 명시적인 로컬 브리지와 권한을 통해 별도 실행합니다. MCP는 도구를 호출하고 결과를 받는 연결 규약이지 3D 렌더링 엔진이 아닙니다.\n브라우저만 열면 자동으로 Blender가 설치되거나 실행되는 것처럼 설명하지 않습니다. 도구 설치, 연결 상태, 입력 파일, 실행 결과를 확인해야 합니다. 결과물을 가져올 때도 파일 크기, 장면 구조, 사용 권리와 버전을 확인하고 프로젝트의 기존 문서를 조용히 덮어쓰지 않습니다.", "Going beyond browser limits is not bypassing browser security. Work requiring specialist applications such as Blender runs through an explicit local bridge and permission boundary. MCP is a protocol for connecting tools, not a 3D engine. Opening the website does not install or run Blender automatically. Check installation, connection, input and execution results, then validate returned assets, rights and versions before applying them."),
    question: t("어디까지 웹만으로 가능하고, 어느 단계부터 로컬 설치가 필요한가요?", "Which steps work in the browser alone, and which require a local installation?"), technologies: ["Blender", "MCP", "ToonBridge", "GLB / glTF", "Artifact validation"],
  },
  {
    id: "seminar-collaboration", chapterId: "collaborative-crdt-boundary", minimumMinutes: 30, section: ai,
    title: t("함께 보이는 것과, 같은 문서를 가진 것은 다릅니다", "Seeing each other is not the same as sharing the same document"),
    takeaway: t("커서·접속 상태, 편집 변경, 저장 확인을 별도 신호로 다룹니다.", "Treat presence, document updates and durable acknowledgement as separate signals."),
    points: [t("Presence: 누가 어디를 보고 있는가", "Presence: who is looking where"), t("CRDT: 지원되는 문서 변경을 어떻게 합치는가", "CRDT: how supported document changes merge"), t("권한·저장·재연결: 서버와 별도 검증", "Permissions, persistence and reconnection need separate verification")],
    flow: [t("편집 명령", "Edit command"), t("변경 전파", "Propagate update"), t("병합", "Merge"), t("저장 확인", "Persistence acknowledgement")],
    script: t("서로의 커서가 움직이는 화면은 인상적이지만, 그것만으로 공동 편집이나 저장 일관성이 증명되지는 않습니다. Yjs 같은 CRDT는 지원되는 변경을 병합하는 데 도움을 주지만 모든 이미지·3D 상태·권한 문제를 자동 해결하지 않습니다.\n발표에서는 어떤 변경이 협업 프로토콜에 포함되는지, 재연결 후 문서가 같은지, 저장 확인이 남는지를 나눠 설명합니다. 두 탭이 아니라 서로 다른 사용자 권한으로 테스트해야 권한 검증까지 확인할 수 있습니다. 가상 스튜디오의 접속 경험과 실제 편집 데이터의 일관성은 별도의 층입니다.", "Moving cursors do not prove collaborative editing or durable consistency. CRDTs such as Yjs help merge supported updates, but do not automatically solve every image, 3D-state or authorization problem. Explain which edits are included, whether documents converge after reconnection and how persistence is acknowledged. Different users and permissions are required to test authorization. Virtual presence and editing consistency are separate layers."),
    question: t("상대방에게 보인 변경이 서버에도 저장되었음을 어떻게 알 수 있나요?", "How do you know a change visible to a peer is also durably saved?"), technologies: ["Yjs", "CRDT", "Socket.IO", "State vector", "Document permissions"],
  },
  {
    id: "seminar-webrtc", chapterId: "webrtc-media-authority", minimumMinutes: 45, section: ai,
    title: t("대화 연결과 문서 동기화는 같은 연결이 아닙니다", "A call connection is not the document synchronization channel"),
    takeaway: t("WebRTC 미디어, 시그널링, 문서 저장의 성공 여부를 구분합니다.", "Distinguish media, signaling and document-persistence success."),
    points: [t("WebRTC: 오디오·비디오 등 실시간 통신", "WebRTC: real-time audio, video and related communication"), t("시그널링: 서로 연결하는 데 필요한 정보 교환", "Signaling: exchange information needed to establish a connection"), t("권한·NAT·TURN·장치 변경은 실패 경로로 테스트", "Test permissions, NAT, TURN and device changes as failure paths")],
    flow: [t("장치 권한", "Device permission"), t("시그널링", "Signaling"), t("미디어 연결", "Media connection"), t("해제·복구", "Release and recover")],
    script: t("같은 방에 입장했다는 상태가 음성 연결 성공을 뜻하지는 않습니다. 카메라와 마이크 권한, 네트워크 구조, 중계 서버 설정이 영향을 줄 수 있습니다. 시그널링은 연결을 협의하는 과정이고 실제 미디어와 문서 데이터의 저장은 서로 다릅니다.\n따라서 장치를 거부했을 때의 안내, 마이크 변경, 재접속, 방을 떠날 때 트랙을 종료하는 동작을 확인해야 합니다. 현재 환경에서 검증하지 않은 TURN 경로나 외부망 통화 품질을 ‘완료’라고 발표하지 않습니다.", "Joining a room does not prove audio connectivity. Device permissions, network topology and relay configuration can affect the result. Signaling negotiates the connection; media and document persistence are distinct. Verify denial messages, microphone changes, reconnection and track cleanup on leaving. Do not claim untested TURN paths or external-network call quality are complete."),
    question: t("방 입장 성공, 통화 성공, 저장 성공을 각각 어떻게 표시하나요?", "How are room entry, call connectivity and persistence reported independently?"), technologies: ["WebRTC", "RTCPeerConnection", "ICE", "STUN / TURN", "Socket.IO signaling"],
  },

  {
    id: "seminar-ai-routing", chapterId: "free-ai-routing", minimumMinutes: 15, section: ai,
    title: t("AI에게 맡기는 일과, 사람이 확정하는 일을 나눕니다", "Separate AI proposals from human approval"),
    takeaway: t("AI는 작업의 보조자입니다. 공급자 연결, 실패 처리와 결과 검수가 함께 필요합니다.", "AI assists the workflow; provider setup, failure handling and review are part of the feature."),
    points: [t("입력: 문맥·참조·허용된 데이터만 전달", "Input: send only relevant context, references and permitted data"), t("실행: 사용 가능한 공급자와 기능을 확인", "Execution: check available providers and capabilities"), t("결과: 미리보기 → 사람 검수 → 명시적 반영", "Output: preview, human review, then explicit application")],
    flow: [t("작업 의도", "Task intent"), t("공급자·기능 확인", "Provider and capability check"), t("AI 제안", "AI proposal"), t("검수·반영", "Review and apply")],
    script: t("AI가 있다는 설명 대신 무엇을 맡기는지 구체적으로 말합니다. 아이디어 정리, 참조 이미지 활용, 포즈나 영상 보조처럼 작업 단위가 먼저입니다. 생성 결과를 즉시 원본에 덮어쓰지 않고 사용자가 비교하고 선택할 수 있어야 합니다.\n코드에 공급자 어댑터가 있는 것과 지금 이 환경에서 API가 연결되어 있는 것은 다릅니다. 인증·쿼터·네트워크·안전 정책 때문에 실패할 수 있으며 실패를 임의의 샘플 결과로 숨기지 않습니다. 무료 우선은 무제한 무료라는 뜻이 아닙니다.", "Explain the specific work delegated to AI rather than merely saying AI exists: ideation, reference-guided work, pose or media assistance. Let users compare and approve results instead of overwriting originals. A provider adapter in the repository does not prove that its API is configured in this environment. Authentication, quotas, network and safety policies can cause failures; do not disguise failure with sample output. Free-first does not mean unlimited free usage."),
    question: t("AI가 실패하거나 잘못된 결과를 주면 기존 작업은 안전한가요?", "Is existing work safe when AI fails or produces an unsuitable result?"), technologies: ["Provider adapters", "Capability checks", "Prompt context", "Human review"],
    demo: { href: "/product-tour?t=300&player=mp4#product-tour-video", action: t("5:00 AI 보조 구간 보기", "Open AI assistance at 5:00"), expected: t("AI가 개입하는 작업 흐름을 확인합니다. 실제 생성 가능 여부는 별도 공급자 상태로 확인합니다.", "Observe the AI-assisted workflow; check provider status separately for actual generation availability."), fallback: t("새 생성 요청 대신 기존 예시와 입력·검수 흐름을 설명합니다.", "Explain an existing example and its input/review flow without issuing a new generation request.") },
  },
  {
    id: "seminar-local-ai", chapterId: "browser-local-compute", minimumMinutes: 30, section: ai,
    title: t("브라우저 안에서 AI를 실행하면 무엇이 달라질까요?", "What changes when AI runs inside the browser?"),
    takeaway: t("로컬 추론은 전송을 줄일 수 있지만 모델 준비, 메모리와 장치 성능을 요구합니다.", "Local inference can reduce data transfer, but requires model preparation, memory and device capacity."),
    points: [t("ONNX Runtime Web: 모델을 웹에서 실행하는 런타임", "ONNX Runtime Web: a runtime for executing models on the web"), t("MediaPipe·OpenCV: 비전 작업별 도구와 처리 경로", "MediaPipe and OpenCV: task-specific vision and processing paths"), t("로컬 기능과 서버 생성 AI는 다른 능력·비용·제약", "Local processing and remote generative AI have different capabilities, costs and constraints")],
    flow: [t("모델 준비", "Prepare model"), t("입력 전처리", "Preprocess input"), t("장치에서 추론", "Infer on device"), t("결과 후처리", "Postprocess result")],
    script: t("모델 파일과 입력을 준비한 뒤 브라우저에서 추론할 수 있는 기능이 있습니다. ONNX Runtime Web은 그 실행을 돕고, MediaPipe와 OpenCV는 비전 작업의 다른 부분을 담당합니다. 이 이름들이 있다고 모든 생성 AI가 오프라인으로 동작하는 것은 아닙니다.\n로컬 처리는 서버로 보내는 데이터를 줄일 수 있지만 전체 앱의 모든 데이터가 밖으로 나가지 않는다는 보장은 아닙니다. 모델 다운로드, 캐시, GPU 지원, 메모리, 입력 크기와 실제 결과를 확인해야 합니다. 시연에서는 모델이 준비되지 않은 상태와 준비된 상태를 구분합니다.", "Some capabilities prepare model files and input, then perform inference in the browser. ONNX Runtime Web supports execution, while MediaPipe and OpenCV address other vision tasks. Their presence does not make all generative AI available offline. Local processing can reduce server transfer, but does not prove the entire application sends no data externally. Check model download, caching, GPU support, memory, input size and actual output."),
    question: t("모델을 미리 내려받지 않은 새 기기에서도 같은 기능을 쓸 수 있나요?", "Will this capability work on a new device without a prepared model?"), technologies: ["ONNX Runtime Web", "MediaPipe Tasks Vision", "OpenCV.js", "WASM / WebGPU", "Model caching"],
  },
  {
    id: "seminar-references", chapterId: "licenses", minimumMinutes: 30, section: ai,
    title: t("참고한 이미지와, 배포 가능한 자산은 다릅니다", "A useful reference is not automatically a distributable asset"),
    takeaway: t("기술 문서·생성 도구·자산 사이트를 역할과 사용 조건으로 구분합니다.", "Separate technical documentation, generation tools and asset sites by role and usage conditions."),
    points: [t("공식 문서: API와 제약을 이해하는 자료", "Official documentation: understand APIs and constraints"), t("생성 도구: 입력 권한과 결과 검수가 필요한 외부 서비스", "Generation tools: external services requiring input rights and output review"), t("자산 사이트: 파일별 라이선스·출처·호환성 확인", "Asset sites: check per-file licenses, provenance and compatibility")],
    flow: [t("참조 선택", "Choose reference"), t("권리·출처 확인", "Check rights and provenance"), t("생성·편집", "Generate or edit"), t("결과 기록", "Record the result")],
    script: t("Poly Haven·ambientCG·Blender 문서처럼 참고할 곳과, OpenAI 이미지 생성·Adobe Firefly처럼 외부 생성 기능을 제공하는 도구는 역할이 다릅니다. 이 발표의 참고 링크는 모두 서비스에 내장되었다는 뜻이 아닙니다. 실제 연동 여부는 구현 근거와 공급자 설정에서 별도로 확인합니다.\n다운로드 버튼이 있다고 재배포할 수 있는 것도 아닙니다. 원본 주소, 파일별 사용 조건, 작가 표시와 변경 이력을 확인합니다. AI에 보내는 참고 이미지도 사용할 권한이 필요하며 고객의 비공개 원고나 개인정보를 무심코 외부로 전송하지 않습니다.", "Reference resources such as Poly Haven, ambientCG and Blender documentation differ from external generation tools such as OpenAI image generation or Adobe Firefly. A reference link does not imply an embedded integration. Confirm actual integration and provider configuration separately. A download button is not a redistribution license: inspect the source, asset terms, attribution and changes. Reference images sent to AI also require appropriate rights; do not casually transmit confidential manuscripts or personal data."),
    question: t("이 자산을 어디서 얻었고, 작품에 어떻게 사용할 수 있는지 설명할 수 있나요?", "Can you explain where this asset came from and how it may be used?"), technologies: ["Asset provenance", "Reference images", "License review", "Provider configuration"],
  },
  {
    id: "seminar-skills", chapterId: "ai-assisted-engineering", minimumMinutes: 30, section: ai,
    title: t("AI 개발 도구도, 작업 절차가 있어야 팀원이 됩니다", "AI development tools need an operating procedure"),
    takeaway: t("스킬은 작업 지침, MCP는 도구 연결, 테스트는 결과를 판정하는 근거입니다.", "Skills guide the task, MCP connects tools, and tests provide evidence about the result."),
    points: [t("AGENTS·스킬: 경계·순서·완료 기준 전달", "AGENTS and skills: boundaries, workflow and completion criteria"), t("도구 연결: 읽기·수정·배포 권한을 구분", "Tool connections: separate read, edit and deployment authority"), t("검증: 변경분·테스트·브라우저 증거를 리뷰", "Verification: review diffs, tests and browser evidence")],
    flow: [t("요구사항", "Requirements"), t("지침·도구", "Guidance and tools"), t("구현", "Implementation"), t("검증·리뷰", "Verification and review")],
    script: t("스킬을 사용했다는 말은 특정 3D 엔진을 설치했다는 말과 다릅니다. 스킬은 어떤 순서로 자료를 읽고 구현하고 검증할지 안내하는 작업 지식입니다. MCP는 필요한 도구를 연결하는 방식이며 실제 제품의 렌더링 라이브러리와 구분해서 설명해야 합니다.\n이 저장소에서는 작업 규칙과 테스트를 코드와 함께 관리합니다. AI가 코드를 작성했다는 사실만으로 성공을 인정하지 않고 실제 변경분, 테스트 결과와 브라우저 동작을 확인합니다. PR 병합과 운영 배포도 다른 승인 단계입니다. AI 활용의 핵심은 생성 속도뿐 아니라 사람이 검토할 수 있는 증거를 남기는 것입니다.", "Using a skill is not installing a 3D engine. A skill is procedural knowledge for reading, implementing and verifying work. MCP connects tools; neither should be confused with a rendering library shipped in the product. This repository keeps working rules and tests alongside code. AI-generated code is not automatically accepted: review the diff, test results and browser behavior. PR merging and production deployment have separate approval boundaries. Reviewable evidence matters as much as generation speed."),
    question: t("AI가 ‘완료’라고 말할 때, 사람이 확인할 수 있는 증거는 무엇인가요?", "When AI says a task is complete, what evidence can a person inspect?"), technologies: ["AGENTS.md", "Task skills", "MCP", "Git worktrees", "Vitest", "Playwright"],
  },
  {
    id: "seminar-cost", chapterId: "cost-engineering", minimumMinutes: 45, section: delivery,
    title: t("무료 우선 설계는, 비용이 생기는 지점을 드러내는 일입니다", "Free-first design makes cost boundaries explicit"),
    takeaway: t("정적 파일, API, 저장, 실시간 연결과 AI의 비용을 한 덩어리로 보지 않습니다.", "Separate the costs of static delivery, APIs, storage, realtime sessions and AI."),
    points: [t("정적 웹·API·실시간 경로를 배포 단위로 분리", "Separate static web, API and realtime deployment units"), t("쿼터·실패·대체 경로를 사용자 흐름과 연결", "Connect quotas, failure and fallback to the user journey"), t("운영 반영은 승인된 SHA와 검증 결과를 기준으로", "Release an approved SHA with its verification evidence")],
    flow: [t("기능 요청", "Capability request"), t("비용·쿼터 확인", "Check cost and quota"), t("승인된 실행", "Authorized execution"), t("측정·회수", "Measure and reclaim")],
    script: t("무료 서비스를 조합했다고 운영 비용이 영원히 0이 되는 것은 아닙니다. 정적 자산의 전송, 데이터베이스, 실시간 중계, AI 요청은 서로 다른 비용 곡선을 가집니다. 현재 저장소의 배포 계약은 정적 웹과 Core API 등 배포 단위를 구분합니다.\n비용 최적화가 품질 검증을 생략하는 이유가 되어서는 안 됩니다. 테스트와 보안 검증을 유지하고 운영 배포는 승인된 커밋을 대상으로 합니다. 구체적인 무료 한도와 가격은 바뀔 수 있으므로 발표 시점의 요금표와 설정을 별도로 확인하며 이 슬라이드에서 고정 수치로 약속하지 않습니다.", "Combining free services does not guarantee permanently zero operating cost. Asset delivery, databases, realtime relays and AI requests have different cost curves. The repository's deployment contracts distinguish static web and Core API units. Cost optimization must not bypass testing or security; release an approved commit. Quotas and prices can change, so verify current pricing and configuration rather than promising fixed numbers here."),
    question: t("사용자가 늘 때 가장 먼저 비용이나 한계에 도달하는 경로는 무엇인가요?", "Which path reaches a cost or capacity limit first as usage grows?"), technologies: ["Static assets", "Cloudflare", "Render", "Deployment units", "Quota / capability policy"],
  },
  {
    id: "seminar-auth", chapterId: "authentication", minimumMinutes: 45, section: delivery,
    title: t("로그인 성공 뒤에도, 작품의 접근 권한은 계속 확인합니다", "Authorization continues after a successful login"),
    takeaway: t("인증은 ‘누구인가’, 권한은 ‘이 작품에 무엇을 할 수 있는가’입니다.", "Authentication identifies a user; authorization determines what they may do to a work."),
    points: [t("OAuth·세션: 계정과 로그인 상태", "OAuth and sessions: identity and login state"), t("프로젝트 권한: 읽기·편집·공유 범위", "Project permissions: read, edit and sharing scope"), t("공유 링크·AI 전송·파일 반입도 권한 경계", "Shared links, AI transfers and file imports cross permission boundaries")],
    flow: [t("사용자 확인", "Identify user"), t("작품 권한 검사", "Authorize access"), t("작업 실행", "Execute action"), t("결과·기록", "Result and record")],
    script: t("로그인을 했다는 이유로 모든 프로젝트를 읽거나 수정할 수는 없습니다. 화면에서 버튼을 숨기는 것과 서버에서 권한을 검사하는 것도 다릅니다. 파일 업로드와 외부 AI 전송은 사용자 데이터가 다른 경계로 넘어가는 순간이므로 별도 검토가 필요합니다.\n발표용으로는 별도의 샘플 프로젝트와 계정을 사용하고 실제 고객 자료를 노출하지 않습니다. 인증 경로가 구현되어 있어도 외부 공급자 등록과 운영 환경 설정이 완료되었는지는 별도로 검증합니다.", "A logged-in user cannot automatically read or edit every project. Hiding a button is not server-side authorization. Uploads and external AI transfers move data across boundaries and require their own review. Present with separate sample projects and accounts, not customer data. An implemented authentication path does not prove external provider registration and production configuration are complete."),
    question: t("버튼을 숨긴 것과 요청을 거부한 것을 각각 테스트하고 있나요?", "Do you test both hidden controls and rejected unauthorized requests?"), technologies: ["OAuth / OIDC", "Session", "Project authorization", "Input validation"],
  },
  {
    id: "seminar-media", chapterId: "delivery", minimumMinutes: 15, section: delivery,
    title: t("영상의 중간으로 이동하면, 모든 시계를 함께 옮겨야 합니다", "Seeking a video means moving every clock together"),
    takeaway: t("장면 프레임, 내레이션, BGM과 자막이 같은 시간 위치를 가리켜야 합니다.", "Scene frames, narration, music and captions must refer to the same position."),
    points: [t("Remotion: 시간으로부터 장면을 구성", "Remotion: derive scenes from time"), t("중간 재생: 최초 위치·오디오 준비·연속 요청의 순서", "Seeking: initial position, audio readiness and request ordering"), t("MP4: 호환 재생 경로와 위치를 유지한 복구", "MP4: compatible playback and position-preserving recovery")],
    flow: [t("사용자가 선택한 시간", "Requested time"), t("미디어 준비", "Prepare media"), t("같은 위치로 탐색", "Seek to one position"), t("재생·확인", "Play and verify")],
    script: t("영상이 처음부터 잘 재생된다고 발표 준비가 끝난 것은 아닙니다. 세미나에서는 3분 48초를 눌렀다가 다시 1분 48초로 돌아가는 일이 많습니다. 화면만 이동하고 오디오가 이전 위치에 남거나 준비 전에 설정한 시간이 초기화되면 청중은 설명과 다른 장면을 보게 됩니다.\n최초 마운트 위치, 마지막 탐색 요청, 재생 의도와 실제 미디어 준비 상태를 구분합니다. 늦게 실패한 이전 play 요청이 새로운 탐색을 망치면 안 됩니다. 호환 MP4와 대본을 함께 제공하되, 대체 재생에서는 독립적인 음성·BGM 믹싱이 동일하게 지원되는 것처럼 안내하지 않습니다.", "Playing from the beginning is not enough for a presentation. Presenters jump to 3:48 and back to 1:48. If the scene moves but audio stays behind, or an early seek is reset while metadata loads, the explanation no longer matches the picture. Separate mount position, latest seek request, playback intent and actual readiness. A late rejection from an earlier play must not corrupt a newer seek. Provide compatible MP4 and a transcript while clearly explaining that independent audio mixing is not identical in the fallback."),
    question: t("‘재생 버튼을 눌렀다’ 대신 어떤 미디어 상태를 성공으로 확인할까요?", "Which media states prove success beyond merely clicking Play?"), technologies: ["Remotion Player", "HTMLMediaElement", "Metadata / seeking", "WebVTT", "Playback state machine"],
  },
  {
    id: "seminar-rehearsal", chapterId: "troubleshooting-evidence", minimumMinutes: 30, section: delivery,
    title: t("데모는 성공 장면보다, 돌아올 경로를 먼저 준비합니다", "Prepare the way back before the live demonstration"),
    takeaway: t("발표 슬라이드, 실제 화면, 영상과 읽을 수 있는 설명을 같은 흐름으로 연결합니다.", "Connect slides, live UI, video and readable explanations into one route."),
    points: [t("발표 위치 링크와 새 탭 데모로 맥락 유지", "Preserve context with slide links and new-tab demos"), t("첫 재생·역방향·연속 탐색·일시정지를 확인", "Check cold playback, reverse and rapid seeking, and pause"), t("연결 실패 시 MP4·스토리보드·오프라인 발표본", "Use MP4, storyboards or the offline deck when a connection fails")],
    flow: [t("슬라이드에서 예고", "Set up the demo"), t("실제 동작", "Show behavior"), t("예상 결과 확인", "Check expected result"), t("같은 슬라이드로 복귀", "Return to the slide")],
    script: t("데모를 열기 전에 청중에게 무엇을 볼지 한 문장으로 알려줍니다. ‘지금은 3D 모델이 있다는 사실이 아니라 포즈와 구도가 같은 프로젝트에 연결되는 점을 보겠습니다’처럼 관찰 대상을 정합니다. 마친 뒤에는 새 기능을 계속 누르지 말고 준비한 슬라이드로 돌아옵니다.\n연결이 안 되면 같은 내용을 설명할 대본이나 스토리보드를 사용합니다. 오프라인 발표본은 브라우저에서 열 수 있는 텍스트 중심의 백업입니다. 외부 링크, 새 AI 요청과 서비스 전체 동작까지 오프라인으로 보장하지는 않습니다.", "Before opening a demo, tell the audience what to observe: not simply that a 3D model exists, but that pose and composition remain connected to the project. Return to the prepared slide instead of opening unrelated features. When connectivity fails, use the corresponding script or storyboard. The offline deck is a text-oriented browser backup, not a guarantee that external links, new AI requests or the entire service work offline."),
    question: t("인터넷이 끊겨도 핵심 설명을 이어갈 수 있나요?", "Can the core explanation continue without the network?"), technologies: ["Deep links", "Compatible MP4", "Storyboard", "Offline HTML", "Browser regression tests"],
  },
  {
    id: "seminar-quality", chapterId: "quality", minimumMinutes: 15, section: delivery,
    title: t("좋은 데모를, 반복해서 확인할 수 있는 증거로 바꿉니다", "Turn a good demonstration into repeatable evidence"),
    takeaway: t("코드가 존재함, 테스트 통과, 브라우저 검증, 운영 반영은 서로 다른 상태입니다.", "Code existence, passing tests, browser verification and production deployment are different states."),
    points: [t("단위 테스트: 입력·경계값·실패 순서", "Unit tests: inputs, boundaries and failure ordering"), t("브라우저: 실제 조작·레이아웃·미디어 상태", "Browser tests: interactions, layout and media state"), t("운영: 배포 SHA·연결 설정·실제 환경 확인", "Production: release SHA, configuration and environment checks")],
    flow: [t("문제 재현", "Reproduce"), t("수정", "Fix"), t("회귀 검증", "Regression test"), t("검토 가능한 기록", "Reviewable evidence")],
    script: t("테스트가 모두 초록이라는 말에는 어떤 테스트를 어느 환경에서 실행했는지가 붙어야 합니다. jsdom은 브라우저 화면과 실제 오디오 디코딩을 재현하지 않습니다. 반대로 브라우저에서 한 번 성공했다고 빠른 연속 요청이나 오류 순서까지 안전하다는 뜻도 아닙니다.\n단위 테스트와 실제 브라우저 검증을 함께 남기고 실행하지 못한 범위를 구분합니다. 이번 발표에서 기술의 장점뿐 아니라 확인 방법과 실패 경계를 설명하면 청중은 자신의 프로젝트에 적용할 판단 기준을 얻을 수 있습니다.", "A statement that tests passed must identify the tests and environment. jsdom does not reproduce visual layout or real audio decoding. A single successful browser run does not prove safety under rapid requests or reordered failures. Combine unit tests with actual browser checks and identify untested scope. Explaining verification and failure boundaries gives the audience reusable decision criteria."),
    question: t("이 기능의 완료를 증명하는 최소한의 재현 절차는 무엇인가요?", "What is the smallest repeatable procedure that proves completion?"), technologies: ["Vitest", "Testing Library", "Playwright", "TypeScript", "ESLint", "CI evidence"],
  },
  {
    id: "seminar-close", chapterId: "delivery", minimumMinutes: 15, section: delivery,
    title: t("가져갈 것은 라이브러리 목록보다, 경계를 나누는 방법입니다", "Take away the boundaries, not just the library list"),
    takeaway: t("빠른 입력, 안전한 원본, 명확한 실패, 사람이 검토할 수 있는 결과를 함께 설계합니다.", "Design responsive input, safe source data, explicit failure and reviewable output together."),
    points: [t("무엇이 원본이며 누가 확정하는가", "What is the source, and who commits it?"), t("어디까지 로컬이고 어디부터 연결이 필요한가", "What is local, and what requires a connection?"), t("실패와 대체 경로를 어떻게 확인하는가", "How are failures and fallback paths verified?")],
    flow: [t("사용자 문제", "User problem"), t("책임 구분", "Clear responsibilities"), t("작은 구현", "Small implementation"), t("반복 검증", "Repeatable verification")],
    script: t("오늘은 한 컷을 만드는 과정에서 웹의 입력, 렌더링, 3D, 저장과 AI가 만나는 지점을 살펴봤습니다. 특정 라이브러리를 모두 도입하는 것이 결론은 아닙니다. 우리 제품에서 가장 먼저 지켜야 할 작업 하나와 그 원본을 정하는 것이 시작입니다.\n질문은 구현 경로, 실제 환경의 검증 결과와 아직 확인하지 않은 범위를 나눠 답합니다. 참고 자료에서 공식 문서와 코드 근거를 함께 확인할 수 있습니다. 마지막으로 청중에게 자신의 서비스에서 가장 먼저 분리하고 싶은 책임 하나를 물어봅니다.", "We followed one panel through input, rendering, 3D, persistence and AI. The conclusion is not to adopt every library. Start by choosing one user task and identifying the source data it must protect. Answer questions by distinguishing implementation, environment verification and untested scope. Use the reference material to inspect official documentation and repository evidence. Ask the audience which responsibility they would separate first in their own product."),
    question: t("우리 서비스에 내일부터 적용할 경계 하나는 무엇인가요?", "Which boundary would you apply to your service tomorrow?"), technologies: ["Local-first", "Document authority", "Explicit fallback", "Evidence-based delivery"],
  },
] as const satisfies readonly SeminarLesson[];

export function seminarLessonsForDuration(minutes: SeminarDuration): readonly SeminarLesson[] {
  return SEMINAR_LESSONS.filter((lesson) => lesson.minimumMinutes <= minutes);
}
