import type {
  EngineeringStatus,
  LocalizedText,
} from "./engineering-story-content";

export interface EngineeringPlaybookDossier {
  readonly id: string;
  readonly status: EngineeringStatus;
  readonly eyebrow: string;
  readonly title: LocalizedText;
  readonly question: LocalizedText;
  readonly background: LocalizedText;
  readonly architecture: readonly LocalizedText[];
  readonly achievements: readonly LocalizedText[];
  readonly portability: readonly LocalizedText[];
  readonly limits: readonly LocalizedText[];
  readonly evidence: readonly string[];
}

export interface EngineeringBenchmarkGroup {
  readonly id: string;
  readonly title: LocalizedText;
  readonly products: readonly string[];
  readonly marketSignal: LocalizedText;
  readonly observedPatterns?: readonly LocalizedText[];
  readonly learned: readonly LocalizedText[];
  readonly applied: readonly LocalizedText[];
  readonly doNotClaim: readonly LocalizedText[];
  readonly evidenceNote?: LocalizedText;
}

export interface EngineeringAiWorkbench {
  readonly id: string;
  readonly layer: LocalizedText;
  readonly tools: readonly string[];
  readonly use: LocalizedText;
  readonly artifact: LocalizedText;
  readonly guardrail: LocalizedText;
}

export interface EngineeringFilmCut {
  readonly id: string;
  readonly duration: string;
  readonly audience: LocalizedText;
  readonly promise: LocalizedText;
  readonly beats: readonly LocalizedText[];
  readonly proof: readonly LocalizedText[];
  readonly avoid: readonly LocalizedText[];
}

export interface EngineeringSeminarModule {
  readonly id: string;
  readonly minutes: number;
  readonly title: LocalizedText;
  readonly learning: readonly LocalizedText[];
  readonly demo: LocalizedText;
  readonly discussion: LocalizedText;
}

export interface EngineeringReuseBlueprint {
  readonly id: string;
  readonly title: LocalizedText;
  readonly useWhen: LocalizedText;
  readonly firstBoundary: LocalizedText;
  readonly firstMilestone: LocalizedText;
  readonly failureDrill: LocalizedText;
  readonly doneEvidence: LocalizedText;
}

export const ENGINEERING_PLAYBOOK_PRINCIPLES = [
  {
    id: "authority-before-library",
    title: { ko: "라이브러리보다 권위", en: "Authority before libraries" },
    body: {
      ko: "어떤 엔진을 썼는지보다 입력·출력·최종 결과·실패·복구를 누가 소유하는지 먼저 정합니다.",
      en: "Define who owns inputs, outputs, final results, failure and recovery before choosing an engine.",
    },
  },
  {
    id: "fast-path-durable-path",
    title: { ko: "빠른 경로와 내구 경로 분리", en: "Separate fast and durable paths" },
    body: {
      ko: "즉시 보이는 preview와 저장·공유·재생 가능한 결과를 분리하되 receipt와 revision으로 연결합니다.",
      en: "Separate immediate preview from durable, shareable and replayable results, connected by receipts and revisions.",
    },
  },
  {
    id: "local-first-not-local-only",
    title: { ko: "로컬 우선이지 로컬 전용은 아님", en: "Local-first, not local-only" },
    body: {
      ko: "반응성과 개인정보를 위해 로컬 계산·저장을 우선하지만 공유·권한·게시 원장은 서버와 명시적으로 동기화합니다.",
      en: "Local computation and storage protect responsiveness and privacy, while sharing, authorization and publishing ledgers synchronize explicitly.",
    },
  },
  {
    id: "evidence-before-claim",
    title: { ko: "주장보다 증거", en: "Evidence before claims" },
    body: {
      ko: "운영·설정·실험·문서·설계를 구분하고 각 문장을 코드·테스트·workflow·문서 경로에 연결합니다.",
      en: "Separate live, configured, experimental, documented and planned work and connect every claim to code, tests, workflows or documents.",
    },
  },
  {
    id: "rights-with-feature",
    title: { ko: "기능과 권리를 함께", en: "Rights travel with the feature" },
    body: {
      ko: "크롤링·AI·3D·브러시·미디어 기능은 출처·라이선스·동의·재배포 범위를 데이터 모델에 포함합니다.",
      en: "Crawling, AI, 3D, brush and media features carry provenance, license, consent and redistribution scope in the data model.",
    },
  },
] as const;

export const ENGINEERING_PLAYBOOK_DOSSIERS = [
  {
    id: "service-product-architecture",
    status: "live",
    eyebrow: "01 · SERVICE & PRODUCT",
    title: { ko: "검색 서비스에서 연결된 제작 운영체제로", en: "From discovery service to connected production system" },
    question: {
      ko: "기획·제작·검수·연재가 여러 페이지와 파일로 흩어져도 프로젝트 맥락을 어떻게 잃지 않을까?",
      en: "How can project context survive when planning, production, review and release span many pages and files?",
    },
    background: {
      ko: "웹툰 제작은 한 화면의 편집 문제가 아니라 작품, 회차, 컷, 자산, revision, 승인과 게시를 이어 주는 handoff 문제입니다. ToonStudio는 기능 수보다 다음 작업자가 현재 상태와 이유를 복원하는 비용을 줄이는 데 초점을 둡니다.",
      en: "Webtoon production is a handoff problem across works, episodes, cuts, assets, revisions, approvals and publishing—not a single editor-screen problem. ToonStudio prioritizes reducing the cost of reconstructing current state and intent.",
    },
    architecture: [
      { ko: "Workspace → Project → Episode → Cut → Asset → Revision → Approval을 명시적 도메인 계약으로 둡니다.", en: "Model Workspace, Project, Episode, Cut, Asset, Revision and Approval as explicit domain contracts." },
      { ko: "작업실·목록·가상 공간·공개 페이지는 같은 도메인의 서로 다른 projection으로 만듭니다.", en: "Treat studio, list, virtual-space and public pages as projections of the same domain." },
      { ko: "전문 엔진은 capability adapter 뒤에 두고 프로젝트 원장을 직접 소유하지 않게 합니다.", en: "Keep specialist engines behind capability adapters and away from direct project-ledger ownership." },
      { ko: "모든 외부 작업은 input, output, revision, provenance와 verification receipt를 남깁니다.", en: "Every external job records input, output, revision, provenance and a verification receipt." },
    ],
    achievements: [
      { ko: "드로잉·3D·협업·AI·출판을 공통 프로젝트 맥락으로 연결하는 공개 기술 지도를 구성했습니다.", en: "A public engineering map connects drawing, 3D, collaboration, AI and publishing through one project context." },
      { ko: "페이지 기능 설명과 코드 근거를 같은 chapter ID로 재사용해 웹·발표·영상의 사실을 맞춥니다.", en: "Shared chapter IDs keep facts aligned across web pages, presentations and film." },
      { ko: "운영 기능과 실험 기능을 같은 완성도로 홍보하지 않는 상태 모델을 적용했습니다.", en: "A status model prevents live and experimental capabilities from being marketed as equivalent." },
    ],
    portability: [
      { ko: "SaaS 관리도구라면 Account·Workspace·Document·Revision·Approval부터 같은 방식으로 시작할 수 있습니다.", en: "A SaaS management tool can begin with Account, Workspace, Document, Revision and Approval." },
      { ko: "미디어 서비스라면 Title·Episode·Asset·Review·Release의 권위를 먼저 나눕니다.", en: "A media service can first separate authority for Title, Episode, Asset, Review and Release." },
    ],
    limits: [
      { ko: "모든 화면을 한 번에 새 도메인으로 바꾸지 않고 실제 두 번째 소비자가 생기는 경계부터 추출합니다.", en: "Do not rewrite every screen into a new domain at once; extract boundaries when a real second consumer appears." },
      { ko: "공개 아키텍처는 secret, private endpoint와 실제 계정 식별자를 포함하지 않습니다.", en: "Public architecture excludes secrets, private endpoints and real account identifiers." },
    ],
    evidence: ["ARCHITECTURE.md", "docs/architecture/modular-monorepo-target.md", "apps/web/src/domains/legal/technology/engineering-story-content.ts"],
  },
  {
    id: "identity-sharing-growth",
    status: "configured",
    eyebrow: "02 · IDENTITY & DISTRIBUTION",
    title: { ko: "가입부터 공유 유입까지 신뢰 경계 연결", en: "Connecting trust boundaries from sign-in to shared acquisition" },
    question: {
      ko: "소셜 공급자를 늘리면서도 계정 보안, 선택 피로와 공유 채널 파편화를 어떻게 통제할까?",
      en: "How can more social providers coexist with account security, low choice fatigue and consistent sharing?",
    },
    background: {
      ko: "로그인과 공유는 겉으로는 작은 버튼이지만 공급자 등록, redirect, 세션, 계정 연결, OG crawler, 앱 전환, CSP와 analytics가 맞물리는 운영 기능입니다.",
      en: "Login and sharing look like small buttons but are operating systems spanning provider registration, redirects, sessions, account linking, Open Graph crawlers, app switching, CSP and analytics.",
    },
    architecture: [
      { ko: "Google·Apple·Kakao·Naver·GitHub의 인증 결과를 제품 HttpOnly 세션으로 교환합니다.", en: "Exchange Google, Apple, Kakao, Naver and GitHub authentication for a first-party HttpOnly session." },
      { ko: "state·PKCE·nonce, 최소 scope, verified contact와 provider subject를 공급자별로 검증합니다.", en: "Validate state, PKCE, nonce, minimal scopes, verified contacts and provider subjects per provider." },
      { ko: "공유는 canonical payload에서 native share, channel URL, copy, QR과 OG를 파생합니다.", en: "Derive native share, channel URLs, copy, QR and Open Graph from one canonical payload." },
      { ko: "analytics에는 전체 URL·제목 대신 channel·result·route만 기록합니다.", en: "Record channel, result and route—not full URLs or titles—in analytics." },
    ],
    achievements: [
      { ko: "공급자 token을 제품 session으로 사용하지 않는 server callback 경계를 마련했습니다.", en: "Server callbacks prevent provider tokens from becoming product sessions." },
      { ko: "native share·카카오·네이버·LINE·X·Facebook·Telegram·이메일·copy·QR의 fallback 계층을 구현했습니다.", en: "A fallback stack covers native share, Kakao, Naver, LINE, X, Facebook, Telegram, email, copy and QR." },
      { ko: "UTM, canonical과 OG metadata를 공유 구현과 함께 검증할 수 있는 운영 문서를 갖췄습니다.", en: "Operating documentation connects UTM, canonical and Open Graph verification to sharing implementation." },
    ],
    portability: [
      { ko: "커뮤니티·콘텐츠 서비스는 LoginProviderAdapter와 ShareAdapter를 화면 밖의 제품 계약으로 추출할 수 있습니다.", en: "Community and content products can extract LoginProviderAdapter and ShareAdapter beyond individual screens." },
      { ko: "B2B SaaS는 social provider 대신 SSO provider를 같은 계정 연결·해제 모델에 넣을 수 있습니다.", en: "B2B SaaS can place SSO providers into the same account-linking and unlinking model." },
    ],
    limits: [
      { ko: "공급자 등록·검수·secret 설정이 끝나지 않은 기능은 configured로 표시하며 성공 데모와 운영 준비를 구분합니다.", en: "Capabilities awaiting provider registration, review or secrets remain configured, separating demos from operations." },
      { ko: "share API 성공은 실제 열람이나 전환을 증명하지 않습니다.", en: "A successful share API call does not prove viewing or conversion." },
    ],
    evidence: ["docs/social-login-provider-setup.md", "docs/social-sharing.md", "apps/web/src/shared/lib/share.ts", "apps/api/src/modules/auth"],
  },
  {
    id: "brush-rendering-system",
    status: "experimental",
    eyebrow: "03 · BRUSH & RENDERING",
    title: { ko: "브러시를 입력·재료·합성·문서 시스템으로 분해", en: "Decomposing brushes into input, media, compositing and document systems" },
    question: {
      ko: "즉시 반응하는 획과 저장·Undo·재생·내보내기에서 동일한 획을 어떻게 동시에 얻을까?",
      en: "How can a stroke feel immediate yet remain the same through save, undo, replay and export?",
    },
    background: {
      ko: "브러시는 선을 그리는 함수가 아니라 고밀도 포인터 입력, 예측, 압력·tilt 보정, dab·ribbon·bristle, 재료 축적, blend, 타일 갱신과 history를 하나의 지연 예산 안에서 처리하는 시스템입니다.",
      en: "A brush is a system for dense pointer input, prediction, pressure and tilt normalization, dabs, ribbons, bristles, media accumulation, blending, tile updates and history within one latency budget.",
    },
    architecture: [
      { ko: "raw PointerEvent를 normalized sample stream과 stroke receipt로 바꿉니다.", en: "Convert raw PointerEvents into normalized sample streams and stroke receipts." },
      { ko: "preview·live simulation·commit·export renderer 역할과 document authority를 registry에 선언합니다.", en: "Declare preview, live simulation, commit and export renderer roles plus document authority in a registry." },
      { ko: "Worker·WASM·GPU backend는 typed protocol과 capability probe 뒤에서 선택합니다.", en: "Select Worker, WASM and GPU backends behind typed protocols and capability probes." },
      { ko: "dirty tile, long-stroke memory, color space와 committed parity를 별도 품질 예산으로 측정합니다.", en: "Measure dirty tiles, long-stroke memory, color space and committed parity as separate quality budgets." },
    ],
    achievements: [
      { ko: "CanvasKit, WebGPU, Rust/WASM과 Canvas fallback을 역할별로 비교 가능한 구조로 만들었습니다.", en: "CanvasKit, WebGPU, Rust/WASM and Canvas fallbacks are comparable by declared role." },
      { ko: "긴 획·GPU commit parity·natural media·bundle activation을 전용 검증 스크립트로 다룹니다.", en: "Dedicated verification covers long strokes, GPU commit parity, natural media and bundle activation." },
      { ko: "전문 브러시 연구실과 실제 문서 engine 사이에 preset·revision·renderer capability 계약을 둡니다.", en: "Preset, revision and renderer-capability contracts separate the brush lab from document engines." },
    ],
    portability: [
      { ko: "화이트보드·서명·지도 편집도 pointer normalization과 preview/commit 분리를 그대로 활용할 수 있습니다.", en: "Whiteboards, signatures and map editors can reuse pointer normalization and preview/commit separation." },
      { ko: "영상·오디오 editor도 scrub preview와 durable render의 권위를 같은 방식으로 나눌 수 있습니다.", en: "Video and audio editors can similarly separate scrub preview from durable render authority." },
    ],
    limits: [
      { ko: "모든 기기에서 동일 backend를 강제하지 않으며 quality tier와 fallback 차이를 공개합니다.", en: "Do not force one backend on every device; expose quality tiers and fallback differences." },
      { ko: "benchmark 숫자는 장비·브라우저·data set·commit과 함께만 사용합니다.", en: "Use benchmark numbers only with device, browser, dataset and commit." },
    ],
    evidence: ["packages/studio-engine-registry/src/renderer-roles.ts", "scripts/verify-studio-brush-latency.mts", "scripts/verify-studio-gpu-committed-parity.mts", "docs/engines/native-brush-benchmark-optimization-2026-09-19.md"],
  },
  {
    id: "crdt-collaboration",
    status: "experimental",
    eyebrow: "04 · CRDT & REALTIME",
    title: { ko: "동시 편집 의미와 대형 자산 전송을 분리", en: "Separating concurrent meaning from large-asset transport" },
    question: {
      ko: "오프라인과 재접속을 허용하면서도 room 메모리와 문서 의미를 어떻게 통제할까?",
      en: "How can offline work and reconnects converge without losing control of room memory or document meaning?",
    },
    background: {
      ko: "CRDT는 충돌을 없애는 마법이 아니라 어떤 operation이 교환 가능하고 어떤 순서·삭제·권한이 제품 의미를 갖는지 명시하는 모델입니다. 픽셀·PSD·GLB와 media stream은 같은 문제에 속하지 않습니다.",
      en: "CRDT is not conflict-removal magic. It models which operations commute and which order, deletion and authorization semantics matter. Pixels, PSD, GLB and media streams are different problems.",
    },
    architecture: [
      { ko: "Yjs document에는 vector·stylus·layer semantic operation과 bounded metadata를 둡니다.", en: "Keep vector, stylus and layer semantic operations plus bounded metadata in the Yjs document." },
      { ko: "asset bytes는 content hash, revision과 durable receipt로 외부 저장소를 참조합니다.", en: "Reference external asset storage through content hashes, revisions and durable receipts." },
      { ko: "room transport, awareness, persistence snapshot, compaction과 authorization을 서로 다른 계약으로 둡니다.", en: "Separate room transport, awareness, persistence snapshots, compaction and authorization." },
      { ko: "래스터 replay·checkpoint는 Worker로 보내 UI와 room sync를 분리합니다.", en: "Move raster replay and checkpoints to Workers, separating UI and room synchronization." },
    ],
    achievements: [
      { ko: "vector slice와 opt-in raster pilot을 같은 문서 schema와 transport envelope로 연결했습니다.", en: "A vector slice and opt-in raster pilot share a document schema and transport envelope." },
      { ko: "update 순서, binary envelope, raster Worker와 bundle boundary를 회귀 검사합니다.", en: "Regression tests cover update ordering, binary envelopes, raster Workers and bundle boundaries." },
      { ko: "CRDT runtime을 초기 Studio bundle에서 지연 로드하는 경계를 갖췄습니다.", en: "The CRDT runtime remains lazy outside the initial Studio bundle." },
    ],
    portability: [
      { ko: "문서·보드·설계도·workflow editor는 semantic operation부터 정의해 같은 패턴을 적용할 수 있습니다.", en: "Document, board, diagram and workflow editors can apply the pattern by defining semantic operations first." },
      { ko: "채팅·presence는 awareness와 durable message ledger를 나누는 방식으로 확장할 수 있습니다.", en: "Chat and presence can extend the pattern by separating awareness from durable message ledgers." },
    ],
    limits: [
      { ko: "CRDT는 server authorization, abuse limit, billing과 durable backup을 대신하지 않습니다.", en: "CRDT does not replace server authorization, abuse limits, billing or durable backups." },
      { ko: "전체 래스터 공동 편집은 experimental이며 device·room·document budget을 넘으면 fallback합니다.", en: "Full raster collaboration remains experimental and falls back when device, room or document budgets are exceeded." },
    ],
    evidence: ["apps/web/src/domains/creator/live/studio-crdt-document.ts", "apps/web/src/domains/creator/contracts/studio-crdt-binary-envelope.ts", "docs/studio-crdt-webgpu-architecture-2026-07-16.md", "scripts/lib/studio-crdt-bundle-boundary.mjs"],
  },
  {
    id: "workers-native-like-performance",
    status: "live",
    eyebrow: "05 · WORKERS & APP-LIKE PERFORMANCE",
    title: { ko: "메인 스레드, 작업 권위와 업데이트 수명주기 분리", en: "Separating main-thread work, job authority and update lifecycle" },
    question: {
      ko: "브라우저 제약 안에서 긴 계산과 업데이트가 드로잉 입력을 멈추거나 결과를 중복하지 않게 하려면?",
      en: "How can long computation and updates avoid freezing drawing or duplicating results inside browser constraints?",
    },
    background: {
      ko: "앱 같은 경험은 단순히 Worker를 많이 만드는 것이 아니라 입력 우선순위, buffer 소유권, cancellation, late response, cache version과 복구 정책을 설계하는 일입니다.",
      en: "An app-like experience is not about creating many Workers. It requires input priority, buffer ownership, cancellation, late-response rules, cache versions and recovery policy.",
    },
    architecture: [
      { ko: "brush, raster, SQLite, 3D geometry, export와 codec을 목적별 Dedicated Worker로 격리합니다.", en: "Isolate brush, raster, SQLite, 3D geometry, export and codecs in purpose-built Dedicated Workers." },
      { ko: "typed message, request ID, generation, Transferable, AbortSignal, timeout과 termination rule을 공통 계약으로 둡니다.", en: "Use typed messages, request IDs, generations, Transferables, AbortSignals, timeouts and termination rules." },
      { ko: "Service Worker는 app shell·정적 자산 복구만 맡고 원고 저장과 background database write를 소유하지 않습니다.", en: "Service Workers restore app shell and static assets, never owning artwork storage or background database writes." },
      { ko: "새 버전은 편집 중 기다리고 사용자 승인 뒤 skipWaiting·reload하며 emergency reset 경로를 유지합니다.", en: "New versions wait during editing, activate after user approval and retain an emergency reset path." },
    ],
    achievements: [
      { ko: "드로잉·3D·파일·database·CRDT 전반에 typed Worker protocol과 전용 회귀 검사를 확장했습니다.", en: "Typed Worker protocols and dedicated regressions span drawing, 3D, files, databases and CRDT." },
      { ko: "OffscreenCanvas·Transferable·WASM을 필요한 작업에만 적용하고 backend 선택을 job 중간에 바꾸지 않습니다.", en: "OffscreenCanvas, Transferables and WASM are applied only where useful and backends never switch mid-job." },
      { ko: "PWA cache, COOP/COEP, 대형 WASM 제외와 user-approved update를 운영 계약으로 만들었습니다.", en: "PWA cache, COOP/COEP, large-WASM exclusion and user-approved updates form an operating contract." },
    ],
    portability: [
      { ko: "대시보드·파일 처리·분석 앱은 Worker job envelope와 cancellation pattern부터 가져갈 수 있습니다.", en: "Dashboards, file processors and analytics apps can first adopt the Worker job envelope and cancellation pattern." },
      { ko: "긴 세션 SaaS는 user-approved Service Worker update와 reset kill switch를 적용할 수 있습니다.", en: "Long-session SaaS products can use user-approved Service Worker updates and reset kill switches." },
    ],
    limits: [
      { ko: "Worker 직렬화와 duplicate memory도 비용이므로 작은 작업까지 무조건 이동하지 않습니다.", en: "Worker serialization and duplicate memory cost matter, so small jobs do not move automatically." },
      { ko: "Service Worker offline 준비와 사용자 문서 backup을 같은 기능으로 홍보하지 않습니다.", en: "Service Worker offline readiness is never marketed as user-document backup." },
    ],
    evidence: ["apps/web/src/domains/creator/render/studio-engine-worker-client.ts", "apps/web/src/domains/creator/studio-local-database.worker.ts", "apps/web/src/app/service-worker/studio-service-worker-registration.ts", "docs/studio-service-worker.md"],
  },
  {
    id: "virtual-studio-living-world",
    status: "experimental",
    eyebrow: "06 · VIRTUAL STUDIO",
    title: { ko: "프로젝트 상태를 살아 있는 공간으로 투영", en: "Projecting production state into a living spatial workspace" },
    question: {
      ko: "가상 공간의 재미를 추가하면서 업무 권위, 접근성과 media privacy를 어떻게 잃지 않을까?",
      en: "How can a virtual space feel alive without losing work authority, accessibility or media privacy?",
    },
    background: {
      ko: "가상 작업실은 배경 이미지에 아바타를 올리는 기능이 아니라 사람 찾기, 활동 상태, 방·도구, 대화 동의, 공간 작성과 프로젝트 이동을 연결하는 별도 UX입니다.",
      en: "A virtual studio is not avatars over a background. It connects people search, activity state, rooms, tools, conversation consent, world authoring and project navigation.",
    },
    architecture: [
      { ko: "versioned world manifest와 compiler가 collision, spawn, object action, art provenance를 검증합니다.", en: "A versioned world manifest and compiler validate collision, spawn, object actions and art provenance." },
      { ko: "actor locomotion·animation·NPC·interaction·conversation policy를 Phaser/DOM 밖의 순수 module로 둡니다.", en: "Actor locomotion, animation, NPC, interaction and conversation policy live in pure modules outside Phaser and the DOM." },
      { ko: "프로젝트·멤버십·review·live/huddle는 기존 도메인 API를 adapter로 사용합니다.", en: "Projects, membership, review and live/huddle use existing domain APIs through adapters." },
      { ko: "Socket.IO admission·signaling, RTCDataChannel 제어와 RTP media를 분리하고 실제 수신자 scope 뒤에서 연결합니다.", en: "Socket.IO admission and signaling, RTCDataChannel control and RTP media stay separate behind actual recipient scope." },
      { ko: "목록·검색·키보드·reduced motion·low-power mode를 공간 화면과 동등한 진입점으로 유지합니다.", en: "List, search, keyboard, reduced-motion and low-power modes remain equivalent entry paths." },
    ],
    achievements: [
      { ko: "공간 page, social panel, world authoring, manifest와 living-world art pipeline을 별도 모듈로 구성했습니다.", en: "Spatial page, social panel, world authoring, manifest and living-world art pipeline are separate modules." },
      { ko: "Gather 2.0, WorkAdventure와 Kumospace의 최신 공식 동작을 기능·privacy·접근성 관점에서 비교했습니다.", en: "Current official Gather 2.0, WorkAdventure and Kumospace behavior was compared across capability, privacy and accessibility." },
      { ko: "소규모 P2P huddle, 양방향 동의형 화면 공유와 short-lived TURN policy 갱신 경계를 구현했습니다.", en: "Small P2P huddles, two-sided-consent screen sharing and short-lived TURN-policy refresh boundaries are implemented." },
      { ko: "공간 object가 임의 script 대신 allowlisted action registry를 사용하도록 설계했습니다.", en: "Spatial objects use an allowlisted action registry instead of arbitrary scripts." },
    ],
    portability: [
      { ko: "원격 업무·교육·행사 서비스는 기존 task/member API를 spatial projection으로 확장할 수 있습니다.", en: "Remote work, education and event services can extend existing task and member APIs as spatial projections." },
      { ko: "게임형 onboarding은 world action을 실제 제품 route·command와 연결하는 방식으로 재사용할 수 있습니다.", en: "Game-like onboarding can connect world actions to real product routes and commands." },
    ],
    limits: [
      { ko: "공간 모드만으로 전체 기능을 사용하게 강제하지 않으며, 화면상의 거리 원을 media privacy 근거로 쓰지 않습니다.", en: "Spatial mode is never mandatory, and on-screen distance is never treated as evidence of media privacy." },
      { ko: "현재 P2P 경로는 세 명의 원격 peer와 일부 단일 Chromium loopback 증거이므로 WAN·제한 NAT·대규모 broadcast parity를 주장하지 않습니다.", en: "The current P2P path caps remote peers at three and includes some single-Chromium loopback evidence, so it does not claim WAN, restrictive-NAT or large-broadcast parity." },
      { ko: "벤치마크 문서의 target 항목은 source 존재나 시각적 유사성만으로 완료 처리하지 않습니다.", en: "Target benchmark items are not marked complete from source existence or visual similarity alone." },
    ],
    evidence: ["apps/web/src/domains/creator/virtual-space", "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts", "apps/web/src/domains/creator/studio-screen-share.ts", "docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md"],
  },
  {
    id: "multi-engine-3d-dcc",
    status: "experimental",
    eyebrow: "07 · WEB 3D & DCC",
    title: { ko: "한 엔진의 만능화 대신 전문 엔진 왕복", en: "Specialist round trips instead of one universal 3D engine" },
    question: {
      ko: "브라우저 상호작용, 캐릭터, CAD, boolean, UV와 최종 QA를 어떤 경계로 나눌까?",
      en: "How should browser interaction, characters, CAD, booleans, UV and final QA be divided?",
    },
    background: {
      ko: "웹 3D에서 뷰포트, 파일 교환, 정밀 형상, 리깅과 final render를 한 runtime에 몰면 번들·메모리·호환성 위험이 함께 커집니다.",
      en: "Combining viewport, interchange, precision geometry, rigging and final rendering in one web runtime couples bundle, memory and compatibility risk.",
    },
    architecture: [
      { ko: "Three.js/R3F는 상호작용 viewport, VRM은 휴머노이드 교환, OpenCascade·Manifold는 제한된 정밀 계산을 담당합니다.", en: "Three.js/R3F owns the interactive viewport, VRM humanoid interchange, and OpenCascade and Manifold bounded precision work." },
      { ko: "Babylon은 독립 engine boundary에서 특정 기능과 WebGPU 호환성을 비교합니다.", en: "Babylon remains an independent engine boundary for targeted capability and WebGPU compatibility comparisons." },
      { ko: "Blender headless QA는 브라우저 export를 독립 환경에서 검증하고 입력·출력 hash와 receipt를 남깁니다.", en: "Headless Blender QA validates browser exports independently and records input, output hashes and receipts." },
      { ko: "좌표계·단위·material·skeleton·texture와 provenance를 GLB/VRM package contract에 고정합니다.", en: "Coordinate systems, units, materials, skeletons, textures and provenance are fixed in GLB and VRM package contracts." },
    ],
    achievements: [
      { ko: "배경·캐릭터·카메라·gizmo·GLB/VRM을 다루는 웹 viewport와 전문 WASM Worker를 연결했습니다.", en: "Web viewports for sets, characters, cameras, gizmos and GLB/VRM connect to specialist WASM Workers." },
      { ko: "VRM import/export round trip과 Blender package preflight를 자동 검사합니다.", en: "Automated tests cover VRM import/export round trips and Blender-package preflight." },
      { ko: "engine 이름이 아니라 input·output·quality receipt로 대체 가능성을 관리합니다.", en: "Replaceability is managed by input, output and quality receipts—not engine names." },
    ],
    portability: [
      { ko: "제품 configurator·CAD viewer·교육 simulation도 interaction engine과 authoritative model을 분리할 수 있습니다.", en: "Product configurators, CAD viewers and training simulations can separate interaction engines from authoritative models." },
      { ko: "DCC 자동화는 MCP 여부와 무관하게 allowlisted command, input package와 signed output contract로 가져갈 수 있습니다.", en: "DCC automation can use allowlisted commands, input packages and signed-output contracts regardless of MCP." },
    ],
    limits: [
      { ko: "브라우저에서 범용 Blender·CAD 전체 기능을 재현한다고 주장하지 않습니다.", en: "The browser product does not claim to reproduce all of Blender or general-purpose CAD." },
      { ko: "대형 WASM, GPU memory와 mobile compatibility 때문에 전문 기능은 지연 로드·입력 budget·fallback이 필요합니다.", en: "Large WASM, GPU memory and mobile compatibility require lazy loading, input budgets and fallbacks." },
    ],
    evidence: ["apps/web/src/domains/creator/hybrid-dcc", "apps/web/src/domains/creator/vrm", "apps/web/src/domains/creator/studio-occt.worker.ts", "scripts/blender"],
  },
  {
    id: "ai-assisted-product-engineering",
    status: "experimental",
    eyebrow: "08 · AI ASSISTANCE",
    title: { ko: "AI를 기능·공급자·개발 도구의 세 층으로 분리", en: "Separating AI into product, provider and engineering-tool layers" },
    question: {
      ko: "AI 도움을 늘리면서 개인정보 재전송, 중복 과금, 출처 상실과 검증 없는 코드 반영을 어떻게 막을까?",
      en: "How can AI assistance grow without repeated private-data transfer, duplicate billing, lost provenance or unverified code changes?",
    },
    background: {
      ko: "생성 기능과 개발 보조는 모두 불확실한 외부 계산입니다. 공급자 이름을 UI·도메인에 직접 넣으면 비용·권리·실패와 교체가 제품 전체에 퍼집니다.",
      en: "Generation and engineering assistance are both uncertain external computation. Embedding provider names into UI and domain logic spreads cost, rights, failure and replacement concerns across the product.",
    },
    architecture: [
      { ko: "image, sound, story, review task를 provider-neutral request·result·receipt 계약 뒤에 둡니다.", en: "Place image, sound, story and review tasks behind provider-neutral request, result and receipt contracts." },
      { ko: "무료 allowlist, BYOK, quota ledger와 explicit approval을 분리하고 ambiguous timeout은 자동 replay하지 않습니다.", en: "Separate free allowlists, BYOK, quota ledgers and explicit approval, and never auto-replay ambiguous timeouts." },
      { ko: "ONNX Runtime Web·MediaPipe 같은 local inference는 device capability와 memory budget 뒤에서 선택합니다.", en: "Select local inference such as ONNX Runtime Web and MediaPipe behind device-capability and memory budgets." },
      { ko: "coding agent·AI review·MCP 결과는 patch·test·artifact와 사람 승인으로 검증합니다.", en: "Verify coding-agent, AI-review and MCP output through patches, tests, artifacts and human approval." },
    ],
    achievements: [
      { ko: "AI 공급자 교체와 무료/유료 경로를 제품 task 의미와 분리한 routing·budget 계약을 구성했습니다.", en: "Routing and budget contracts separate provider replacement and free or paid paths from product-task meaning." },
      { ko: "참조 이미지 역할, 생성 결과 rights와 request provenance를 같은 결과 모델에 보존합니다.", en: "Reference-image roles, generated-output rights and request provenance remain in one result model." },
      { ko: "AI 개발 보조를 성공 메시지가 아니라 diff, test와 reproducible artifact로 평가합니다.", en: "AI engineering assistance is evaluated through diffs, tests and reproducible artifacts, not success messages." },
    ],
    portability: [
      { ko: "모든 AI 기능은 먼저 TaskContract, DataPolicy, BudgetPolicy와 ResultReceipt 네 문서로 시작할 수 있습니다.", en: "Any AI feature can begin with TaskContract, DataPolicy, BudgetPolicy and ResultReceipt." },
      { ko: "개발 조직은 AI 제안과 merge authority를 분리하고 검증 command를 PR description에 남길 수 있습니다.", en: "Engineering teams can separate AI proposals from merge authority and record verification commands in pull requests." },
    ],
    limits: [
      { ko: "모델·공급자 가용성, 약관과 가격은 변하므로 public 문구와 allowlist를 정기 재검증해야 합니다.", en: "Model and provider availability, terms and pricing change, so public copy and allowlists need periodic revalidation." },
      { ko: "AI가 생성했다는 이유만으로 코드·미디어의 정확성·안전·권리를 보장하지 않습니다.", en: "AI generation alone guarantees neither correctness, safety nor rights for code or media." },
    ],
    evidence: ["apps/web/src/domains/creator/ai", "apps/api/src/modules/studio-ai", "docs/operations/quality-preserving-cost-policy.md", ".github"],
  },
  {
    id: "data-crawling-provenance",
    status: "live",
    eyebrow: "09 · CRAWLING & OPEN DATA",
    title: { ko: "수집보다 출처·권리·변경 감지부터", en: "Provenance, rights and drift detection before collection" },
    question: {
      ko: "외부 사이트와 Open API를 유용하게 연결하면서 이용 약관·robots·schema drift와 삭제 요청을 어떻게 존중할까?",
      en: "How can external sites and Open APIs be useful while respecting terms, robots, schema drift and removal requests?",
    },
    background: {
      ko: "공개 URL은 자유로운 재사용 허가가 아닙니다. HTML selector와 API schema는 변하며 이미지 host, license flag와 attribution 요구도 응답마다 다를 수 있습니다.",
      en: "A public URL is not blanket reuse permission. HTML selectors and API schemas drift, while image hosts, license flags and attribution requirements vary by response.",
    },
    architecture: [
      { ko: "robots·이용 약관·API 정책·rate limit과 허용 데이터 범위를 source registry에 둡니다.", en: "Record robots, terms, API policy, rate limits and permitted data scope in a source registry." },
      { ko: "provider adapter가 raw response를 schema 검증한 뒤 provenance·license·fetchedAt과 함께 내부 모델로 정규화합니다.", en: "Provider adapters schema-validate raw responses and normalize them with provenance, license and fetchedAt." },
      { ko: "원본 HTML·API payload, 파생 metadata와 서비스 노출 copy의 보존 기간을 나눕니다.", en: "Separate retention for source HTML or API payloads, derived metadata and public copy." },
      { ko: "schema·rights drift와 image host 변경을 계약 테스트와 운영 alert로 감지합니다.", en: "Detect schema, rights and image-host drift through contract tests and operating alerts." },
    ],
    achievements: [
      { ko: "Open API와 crawling source를 출처·권리·quota 관점에서 공개 데이터 페이지와 연결했습니다.", en: "Open APIs and crawling sources connect to public data pages through provenance, rights and quota." },
      { ko: "Google Books, Wikimedia, Poly Haven 등 서로 다른 응답을 provider adapter와 rights metadata로 정규화합니다.", en: "Provider adapters and rights metadata normalize diverse responses such as Google Books, Wikimedia and Poly Haven." },
      { ko: "selector·schema·rights drift를 장애 기록과 회귀 검사로 남깁니다.", en: "Selector, schema and rights drift remain in incident records and regression tests." },
    ],
    portability: [
      { ko: "가격 비교·채용·뉴스·리서치 서비스는 source registry와 provenance envelope를 먼저 적용할 수 있습니다.", en: "Price comparison, hiring, news and research products can first adopt source registries and provenance envelopes." },
      { ko: "AI RAG pipeline도 retrievedAt·source URL·license·chunk hash를 같은 원칙으로 보존할 수 있습니다.", en: "AI retrieval pipelines can preserve retrievedAt, source URL, license and chunk hashes by the same principle." },
    ],
    limits: [
      { ko: "기술적으로 접근 가능해도 정책·권리 근거가 없으면 수집·노출하지 않습니다.", en: "Technical accessibility alone is insufficient without policy and rights basis." },
      { ko: "공개 API의 현재 schema와 quota는 배포 전 공식 문서·실응답으로 다시 검증합니다.", en: "Current public-API schemas and quotas are revalidated against official docs and live responses before release." },
    ],
    evidence: ["apps/web/src/domains/legal/CrawlerPolicyPage.tsx", "scripts/crawl.mjs", "apps/api/src/modules/creator-resources", "apps/web/src/domains/creator-resources"],
  },
  {
    id: "quality-delivery-promotion",
    status: "live",
    eyebrow: "10 · QUALITY & COMMUNICATION",
    title: { ko: "코드·테스트·발표·홍보영상을 하나의 사실 원본으로", en: "One factual source for code, tests, decks and promotional film" },
    question: {
      ko: "기술 자랑이 과장된 카피가 되지 않고 실제 검증과 시장 설명으로 이어지게 하려면?",
      en: "How can technical pride become verified market communication instead of exaggerated copy?",
    },
    background: {
      ko: "기술 페이지, 투자자 자료, 세미나와 홍보영상이 서로 다른 숫자와 상태를 말하면 신뢰가 떨어지고 업데이트 비용이 커집니다.",
      en: "Trust and maintainability fall when technology pages, investor decks, seminars and promotional films tell different numbers or status stories.",
    },
    architecture: [
      { ko: "chapter·guide·reference·field note를 typed content로 만들고 모든 surface가 같은 배열을 사용합니다.", en: "Model chapters, guides, references and field notes as typed content consumed by every surface." },
      { ko: "각 claim은 status와 repository evidence path를 가지며 secret이나 private endpoint는 제외합니다.", en: "Every claim carries status and repository evidence paths while excluding secrets and private endpoints." },
      { ko: "Remotion film은 scene data와 deterministic timing을 사용하고 실제 측정이 아닌 숫자는 장식으로도 넣지 않습니다.", en: "Remotion films use scene data and deterministic timing and never include unmeasured numbers, even decoratively." },
      { ko: "PR·CI·artifact review 뒤에만 공개·배포하며 merge와 deploy를 같은 행위로 취급하지 않습니다.", en: "Public release and deployment follow PR, CI and artifact review; merge and deploy remain separate actions." },
    ],
    achievements: [
      { ko: "동일한 기술 원본에서 story, guide, reference, field note, deck, film과 license 페이지를 구성했습니다.", en: "Story, guide, reference, field-note, deck, film and license pages share one engineering source." },
      { ko: "투자자·세미나·스터디 깊이를 같은 사실의 서로 다른 편집으로 제공합니다.", en: "Investor, seminar and study depths are edits of the same facts." },
      { ko: "홍보영상의 재생·다운로드·hash manifest와 품질 검증을 배포 파이프라인과 분리해 reviewable artifact로 만듭니다.", en: "Film playback, download, hash manifests and quality checks produce reviewable artifacts separate from deployment." },
    ],
    portability: [
      { ko: "다른 서비스도 claim registry를 만들고 홈페이지·세일즈 deck·채용 페이지가 같은 status와 evidence를 사용하게 할 수 있습니다.", en: "Other products can build a claim registry shared by homepages, sales decks and recruiting pages." },
      { ko: "세미나 자료를 코드 옆에서 관리하면 architecture decision과 교육 자료의 drift를 함께 줄일 수 있습니다.", en: "Keeping seminar material beside code reduces drift in both architecture decisions and education." },
    ],
    limits: [
      { ko: "저장소 path는 구현 존재를 보여 줄 뿐 운영 성공·시장 성과를 자동 증명하지 않습니다.", en: "Repository paths show implementation existence, not operating success or market outcome." },
      { ko: "고객·투자자용 정량 수치는 독립적으로 측정하고 시점·표본·환경을 함께 공개해야 합니다.", en: "Customer and investor metrics require independent measurement with time, sample and environment disclosed." },
    ],
    evidence: ["apps/web/src/domains/legal/technology", "tools/media/brand-film/src/TechnologyStoryFilm.tsx", "docs/marketing/creator-first-home.md", "docs/marketing/creator-film-playback-hardening.md"],
  },
] as const satisfies readonly EngineeringPlaybookDossier[];

export const ENGINEERING_BENCHMARK_GROUPS = [
  {
    id: "drawing-professional-tools",
    title: { ko: "전문 드로잉·만화 제작", en: "Professional drawing and comics" },
    products: ["Clip Studio Paint", "Krita", "Photoshop", "Procreate", "MediBang Paint"],
    marketSignal: {
      ko: "사용자는 브러시 감각만이 아니라 레이어, 페이지, 파일 호환, 반복 작업과 학습 생태계를 하나의 전문성으로 평가합니다.",
      en: "Users judge professional quality through layers, pages, file interchange, repetitive workflows and learning ecosystems—not brush feel alone.",
    },
    observedPatterns: [
      { ko: "Clip Studio Paint는 페이지·소재·3D reference와 desktop 제작 workflow를 하나의 전문 환경으로 연결합니다.", en: "Clip Studio Paint connects pages, materials and 3D reference inside a professional desktop workflow." },
      { ko: "Krita·Photoshop·Procreate·MediBang은 서로 다른 장치·파일·학습 생태계에 최적화되어 한 제품의 기능 수만으로 비교하기 어렵습니다.", en: "Krita, Photoshop, Procreate and MediBang optimize for different devices, file flows and learning ecosystems, so feature counts alone are misleading." },
    ],
    evidenceNote: { ko: "제품 공식 문서와 동일 파일·장치 기반 내부 검증을 구분합니다.", en: "Official product documentation remains separate from our same-file and same-device validation." },
    learned: [
      { ko: "창작 중 방해를 줄이는 패널·shortcut·tool feedback", en: "Panels, shortcuts and tool feedback that reduce interruption" },
      { ko: "브러시 preset·material·page와 project 단위 관리", en: "Brush presets, materials, pages and project-level management" },
      { ko: "PSD·image·3D reference round trip의 중요성", en: "Importance of PSD, image and 3D-reference round trips" },
    ],
    applied: [
      { ko: "preview/commit renderer 역할, brush lab와 project revision을 분리했습니다.", en: "Preview and commit roles, the brush lab and project revisions remain separate." },
      { ko: "기능 수 복제보다 긴 획·복구·파일 왕복을 검증 기준으로 사용합니다.", en: "Long strokes, recovery and file round trips matter more than feature-count copying." },
    ],
    doNotClaim: [
      { ko: "실제 동일 파일·브러시·장비 benchmark 없이 제품 동등성을 주장하지 않습니다.", en: "No parity claim without real file, brush and device benchmarks." },
      { ko: "desktop 앱의 모든 plugin·color workflow를 브라우저가 대체한다고 말하지 않습니다.", en: "The browser product does not claim to replace every desktop plugin or color workflow." },
    ],
  },
  {
    id: "collaborative-canvas",
    title: { ko: "실시간 협업 캔버스", en: "Realtime collaborative canvases" },
    products: ["Figma", "tldraw", "Magma", "Excalidraw"],
    marketSignal: {
      ko: "공동 편집의 가치는 cursor 수보다 room 권위, presence, 공유 link, migration과 복구가 얼마나 예측 가능한지에 달려 있습니다.",
      en: "Collaborative value depends less on cursor count than predictable room authority, presence, share links, migrations and recovery.",
    },
    observedPatterns: [
      { ko: "Figma·tldraw·Excalidraw 계열은 공유 가능한 문서 room과 ephemeral presence를 분리하는 패턴을 보여 줍니다.", en: "Figma, tldraw and Excalidraw show the value of separating shareable document rooms from ephemeral presence." },
      { ko: "Magma는 캔버스 안의 대화·영상·화면 공유를 창작 흐름에 붙이되 일부 미디어 capability를 요금제 경계로 운영합니다.", en: "Magma brings conversation, video and screen sharing into the canvas while placing some media capabilities behind plan boundaries." },
      { ko: "문서 동기화와 음성·영상 transport는 사용자 경험상 가까워도 내구성·권한·비용 면에서는 별도 시스템입니다.", en: "Document synchronization and audio or video transport may feel adjacent, but differ in durability, authority and cost." },
    ],
    evidenceNote: { ko: "공식 기능 문서는 workflow 신호이며 동시 사용자 수·지연·복구 parity의 독립 benchmark는 아닙니다.", en: "Official feature documentation is a workflow signal, not an independent concurrency, latency or recovery benchmark." },
    learned: [
      { ko: "하나의 document room과 명확한 share·permission 경계", en: "One document room with explicit sharing and permission boundaries" },
      { ko: "ephemeral presence와 durable document state 분리", en: "Separation of ephemeral presence and durable document state" },
      { ko: "큰 asset를 collaborative document 밖에서 보관", en: "Keeping large assets outside the collaborative document" },
    ],
    applied: [
      { ko: "Yjs semantic operation, awareness, durable receipt와 asset storage를 분리했습니다.", en: "Yjs semantic operations, awareness, durable receipts and asset storage are separated." },
      { ko: "room sync를 전체 Studio 초기 bundle에서 지연 로드합니다.", en: "Room sync stays lazy outside the initial Studio bundle." },
    ],
    doNotClaim: [
      { ko: "CRDT 사용만으로 Figma 수준의 다자 편집·권한·운영을 달성했다고 말하지 않습니다.", en: "Using CRDT alone does not imply Figma-level collaboration, authorization or operations." },
      { ko: "cursor·presence 데모를 문서 내구성과 동일하게 취급하지 않습니다.", en: "Cursor and presence demos are not durable-document proof." },
    ],
  },
  {
    id: "browser-3d-dcc",
    title: { ko: "브라우저 3D·DCC·소재", en: "Browser 3D, DCC and assets" },
    products: ["Spline", "Blender", "SketchUp", "ACON3D", "VRoid Studio", "MetaHuman"],
    marketSignal: {
      ko: "브라우저 협업과 빠른 조립, desktop DCC의 정밀 편집, 전문 자산 시장은 서로 다른 가치 사슬을 만듭니다.",
      en: "Browser collaboration and assembly, precise desktop DCC work and specialist asset marketplaces form different value chains.",
    },
    observedPatterns: [
      { ko: "Spline은 브라우저 협업과 빠른 scene 조립, Blender는 topology·rig·render QA, VRoid·MetaHuman은 캐릭터 특화 authoring에 강점이 있습니다.", en: "Spline emphasizes browser collaboration and scene assembly, Blender topology, rigging and render QA, and VRoid or MetaHuman specialized character authoring." },
      { ko: "SketchUp·ACON3D 같은 도구와 시장은 정밀 모델링과 검증된 소재 유통이 서로 다른 책임임을 보여 줍니다.", en: "Tools and marketplaces such as SketchUp and ACON3D show that precision authoring and validated asset distribution are different responsibilities." },
    ],
    evidenceNote: { ko: "파일 왕복, 좌표·재질·skeleton과 권리 provenance를 실제 asset로 검증한 범위만 비교합니다.", en: "Comparisons are limited to real-asset round trips, coordinates, materials, skeletons and rights provenance we actually validate." },
    learned: [
      { ko: "웹 viewport와 authoritative scene data 분리", en: "Separate web viewports from authoritative scene data" },
      { ko: "GLB·VRM 같은 교환 format과 provenance 유지", en: "Preserve GLB and VRM interchange plus provenance" },
      { ko: "asset discovery, license와 project revision 연결", en: "Connect asset discovery, licenses and project revisions" },
    ],
    applied: [
      { ko: "Three.js, VRM, WASM geometry와 Blender QA를 specialist boundary로 연결했습니다.", en: "Three.js, VRM, WASM geometry and Blender QA connect through specialist boundaries." },
      { ko: "자산 원본·revision·권리와 scene instance를 구분합니다.", en: "Source assets, revisions and rights remain separate from scene instances." },
    ],
    doNotClaim: [
      { ko: "한 browser runtime이 Blender·SketchUp·캐릭터 도구 전체를 대체한다고 주장하지 않습니다.", en: "One browser runtime does not replace all of Blender, SketchUp or character tools." },
      { ko: "상용 marketplace 소재를 CC0나 자체 제작 자산처럼 다루지 않습니다.", en: "Commercial marketplace assets are not treated like CC0 or first-party assets." },
    ],
  },
  {
    id: "spatial-workspaces",
    title: { ko: "가상 업무·소셜 공간", en: "Spatial work and social spaces" },
    products: ["Gather 2.0", "WorkAdventure", "Kumospace"],
    marketSignal: {
      ko: "공간은 사람·방·도구 발견성을 높이지만 대화 동의, 실제 media recipient와 목록 대체 경로가 없으면 장식적이고 배타적인 UI가 됩니다.",
      en: "Space improves discovery of people, rooms and tools, but becomes decorative and exclusionary without conversation consent, real media-recipient disclosure and list alternatives.",
    },
    observedPatterns: [
      { ko: "Gather는 근접·private area 공유와 room-wide Spotlight를 구분하고, 모드별 권장 규모를 별도로 안내합니다.", en: "Gather distinguishes proximity or private-area sharing from room-wide Spotlight and publishes separate scale guidance by mode." },
      { ko: "WorkAdventure는 meeting·silent·restricted·personal·lockable area와 room/world megaphone를 map authoring 계약으로 제공합니다.", en: "WorkAdventure models meeting, silent, restricted, personal and lockable areas plus room or world megaphone as map-authoring contracts." },
      { ko: "Kumospace는 audio range, room audio, closed room, floor broadcast와 recording 범위를 서로 다른 UX로 노출합니다.", en: "Kumospace exposes audio range, room audio, closed rooms, floor broadcast and recording scope as distinct experiences." },
      { ko: "세 제품 모두 공간상 거리와 대규모 broadcast를 같은 transport로 취급하지 않으며 수신 범위를 사용자가 이해할 수 있게 표시합니다.", en: "These products do not treat proximity and large broadcast as one transport and make recipient scope legible to users." },
    ],
    evidenceNote: { ko: "공식 도움말을 2026-09-25에 재확인했습니다. 이는 제품 기능 신호이며 WAN 품질·암호화·접근성의 독립 검증은 아닙니다.", en: "Official help material was rechecked on 2026-09-25. It is a product signal, not independent proof of WAN quality, encryption or accessibility." },
    learned: [
      { ko: "사람 찾기·목적지 이동·회의 요청을 하나의 흐름으로 연결", en: "Connect people search, navigation and meeting requests" },
      { ko: "시각적 방, 음향 범위, 출입 권한과 media 전송 규칙 분리", en: "Separate visual rooms, audio range, access rights and media-routing rules" },
      { ko: "world editor와 runtime, publish·rollback 경계", en: "World-editor, runtime, publish and rollback boundaries" },
    ],
    applied: [
      { ko: "world manifest·action registry·social adapter와 project authority를 분리했습니다.", en: "World manifests, action registries, social adapters and project authority remain separate." },
      { ko: "공간과 목록 view를 같은 프로젝트의 projection으로 유지합니다.", en: "Spatial and list views remain projections of the same project." },
    ],
    doNotClaim: [
      { ko: "화면의 거리·벽만으로 음성·화면 공유 privacy를 보장한다고 말하지 않습니다.", en: "On-screen distance or walls do not prove voice or screen-share privacy." },
      { ko: "공식 문서에 없는 접근성·암호화·성능을 경쟁 제품의 부재로 단정하지 않습니다.", en: "Unverified accessibility, encryption or performance is not treated as absence in competing products." },
    ],
  },
  {
    id: "accessible-web-creation",
    title: { ko: "접근 가능한 웹 창작·배포", en: "Accessible web creation and distribution" },
    products: ["Canva", "Adobe Express", "Figma Slides", "Remotion"],
    marketSignal: {
      ko: "웹 창작 도구는 설치 장벽을 낮추고 template·공유·export를 연결하지만 복잡한 전문 기능은 progressive disclosure가 필요합니다.",
      en: "Web creation lowers installation friction and connects templates, sharing and export, while professional complexity needs progressive disclosure.",
    },
    observedPatterns: [
      { ko: "Canva·Adobe Express는 template에서 편집·공유·다운로드까지 첫 성공 경로를 짧게 만들고 고급 기능을 점진적으로 노출합니다.", en: "Canva and Adobe Express shorten the path from templates to edit, share and download while progressively exposing advanced capability." },
      { ko: "Figma Slides는 협업 문서와 발표를 연결하고, Remotion은 React 데이터와 frame timeline을 재현 가능한 영상 산출물로 바꿉니다.", en: "Figma Slides connects collaborative documents to presentation, while Remotion turns React data and frame timelines into reproducible film artifacts." },
    ],
    evidenceNote: { ko: "홍보 영상·발표 화면은 제품 동작과 동일한 source data를 사용하되 실제 사용 성과처럼 표현하지 않습니다.", en: "Promotional films and presentations share product source data but are never presented as measured user outcomes." },
    learned: [
      { ko: "첫 성공까지 짧은 guided entry와 즉시 쓸 수 있는 template", en: "Guided entry and templates that shorten time to first success" },
      { ko: "편집 결과를 share link, download와 presentation으로 재사용", en: "Reuse edited output as share links, downloads and presentations" },
      { ko: "초보와 전문 사용자를 같은 화면에 강제로 몰지 않는 단계적 노출", en: "Progressive disclosure instead of forcing novice and expert workflows into one screen" },
    ],
    applied: [
      { ko: "웹 story, deck와 Remotion film이 같은 기술 원본을 사용합니다.", en: "Web stories, decks and Remotion films share one engineering source." },
      { ko: "공유·다운로드·presentation mode를 별도 artifact로 검증합니다.", en: "Sharing, download and presentation modes are verified as separate artifacts." },
    ],
    doNotClaim: [
      { ko: "template 수나 생성 기능 수만으로 전문 제작 workflow 완성도를 판단하지 않습니다.", en: "Template or generation counts do not prove professional-workflow completeness." },
      { ko: "화려한 영상이 실제 product metric이나 사용 장면을 대신하지 않습니다.", en: "Polished film does not substitute for real product metrics or user evidence." },
    ],
  },
] as const satisfies readonly EngineeringBenchmarkGroup[];

export const ENGINEERING_AI_WORKBENCH = [
  {
    id: "product-ai-contracts",
    layer: { ko: "제품 기능", en: "Product capability" },
    tools: ["provider-neutral task adapters", "free-first routing", "BYOK", "quota ledger"],
    use: { ko: "이미지·사운드·스토리·분석 요청을 공급자 이름이 아닌 사용자 task로 표현합니다.", en: "Express image, sound, story and analysis requests as user tasks rather than provider names." },
    artifact: { ko: "입력 policy, model/provider revision, 비용·권리·결과 receipt", en: "Input policy, model/provider revision, cost, rights and result receipt" },
    guardrail: { ko: "ambiguous timeout을 다른 공급자에 자동 재전송하지 않고 사용자 승인을 받습니다.", en: "Ambiguous timeouts never auto-replay to another provider without user approval." },
  },
  {
    id: "local-browser-ai",
    layer: { ko: "브라우저 로컬 추론", en: "Browser-local inference" },
    tools: ["ONNX Runtime Web", "WebGPU/WASM", "MediaPipe", "Worker"],
    use: { ko: "가능한 보조 계산과 vision task를 기기 안에서 실행해 업로드 지연과 개인정보 전송을 줄입니다.", en: "Run eligible assistance and vision tasks on-device to reduce upload latency and private-data transfer." },
    artifact: { ko: "capability probe, model revision, memory budget, fallback reason", en: "Capability probe, model revision, memory budget and fallback reason" },
    guardrail: { ko: "모델 다운로드·메모리·발열을 감추지 않고 저사양 기기에는 명시적 fallback을 제공합니다.", en: "Model download, memory and thermal cost stay visible with explicit low-end fallbacks." },
  },
  {
    id: "coding-agents",
    layer: { ko: "코딩 에이전트", en: "Coding agents" },
    tools: ["repository-aware agents", "GitHub review", "worktree isolation", "test runners"],
    use: { ko: "코드 탐색, 반복 refactor, 테스트 작성과 문서 갱신을 독립 branch·worktree에서 보조합니다.", en: "Assist code exploration, repetitive refactors, tests and documentation inside isolated branches and worktrees." },
    artifact: { ko: "diff, commit, PR, 실행한 검증 command와 남은 위험", en: "Diff, commit, pull request, verification commands and residual risks" },
    guardrail: { ko: "성공 메시지 대신 실제 git diff·test·build와 사람 review를 merge 기준으로 사용합니다.", en: "Use actual diffs, tests, builds and human review—not success messages—as merge criteria." },
  },
  {
    id: "mcp-tool-calling",
    layer: { ko: "도구 호출·MCP", en: "Tool calling and MCP" },
    tools: ["Blender MCP boundary", "GitHub connector", "browser verification", "artifact tools"],
    use: { ko: "AI 제안을 실제 repository, DCC, test와 artifact 작업으로 연결하되 tool별 권한과 input/output 범위를 제한합니다.", en: "Connect AI proposals to repositories, DCC, tests and artifacts while bounding each tool's permissions and inputs or outputs." },
    artifact: { ko: "allowlisted command, input package, output hash, execution log", en: "Allowlisted command, input package, output hash and execution log" },
    guardrail: { ko: "검증된 live host가 없으면 unavailable로 닫고 임의 shell·file access를 제품 권위로 승격하지 않습니다.", en: "Fail closed without a verified live host and never promote arbitrary shell or file access to product authority." },
  },
  {
    id: "research-documentation",
    layer: { ko: "기술 조사·학습", en: "Technical research" },
    tools: ["official documentation", "standards/RFCs", "Context7-style library lookup", "benchmark matrices"],
    use: { ko: "변하는 API·표준·제품 동작은 공식 문서와 실험 날짜를 남기고 source와 target을 구분합니다.", en: "Record official sources and experiment dates for changing APIs, standards and product behavior, separating source from target." },
    artifact: { ko: "열람일, source link, 판단, 적용 범위와 미확인 항목", en: "Access date, source link, decision, application scope and unknowns" },
    guardrail: { ko: "검색 결과 요약만으로 API 존재·제품 기능·시장 parity를 단정하지 않습니다.", en: "Search summaries alone never prove an API, product capability or market parity." },
  },
  {
    id: "media-storytelling",
    layer: { ko: "미디어 제작", en: "Media production" },
    tools: ["image generation adapters", "sound generation adapters", "Remotion", "reference-role metadata"],
    use: { ko: "서비스 소개 이미지·음향·영상 초안을 만들되 실제 화면·측정치·창작물 출처와 구분합니다.", en: "Create draft service imagery, audio and film while separating them from real screens, measurements and source artwork." },
    artifact: { ko: "prompt/brief, reference role, provider/model revision, rights note, rendered hash", en: "Prompt or brief, reference role, provider/model revision, rights note and rendered hash" },
    guardrail: { ko: "illustrative asset를 실제 사용자·성과·제품 screenshot처럼 표시하지 않습니다.", en: "Illustrative assets are never presented as real users, outcomes or product screenshots." },
  },
] as const satisfies readonly EngineeringAiWorkbench[];

export const ENGINEERING_FILM_CUTS = [
  {
    id: "teaser-15",
    duration: "15s",
    audience: { ko: "SNS·행사 teaser", en: "Social and event teaser" },
    promise: { ko: "브라우저에서 기획·그리기·3D·협업이 하나의 프로젝트로 이어진다.", en: "Planning, drawing, 3D and collaboration remain one browser project." },
    beats: [
      { ko: "0–3초: 흩어진 대본·그림·3D·검수 창", en: "0–3s: fragmented scripts, drawings, 3D and reviews" },
      { ko: "3–10초: 프로젝트 중심 Studio와 즉시 반응하는 brush·공간·3D", en: "3–10s: project-centered Studio with responsive brushes, space and 3D" },
      { ko: "10–15초: ‘맥락이 끊기지 않는 창작 스튜디오’와 CTA", en: "10–15s: connected-creation promise and CTA" },
    ],
    proof: [
      { ko: "실제 route·interaction capture 또는 명확히 표시한 illustration", en: "Real route and interaction capture or clearly labelled illustration" },
      { ko: "상태 badge 없는 미완성 기능을 전면에 두지 않음", en: "No unfinished capability foregrounded without status" },
    ],
    avoid: [
      { ko: "읽을 수 없는 기술명 나열", en: "Unreadable technology-name walls" },
      { ko: "측정하지 않은 ‘가장 빠른’·‘완전한’ 표현", en: "Unmeasured ‘fastest’ or ‘complete’ claims" },
    ],
  },
  {
    id: "investor-45",
    duration: "45s",
    audience: { ko: "투자자·파트너", en: "Investors and partners" },
    promise: { ko: "기능 모음이 아니라 프로젝트 맥락·권리·복구를 지키는 확장 가능한 제작 기반", en: "A scalable production foundation protecting project context, rights and recovery—not a feature bundle" },
    beats: [
      { ko: "문제: 제작 handoff 때마다 맥락과 파일이 분리됨", en: "Problem: context and files fragment at every production handoff" },
      { ko: "방어력: local-first, Worker/PWA, semantic collaboration과 specialist engines", en: "Defensibility: local-first, Worker/PWA, semantic collaboration and specialist engines" },
      { ko: "확장: 무료 우선 비용·provider adapter·권리 provenance", en: "Scale: free-first cost, provider adapters and rights provenance" },
      { ko: "증거: status와 code/test/workflow 연결", en: "Evidence: status linked to code, tests and workflows" },
    ],
    proof: [
      { ko: "제품 architecture map과 실제 검증 artifact", en: "Product architecture map and real verification artifacts" },
      { ko: "운영·설정·실험 숫자를 구분한 chapter count", en: "Chapter counts separated by live, configured and experimental status" },
    ],
    avoid: [
      { ko: "시장 규모·전환·사용자 수를 근거 없이 삽입", en: "Unsupported market-size, conversion or user-count claims" },
      { ko: "기술 complexity 자체를 사업 방어력으로 간주", en: "Treating technical complexity itself as business defensibility" },
    ],
  },
  {
    id: "overview-90",
    duration: "90s",
    audience: { ko: "서비스 소개·채용·세미나 오프닝", en: "Service introduction, recruiting and seminar opening" },
    promise: { ko: "문제, 기술 경계, 사용자 가치와 검증을 한 번에 이해한다.", en: "Understand the problem, technical boundaries, user value and verification in one pass." },
    beats: [
      { ko: "서비스 문제와 project-centered domain", en: "Service problem and project-centered domain" },
      { ko: "social identity·share와 신뢰 경계", en: "Social identity, sharing and trust boundaries" },
      { ko: "brush preview/commit, Worker와 local-first recovery", en: "Brush preview/commit, Workers and local-first recovery" },
      { ko: "CRDT semantic collaboration과 대형 asset 분리", en: "CRDT semantic collaboration and large-asset separation" },
      { ko: "virtual studio, web 3D와 Blender QA", en: "Virtual studio, web 3D and Blender QA" },
      { ko: "AI·Open API·rights·quality evidence", en: "AI, open APIs, rights and quality evidence" },
    ],
    proof: [
      { ko: "각 scene에 대응하는 공개 chapter·guide link", en: "A public chapter or guide link for every scene" },
      { ko: "실제 status badge와 과장 없는 한계 문구", en: "Actual status badges and non-exaggerated limitation copy" },
    ],
    avoid: [
      { ko: "한 장면에 네 개가 넘는 핵심 기술명", en: "More than four core technology names in one scene" },
      { ko: "실제 UI와 concept art를 구분하지 않는 montage", en: "Montage that fails to distinguish real UI from concept art" },
    ],
  },
  {
    id: "seminar-6m",
    duration: "6m",
    audience: { ko: "기술 발표·온보딩", en: "Engineering talks and onboarding" },
    promise: { ko: "패키지 목록이 아니라 결정·대안·실패·재사용 순서를 배운다.", en: "Learn decisions, alternatives, failures and reuse order—not package lists." },
    beats: [
      { ko: "1분: 제품·시장 문제와 비교 방법", en: "1m: product and market problem plus benchmark method" },
      { ko: "2분: authority map과 local-first/Worker/PWA", en: "2m: authority map and local-first, Worker and PWA" },
      { ko: "1분: brush·CRDT·virtual studio의 핵심 tradeoff", en: "1m: core brush, CRDT and virtual-studio tradeoffs" },
      { ko: "1분: 3D·AI·data provenance", en: "1m: 3D, AI and data provenance" },
      { ko: "1분: 장애 기록, 검증과 다른 프로젝트 적용", en: "1m: incident evidence, verification and reuse" },
    ],
    proof: [
      { ko: "speaker note에 source·demo·fallback·질문 포함", en: "Speaker notes include sources, demo, fallback and discussion questions" },
      { ko: "모든 demo에 녹화 fallback과 실패 시나리오 준비", en: "Every demo has recorded fallback and a prepared failure scenario" },
    ],
    avoid: [
      { ko: "live demo 성공만을 결론으로 사용", en: "Using one successful live demo as the conclusion" },
      { ko: "코드 path를 설명 없이 화면에 오래 노출", en: "Leaving code paths on screen without interpretation" },
    ],
  },
] as const satisfies readonly EngineeringFilmCut[];

export const ENGINEERING_SEMINAR_MODULES = [
  {
    id: "opening",
    minutes: 5,
    title: { ko: "왜 브라우저 제작실인가", en: "Why a browser production studio" },
    learning: [
      { ko: "기능 목록보다 handoff와 맥락 비용을 문제로 정의", en: "Frame handoff and context cost before feature lists" },
      { ko: "오늘 다룰 live·configured·experimental 상태 이해", en: "Understand live, configured and experimental status" },
    ],
    demo: { ko: "기획 → 컷 → 드로잉 → 검수 route를 60초 안에 이동", en: "Navigate planning to cut, drawing and review routes in 60 seconds" },
    discussion: { ko: "우리 서비스에서 다음 담당자가 가장 자주 복원하는 맥락은 무엇인가?", en: "Which context does the next person reconstruct most often in our product?" },
  },
  {
    id: "market-benchmark",
    minutes: 10,
    title: { ko: "시장·제품 벤치마크를 parity 주장 없이 읽기", en: "Reading product benchmarks without parity claims" },
    learning: [
      { ko: "used·evaluated·inspired·alternative 구분", en: "Separate used, evaluated, inspired and alternative references" },
      { ko: "공식 문서, 실제 사용 실험과 미확인 항목 기록", en: "Record official documentation, product experiments and unknowns" },
    ],
    demo: { ko: "Clip Studio·Figma·Spline·Gather 비교표에서 한 항목을 source → lesson → boundary로 변환", en: "Turn one Clip Studio, Figma, Spline or Gather benchmark into source, lesson and boundary" },
    discussion: { ko: "경쟁사 기능을 복제하지 않고 가져올 원칙은 무엇인가?", en: "Which principle should we adopt without copying a competitor feature?" },
  },
  {
    id: "authority-architecture",
    minutes: 15,
    title: { ko: "권위·receipt·revision 중심 아키텍처", en: "Authority, receipt and revision architecture" },
    learning: [
      { ko: "빠른 표시와 durable result 분리", en: "Separate fast display from durable results" },
      { ko: "외부 engine과 provider를 adapter 뒤에 두기", en: "Place external engines and providers behind adapters" },
    ],
    demo: { ko: "한 기능의 input·output·authority·failure·fallback 표 작성", en: "Build an input, output, authority, failure and fallback table for one feature" },
    discussion: { ko: "우리 시스템에서 둘 이상의 component가 최종 결과를 소유하는 곳은 어디인가?", en: "Where do two or more components claim final ownership in our system?" },
  },
  {
    id: "brush-engine",
    minutes: 20,
    title: { ko: "브러시 입력에서 문서 commit까지", en: "From brush input to document commit" },
    learning: [
      { ko: "sample normalization, prediction, material simulation과 tile commit", en: "Sample normalization, prediction, media simulation and tile commit" },
      { ko: "preview/commit parity, long stroke와 fallback 품질", en: "Preview/commit parity, long strokes and fallback quality" },
    ],
    demo: { ko: "pointer sample이 Worker·renderer registry·history receipt로 흐르는 sequence", en: "Trace a pointer sample through Worker, renderer registry and history receipt" },
    discussion: { ko: "우리 UI에서 빠르게 보이지만 저장 결과가 달라질 수 있는 경로는 무엇인가?", en: "Which UI path can look fast yet persist a different result?" },
  },
  {
    id: "workers-pwa-local-first",
    minutes: 15,
    title: { ko: "Worker·PWA·OPFS로 앱 같은 연속성 만들기", en: "App-like continuity with Workers, PWA and OPFS" },
    learning: [
      { ko: "typed job, Transferable, cancellation과 late response", en: "Typed jobs, Transferables, cancellation and late responses" },
      { ko: "Service Worker update와 user data recovery 분리", en: "Separate Service Worker updates from user-data recovery" },
    ],
    demo: { ko: "편집 중 새 Service Worker 대기 → 사용자 승인 → reset 가능한 update 흐름", en: "Show a waiting Service Worker, user-approved update and reset path during editing" },
    discussion: { ko: "Worker 실패 뒤 자동 replay해도 안전한 작업과 위험한 작업은?", en: "Which jobs are safe or unsafe to replay automatically after Worker failure?" },
  },
  {
    id: "crdt-collaboration",
    minutes: 15,
    title: { ko: "CRDT와 실시간 협업의 실제 범위", en: "The real scope of CRDT collaboration" },
    learning: [
      { ko: "semantic operation·awareness·asset·receipt 분리", en: "Separate semantic operations, awareness, assets and receipts" },
      { ko: "offline fork, migration, compaction과 room budget", en: "Offline forks, migration, compaction and room budgets" },
    ],
    demo: { ko: "서로 다른 update 순서가 같은 scene snapshot으로 수렴하는 테스트", en: "Run a convergence test where reordered updates produce the same scene snapshot" },
    discussion: { ko: "우리 데이터 중 CRDT에 넣으면 안 되는 가장 큰 binary는 무엇인가?", en: "What is the largest binary in our product that should stay outside CRDT?" },
  },
  {
    id: "virtual-studio-3d",
    minutes: 15,
    title: { ko: "가상 스튜디오와 멀티 엔진 3D", en: "Virtual studio and multi-engine 3D" },
    learning: [
      { ko: "spatial projection과 project authority 분리", en: "Separate spatial projection from project authority" },
      { ko: "Three.js·VRM·WASM geometry·Blender QA 역할", en: "Roles of Three.js, VRM, WASM geometry and Blender QA" },
    ],
    demo: { ko: "world object action → project route와 GLB export → Blender validation 흐름", en: "Trace a world-object action to a project route and GLB export to Blender validation" },
    discussion: { ko: "공간 UI가 목록 UI보다 불리한 사용자를 위해 어떤 동등 경로가 필요한가?", en: "Which equivalent paths are needed for users disadvantaged by spatial UI?" },
  },
  {
    id: "ai-data-rights",
    minutes: 10,
    title: { ko: "AI·Open API·크롤링과 권리", en: "AI, open APIs, crawling and rights" },
    learning: [
      { ko: "provider-neutral AI, cost ledger와 ambiguous failure", en: "Provider-neutral AI, cost ledgers and ambiguous failure" },
      { ko: "provenance·license·schema drift를 결과와 함께 저장", en: "Store provenance, license and schema drift with results" },
    ],
    demo: { ko: "외부 결과 하나를 source·rights·revision·result receipt로 정규화", en: "Normalize one external result into source, rights, revision and result receipt" },
    discussion: { ko: "기술적으로 가능하지만 정책상 수집하지 말아야 할 데이터는?", en: "Which technically accessible data should still not be collected?" },
  },
  {
    id: "quality-incidents",
    minutes: 10,
    title: { ko: "실패 기록·품질 게이트·공개 커뮤니케이션", en: "Incident evidence, quality gates and public communication" },
    learning: [
      { ko: "증상·원인·수정·regression 분리", en: "Separate symptom, cause, fix and regression" },
      { ko: "status·evidence 기반 홍보와 reviewable artifact", en: "Status and evidence based communication with reviewable artifacts" },
    ],
    demo: { ko: "OAuth callback, PWA reload loop 또는 Worker replay 장애를 runbook으로 재구성", en: "Reconstruct an OAuth callback, PWA reload loop or Worker replay incident as a runbook" },
    discussion: { ko: "현재 서비스 홍보 문구 중 어떤 문장에 가장 먼저 evidence link가 필요한가?", en: "Which current marketing claim needs an evidence link first?" },
  },
  {
    id: "closing",
    minutes: 5,
    title: { ko: "다른 프로젝트에 적용할 한 가지 경계", en: "One boundary to reuse next" },
    learning: [
      { ko: "패키지가 아니라 검증 순서를 가져가기", en: "Reuse verification order, not package lists" },
      { ko: "작은 first milestone과 failure drill 정하기", en: "Choose a small first milestone and failure drill" },
    ],
    demo: { ko: "참가자별 30일 적용 카드 작성", en: "Write a 30-day adoption card per participant" },
    discussion: { ko: "월요일에 바로 정의할 authority·budget·fallback은 무엇인가?", en: "Which authority, budget and fallback will you define on Monday?" },
  },
] as const satisfies readonly EngineeringSeminarModule[];

export const ENGINEERING_REUSE_BLUEPRINTS = [
  {
    id: "oauth-share",
    title: { ko: "콘텐츠 서비스의 로그인·공유", en: "Identity and sharing for a content product" },
    useWhen: { ko: "여러 소셜 공급자와 모바일 공유 유입을 동시에 추가할 때", en: "Adding multiple social providers and mobile sharing together" },
    firstBoundary: { ko: "provider subject·product session과 canonical share payload", en: "Provider subject, product session and canonical share payload" },
    firstMilestone: { ko: "한 provider의 code flow + native share·copy fallback + OG preview", en: "One provider code flow plus native share, copy fallback and Open Graph preview" },
    failureDrill: { ko: "중복 callback, provider 장애, share 취소와 clipboard 거부", en: "Duplicate callback, provider outage, share cancellation and clipboard denial" },
    doneEvidence: { ko: "server callback test, mobile browser capture, crawler OG 검사와 unlink runbook", en: "Server callback tests, mobile-browser capture, crawler Open Graph check and unlink runbook" },
  },
  {
    id: "browser-workstation",
    title: { ko: "브라우저 전문 작업도구", en: "Professional browser workstation" },
    useWhen: { ko: "긴 계산·대형 파일·복구가 필요한 편집기나 분석 도구를 만들 때", en: "Building an editor or analysis tool with long computation, large files and recovery" },
    firstBoundary: { ko: "UI thread, Worker job, local storage와 durable export 권위", en: "UI thread, Worker jobs, local storage and durable export authority" },
    firstMilestone: { ko: "한 무거운 작업의 typed Worker + cancellation + OPFS checkpoint", en: "One heavy typed Worker job with cancellation and an OPFS checkpoint" },
    failureDrill: { ko: "Worker crash, tab close, quota 부족과 late response", en: "Worker crash, tab close, quota exhaustion and late response" },
    doneEvidence: { ko: "task latency·memory·recovery benchmark와 실제 browser restart test", en: "Task latency, memory and recovery benchmark plus a real-browser restart test" },
  },
  {
    id: "collaborative-editor",
    title: { ko: "실시간 공동 편집기", en: "Realtime collaborative editor" },
    useWhen: { ko: "오프라인과 동시 수정을 모두 허용하는 문서·보드·workflow를 만들 때", en: "Building documents, boards or workflows with offline and concurrent editing" },
    firstBoundary: { ko: "semantic operation, awareness, room authority와 asset storage", en: "Semantic operations, awareness, room authority and asset storage" },
    firstMilestone: { ko: "두 peer의 property·order 수정 convergence + reconnect snapshot", en: "Two-peer property and order convergence plus reconnect snapshot" },
    failureDrill: { ko: "update 재정렬·중복, 구버전 schema와 대형 payload", en: "Reordered or duplicate updates, old schemas and oversized payloads" },
    doneEvidence: { ko: "convergence property test, room limit, migration test와 asset receipt", en: "Convergence property tests, room limits, migration tests and asset receipts" },
  },
  {
    id: "spatial-workspace",
    title: { ko: "가상 업무·교육 공간", en: "Spatial work or learning space" },
    useWhen: { ko: "사람·장소·도구 discovery를 기존 업무 시스템에 공간 UX로 추가할 때", en: "Adding spatial discovery of people, places and tools to an existing work system" },
    firstBoundary: { ko: "world projection, project authority, conversation consent와 media recipients", en: "World projection, project authority, conversation consent and media recipients" },
    firstMilestone: { ko: "검색 가능한 한 방 + allowlisted object action + 목록 대체 경로", en: "One searchable room with an allowlisted object action and list alternative" },
    failureDrill: { ko: "이동 불가, locked room, mic 거부, network reconnect와 low-power", en: "Blocked movement, locked rooms, microphone denial, reconnect and low-power mode" },
    doneEvidence: { ko: "keyboard·reduced motion·list path와 실제 recipient disclosure test", en: "Keyboard, reduced-motion and list paths plus real recipient-disclosure tests" },
  },
  {
    id: "multi-engine-3d",
    title: { ko: "멀티 엔진 3D 제작", en: "Multi-engine 3D production" },
    useWhen: { ko: "브라우저 상호작용과 정밀 계산·desktop QA를 함께 사용할 때", en: "Combining browser interaction, precision computation and desktop QA" },
    firstBoundary: { ko: "authoritative scene model, viewport engine, geometry Worker와 DCC package", en: "Authoritative scene model, viewport engine, geometry Worker and DCC package" },
    firstMilestone: { ko: "작은 GLB/VRM의 browser import-edit-export + headless validation", en: "Browser import, edit and export of a small GLB or VRM plus headless validation" },
    failureDrill: { ko: "coordinate·unit·material·texture·skeleton mismatch와 GPU loss", en: "Coordinate, unit, material, texture and skeleton mismatch plus GPU loss" },
    doneEvidence: { ko: "round-trip hash, visual QA, schema preflight와 license provenance", en: "Round-trip hash, visual QA, schema preflight and license provenance" },
  },
  {
    id: "ai-open-data",
    title: { ko: "AI·Open API·외부 데이터 기능", en: "AI, open API and external-data features" },
    useWhen: { ko: "여러 AI 공급자나 외부 데이터 source를 제품 기능에 연결할 때", en: "Connecting multiple AI providers or external data sources to product capabilities" },
    firstBoundary: { ko: "task contract, data policy, budget policy, source registry와 result receipt", en: "Task contract, data policy, budget policy, source registry and result receipt" },
    firstMilestone: { ko: "한 provider/source의 schema validation + provenance + explicit failure", en: "One provider or source with schema validation, provenance and explicit failure" },
    failureDrill: { ko: "timeout 후 결과 불명, quota 초과, schema drift, rights flag 변경", en: "Ambiguous timeout, exhausted quota, schema drift and rights-flag changes" },
    doneEvidence: { ko: "fixture contract test, cost ledger, removal path와 public data disclosure", en: "Fixture contract tests, cost ledger, removal path and public data disclosure" },
  },
] as const satisfies readonly EngineeringReuseBlueprint[];
