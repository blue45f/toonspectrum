import type {
  EngineeringChapter,
  EngineeringEvidence,
  EngineeringEvidenceKind,
  EngineeringGuide,
  EngineeringStatus,
  LocalizedText,
} from "./engineering-story-content";

const evidence = (
  kind: EngineeringEvidenceKind,
  path: string,
  ko: string,
  en: string,
): EngineeringEvidence => ({ kind, path, label: { ko, en } });

export const ENGINEERING_DEEP_DIVE_CHAPTERS = [
  {
    id: "worker-architecture",
    order: 16,
    status: "live",
    eyebrow: "16 · WORKER ARCHITECTURE",
    title: { ko: "무거운 계산을 UI 스레드 밖으로 격리하는 법", en: "Isolating heavy computation from the UI thread" },
    thesis: {
      ko: "Worker는 성능 장식이 아니라 입력·출력·취소·메모리 소유권과 실패 범위를 고정하는 실행 경계입니다.",
      en: "Workers are execution boundaries for inputs, outputs, cancellation, memory ownership and failure—not a decorative performance trick.",
    },
    problem: {
      ko: "이미지 필터, SQLite, WASM 형상 연산, GLB 내보내기와 압축을 메인 스레드에서 실행하면 드로잉 입력과 UI 응답성이 함께 멈춥니다.",
      en: "Image filters, SQLite, WASM geometry, GLB export and compression can freeze drawing input and the interface when they share the main thread.",
    },
    decision: {
      ko: "작업별 typed protocol, 요청 ID, Transferable, AbortSignal, 응답 예산과 종료 규칙을 둔 Dedicated Worker를 사용하고 선택한 실행 backend는 작업 도중 바꾸지 않습니다.",
      en: "Each job uses a Dedicated Worker with a typed protocol, request IDs, Transferables, AbortSignal, response budgets and cleanup rules; the chosen backend never changes mid-job.",
    },
    userValue: {
      ko: "긴 내보내기나 형상 계산 중에도 캔버스와 진행 상태가 반응하며, 취소한 작업이 뒤늦게 결과를 덮어쓰지 않습니다.",
      en: "The canvas and progress UI remain responsive, and cancelled work cannot overwrite newer state when it finishes late.",
    },
    tradeoff: {
      ko: "직렬화 비용과 버퍼 소유권 이동을 설계해야 하며 Worker 오류 뒤 직접 실행으로 몰래 재생하면 중복 결과가 생길 수 있습니다.",
      en: "Serialization and buffer ownership must be designed explicitly, and silently replaying after a Worker error can create duplicate results.",
    },
    technologies: ["Dedicated Worker", "OffscreenCanvas", "Transferable", "AbortController", "SharedArrayBuffer"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-glb-export-worker-client.ts", "GLB 내보내기 Worker 계약", "GLB export Worker contract"),
      evidence("code", "apps/web/src/domains/creator/studio-local-database.worker.ts", "SQLite 전용 Worker", "SQLite-owned Worker"),
      evidence("test", "apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-glb-export-worker-client.test.ts", "전송·취소·실패 회귀 검사", "Transfer, cancellation and failure regression tests"),
      evidence("test", "apps/web/src/domains/creator/studio-local-database-worker-client.test.ts", "DB Worker 소유권 검사", "Database Worker ownership tests"),
    ],
    reuseSteps: [
      { ko: "UI 지연에 영향을 주는 작업을 측정하고 순수 입력·출력 계약으로 분리합니다.", en: "Measure UI-blocking jobs and isolate them behind pure input/output contracts." },
      { ko: "복제 대신 이전할 ArrayBuffer와 Worker가 소유할 자원을 명시합니다.", en: "Declare which ArrayBuffers transfer and which resources the Worker owns." },
      { ko: "취소·timeout·messageerror·종료 후 늦은 응답을 프로토콜에 포함합니다.", en: "Model cancellation, timeout, messageerror and late responses after termination." },
      { ko: "Worker 실패 때 동일 작업을 자동 재실행할지 결과의 중복 가능성으로 판단합니다.", en: "Decide replay after Worker failure according to duplicate-result risk." },
    ],
  },
  {
    id: "pwa-continuity",
    order: 17,
    status: "live",
    eyebrow: "17 · PWA CONTINUITY",
    title: { ko: "설치보다 작업 연속성을 우선한 PWA", en: "A PWA designed for work continuity before installability" },
    thesis: {
      ko: "Service Worker는 원고 저장소가 아니라 앱 셸과 검증된 정적 자산을 복구하는 계층이며 업데이트는 사용자가 안전한 시점에 승인합니다.",
      en: "The Service Worker restores the app shell and verified static assets, not artwork storage, and updates wait for user approval at a safe moment.",
    },
    problem: {
      ko: "제작 중 새 Service Worker가 즉시 활성화되거나 오래된 HTML·JS·WASM이 섞이면 획 도중 화면이 바뀌거나 chunk 404와 격리 헤더 불일치가 생깁니다.",
      en: "Immediate Service Worker activation or mixed HTML, JS and WASM versions can interrupt a stroke, cause chunk 404s and break isolation headers.",
    },
    decision: {
      ko: "경로별 cache strategy, 원자적 core precache, 대형 WASM 제외, 사용자 승인형 skipWaiting, COOP/COEP 보존과 긴급 reset kill switch를 구현했습니다.",
      en: "The implementation uses route-specific caching, atomic core precache, large-WASM exclusion, user-approved skipWaiting, COOP/COEP preservation and an emergency reset kill switch.",
    },
    userValue: {
      ko: "한 번 준비된 작업실은 네트워크가 불안해도 열리며 새 버전 때문에 현재 편집 세션이 갑자기 교체되지 않습니다.",
      en: "A warmed studio can reopen on an unreliable network without a new version unexpectedly replacing the active editing session.",
    },
    tradeoff: {
      ko: "첫 방문만으로 모든 전문 엔진이 오프라인 준비되지는 않으며 앱 셸과 사용자 데이터 복구를 같은 기능으로 오해하면 안 됩니다.",
      en: "A first visit does not make every specialist engine offline-ready, and app-shell recovery must not be confused with user-data recovery.",
    },
    technologies: ["Service Worker", "Cache Storage", "Web App Manifest", "COOP/COEP", "beforeinstallprompt"],
    evidence: [
      evidence("document", "docs/studio-service-worker.md", "Service Worker 운영 계약", "Service Worker operating contract"),
      evidence("code", "apps/web/src/app/service-worker/studio-service-worker-policy.ts", "경로별 캐시 정책", "Route-specific cache policy"),
      evidence("code", "apps/web/src/app/service-worker/studio-service-worker-registration.ts", "업데이트 승인과 reset 등록", "Update approval and reset registration"),
      evidence("test", "scripts/verify-studio-service-worker.mts", "실제 브라우저 오프라인·업데이트 검증", "Real-browser offline and update verification"),
    ],
    reuseSteps: [
      { ko: "오프라인 목표를 앱 셸, 최근 문서, 전문 엔진별로 구분합니다.", en: "Separate offline goals for the app shell, recent documents and specialist engines." },
      { ko: "캐시 키에 build revision을 넣고 core 설치 실패는 원자적으로 처리합니다.", en: "Version cache keys by build revision and make core installation atomic." },
      { ko: "편집·결제 같은 긴 세션은 새 Worker가 기다리게 하고 명시적 승인 후 교체합니다.", en: "Let new Workers wait during long editing or checkout sessions and activate only after approval." },
      { ko: "잘못된 배포를 복구할 kill switch와 브라우저 자동 검증을 함께 둡니다.", en: "Ship a kill switch and real-browser verification for bad deployments." },
    ],
  },
  {
    id: "browser-local-compute",
    order: 18,
    status: "live",
    eyebrow: "18 · LOCAL COMPUTE",
    title: { ko: "브라우저를 로컬 제작 애플리케이션처럼 사용하기", en: "Using the browser as a local production application" },
    thesis: {
      ko: "OPFS, SQLite WASM, WebAssembly, WebGPU와 Worker를 결합해 서버에 보내지 않아도 되는 계산과 원본을 사용자 기기 안에 둡니다.",
      en: "OPFS, SQLite WASM, WebAssembly, WebGPU and Workers keep eligible computation and source data on the user's device.",
    },
    problem: {
      ko: "모든 원본과 중간 계산을 서버로 보내면 업로드 지연, 개인정보 노출, 저장 비용과 네트워크 장애가 제작 경험 전체를 지배합니다.",
      en: "Sending every source asset and intermediate result to a server makes latency, privacy exposure, storage cost and network failure dominate production.",
    },
    decision: {
      ko: "대형 binary는 OPFS, 검색 가능한 메타데이터는 SQLite WASM, 무거운 계산은 Worker/WASM/GPU에 두고 서버에는 공유·게시·권한 원장만 남깁니다.",
      en: "Large binaries live in OPFS, queryable metadata in SQLite WASM, heavy computation in Worker/WASM/GPU, while servers retain sharing, publishing and authority records.",
    },
    userValue: {
      ko: "자동 저장과 편집은 네트워크와 분리되고 개인 원본을 중앙 서비스에 무제한 업로드하지 않아도 됩니다.",
      en: "Autosave and editing remain independent of the network, without requiring unlimited central upload of private source files.",
    },
    tradeoff: {
      ko: "브라우저 저장소 삭제, 기기 분실과 quota를 사용자가 이해할 수 있게 보여주고 별도 내보내기·BYOS 복구 경로를 제공해야 합니다.",
      en: "Storage eviction, device loss and quota need clear UX plus explicit export and BYOS recovery paths.",
    },
    technologies: ["OPFS", "SQLite WASM", "WebAssembly", "WebGPU", "Web Locks"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/studio-opfs-filesystem.ts", "OPFS 파일 계층", "OPFS file layer"),
      evidence("code", "apps/web/src/domains/creator/studio-local-database.worker.ts", "SQLite WASM Worker 권위", "SQLite WASM Worker authority"),
      evidence("test", "scripts/verify-local-first-contracts.mjs", "로컬 우선 경계 검증", "Local-first boundary verification"),
      evidence("document", "docs/operations/quality-preserving-cost-policy.md", "품질 보존형 로컬 계산 정책", "Quality-preserving local-compute policy"),
    ],
    reuseSteps: [
      { ko: "데이터를 원본 binary, 메타데이터, 공유 원장과 파생 결과로 분류합니다.", en: "Classify source binaries, metadata, shared authority and derived results." },
      { ko: "각 데이터에 하나의 쓰기 권위와 복구 가능한 내보내기 형식을 정합니다.", en: "Assign one write authority and a recoverable export format to each data class." },
      { ko: "브라우저 quota와 eviction을 감지하고 저장 상태를 기능 UI에 노출합니다.", en: "Detect browser quota and eviction and expose persistence state in the feature UI." },
      { ko: "네트워크 없이 저장·재시작·복구되는 실제 브라우저 시나리오를 검사합니다.", en: "Test save, restart and recovery in real browsers without a network." },
    ],
  },
  {
    id: "web-3d-engine",
    order: 19,
    status: "experimental",
    eyebrow: "19 · WEB 3D ENGINE",
    title: { ko: "하나의 거대 엔진 대신 역할별 3D 권위 분리", en: "Separating 3D authority instead of adopting one giant engine" },
    thesis: {
      ko: "Three.js 뷰포트, VRM, OpenCascade·Manifold WASM과 Blender QA를 각자의 전문 책임으로 연결합니다.",
      en: "Three.js viewports, VRM, OpenCascade and Manifold WASM, and Blender QA are connected through specialist responsibilities.",
    },
    problem: {
      ko: "뷰포트, 캐릭터 리깅, CAD 형상, boolean, UV, 내보내기와 오프라인 QA를 한 엔진이 모두 소유하면 번들·메모리·파일 호환 문제가 함께 커집니다.",
      en: "Letting one engine own viewport, rigging, CAD geometry, booleans, UVs, export and offline QA couples bundle, memory and compatibility risks.",
    },
    decision: {
      ko: "Three.js/R3F는 상호작용, VRM은 휴머노이드, OpenCascade는 정밀 형상, Manifold는 제한된 boolean, Blender는 오프라인 검증을 맡고 GLB/VRM과 영수증으로 연결합니다.",
      en: "Three.js/R3F own interaction, VRM owns humanoids, OpenCascade precise solids, Manifold bounded booleans and Blender offline validation, connected by GLB/VRM and receipts.",
    },
    userValue: {
      ko: "브라우저에서 배경·캐릭터·카메라를 조작하면서도 전문 계산을 필요한 순간에만 지연 로드할 수 있습니다.",
      en: "Creators can manipulate sets, characters and cameras in-browser while specialist computation loads only when needed.",
    },
    tradeoff: {
      ko: "좌표계, 단위, 재질, skeleton과 파일 provenance를 엔진 사이에서 명시적으로 변환하고 round-trip 검증해야 합니다.",
      en: "Coordinate systems, units, materials, skeletons and provenance require explicit conversion and round-trip validation across engines.",
    },
    technologies: ["Three.js", "React Three Fiber", "Babylon.js", "VRM", "OpenCascade WASM", "Manifold", "GLB/glTF"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccViewportCore.tsx", "상호작용형 Three.js 뷰포트", "Interactive Three.js viewport"),
      evidence("code", "apps/web/src/domains/creator/studio-occt.worker.ts", "OpenCascade Worker 형상 연산", "OpenCascade Worker geometry operations"),
      evidence("code", "apps/web/src/domains/creator/studio-manifold-mesh-provider.ts", "예산·영수증 기반 Manifold backend", "Budgeted, receipted Manifold backend"),
      evidence("test", "apps/web/src/domains/creator/studio-occt-worker-client.test.ts", "정밀 형상 Worker 회귀 검사", "Precision-geometry Worker regression tests"),
    ],
    reuseSteps: [
      { ko: "렌더링, 편집 권위, 정밀 연산과 내보내기를 서로 다른 책임으로 나눕니다.", en: "Separate rendering, edit authority, precision operations and export responsibilities." },
      { ko: "중간 교환 형식과 좌표·단위 변환 영수증을 먼저 정의합니다.", en: "Define interchange formats and coordinate/unit conversion receipts first." },
      { ko: "WASM 엔진은 사용자 동작 이후 지연 로드하고 메모리·삼각형 예산을 둡니다.", en: "Lazy-load WASM engines after intent and enforce memory and triangle budgets." },
      { ko: "내보낸 파일을 다른 loader와 DCC에서 다시 열어 의미를 검증합니다.", en: "Reload exports in independent loaders and DCC tools to verify meaning." },
    ],
  },
  {
    id: "blender-mcp-boundary",
    order: 20,
    status: "experimental",
    eyebrow: "20 · BLENDER · MCP · DCC",
    title: { ko: "Blender 자동화와 MCP를 제품 권위에서 분리하기", en: "Separating Blender automation and MCP from product authority" },
    thesis: {
      ko: "Blender `bpy`는 오프라인 자산 생성·리깅·렌더 QA에 사용하고 MCP 연결은 호스트가 확인될 때만 작동하는 선택형 도구 경계로 둡니다.",
      en: "Blender `bpy` handles offline asset generation, rigging and render QA, while MCP remains an optional tool boundary that runs only with a verified host.",
    },
    problem: {
      ko: "LLM이 DCC 장면을 직접 바꾸게 하면 재현성, 버전, 파일 손상과 결과 소유권이 불명확해지고 연결 실패를 성공처럼 보일 위험이 있습니다.",
      en: "Direct LLM mutation of DCC scenes makes reproducibility, versions, corruption and output ownership unclear, and connection failure can look like success.",
    },
    decision: {
      ko: "Blender script는 입력·출력 파일과 품질 영수증을 갖고 실행하며, VRM 생성 MCP는 local host를 기본으로 사용하고 `blender` 요청에 live host가 없으면 명시적으로 unavailable을 반환합니다.",
      en: "Blender scripts run with explicit files and quality receipts; VRM generation defaults to a local host, and a requested Blender MCP returns unavailable when no live host exists.",
    },
    userValue: {
      ko: "브라우저 결과를 전문 DCC에서 검증하고 자동화할 수 있지만 연결되지 않은 외부 도구 때문에 제작 결과가 사라지지 않습니다.",
      en: "Browser output can be validated and automated in a professional DCC without losing work when an external tool is not connected.",
    },
    tradeoff: {
      ko: "Blender 버전·add-on·VRM importer와 headless 환경을 고정해야 하며 MCP는 현재 기본 제품 경로가 아닙니다.",
      en: "Blender versions, add-ons, VRM importers and headless environments must be pinned, and MCP is not the default product path today.",
    },
    technologies: ["Blender bpy", "MCP", "VRM", "GLB", "SHA-256", "Headless QA"],
    evidence: [
      evidence("code", "scripts/blender/render_everyday_props_pack_v4_qa.py", "Blender 리깅·IK·렌더 QA", "Blender rigging, IK and render QA"),
      evidence("code", "apps/web/src/domains/creator/vrm/studio-vrm-generate-mcp.ts", "fail-closed MCP host 계약", "Fail-closed MCP host contract"),
      evidence("workflow", "scripts/studio-vrm-generate-mcp-host.mts", "VRM 생성·Blender probe CLI", "VRM generation and Blender probe CLI"),
      evidence("test", "apps/web/src/domains/creator/vrm/studio-vrm-blender-package-import.test.ts", "Blender 패키지 무결성·경로 검증", "Blender package integrity and path tests"),
    ],
    reuseSteps: [
      { ko: "자연어 요청을 먼저 versioned recipe와 허용된 tool call로 변환합니다.", en: "Translate natural-language intent into a versioned recipe and allowlisted tool calls." },
      { ko: "DCC 실행은 원본 복사본과 격리된 출력 디렉터리에서 수행합니다.", en: "Run DCC automation on a source copy with an isolated output directory." },
      { ko: "파일 크기·해시·형식·외부 참조·품질 gate를 가져오기 전에 검증합니다.", en: "Validate size, hash, format, external references and quality gates before import." },
      { ko: "호스트 부재와 도구 실패를 성공으로 대체하지 말고 수동 경로를 유지합니다.", en: "Never replace host absence or tool failure with fake success; preserve a manual path." },
    ],
  },
  {
    id: "free-ai-routing",
    order: 21,
    status: "configured",
    eyebrow: "21 · FREE-FIRST AI",
    title: { ko: "무료 AI를 기능이 아니라 비용·실패 계약으로 설계하기", en: "Designing free-first AI as a cost and failure contract" },
    thesis: {
      ko: "공용 무료 풀, 개인 무료 키와 명시적 유료 BYOK를 분리하고 무료 경로가 끝나면 품질을 몰래 낮추거나 결제를 자동 활성화하지 않습니다.",
      en: "The shared free pool, personal free keys and explicit paid BYOK remain separate; exhaustion never silently lowers quality or enables billing.",
    },
    problem: {
      ko: "무료 티어는 모델·지역·계정별 한도가 달라 단순 순환 호출을 하면 중복 추론, 예상치 못한 과금과 개인정보 재전송이 생깁니다.",
      en: "Free tiers vary by model, region and account, so naïve rotation can duplicate inference, create charges and resend private input.",
    },
    decision: {
      ko: "검토된 HTTPS endpoint와 무료 모델 allowlist, `CONFIRMED` 승인, 브라우저·서버 quota ledger, 응답 크기 제한과 추론 전 거절에만 허용되는 fallback을 사용합니다.",
      en: "Reviewed HTTPS endpoints, free-model allowlists, explicit confirmation, browser/server quota ledgers, response caps and pre-inference-only fallback form the boundary.",
    },
    userValue: {
      ko: "사용자는 어떤 공급자와 키가 사용되는지 알고 무료 한도가 끝나도 동의하지 않은 유료 경로로 넘어가지 않습니다.",
      en: "Users know which provider and key are used, and exhaustion never moves them to an unapproved paid route.",
    },
    tradeoff: {
      ko: "공급자 정책과 무료 모델 목록은 계속 재검토해야 하며 네트워크·timeout·5xx처럼 결과가 모호한 실패는 자동 재전송하지 않습니다.",
      en: "Provider terms and free-model lists require ongoing review, and ambiguous network, timeout or 5xx failures are never automatically replayed.",
    },
    technologies: ["BYOK", "OpenAI-compatible API", "Quota ledger", "Circuit breaker", "Provider allowlist"],
    evidence: [
      evidence("code", "apps/web/src/shared/ai/free-ai-policy.ts", "무료 공급자·모델·endpoint 정책", "Free provider, model and endpoint policy"),
      evidence("code", "apps/web/src/shared/ai/free-ai-runtime-budget.ts", "브라우저 요청·토큰 안전 예산", "Browser request and token safety budget"),
      evidence("code", "apps/api/src/modules/studio-ai/studio-ai-provider.ts", "서버 무료 풀과 실패 분류", "Server free pool and failure classification"),
      evidence("document", "docs/operations/free-ai-runtime.md", "무료 우선 AI 운영 계약", "Free-first AI operating contract"),
    ],
    reuseSteps: [
      { ko: "무료, 개인 유료와 운영자 부담 경로를 서로 다른 정책 타입으로 분리합니다.", en: "Represent free, personal paid and operator-funded routes as distinct policy types." },
      { ko: "공식 endpoint·무료 모델·결제 비활성 상태를 allowlist와 승인 플래그로 고정합니다.", en: "Pin official endpoints, free models and billing-disabled state with allowlists and approval flags." },
      { ko: "요청 전에 원자적으로 예산을 예약하고 프롬프트가 아닌 수치만 원장에 기록합니다.", en: "Reserve budget atomically before a request and store counts, never prompts, in ledgers." },
      { ko: "추론 전 확정 거절만 다음 무료 경로로 보내고 모호한 실패는 사용자에게 반환합니다.", en: "Advance only on definitive pre-inference rejection; surface ambiguous failures." },
    ],
  },
  {
    id: "ai-assisted-engineering",
    order: 22,
    status: "documented",
    eyebrow: "22 · AI-ASSISTED ENGINEERING",
    title: { ko: "AI 제안을 검증 가능한 엔지니어링 산출물로 바꾸기", en: "Turning AI proposals into verifiable engineering artifacts" },
    thesis: {
      ko: "AI는 설계·코드·장면 자동화의 제안자일 수 있지만 저장소 검색, typed contract, 테스트, 브라우저 증거와 사람의 승인이 최종 권위입니다.",
      en: "AI can propose designs, code and scene automation, while repository evidence, typed contracts, tests, browser proof and human approval remain authoritative.",
    },
    problem: {
      ko: "대규모 코드베이스에서 AI가 실제 구현과 문서를 구분하지 못하면 존재하지 않는 기능, 잘못된 API와 검증되지 않은 성공을 그럴듯하게 설명할 수 있습니다.",
      en: "In a large codebase, AI can plausibly describe nonexistent features, invalid APIs and unverified success when implementation and documentation are not separated.",
    },
    decision: {
      ko: "작업 전 근거 경로를 찾고 작은 변경 단위, 자동 테스트, 생성물 manifest와 수동 검토를 거치며 MCP는 외부 도구를 호출하는 adapter로만 취급합니다.",
      en: "Work begins with evidence discovery, proceeds in small changes with automated tests and artifact manifests, and treats MCP only as an adapter to external tools.",
    },
    userValue: {
      ko: "개발 속도를 높이면서도 발표 자료와 제품 화면이 실제 코드보다 앞서 주장하는 위험을 줄입니다.",
      en: "Development accelerates without letting presentations or product UI claim more than the code proves.",
    },
    tradeoff: {
      ko: "AI 출력 자체는 증거가 아니므로 코드 리뷰와 실제 실행 비용이 사라지지 않으며 자동화 범위가 넓을수록 승인·rollback 경계가 더 중요합니다.",
      en: "AI output is not evidence, so review and execution costs remain, and broader automation requires stronger approval and rollback boundaries.",
    },
    technologies: ["MCP", "Typed tool contracts", "Artifact manifest", "Visual regression", "Human approval"],
    evidence: [
      evidence("document", "AGENTS.md", "배포·검증·변경 보존 지침", "Deployment, verification and change-preservation rules"),
      evidence("workflow", "scripts/studio-vrm-generate-mcp-host.mts", "MCP/CLI 도구 경계", "MCP/CLI tool boundary"),
      evidence("test", "scripts/creator-film-automation.test.mjs", "영상 자동화 계약 검사", "Film automation contract tests"),
      evidence("workflow", ".github/workflows/technology-story-film.yml", "검토용 영상 산출물 workflow", "Review-only film artifact workflow"),
    ],
    reuseSteps: [
      { ko: "AI 요청 전에 변경 대상·근거·완료 기준을 파일 수준으로 적습니다.", en: "State target files, evidence and completion criteria before asking AI to change anything." },
      { ko: "외부 도구 호출은 schema, allowlist, dry-run과 격리된 출력 경로를 사용합니다.", en: "Use schemas, allowlists, dry runs and isolated outputs for external tool calls." },
      { ko: "생성물에는 입력 revision, 도구 버전, 해시와 검증 결과를 manifest로 남깁니다.", en: "Record input revision, tool version, hashes and verification in an artifact manifest." },
      { ko: "AI가 쓴 설명도 코드·테스트와 대조하고 불확실한 항목은 계획·참고로 표시합니다.", en: "Compare AI-written explanations with code and tests, labeling uncertain scope as planned or reference-only." },
    ],
  },
  {
    id: "cost-engineering",
    order: 23,
    status: "configured",
    eyebrow: "23 · COST ENGINEERING",
    title: { ko: "무료 티어를 지키되 품질을 희생하지 않는 인프라", en: "Protecting free tiers without sacrificing product quality" },
    thesis: {
      ko: "정적·동적·실시간·원장·대형 파일·개인 원본을 다른 실패 도메인으로 나누고 유료 승격은 자동화하지 않습니다.",
      en: "Static, dynamic, realtime, ledger, large-file and private-source workloads live in separate failure domains, with no automatic paid promotion.",
    },
    problem: {
      ko: "모든 요청을 Worker와 API로 통과시키고 모든 파일을 중앙 저장소에 모으면 무료 한도가 제품 성장보다 먼저 병목이 됩니다.",
      en: "Routing every request through Workers and APIs and centralizing every file makes free-tier limits the first scaling bottleneck.",
    },
    decision: {
      ko: "Static Assets 우선, 동적 경로만 Worker, Render scale-to-zero Core API, Durable Objects 실시간 조정, R2 불변 공개 파일, PostgreSQL 단일 원장과 OPFS/BYOS 개인 원본을 사용합니다.",
      en: "Static Assets lead; only dynamic paths use Workers, with a scale-to-zero Core API, Durable Objects coordination, immutable R2 assets, one PostgreSQL ledger and OPFS/BYOS private sources.",
    },
    userValue: {
      ko: "비용 한도에 도달해도 편집·읽기·내보내기 같은 핵심 로컬 기능은 유지되고 몰래 저화질로 바뀌지 않습니다.",
      en: "When a quota approaches, core local editing, reading and export remain available without silent quality reduction.",
    },
    tradeoff: {
      ko: "cold start, 공급자별 quota 관찰과 수동 release가 필요하며 무료는 SLA나 영구 0원을 의미하지 않습니다.",
      en: "Cold starts, provider-specific quota observation and manual release remain, and free-first does not promise an SLA or permanent zero cost.",
    },
    technologies: ["Cloudflare Static Assets", "Workers", "R2", "Durable Objects", "Render", "Neon", "BYOS"],
    evidence: [
      evidence("document", "docs/FREE_INFRASTRUCTURE.md", "무료 우선 인프라 운영 기준", "Free-first infrastructure operating policy"),
      evidence("code", "config/free-infrastructure-policy.json", "기계 검증 가능한 비용 정책", "Machine-verifiable cost policy"),
      evidence("test", "scripts/verify-free-infrastructure-policy.mjs", "인프라 회귀 검증", "Infrastructure regression verifier"),
      evidence("document", "docs/operations/minimum-cost-deployment-policy.md", "수동 최소 비용 배포 절차", "Manual minimum-cost release procedure"),
    ],
    reuseSteps: [
      { ko: "요청·저장·CPU·실시간 workload를 비용 단위와 실패 도메인으로 분리합니다.", en: "Split request, storage, CPU and realtime workloads by cost unit and failure domain." },
      { ko: "정적 경로가 동적 실행량을 사용하지 않는지 배포 설정과 테스트로 고정합니다.", en: "Verify in deployment config and tests that static paths do not consume dynamic execution." },
      { ko: "사용량 60·70·80·85·95% 단계별 조치와 애플리케이션 hard cap을 둡니다.", en: "Define 60, 70, 80, 85 and 95 percent actions plus application hard caps." },
      { ko: "유료 승격·공급자 failover·DB migration은 별도 승인 runbook으로 분리합니다.", en: "Keep paid promotion, provider failover and database migration behind separate approval runbooks." },
    ],
  },
  {
    id: "open-api-data",
    order: 24,
    status: "live",
    eyebrow: "24 · OPEN API · OPEN DATA",
    title: { ko: "무료 Open API를 출처와 권리까지 포함해 연결하기", en: "Integrating free Open APIs with provenance and rights" },
    thesis: {
      ko: "외부 API 응답을 그대로 UI에 뿌리지 않고 host·path·schema·라이선스·조회 시각을 검증한 내부 resource contract로 정규화합니다.",
      en: "External responses are normalized into an internal resource contract after host, path, schema, license and retrieval-time validation.",
    },
    problem: {
      ko: "무료 API는 응답 schema 변경, quota, 부분 장애와 권리 범위가 서로 달라 검색 결과가 곧 재배포·각색 허가라는 오해를 만들 수 있습니다.",
      en: "Free APIs vary in schema stability, quota, partial failure and rights, and discovery results can be mistaken for redistribution or adaptation permission.",
    },
    decision: {
      ko: "Google Books는 판본 메타데이터만, Poly Haven은 CC0 자산 메타데이터·미리보기만 사용하고 KMAS·Wikimedia 등 공급자별 권리와 quota를 별도 대장에 기록합니다.",
      en: "Google Books contributes edition metadata only, Poly Haven contributes CC0 metadata and previews, and provider-specific rights and quotas for KMAS, Wikimedia and others stay in a registry.",
    },
    userValue: {
      ko: "자료를 찾은 위치, 저작자, 라이선스와 원문을 함께 확인하고 실제 파일 이용 조건을 다시 검토할 수 있습니다.",
      en: "Creators see source, author, license and origin together and can review actual file terms before use.",
    },
    tradeoff: {
      ko: "provider마다 schema adapter와 cache·rate limit·부분 성공 처리가 필요하며 API 키는 브라우저에 노출할 수 없습니다.",
      en: "Each provider needs schema adapters, caching, rate-limit and partial-success handling, while API keys remain server-side.",
    },
    technologies: ["Google Books API", "Poly Haven API", "Wikimedia Commons", "KMAS", "Schema validation", "Provenance"],
    evidence: [
      evidence("code", "apps/api/src/modules/creator-resources/google-books-provider.ts", "Google Books metadata adapter", "Google Books metadata adapter"),
      evidence("code", "apps/api/src/modules/creator-resources/polyhaven-provider.ts", "Poly Haven CC0 adapter", "Poly Haven CC0 adapter"),
      evidence("test", "apps/api/src/modules/creator-resources/free-resource-providers.test.ts", "공급자 schema·실패 회귀 검사", "Provider schema and failure regression tests"),
      evidence("document", "docs/operations/free-api-access-register-2026-09-15.md", "무료 API 발급·연동·권리 대장", "Free API access, integration and rights register"),
    ],
    reuseSteps: [
      { ko: "공식 API와 데이터 dump를 크롤링보다 먼저 검토하고 공급자별 허용 범위를 기록합니다.", en: "Prefer official APIs and dumps before crawling and record each provider's allowed scope." },
      { ko: "고정 host/path, response schema, 크기와 pagination 상한을 검증합니다.", en: "Validate fixed hosts and paths, response schemas, sizes and pagination ceilings." },
      { ko: "내부 모델에 source URL, credit, license, fetchedAt과 원문 확인 문구를 필수화합니다.", en: "Require source URL, credit, license, fetchedAt and origin-review guidance in the internal model." },
      { ko: "429·schema drift·일부 공급자 장애를 전체 실패와 구분해 cache와 partial 상태로 처리합니다.", en: "Handle 429s, schema drift and partial provider outages distinctly with caching and partial states." },
    ],
  },
  {
    id: "troubleshooting-evidence",
    order: 25,
    status: "documented",
    eyebrow: "25 · TROUBLESHOOTING",
    title: { ko: "성공 사례보다 재현 가능한 실패 기록 남기기", en: "Recording reproducible failures, not only success stories" },
    thesis: {
      ko: "증상, 잘못된 가설, 실제 원인, 수정, 회귀 테스트와 일반화된 교훈을 같은 항목에 묶어 다음 프로젝트에서 재사용합니다.",
      en: "Symptoms, wrong hypotheses, root cause, fix, regression test and transferable lesson remain in one reusable record.",
    },
    problem: {
      ko: "Worker·PWA·WASM·3D·AI·외부 API 장애는 네트워크 문제처럼 보이기 쉬워 임시 새로고침이나 재시도로 원인이 숨겨집니다.",
      en: "Worker, PWA, WASM, 3D, AI and API failures often look like generic network issues, so refreshes and retries hide their real cause.",
    },
    decision: {
      ko: "기술 페이지에 별도 트러블슈팅 아카이브를 두고 실제 테스트·문서 경로, fail-closed 동작과 다시 발생하지 않게 만든 검증을 연결합니다.",
      en: "A dedicated troubleshooting archive links real tests and documents to fail-closed behavior and the verification that prevents recurrence.",
    },
    userValue: {
      ko: "장애 시 데이터와 비용을 보호하면서 사용자가 할 수 있는 복구 행동과 개발자가 확인할 근거가 명확해집니다.",
      en: "Recovery actions and developer evidence become clear while protecting user data and cost during failures.",
    },
    tradeoff: {
      ko: "사건 기록을 최신 상태로 유지해야 하고 테스트로 고정되지 않은 일회성 해결책은 완료로 표시할 수 없습니다.",
      en: "Incident records require maintenance, and one-off fixes without regression tests cannot be presented as complete.",
    },
    technologies: ["Failure taxonomy", "Fail closed", "Regression test", "Runbook", "Artifact evidence"],
    evidence: [
      evidence("document", "docs/studio-service-worker.md", "PWA 실패·복구 기록", "PWA failure and recovery record"),
      evidence("test", "apps/web/src/app/service-worker/studio-service-worker-continuity.test.ts", "캐시·격리 회귀 검사", "Cache and isolation regression tests"),
      evidence("test", "apps/web/src/shared/ai/free-ai-runtime-budget.test.ts", "quota·cooldown 회귀 검사", "Quota and cooldown regression tests"),
      evidence("test", "apps/web/src/domains/creator/vrm/studio-vrm-blender-package-import.test.ts", "DCC 패키지 공격·손상 회귀 검사", "DCC package attack and corruption regression tests"),
    ],
    reuseSteps: [
      { ko: "사용자 증상과 내부 오류 코드를 분리해 재현 가능한 최소 입력을 보존합니다.", en: "Separate user-visible symptoms from internal error codes and retain a minimal reproduction." },
      { ko: "데이터 손실·중복 과금·권한 노출 위험부터 차단하는 fail-closed 동작을 정합니다.", en: "Choose fail-closed behavior that first prevents data loss, duplicate charges and permission exposure." },
      { ko: "수정 뒤 동일 경로를 자동화한 회귀 테스트나 실제 브라우저 probe로 고정합니다.", en: "Lock the fix with an automated regression test or real-browser probe of the same path." },
      { ko: "제품 고유 원인과 다른 프로젝트에도 적용할 교훈을 분리해 문서화합니다.", en: "Document product-specific cause separately from the lesson reusable elsewhere." },
    ],
  },
] as const satisfies readonly EngineeringChapter[];

export const ENGINEERING_DEEP_DIVE_GUIDES = [
  {
    id: "worker-job-boundary",
    status: "live",
    title: { ko: "Worker 작업 경계 설계", en: "Worker job-boundary design" },
    summary: {
      ko: "메인 스레드에서 떼어낼 작업을 typed protocol, 메모리 소유권, 취소와 실패 정책까지 포함해 설계합니다.",
      en: "Move work off the main thread with a typed protocol covering memory ownership, cancellation and failure policy.",
    },
    outcome: { ko: "중복 실행 없이 취소 가능한 반응형 백그라운드 작업", en: "Responsive cancellable background work without duplicate execution" },
    steps: [
      { ko: "작업의 입력·출력·최대 크기와 하나의 결과 권위를 정의합니다.", en: "Define inputs, outputs, maximum sizes and one result authority." },
      { ko: "requestId와 version을 가진 request/response discriminated union을 만듭니다.", en: "Create versioned request/response discriminated unions with request IDs." },
      { ko: "ArrayBuffer는 Transferable로 넘기고 전송 뒤 원본 접근을 금지합니다.", en: "Transfer ArrayBuffers and forbid source access after ownership moves." },
      { ko: "AbortSignal, timeout, messageerror, worker error와 terminate 정리를 구현합니다.", en: "Implement AbortSignal, timeout, messageerror, Worker error and termination cleanup." },
      { ko: "실패 뒤 direct fallback 재실행 여부를 idempotency로 결정합니다.", en: "Decide direct fallback replay from idempotency, not convenience." },
    ],
    checklist: [
      { ko: "메인 스레드와 Worker 모두 protocol validator 사용", en: "Protocol validator used on both sides" },
      { ko: "전송 버퍼·응답 byte budget 검사", en: "Transferred buffers and response-byte budgets tested" },
      { ko: "취소·timeout·늦은 응답 회귀 테스트", en: "Cancellation, timeout and late-response regressions covered" },
    ],
    code: `type Request = { version: 1; id: number; kind: "export"; bytes: ArrayBuffer };
type Reply = { version: 1; id: number; kind: "ok"; bytes: ArrayBuffer }
  | { version: 1; id: number; kind: "error"; code: string };
worker.postMessage(request, [request.bytes]);`,
  },
  {
    id: "pwa-safe-update",
    status: "live",
    title: { ko: "편집 앱용 PWA 안전 업데이트", en: "Safe PWA updates for editing applications" },
    summary: {
      ko: "설치 가능성보다 버전 일관성, 편집 세션 보호와 복구 가능성을 우선하는 Service Worker 배포 절차입니다.",
      en: "A Service Worker release process prioritizing version consistency, editing-session safety and recovery over install badges.",
    },
    outcome: { ko: "오프라인 앱 셸과 사용자 승인형 무중단 업데이트", en: "Offline app shell with user-approved non-disruptive updates" },
    steps: [
      { ko: "navigation, immutable asset, mutable catalog, API와 Range 요청을 다른 strategy로 분리합니다.", en: "Separate navigation, immutable assets, mutable catalogs, APIs and Range requests." },
      { ko: "core precache는 원자적으로 설치하고 대형 WASM은 사용자 동작 뒤 warm합니다.", en: "Install core precache atomically and warm large WASM only after user intent." },
      { ko: "새 Worker는 waiting 상태로 두고 안전한 시점에 사용자가 적용하게 합니다.", en: "Keep new Workers waiting and let users apply them at a safe moment." },
      { ko: "COOP/COEP/CORP와 CSP를 네트워크·캐시 응답 모두에 보존합니다.", en: "Preserve COOP, COEP, CORP and CSP on network and cached responses." },
      { ko: "query kill switch, cache reset, tombstone Worker와 rollback을 준비합니다.", en: "Prepare query kill switches, cache reset, tombstone Workers and rollback." },
    ],
    checklist: [
      { ko: "작업 중 자동 reload 없음", en: "No automatic reload during active work" },
      { ko: "warm/cold offline 실제 브라우저 검사", en: "Warm and cold offline browser probes" },
      { ko: "Service Worker가 OPFS·SQLite를 직접 소유하지 않음", en: "Service Worker never owns OPFS or SQLite" },
    ],
  },
  {
    id: "browser-local-first",
    status: "live",
    title: { ko: "OPFS + SQLite WASM 로컬 우선 앱", en: "OPFS + SQLite WASM local-first application" },
    summary: {
      ko: "대형 binary, 관계형 메타데이터와 복구 저널을 분리해 네트워크 없이도 저장·재시작 가능한 작업실을 만듭니다.",
      en: "Separate large binaries, relational metadata and recovery journals to support save and restart without a network." },
    outcome: { ko: "중앙 파일 서버 의존이 낮은 내구성 있는 로컬 프로젝트", en: "Durable local projects with low dependence on a central file server" },
    steps: [
      { ko: "binary는 OPFS, 검색 메타데이터는 SQLite, 작고 임시적인 설정은 별도 저장소로 구분합니다.", en: "Put binaries in OPFS, searchable metadata in SQLite and small transient preferences elsewhere." },
      { ko: "SQLite 연결은 한 Worker가 소유하고 탭·세션 lock 정책을 둡니다.", en: "Let one Worker own SQLite and define tab/session lock policy." },
      { ko: "저장 intent, journal, checkpoint와 마지막 정상 revision을 기록합니다.", en: "Record save intents, journals, checkpoints and the last healthy revision." },
      { ko: "명시적 export와 사용자 소유 클라우드 백업을 별도 복구 경로로 제공합니다.", en: "Provide explicit export and user-owned cloud backup as separate recovery paths." },
    ],
    checklist: [
      { ko: "강제 종료 뒤 journal 복구", en: "Journal recovery after forced termination" },
      { ko: "저장소 quota·persistent permission 표시", en: "Storage quota and persistence permission surfaced" },
      { ko: "브라우저 삭제 시 복구 한계 안내", en: "Clear recovery limits after browser-data deletion" },
    ],
  },
  {
    id: "web-3d-dcc-pipeline",
    status: "experimental",
    title: { ko: "웹 3D와 Blender DCC 왕복 파이프라인", en: "Web 3D and Blender DCC round-trip pipeline" },
    summary: {
      ko: "상호작용 뷰포트, 정밀 형상 WASM, VRM 리깅, Blender QA를 파일·좌표 변환·무결성 영수증으로 연결합니다.",
      en: "Connect interactive viewports, precision-geometry WASM, VRM rigs and Blender QA with files, coordinate transforms and integrity receipts." },
    outcome: { ko: "브라우저 편집 결과를 독립 DCC에서 검증 가능한 3D 파이프라인", en: "A 3D pipeline whose browser output is verifiable in an independent DCC" },
    steps: [
      { ko: "편집 authority와 표시용 scene graph를 분리하고 asset revision을 고정합니다.", en: "Separate edit authority from the display scene graph and pin asset revisions." },
      { ko: "좌표계·단위·재질·bone·morph 변환을 versioned receipt로 기록합니다.", en: "Record coordinates, units, materials, bones and morph transforms in versioned receipts." },
      { ko: "정밀 연산은 Worker/WASM에 삼각형·메모리·시간 예산을 둡니다.", en: "Enforce triangle, memory and time budgets around Worker/WASM precision jobs." },
      { ko: "GLB/VRM 패키지의 해시·경로·외부 URI·품질 점수를 import 전에 확인합니다.", en: "Verify GLB/VRM hashes, paths, external URIs and quality scores before import." },
      { ko: "Blender headless 렌더와 독립 loader round-trip을 회귀 gate로 사용합니다.", en: "Use Blender headless rendering and independent-loader round trips as regression gates." },
    ],
    checklist: [
      { ko: "다른 엔진에서 동일 단위·방향·pose 재현", en: "Units, orientation and pose reproduce across engines" },
      { ko: "파일 변조·path traversal·외부 texture 거부", en: "Tampering, path traversal and external textures rejected" },
      { ko: "MCP host 부재 시 명시적 unavailable", en: "Explicit unavailable state when MCP host is absent" },
    ],
  },
  {
    id: "free-ai-cost-router",
    status: "configured",
    title: { ko: "무료 우선 AI 비용 라우터", en: "Free-first AI cost router" },
    summary: {
      ko: "공용 무료 계정과 개인 BYOK를 분리하고 확정적인 추론 전 거절에만 다음 경로를 시도합니다.",
      en: "Separate shared free accounts from personal BYOK and advance only after definitive pre-inference rejection." },
    outcome: { ko: "중복 생성과 자동 과금이 없는 다중 공급자 AI 경로", en: "Multi-provider AI routing without duplicate generation or automatic billing" },
    steps: [
      { ko: "공급자 endpoint, 모델, 무료 상태와 지역을 allowlist합니다.", en: "Allowlist provider endpoints, models, free state and region." },
      { ko: "공용 key는 서버 전용, 개인 key는 메모리 기본·선택형 암호화 vault로 분리합니다.", en: "Keep shared keys server-only and personal keys memory-first with an optional encrypted vault." },
      { ko: "요청·토큰·본문·응답 크기와 일일 UTC budget을 요청 전에 예약합니다.", en: "Reserve request, token, body, response and UTC-day budgets before sending." },
      { ko: "401/403/402/429와 검증된 quota code만 다음 무료 경로로 넘깁니다.", en: "Advance only on 401/403/402/429 and verified quota codes." },
      { ko: "timeout·network·5xx·잘못된 성공 응답은 재전송하지 않습니다.", en: "Do not replay timeouts, network failures, 5xx or malformed success responses." },
    ],
    checklist: [
      { ko: "유료 BYOK 자동 fallback 기본 꺼짐", en: "Paid BYOK automatic fallback disabled by default" },
      { ko: "ledger에 prompt·output·secret 없음", en: "No prompts, outputs or secrets in ledgers" },
      { ko: "402·429·Retry-After 회로 차단 검사", en: "402, 429 and Retry-After circuit-breaker tests" },
    ],
  },
  {
    id: "open-api-adapter",
    status: "live",
    title: { ko: "권리·출처를 보존하는 Open API adapter", en: "Open API adapter preserving rights and provenance" },
    summary: {
      ko: "공급자별 응답을 안전한 내부 resource contract로 바꾸고 검색 메타데이터와 실제 이용 권리를 구분합니다.",
      en: "Normalize provider responses into a safe internal resource contract and distinguish discovery metadata from usage rights." },
    outcome: { ko: "schema drift와 권리 오해에 강한 외부 자료 검색", en: "External resource search resilient to schema drift and rights confusion" },
    steps: [
      { ko: "공식 API·dump·feed를 우선하고 host/path를 고정합니다.", en: "Prefer official APIs, dumps and feeds and pin hosts and paths." },
      { ko: "응답 schema, 문자열·배열·페이지 크기와 URL host를 런타임 검증합니다.", en: "Runtime-validate response schemas, strings, arrays, page sizes and URL hosts." },
      { ko: "sourceUrl, credit, license, fetchedAt과 provider message를 정규화합니다.", en: "Normalize sourceUrl, credit, license, fetchedAt and provider guidance." },
      { ko: "cache, timeout, 429, partial result와 공급자별 quota를 적용합니다.", en: "Apply caching, timeout, 429, partial-result and provider quota policies." },
      { ko: "API 검색 결과와 파일 재배포·각색 허가를 UI에서 구분합니다.", en: "Distinguish API discovery from file redistribution or adaptation permission in the UI." },
    ],
    checklist: [
      { ko: "키가 브라우저·URL·로그에 노출되지 않음", en: "Keys absent from browser, URLs and logs" },
      { ko: "출처·라이선스·조회일 필수", en: "Source, license and retrieval date required" },
      { ko: "일부 공급자 실패 시 partial 상태", en: "Partial state on individual provider failure" },
    ],
  },
  {
    id: "troubleshooting-runbook",
    status: "documented",
    title: { ko: "재현 가능한 트러블슈팅 runbook", en: "Reproducible troubleshooting runbook" },
    summary: {
      ko: "사용자 증상부터 회귀 테스트까지 한 사건 기록으로 묶어 임시 새로고침과 무조건 재시도를 제거합니다.",
      en: "Tie user symptoms through regression tests into one incident record, replacing refresh rituals and blind retries." },
    outcome: { ko: "다음 장애에서 바로 사용할 수 있는 증거 기반 복구 절차", en: "Evidence-based recovery procedures reusable in the next incident" },
    steps: [
      { ko: "시각·브라우저·revision·입력·네트워크 상태와 사용자 증상을 기록합니다.", en: "Record time, browser, revision, input, network state and user symptom." },
      { ko: "데이터 손실·중복 과금·권한 누출 여부로 우선순위를 정합니다.", en: "Prioritize by data loss, duplicate-charge and permission-leak risk." },
      { ko: "잘못된 가설도 남기고 최소 재현과 실제 root cause를 분리합니다.", en: "Keep rejected hypotheses and separate the minimal reproduction from root cause." },
      { ko: "수정은 feature flag·kill switch·rollback과 함께 적용합니다.", en: "Apply fixes with feature flags, kill switches and rollback." },
      { ko: "같은 실패 경로의 unit·integration·browser 회귀 검사를 추가합니다.", en: "Add unit, integration and browser regressions for the same failure path." },
    ],
    checklist: [
      { ko: "증상·원인·해결을 서로 다른 필드로 기록", en: "Symptom, cause and resolution recorded separately" },
      { ko: "사용자 복구 행동과 운영자 rollback 포함", en: "User recovery action and operator rollback included" },
      { ko: "검증 없는 해결책을 완료로 표시하지 않음", en: "No unverified workaround marked complete" },
    ],
  },
] as const satisfies readonly EngineeringGuide[];

export type EngineeringReferenceRelation = "used" | "evaluated" | "inspired" | "alternative";

export interface EngineeringReference {
  readonly id: string;
  readonly relation: EngineeringReferenceRelation;
  readonly status: EngineeringStatus;
  readonly category: LocalizedText;
  readonly title: string;
  readonly summary: LocalizedText;
  readonly applied: LocalizedText;
  readonly caution: LocalizedText;
  readonly evidence: readonly EngineeringEvidence[];
}

export const ENGINEERING_REFERENCE_RELATION_META: Record<
  EngineeringReferenceRelation,
  { readonly label: LocalizedText; readonly description: LocalizedText }
> = {
  used: {
    label: { ko: "실제 사용", en: "Used" },
    description: { ko: "제품 코드·검증 workflow에서 확인됩니다.", en: "Present in product code or verified workflows." },
  },
  evaluated: {
    label: { ko: "평가·실험", en: "Evaluated" },
    description: { ko: "도입 가능성을 검토했거나 제한된 경로에서 실험합니다.", en: "Assessed for adoption or exercised in a bounded experiment." },
  },
  inspired: {
    label: { ko: "제품·UX 참고", en: "Product inspiration" },
    description: { ko: "문제와 사용자 경험을 참고했으며 구현 복제를 뜻하지 않습니다.", en: "Informed product or UX thinking without implying implementation parity." },
  },
  alternative: {
    label: { ko: "대안", en: "Alternative" },
    description: { ko: "현재 기본 선택은 아니지만 교체·확장 후보로 비교합니다.", en: "Compared as a replacement or expansion option, not the default choice." },
  },
};

export const ENGINEERING_REFERENCES = [
  {
    id: "threejs-r3f",
    relation: "used",
    status: "live",
    category: { ko: "웹 3D", en: "Web 3D" },
    title: "Three.js · React Three Fiber · Drei",
    summary: { ko: "배경, 캐릭터, 카메라, gizmo와 GLB/VRM 상호작용의 기본 웹 뷰포트 계층입니다.", en: "The primary web viewport layer for sets, characters, cameras, gizmos and GLB/VRM interaction." },
    applied: { ko: "표시 scene graph와 편집 데이터 권위를 분리하고 전문 계산은 WASM Worker로 전달합니다.", en: "Display scene graphs stay separate from edit authority, while specialist computation moves to WASM Workers." },
    caution: { ko: "렌더러 object를 프로젝트 원본으로 저장하지 않고 GPU 자원 해제와 context loss를 별도로 다룹니다.", en: "Renderer objects are not project source data; GPU disposal and context loss are handled separately." },
    evidence: [
      evidence("code", "apps/web/src/domains/creator/hybrid-dcc/StudioHybridDccViewportCore.tsx", "Hybrid DCC 뷰포트", "Hybrid DCC viewport"),
      evidence("code", "apps/web/src/domains/creator/studio-background-3d-model.ts", "3D 배경 모델 runtime", "3D background model runtime"),
    ],
  },
  {
    id: "babylonjs",
    relation: "used",
    status: "experimental",
    category: { ko: "웹 3D", en: "Web 3D" },
    title: "Babylon.js",
    summary: { ko: "Three.js와 별도 엔진 경계에서 기능·호환성을 비교하고 특정 3D 경로를 검증하는 전문 후보입니다.", en: "A specialist engine boundary used to compare capability and compatibility independently from Three.js." },
    applied: { ko: "엔진 이름보다 입력·출력·품질 영수증을 고정해 교체 가능성을 유지합니다.", en: "Stable input, output and quality receipts preserve replaceability beyond engine choice." },
    caution: { ko: "같은 장면의 최종 권위를 두 엔진이 동시에 가지지 않도록 합니다.", en: "Two engines must never simultaneously own final authority for the same scene." },
    evidence: [
      evidence("code", "package.json", "고정된 Babylon.js 의존성", "Pinned Babylon.js dependencies"),
      evidence("document", "docs/studio-3d-cinematic-asset-pack-20260909.md", "3D 자산·엔진 검토 기록", "3D asset and engine review"),
    ],
  },
  {
    id: "vrm-standard",
    relation: "used",
    status: "live",
    category: { ko: "캐릭터 3D", en: "Character 3D" },
    title: "VRM · @pixiv/three-vrm",
    summary: { ko: "휴머노이드 bone, pose, 표정, spring bone과 MToon 계열 재질을 연결하는 캐릭터 교환 경계입니다.", en: "The character interchange boundary for humanoid bones, poses, expressions, spring bones and MToon-style materials." },
    applied: { ko: "파일 확장자만 믿지 않고 VRM extension과 완전한 humanoid mapping을 검사한 뒤 프로젝트에 등록합니다.", en: "Files enter the project only after VRM extensions and complete humanoid mapping are verified." },
    caution: { ko: "VRM 0/1 차이, rig naming, 좌우 손가락 방향과 외부 texture를 round-trip 테스트해야 합니다.", en: "VRM 0/1 differences, rig naming, finger orientation and external textures require round-trip tests." },
    evidence: [
      evidence("code", "apps/web/src/domains/creator/vrm/studio-vrm-asset-runtime.ts", "VRM runtime loader", "VRM runtime loader"),
      evidence("test", "apps/web/src/domains/creator/vrm/studio-vrm-export-loader-roundtrip.test.ts", "VRM 내보내기 round-trip", "VRM export round trip"),
    ],
  },
  {
    id: "blender",
    relation: "used",
    status: "configured",
    category: { ko: "DCC·QA", en: "DCC and QA" },
    title: "Blender · bpy · EEVEE",
    summary: { ko: "브라우저 3D 결과를 독립 환경에서 불러와 리깅, IK, 카메라와 렌더 품질을 검증합니다.", en: "An independent environment for validating browser 3D output, rigging, IK, cameras and render quality." },
    applied: { ko: "headless Python script가 입력 파일과 지정된 출력만 다루고 사용자 설정이나 저장소 원본을 변경하지 않습니다.", en: "Headless Python scripts touch only declared inputs and outputs and never reset user preferences or rewrite repository sources." },
    caution: { ko: "Blender·VRM add-on 버전과 색 관리·좌표 변환을 고정하지 않으면 재현성이 깨집니다.", en: "Reproducibility depends on pinned Blender and VRM add-on versions, color management and coordinate transforms." },
    evidence: [
      evidence("workflow", "scripts/blender/render_everyday_props_pack_v4_qa.py", "Blender QA 렌더", "Blender QA render"),
      evidence("test", "apps/web/src/domains/creator/vrm/studio-vrm-blender-package-import.test.ts", "DCC 패키지 preflight", "DCC package preflight"),
    ],
  },
  {
    id: "precision-geometry",
    relation: "used",
    status: "experimental",
    category: { ko: "정밀 형상", en: "Precision geometry" },
    title: "OpenCascade.js · Manifold · Rhino3dm · xatlas",
    summary: { ko: "정밀 solid, bounded boolean, CAD 교환과 UV 후보를 뷰포트 엔진 밖의 전문 계산 계층으로 둡니다.", en: "Precision solids, bounded booleans, CAD interchange and UV candidates live outside the viewport engine as specialist computation." },
    applied: { ko: "WASM 지연 로드, topology budget, backpressure, 명시적 handle 삭제와 결과 hash를 사용합니다.", en: "WASM is lazy-loaded with topology budgets, backpressure, explicit handle deletion and output hashes." },
    caution: { ko: "대형 WASM과 복잡도 폭증 때문에 입력 제한 없이 범용 CAD처럼 노출하지 않습니다.", en: "Large WASM and complexity blow-ups prevent exposing it as unrestricted general-purpose CAD." },
    evidence: [
      evidence("code", "apps/web/src/domains/creator/studio-occt.worker.ts", "OpenCascade Worker", "OpenCascade Worker"),
      evidence("code", "apps/web/src/domains/creator/studio-manifold-mesh-provider.ts", "Manifold mesh provider", "Manifold mesh provider"),
    ],
  },
  {
    id: "blender-mcp",
    relation: "evaluated",
    status: "reference-only",
    category: { ko: "AI 도구 연동", en: "AI tool integration" },
    title: "Blender MCP",
    summary: { ko: "자연어·도구 호출을 Blender 작업으로 연결할 수 있는 선택형 host 패턴을 평가합니다.", en: "An optional host pattern evaluated for connecting natural-language tool calls to Blender operations." },
    applied: { ko: "현재 제품은 local VRM host를 기본으로 하고 Blender MCP 요청은 실제 live host가 확인되지 않으면 unavailable로 닫힙니다.", en: "The product defaults to a local VRM host and fails closed when a requested Blender MCP has no verified live host." },
    caution: { ko: "외부 MCP 구현을 설치했다는 주장과 저장소 내부의 host contract를 혼동하지 않습니다.", en: "The repository host contract is not evidence that an external Blender MCP implementation is installed." },
    evidence: [
      evidence("code", "apps/web/src/domains/creator/vrm/studio-vrm-generate-mcp.ts", "MCP host interface", "MCP host interface"),
      evidence("workflow", "scripts/studio-vrm-generate-mcp-host.mts", "host probe와 CLI", "Host probe and CLI"),
    ],
  },
  {
    id: "webrtc-standard",
    relation: "used",
    status: "experimental",
    category: { ko: "실시간 미디어", en: "Realtime media" },
    title: "WebRTC · W3C · MDN",
    summary: { ko: "RTCPeerConnection, RTCDataChannel, ICE restart와 getUserMedia/getDisplayMedia를 사용하는 실시간 미디어 표준 경계입니다.", en: "The realtime-media standards boundary for RTCPeerConnection, RTCDataChannel, ICE restart and media capture." },
    applied: { ko: "Socket.IO admission·signaling, direct data와 RTP media를 분리하고 권한 응답 뒤 recipient revision을 다시 검증합니다.", en: "Socket.IO admission and signaling, direct data and RTP media stay separate, with recipient revision rechecked after permission responses." },
    caution: { ko: "loopback 성공, STUN-only 연결과 소규모 P2P mesh를 WAN·TURN·SFU 대규모 품질로 해석하지 않습니다.", en: "Loopback success, STUN-only connectivity and a small P2P mesh are not treated as WAN, TURN or SFU-scale quality proof." },
    evidence: [
      evidence("code", "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts", "WebRTC huddle controller", "WebRTC huddle controller"),
      evidence("document", "docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md", "표준·복구·검증 단계", "Standards, recovery and evidence stages"),
    ],
  },
  {
    id: "spatial-collaboration-products",
    relation: "inspired",
    status: "documented",
    category: { ko: "공간 협업 참고", en: "Spatial collaboration references" },
    title: "Gather · WorkAdventure · Kumospace · Magma",
    summary: { ko: "근접 대화, 방·영역 policy, broadcast, recording과 창작 캔버스 안 미디어 UX를 비교한 제품 참고군입니다.", en: "A product reference set for proximity conversation, room and area policy, broadcast, recording and media inside creative canvases." },
    applied: { ko: "공간상 proximity를 recipient 힌트로만 사용하고 실제 peer scope, screen-share consent, TURN 정책과 목록 대체 경로를 별도 권위로 둡니다.", en: "Spatial proximity remains a recipient hint while peer scope, screen-share consent, TURN policy and list alternatives keep separate authority." },
    caution: { ko: "공식 도움말은 기능 신호이며 독립적인 지연·암호화·접근성·동시 사용자 성능 검증이 아닙니다.", en: "Official help material is a capability signal, not independent latency, encryption, accessibility or concurrency evidence." },
    evidence: [
      evidence("document", "docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md", "제품 공식 자료 벤치마크", "Official-product-material benchmark"),
      evidence("document", "docs/studio/virtual-studio-benchmark-20260920.md", "Virtual Studio 상세 비교", "Detailed Virtual Studio comparison"),
    ],
  },
  {
    id: "creative-desktop-products",
    relation: "inspired",
    status: "documented",
    category: { ko: "참고 제품", en: "Reference products" },
    title: "Clip Studio Paint · Photoshop · Procreate · MediBang",
    summary: { ko: "드로잉 집중도, 패널 구성, 브러시 피드백, 파일 호환과 학습 비용을 비교한 제품 참고군입니다.", en: "A product reference set for drawing focus, panel layout, brush feedback, file compatibility and learning cost." },
    applied: { ko: "기능 수를 복제하기보다 창작 중 방해를 줄이고 작업 상태를 예측 가능하게 만드는 원칙을 가져옵니다.", en: "The lesson is predictable, low-interruption creation—not copying feature counts." },
    caution: { ko: "경쟁 제품과 동등하다는 주장은 실제 benchmark와 파일 round-trip 근거 없이는 사용하지 않습니다.", en: "Parity claims require actual benchmarks and file round-trip evidence." },
    evidence: [
      evidence("document", "docs/studio-competitor-features.md", "경쟁 제품 기능·경계 조사", "Competitor capability and boundary review"),
      evidence("test", "scripts/verify-studio-competitor-replacement.mts", "경쟁 기능 검증 gate", "Competitor-capability verification gate"),
    ],
  },
  {
    id: "sketchup-acon3d",
    relation: "inspired",
    status: "documented",
    category: { ko: "참고 제품", en: "Reference products" },
    title: "SketchUp · ACON3D",
    summary: { ko: "웹툰 배경 조립, 카메라 재사용, 자산 탐색과 라이선스 전달 방식을 비교한 참고군입니다.", en: "References for webtoon set assembly, reusable cameras, asset discovery and license handoff." },
    applied: { ko: "3D 장면과 자산 카탈로그를 분리하고 프로젝트에 들어온 자산 revision·출처·권리를 함께 보존합니다.", en: "3D scenes remain separate from catalogs, and imported assets retain revision, provenance and rights." },
    caution: { ko: "상용 소재의 소유권·재배포 조건을 CC0나 자체 제작물과 같은 방식으로 취급하지 않습니다.", en: "Commercial-material ownership and redistribution terms are not treated like CC0 or first-party assets." },
    evidence: [
      evidence("document", "docs/studio-competitor-features.md", "3D·소재 제품 비교", "3D and asset product comparison"),
      evidence("document", "docs/studio-asset-library-upgrade-20260913.md", "자산 라이브러리 설계", "Asset library design"),
    ],
  },
  {
    id: "polyhaven",
    relation: "used",
    status: "live",
    category: { ko: "오픈 자산", en: "Open assets" },
    title: "Poly Haven",
    summary: { ko: "CC0 HDRI, texture와 3D 모델을 공식 API에서 검색하고 원문으로 연결합니다.", en: "Official API discovery for CC0 HDRIs, textures and 3D models with links back to origin." },
    applied: { ko: "미리보기·메타데이터만 정규화하고 대형 파일과 실제 포맷 확인은 원문에서 수행합니다.", en: "Only previews and metadata are normalized; large files and exact formats remain at the origin." },
    caution: { ko: "CC0 표시도 asset ID, 저자, 조회일과 공식 원문을 함께 보존합니다.", en: "Even CC0 records retain asset ID, author, retrieval date and official origin." },
    evidence: [
      evidence("code", "apps/api/src/modules/creator-resources/polyhaven-provider.ts", "Poly Haven provider", "Poly Haven provider"),
      evidence("document", "docs/free-material-atlas.md", "무료 material atlas 정책", "Free material-atlas policy"),
    ],
  },
  {
    id: "books-cultural-data",
    relation: "used",
    status: "live",
    category: { ko: "Open API", en: "Open APIs" },
    title: "Google Books · Wikimedia Commons · KMAS",
    summary: { ko: "판본 발견, CC0 이미지와 만화·웹툰 메타데이터를 공급자별 권리 경계로 제공합니다.", en: "Edition discovery, CC0 imagery and comics/webtoon metadata through provider-specific rights boundaries." },
    applied: { ko: "검색·메타데이터만 가져오고 본문·유료 미리보기·권리 불명 파일은 수집하지 않습니다.", en: "Only search metadata is ingested; full text, paid previews and unclear-rights files are excluded." },
    caution: { ko: "검색 결과는 재배포나 각색 권한을 자동으로 부여하지 않습니다.", en: "Search results never automatically grant redistribution or adaptation rights." },
    evidence: [
      evidence("code", "apps/api/src/modules/creator-resources/google-books-provider.ts", "Google Books adapter", "Google Books adapter"),
      evidence("document", "docs/operations/free-api-access-register-2026-09-15.md", "Open API 운영 대장", "Open API operations register"),
    ],
  },
  {
    id: "ai-routing-products",
    relation: "evaluated",
    status: "documented",
    category: { ko: "AI 라우팅 참고", en: "AI routing references" },
    title: "Dia · Browser Use Cloud · Vercel AI Gateway · OpenRouter",
    summary: { ko: "공급자 순서, fallback, BYOK, 비용 budget와 브라우저 AI 개인정보 제어를 비교한 참고군입니다.", en: "References for provider order, fallback, BYOK, cost budgets and browser-AI privacy controls." },
    applied: { ko: "ToonStudio는 자동·우선순위·수동 고정 모드를 분리하고 모호한 실패를 재전송하지 않는 더 보수적인 경계를 선택했습니다.", en: "ToonStudio separates automatic, priority and exact-manual modes and adopts a stricter no-replay rule for ambiguous failures." },
    caution: { ko: "외부 제품의 동작을 동일한 API나 보안 보장으로 표현하지 않습니다.", en: "External product behavior is not presented as an identical API or security guarantee." },
    evidence: [
      evidence("document", "docs/operations/cloud-ai-routing-benchmark-2026-09-16.md", "AI 라우팅 제품 비교와 결정", "AI routing product comparison and decisions"),
      evidence("code", "apps/web/src/shared/ai/user-ai-transport.ts", "실제 보수적 fallback", "Implemented conservative fallback"),
    ],
  },
] as const satisfies readonly EngineeringReference[];

export interface EngineeringTroubleshootingCase {
  readonly id: string;
  readonly status: EngineeringStatus;
  readonly area: LocalizedText;
  readonly title: LocalizedText;
  readonly symptom: LocalizedText;
  readonly wrongTurn: LocalizedText;
  readonly rootCause: LocalizedText;
  readonly resolution: LocalizedText;
  readonly regression: LocalizedText;
  readonly lesson: LocalizedText;
  readonly evidence: readonly EngineeringEvidence[];
}

export const ENGINEERING_TROUBLESHOOTING_CASES = [
  {
    id: "service-worker-update-race",
    status: "live",
    area: { ko: "PWA 업데이트", en: "PWA updates" },
    title: { ko: "드로잉 중 새 버전이 활성화되는 문제", en: "A new version activates during drawing" },
    symptom: { ko: "열려 있던 화면과 lazy chunk가 다른 build를 가리켜 기능이 사라지거나 새로고침을 요구합니다.", en: "The open document and lazy chunks point at different builds, causing missing features or forced reloads." },
    wrongTurn: { ko: "`skipWaiting()`과 즉시 reload를 모든 배포에 자동 적용했습니다.", en: "Calling `skipWaiting()` and reloading immediately on every deployment." },
    rootCause: { ko: "긴 편집 세션과 Service Worker 생명주기를 같은 짧은 웹 페이지처럼 취급했습니다.", en: "A long editing session was treated like a short-lived web page." },
    resolution: { ko: "새 Worker를 waiting 상태에 두고 업데이트 준비를 알린 뒤 안전한 시점의 사용자 승인으로만 교체합니다.", en: "Keep the new Worker waiting, disclose update readiness and activate only after user approval at a safe point." },
    regression: { ko: "실제 브라우저에서 waiting Worker, 승인 전 controller 유지와 승인 후 revision 교체를 검사합니다.", en: "Real-browser tests verify waiting state, controller stability before approval and revision change afterward." },
    lesson: { ko: "편집·결제·업로드 앱에서 Service Worker 활성화는 배포 문제가 아니라 사용자 transaction 경계입니다.", en: "In editing, checkout and upload apps, Service Worker activation is a user-transaction boundary, not merely deployment plumbing." },
    evidence: [
      evidence("code", "apps/web/src/app/service-worker/studio-service-worker-registration.ts", "사용자 승인형 업데이트", "User-approved update flow"),
      evidence("test", "scripts/verify-studio-service-worker.mts", "waiting·activation 브라우저 검사", "Waiting and activation browser probe"),
    ],
  },
  {
    id: "cached-isolation-headers",
    status: "live",
    area: { ko: "PWA 보안 헤더", en: "PWA security headers" },
    title: { ko: "캐시된 앱에서 crossOriginIsolated가 풀리는 문제", en: "Cached app loses crossOriginIsolated" },
    symptom: { ko: "온라인에서는 동작하던 SharedArrayBuffer·WASM 경로가 오프라인 캐시 응답에서 비활성화됩니다.", en: "SharedArrayBuffer and WASM paths that work online become unavailable from cached offline responses." },
    wrongTurn: { ko: "네트워크 응답의 COOP/COEP만 확인하고 Cache Storage 응답은 동일하다고 가정했습니다.", en: "Checking COOP/COEP on network responses and assuming cached responses are equivalent." },
    rootCause: { ko: "오래된 Worker 또는 캐시 항목이 필요한 CORP/격리 헤더 없이 저장됐습니다.", en: "An older Worker or cache entry stored responses without required CORP/isolation headers." },
    resolution: { ko: "cache write/read에서 보안 헤더 계약을 검증하고 결함 있는 항목은 삭제 후 네트워크에서 다시 가져옵니다.", en: "Validate security headers on cache write/read and evict defective entries before refetching." },
    regression: { ko: "warm offline 부팅 뒤 `crossOriginIsolated`, Worker/WASM probe와 헤더를 함께 검사합니다.", en: "Warm-offline probes verify `crossOriginIsolated`, Worker/WASM behavior and headers together." },
    lesson: { ko: "PWA의 보안 헤더는 CDN 설정뿐 아니라 캐시 직렬화 계약입니다.", en: "PWA security headers are a cache serialization contract, not only CDN configuration." },
    evidence: [
      evidence("code", "apps/web/src/app/service-worker/studio-service-worker-policy.ts", "캐시 보안 헤더 정책", "Cached security-header policy"),
      evidence("test", "apps/web/src/app/service-worker/studio-service-worker-continuity.test.ts", "격리 헤더 self-heal 검사", "Isolation-header self-healing tests"),
    ],
  },
  {
    id: "large-wasm-precache",
    status: "live",
    area: { ko: "PWA·WASM", en: "PWA and WASM" },
    title: { ko: "대형 WASM 때문에 Service Worker 설치가 실패하는 문제", en: "Large WASM breaks Service Worker installation" },
    symptom: { ko: "첫 방문에서 다운로드가 길어지고 한 파일 실패로 core precache 전체가 설치되지 않습니다.", en: "First visit becomes slow and one file failure prevents the entire core precache from installing." },
    wrongTurn: { ko: "오프라인 지원을 위해 build 결과 전체를 precache에 넣었습니다.", en: "Putting the entire build output into precache in the name of offline support." },
    rootCause: { ko: "약 60MB 이상의 전문 WASM을 앱 셸과 같은 필수 자산으로 취급했습니다.", en: "A specialist WASM asset over roughly 60MB was treated as mandatory app-shell content." },
    resolution: { ko: "core 앱 셸만 원자적으로 precache하고 OpenCascade 같은 대형 엔진은 실제 기능 진입 뒤 immutable runtime cache로 warm합니다.", en: "Atomically precache only the core shell and warm large engines such as OpenCascade in immutable runtime cache after feature entry." },
    regression: { ko: "precache plan의 최대 파일·총량과 금지된 대형 자산을 build 검증에서 확인합니다.", en: "Build verification checks precache file/total budgets and forbidden large assets." },
    lesson: { ko: "오프라인 가능성과 최초 설치 완결성은 기능별로 나눠야 합니다.", en: "Offline capability and first-install completeness must be scoped by feature." },
    evidence: [
      evidence("code", "apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts", "예산 기반 precache plan", "Budgeted precache plan"),
      evidence("document", "docs/studio-service-worker.md", "대형 WASM 제외 근거", "Large-WASM exclusion rationale"),
    ],
  },
  {
    id: "background-sync-opfs-lock",
    status: "documented",
    area: { ko: "오프라인 저장", en: "Offline persistence" },
    title: { ko: "Background Sync가 SQLite OPFS 소유권과 충돌하는 문제", en: "Background Sync conflicts with SQLite OPFS ownership" },
    symptom: { ko: "페이지와 Service Worker가 같은 로컬 DB를 열면 lock 충돌이나 손상 위험이 생길 수 있습니다.", en: "A page and Service Worker opening the same local database can create lock conflicts or corruption risk." },
    wrongTurn: { ko: "오프라인이면 모든 저장을 Background Sync queue로 보내려 했습니다.", en: "Moving every offline save into a Background Sync queue." },
    rootCause: { ko: "SQLite OPFS SAH 계열은 단일 Worker 소유권을 전제로 하는데 Service Worker를 두 번째 DB 실행자로 추가했습니다.", en: "SQLite OPFS SAH assumes single-Worker ownership, while the Service Worker became a second database executor." },
    resolution: { ko: "로컬 저장은 페이지의 DB Worker가 계속 소유하고 Service Worker는 정적 continuity만 담당합니다. 원격 동기화는 outbox를 읽는 명시적 페이지 작업으로 둡니다.", en: "The page's database Worker retains local ownership; the Service Worker handles only static continuity, and remote sync is an explicit page-driven outbox operation." },
    regression: { ko: "Service Worker source에 OPFS/SQLite 접근이 없고 DB lock·recovery 테스트가 통과하는지 검사합니다.", en: "Verify the Service Worker never accesses OPFS/SQLite and database lock/recovery tests pass." },
    lesson: { ko: "오프라인 기능을 한 API에 몰지 말고 저장 권위와 네트워크 재전송 책임을 분리해야 합니다.", en: "Offline design must separate storage authority from network retransmission instead of centralizing both in one API." },
    evidence: [
      evidence("document", "docs/studio-service-worker.md", "Background Sync 제외 결정", "Background Sync exclusion decision"),
      evidence("test", "apps/web/src/domains/creator/studio-local-database-ownership.test.ts", "DB 단일 소유권 검사", "Single database ownership tests"),
    ],
  },
  {
    id: "worker-failure-replay",
    status: "live",
    area: { ko: "Worker", en: "Workers" },
    title: { ko: "Worker 실패 뒤 직접 실행이 중복 결과를 만드는 문제", en: "Direct replay after Worker failure creates duplicate output" },
    symptom: { ko: "timeout 직전에 Worker가 파일을 만들었지만 응답을 받지 못해 main-thread fallback이 두 번째 파일을 생성합니다.", en: "A Worker creates a file just before timeout, but the unseen response triggers a main-thread fallback that creates a second file." },
    wrongTurn: { ko: "사용자 편의를 위해 Worker 오류는 항상 direct backend로 자동 재시도했습니다.", en: "Automatically retrying every Worker error through a direct backend for convenience." },
    rootCause: { ko: "실패가 작업 시작 전인지 결과 commit 후인지 알 수 없는 모호한 상태였습니다.", en: "The failure was ambiguous: the system could not know whether work failed before execution or after commit." },
    resolution: { ko: "작업 시작 전에 backend를 한 번 선택하고 construction, post, protocol, timeout과 runtime 실패를 terminal로 처리합니다.", en: "Select one backend before work starts and treat construction, post, protocol, timeout and runtime failures as terminal." },
    regression: { ko: "각 실패 종류에서 attempted backend가 하나이고 terminate·listener 정리가 한 번만 일어나는지 검사합니다.", en: "Each failure test asserts one attempted backend and single termination/listener cleanup." },
    lesson: { ko: "fallback 안전성은 속도가 아니라 idempotency와 commit 영수증으로 결정합니다.", en: "Fallback safety is determined by idempotency and commit receipts, not speed." },
    evidence: [
      evidence("code", "apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-glb-export-worker-client.ts", "단일 backend 실행 계약", "Single-backend execution contract"),
      evidence("test", "apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-glb-export-worker-client.test.ts", "중복 replay 방지 검사", "Duplicate-replay prevention tests"),
    ],
  },
  {
    id: "blender-package-tampering",
    status: "live",
    area: { ko: "3D·DCC 보안", en: "3D and DCC security" },
    title: { ko: "Blender 전달 파일이 정상처럼 보이지만 변조된 문제", en: "A Blender delivery looks valid but has been tampered with" },
    symptom: { ko: "파일 크기와 이름은 맞지만 binary가 달라졌거나 manifest가 상위 경로·외부 texture를 참조합니다.", en: "Names and sizes look correct while bytes changed, or a manifest references parent paths or external textures." },
    wrongTurn: { ko: "확장자, 파일명과 manifest의 `passed` 값만 신뢰했습니다.", en: "Trusting extensions, filenames and the manifest's `passed` flag." },
    rootCause: { ko: "패키지 경계를 신뢰 구역으로 간주해 내용 hash, glTF 구조와 실제 quality score를 다시 계산하지 않았습니다.", en: "The package boundary was treated as trusted, so hashes, glTF structure and actual quality scores were not recomputed." },
    resolution: { ko: "읽기 전 크기 상한, 경로 정규화, 중복·대소문자 충돌, SHA-256, GLB/VRM 구조, 외부 URI와 quality gate를 검증합니다.", en: "Validate pre-read size limits, normalized paths, duplicates/case collisions, SHA-256, GLB/VRM structure, external URIs and quality gates." },
    regression: { ko: "동일 크기 변조, path traversal, renamed GLB, broken header, remote texture와 256MB 초과 fixture를 검사합니다.", en: "Fixtures cover same-size tampering, path traversal, renamed GLB, broken headers, remote textures and files over 256MB." },
    lesson: { ko: "DCC에서 생성됐다는 사실은 안전성과 제품 호환성의 증거가 아닙니다.", en: "Being produced by a DCC is not evidence of safety or product compatibility." },
    evidence: [
      evidence("test", "apps/web/src/domains/creator/vrm/studio-vrm-blender-package-import.test.ts", "Blender package 공격·손상 matrix", "Blender package attack and corruption matrix"),
      evidence("code", "apps/web/src/domains/creator/vrm/studio-vrm-blender-package-import.ts", "패키지 preflight 구현", "Package preflight implementation"),
    ],
  },
  {
    id: "free-ai-ambiguous-failure",
    status: "live",
    area: { ko: "무료 AI", en: "Free-first AI" },
    title: { ko: "timeout 뒤 다른 AI 공급자로 보내 중복 생성되는 문제", en: "Timeout replay to another AI provider duplicates generation" },
    symptom: { ko: "첫 공급자는 작업을 수락했지만 응답 전에 연결이 끊겨 두 번째 공급자에도 같은 프롬프트가 전송됩니다.", en: "The first provider accepted work but the connection dropped before response, so the same prompt reaches a second provider." },
    wrongTurn: { ko: "모든 오류를 quota 소진으로 간주하고 다음 무료 또는 유료 공급자로 넘겼습니다.", en: "Treating every error as quota exhaustion and advancing to the next free or paid provider." },
    rootCause: { ko: "추론 전 확정 거절과 추론 여부를 알 수 없는 네트워크 실패를 같은 failure class로 묶었습니다.", en: "Definitive pre-inference rejection and ambiguous network failure shared one failure class." },
    resolution: { ko: "401/403/402/429와 allowlist quota code만 안전한 advance로 분류하고 network, timeout, 5xx와 malformed success는 즉시 반환합니다.", en: "Only 401/403/402/429 and allowlisted quota codes permit safe advance; network, timeout, 5xx and malformed success return immediately." },
    regression: { ko: "공급자별 HTTP·business code와 attempted route 수, Retry-After cooldown을 검사합니다.", en: "Tests cover provider HTTP/business codes, attempted-route counts and Retry-After cooldowns." },
    lesson: { ko: "AI 라우팅에서 고가용성보다 중복 추론·과금·개인정보 재전송 방지가 먼저입니다.", en: "In AI routing, preventing duplicate inference, charges and data retransmission precedes availability." },
    evidence: [
      evidence("code", "apps/web/src/shared/ai/user-ai-transport.ts", "보수적 route advance", "Conservative route advance"),
      evidence("test", "apps/web/src/shared/ai/free-ai-runtime-budget.test.ts", "quota·cooldown 회귀 검사", "Quota and cooldown regressions"),
    ],
  },
  {
    id: "open-api-schema-drift",
    status: "live",
    area: { ko: "Open API", en: "Open APIs" },
    title: { ko: "외부 API 일부 변경이 전체 검색을 깨뜨리는 문제", en: "A partial upstream API change breaks all search" },
    symptom: { ko: "한 공급자가 field를 누락하거나 HTML 오류를 반환해 다른 정상 공급자의 결과도 함께 사라집니다.", en: "One provider omits a field or returns HTML, and healthy providers disappear with it." },
    wrongTurn: { ko: "응답 타입을 TypeScript interface로만 선언하고 여러 공급자를 `Promise.all`로 묶었습니다.", en: "Declaring response types only in TypeScript and combining providers with `Promise.all`." },
    rootCause: { ko: "외부 JSON을 신뢰했고 공급자별 실패 격리와 runtime schema 검증이 없었습니다.", en: "External JSON was trusted without runtime schema validation or per-provider failure isolation." },
    resolution: { ko: "공식 host/path와 shape를 런타임 검증하고 `Promise.allSettled`, bounded normalization과 `partial` 상태를 사용합니다.", en: "Runtime-validate official host/path and shape, then use `Promise.allSettled`, bounded normalization and a `partial` state." },
    regression: { ko: "잘못된 host, schema, 일부 유형 실패, 중복 ID와 비정상 URL fixture를 공급자 adapter마다 검사합니다.", en: "Provider adapters test wrong hosts, schemas, partial type failure, duplicate IDs and unsafe URLs." },
    lesson: { ko: "외부 API interface는 컴파일 타입이 아니라 실패 격리·권리·출처까지 포함한 runtime boundary입니다.", en: "An external API interface is a runtime boundary for failure isolation, rights and provenance—not just a compile-time type." },
    evidence: [
      evidence("code", "apps/api/src/modules/creator-resources/polyhaven-provider.ts", "부분 성공 Open API adapter", "Partial-success Open API adapter"),
      evidence("test", "apps/api/src/modules/creator-resources/free-resource-providers.test.ts", "공급자 schema drift 검사", "Provider schema-drift tests"),
    ],
  },
] as const satisfies readonly EngineeringTroubleshootingCase[];
