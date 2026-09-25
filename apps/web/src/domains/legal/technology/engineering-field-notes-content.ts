import type {
  EngineeringEvidence,
  EngineeringStatus,
  LocalizedText,
} from "./engineering-story-content";

export type EngineeringFieldCategory =
  | "workers-pwa"
  | "ai-cost"
  | "three-d-dcc"
  | "open-data"
  | "reliability";

export type EngineeringReferenceRole =
  | "applied-pattern"
  | "specialist"
  | "reference-only"
  | "not-adopted"
  | "planned-evaluation";

export interface EngineeringExternalReference {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly kind: "official-doc" | "standard" | "open-api" | "product";
  readonly note: LocalizedText;
  readonly reviewedAt: string;
}

export interface EngineeringFieldNote {
  readonly id: string;
  readonly category: EngineeringFieldCategory;
  readonly status: EngineeringStatus;
  readonly eyebrow: string;
  readonly title: LocalizedText;
  readonly summary: LocalizedText;
  readonly problem: LocalizedText;
  readonly pattern: LocalizedText;
  readonly boundary: LocalizedText;
  readonly technologies: readonly string[];
  readonly evidence: readonly EngineeringEvidence[];
  readonly reuseSteps: readonly LocalizedText[];
  readonly references: readonly EngineeringExternalReference[];
}

export interface EngineeringOpenApiNote {
  readonly id: string;
  readonly provider: string;
  readonly status: EngineeringStatus;
  readonly purpose: LocalizedText;
  readonly access: LocalizedText;
  readonly rightsGate: LocalizedText;
  readonly resilience: LocalizedText;
  readonly evidence: readonly EngineeringEvidence[];
  readonly officialUrl: string;
}

export interface EngineeringTroubleshootingCase {
  readonly id: string;
  readonly status: EngineeringStatus;
  readonly title: LocalizedText;
  readonly symptom: LocalizedText;
  readonly rootCause: LocalizedText;
  readonly fix: LocalizedText;
  readonly prevention: LocalizedText;
  readonly evidence: readonly EngineeringEvidence[];
}

export interface EngineeringReferenceProduct {
  readonly id: string;
  readonly name: string;
  readonly role: EngineeringReferenceRole;
  readonly lesson: LocalizedText;
  readonly applied: LocalizedText;
  readonly boundary: LocalizedText;
  readonly url: string;
}

export interface EngineeringImplementationInventory {
  readonly reviewedAt: string;
  readonly workerEntries: number;
  readonly workerClients: number;
  readonly serviceWorkerRuntimeFiles: number;
  readonly localInferenceRuntimes: readonly string[];
  readonly blenderMcpCommands: number;
  readonly openApiProviders: number;
}

export const ENGINEERING_FIELD_CATEGORY_META: Record<
  EngineeringFieldCategory,
  { readonly label: LocalizedText; readonly description: LocalizedText }
> = {
  "workers-pwa": {
    label: { ko: "Worker · PWA", en: "Workers · PWA" },
    description: {
      ko: "무거운 계산을 UI에서 분리하고 설치·오프라인·업데이트를 안전하게 운영하는 브라우저 구조",
      en: "Browser patterns for isolating heavy work and operating install, offline and update flows safely",
    },
  },
  "ai-cost": {
    label: { ko: "무료 AI · 인프라", en: "Free-first AI · infrastructure" },
    description: {
      ko: "무료 한도를 품질 저하나 자동 과금으로 바꾸지 않는 공급자·예산·배포 계약",
      en: "Provider, budget and deployment contracts that never turn free limits into silent quality loss or billing",
    },
  },
  "three-d-dcc": {
    label: { ko: "Blender · 3D", en: "Blender · 3D" },
    description: {
      ko: "브라우저 실시간 편집과 DCC 제작 파이프라인을 하나의 문서 권위 아래 연결하는 구조",
      en: "Connecting realtime browser editing and DCC authoring under one document authority",
    },
  },
  "open-data": {
    label: { ko: "Open API · 출처", en: "Open APIs · provenance" },
    description: {
      ko: "외부 데이터를 스키마·권리·출처·실패 계약 뒤에서 안전하게 사용하는 방법",
      en: "Using external data behind schema, rights, provenance and visible-failure contracts",
    },
  },
  reliability: {
    label: { ko: "복구 · 트러블슈팅", en: "Recovery · troubleshooting" },
    description: {
      ko: "실제 실패를 숨기지 않고 복구 가능 상태와 재발 방지 테스트로 바꾸는 방법",
      en: "Turning real failures into recoverable states and regression-proof contracts",
    },
  },
};

const ref = (
  id: string,
  title: string,
  url: string,
  kind: EngineeringExternalReference["kind"],
  ko: string,
  en: string,
): EngineeringExternalReference => ({
  id,
  title,
  url,
  kind,
  note: { ko, en },
  reviewedAt: "2026-09-17",
});

export const ENGINEERING_FIELD_NOTES = [
  {
    id: "worker-topology",
    category: "workers-pwa",
    status: "live",
    eyebrow: "DEDICATED WORKERS · TRANSFER · ABORT",
    title: {
      ko: "Worker를 하나의 만능 백그라운드 스레드가 아니라 작업별 격리 경계로 사용합니다.",
      en: "Workers are task-specific isolation boundaries, not one universal background thread.",
    },
    summary: {
      ko: "3D 검증·물리·브러시·이미지 필터·CRDT·SQLite·가져오기와 내보내기를 별도 Worker로 분리하고, 요청 ID·전송 가능한 버퍼·취소·종료·응답 검증을 공통 계약으로 둡니다.",
      en: "3D validation, physics, brushes, image filters, CRDT, SQLite, import and export run in separate workers with request IDs, transferables, cancellation, termination and response validation.",
    },
    problem: {
      ko: "대형 GLB 검증, 브러시 시뮬레이션이나 이미지 변환이 메인 스레드에서 실행되면 포인터 입력과 캔버스 표시가 멈추고, 실패한 WASM 작업이 다음 요청의 메모리까지 오염시킬 수 있습니다.",
      en: "Large GLB validation, brush simulation and image conversion can stall pointer input on the main thread, while a failed WASM job can poison memory for later requests.",
    },
    pattern: {
      ko: "UI는 의도와 작은 메타데이터만 만들고, Worker 클라이언트가 payload 상한을 검사한 뒤 ArrayBuffer를 transfer합니다. 모든 응답은 requestId와 schema를 검증하고, timeout·abort·치명적 cleanup 실패 시 Worker를 종료해 다음 요청에서 새 인스턴스를 만듭니다.",
      en: "The UI emits intent and small metadata. A client validates payload budgets, transfers ArrayBuffers, validates request IDs and schemas, and terminates poisoned workers after timeout, abort or fatal cleanup failure.",
    },
    boundary: {
      ko: "Worker는 문서 정본이나 UI 상태를 소유하지 않습니다. 계산 결과는 메인 스레드의 명시적 commit 단계에서만 프로젝트 revision이 됩니다.",
      en: "Workers never own canonical documents or UI state. Results become project revisions only through an explicit main-thread commit.",
    },
    technologies: ["Web Workers", "Transferable ArrayBuffer", "AbortSignal", "OffscreenCanvas", "WASM", "SQLite Worker", "requestId fencing"],
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation-worker-client.ts", label: { ko: "GLB 검증 Worker 수명·요청 계약", en: "GLB validation worker lifecycle and request contract" } },
      { kind: "code", path: "apps/web/src/domains/creator/render/studio-gpu-bristle.worker.ts", label: { ko: "GPU 브리슬 브러시 Worker", en: "GPU bristle brush worker" } },
      { kind: "code", path: "apps/web/src/domains/creator/studio-local-database.worker.ts", label: { ko: "로컬 SQLite 전용 Worker", en: "Dedicated local SQLite worker" } },
      { kind: "test", path: "apps/web/src/domains/creator/studio-raster-worker-queue-stability.test.ts", label: { ko: "Worker 큐·유휴 안정성 회귀", en: "Worker queue and idle stability regression" } },
    ],
    reuseSteps: [
      { ko: "CPU 시간뿐 아니라 payload 크기·복사 비용·메모리 수명을 포함한 Worker 후보를 고릅니다.", en: "Choose worker candidates using CPU time, payload size, copy cost and memory lifetime." },
      { ko: "requestId, timeout, abort, progress, typed success/error envelope를 먼저 정의합니다.", en: "Define request ID, timeout, abort, progress and typed success/error envelopes first." },
      { ko: "가능한 바이너리는 transfer하고 원본 mutation·late response·double settle을 테스트합니다.", en: "Transfer eligible binary data and test source mutation, late responses and double settlement." },
      { ko: "WASM cleanup 실패처럼 상태가 불명확한 오류는 인스턴스를 재사용하지 않습니다.", en: "Do not reuse an instance after ambiguous failures such as broken WASM cleanup." },
    ],
    references: [
      ref("mdn-workers", "MDN Web Workers API", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API", "official-doc", "Worker의 메시지·별도 실행 컨텍스트·제한 API를 확인합니다.", "Covers worker messaging, isolated execution contexts and API limitations."),
      ref("mdn-transferable", "MDN Transferable objects", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects", "official-doc", "대형 버퍼 복사를 피하는 소유권 이전 기준입니다.", "Reference for transferring ownership instead of copying large buffers."),
    ],
  },
  {
    id: "pwa-offline-lifecycle",
    category: "workers-pwa",
    status: "live",
    eyebrow: "PWA · SERVICE WORKER · OFFLINE RECOVERY",
    title: {
      ko: "PWA를 설치 배너가 아니라 버전이 있는 오프라인 실행 정책으로 다룹니다.",
      en: "The PWA is a versioned offline execution policy, not merely an install banner.",
    },
    summary: {
      ko: "manifest, 설치 프롬프트, route별 캐시 전략, Studio shell warmup, 업데이트 제어, controllerchange 재로딩과 비상 unregister를 하나의 정책으로 연결합니다.",
      en: "Manifest, install prompt, route-specific caching, Studio shell warmup, update control, controller-change reload and emergency unregister form one policy.",
    },
    problem: {
      ko: "모든 파일을 cache-first로 처리하면 오래된 HTML과 새 chunk가 섞이고, 서비스워커 갱신 직후 무한 reload나 편집 중 강제 전환이 발생할 수 있습니다.",
      en: "A blanket cache-first rule can mix stale HTML with new chunks and cause reload loops or disruptive activation while editing.",
    },
    pattern: {
      ko: "API는 network-only, 문서 탐색은 network-first, 해시 자산은 cache-first, Studio shell과 편집 runtime은 생성된 precache plan과 정상 상태에 따라 구분합니다. 스키마·content hash가 맞지 않으면 정책을 거부하고, 빠른 controllerchange 반복은 unregister와 cache 정리로 복구합니다.",
      en: "APIs use network-only, navigation uses network-first, hashed assets use cache-first, and Studio/editor assets follow a generated precache plan. Schema or content-hash drift fails closed; rapid controller changes recover via unregister and cache cleanup.",
    },
    boundary: {
      ko: "서비스워커 캐시는 프로젝트 원본 저장소가 아닙니다. 작업 데이터는 OPFS·SQLite·복구 저널이 소유하고 캐시는 재생성 가능한 실행 자산만 보관합니다.",
      en: "Service-worker caches are not project storage. OPFS, SQLite and recovery journals own work data; caches hold reproducible runtime assets only.",
    },
    technologies: ["Web App Manifest", "Service Worker", "Cache Storage", "COOP/COEP", "install prompt", "controllerchange guard", "offline shell"],
    evidence: [
      { kind: "code", path: "apps/web/src/app/service-worker/studio-service-worker-policy.ts", label: { ko: "요청 클래스별 fetch·cache 정책", en: "Fetch and cache policy by request class" } },
      { kind: "code", path: "apps/web/src/app/service-worker/studio-service-worker-registration.ts", label: { ko: "업데이트·reload loop 복구", en: "Update and reload-loop recovery" } },
      { kind: "code", path: "apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts", label: { ko: "빌드 결과 기반 precache plan", en: "Build-output-driven precache plan" } },
      { kind: "document", path: "docs/studio-offline-resilience-2026-09-13.md", label: { ko: "오프라인·복구 운영 경계", en: "Offline and recovery operating boundary" } },
    ],
    reuseSteps: [
      { ko: "URL 패턴보다 데이터 성격을 기준으로 요청 클래스를 먼저 정의합니다.", en: "Define request classes by data semantics before writing URL rules." },
      { ko: "HTML·API·해시 자산·대형 선택 자산에 서로 다른 전략과 용량·TTL을 적용합니다.", en: "Apply separate strategies, capacities and TTLs to HTML, APIs, hashed assets and optional large assets." },
      { ko: "서비스워커 정책과 실제 빌드 manifest 사이에 schema·hash 검증을 둡니다.", en: "Verify schema and content hashes between service-worker policy and the actual build manifest." },
      { ko: "업데이트 성공뿐 아니라 stale worker, reload loop, cache corruption과 저장 중 전환을 테스트합니다.", en: "Test stale workers, reload loops, corrupt caches and activation during saves—not just happy-path updates." },
    ],
    references: [
      ref("mdn-service-worker", "MDN Service Worker API", "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API", "official-doc", "서비스워커의 install·activate·fetch 수명주기 기준입니다.", "Reference for service-worker install, activate and fetch lifecycles."),
      ref("web-app-manifest", "W3C Web App Manifest", "https://www.w3.org/TR/appmanifest/", "standard", "설치 가능한 웹 앱 manifest의 표준입니다.", "Standard for installable web app manifests."),
    ],
  },
  {
    id: "free-first-ai",
    category: "ai-cost",
    status: "configured",
    eyebrow: "FREE-FIRST AI · BYOK · FAIL CLOSED",
    title: {
      ko: "무료 AI는 모델 이름 목록이 아니라 과금과 중복 실행을 막는 라우팅 정책입니다.",
      en: "Free-first AI is a routing and billing-safety policy, not a model-name list.",
    },
    summary: {
      ko: "서버 자동 풀, 사용자 BYOK, 명시적 모델 배정, 일일 quota 원장, idempotency receipt와 안전한 failover 규칙을 분리합니다.",
      en: "The design separates a server free pool, user BYOK, explicit model assignment, daily quota ledger, idempotency receipts and safe failover rules.",
    },
    problem: {
      ko: "‘무료 모델’도 한도·정책·이름이 바뀌고, timeout 뒤 다른 공급자로 자동 재전송하면 동일 프롬프트가 두 번 실행되거나 개인 유료 키에 비용이 발생할 수 있습니다.",
      en: "Free models still change limits and identifiers; retrying another provider after a timeout can duplicate inference or charge a personal paid key.",
    },
    pattern: {
      ko: "정확한 free allowlist와 운영자의 CONFIRMED 설정이 있는 공급자만 자동 풀에 참여합니다. HTTP 402·429처럼 추론 전 거절이 기계적으로 확인될 때만 다음 무료 공급자로 이동하며, timeout·5xx·형식 오류는 결과가 불명확하므로 자동 재시도하지 않습니다. BYOK는 현재 탭과 명시적 작업 배정에 한정합니다.",
      en: "Only exact free allowlists with operator confirmation join the automatic pool. Routing advances only after machine-verifiable pre-inference rejection such as 402/429; timeouts, 5xx and malformed success remain ambiguous and are not retried. BYOK is tab-scoped and explicitly assigned.",
    },
    boundary: {
      ko: "무료 한도 때문에 입력·모델·해상도·결과 품질을 몰래 낮추지 않습니다. 이미지·영상·3D처럼 비용과 권리 영향이 큰 작업은 명시적 사용자 키와 확인을 요구합니다.",
      en: "Free limits never silently downgrade input, model, resolution or output quality. Image, video and 3D work require explicit user-funded credentials and review.",
    },
    technologies: ["provider-neutral adapter", "exact model allowlist", "PostgreSQL quota ledger", "idempotency receipt", "BYOK", "session-scoped secret", "safe failover"],
    evidence: [
      { kind: "document", path: "apps/api/src/modules/studio-ai/README.md", label: { ko: "무료 풀·quota·failover 운영 계약", en: "Free-pool, quota and failover operating contract" } },
      { kind: "code", path: "apps/web/src/shared/ai/free-ai-policy.ts", label: { ko: "클라이언트 공급자·모델 정책", en: "Client provider and model policy" } },
      { kind: "code", path: "apps/web/src/shared/ai/free-ai-runtime-budget.ts", label: { ko: "런타임 예산·요청 상한", en: "Runtime budget and request bounds" } },
      { kind: "code", path: "apps/web/src/shared/ai/user-ai-store.ts", label: { ko: "BYOK 탭 범위 저장", en: "Tab-scoped BYOK storage" } },
    ],
    reuseSteps: [
      { ko: "무료·유료·BYOK·로컬 실행을 하나의 fallback 목록으로 섞지 않습니다.", en: "Do not mix free, paid, BYOK and local execution in one fallback list." },
      { ko: "공급자별 무료 모델을 exact allowlist와 검토일로 관리합니다.", en: "Manage provider free models through exact allowlists and review dates." },
      { ko: "요청 전에 quota와 idempotency를 예약하고 결과 뒤 원자적으로 정산합니다.", en: "Reserve quota and idempotency before requests, then settle atomically after outcomes." },
      { ko: "결과가 불명확한 네트워크 실패는 재시도하지 않고 사용자에게 상태와 선택지를 보여줍니다.", en: "Do not retry ambiguous network failures; expose state and choices to the user." },
    ],
    references: [
      ref("cloudflare-ai-pricing", "Cloudflare Workers AI pricing", "https://developers.cloudflare.com/workers-ai/platform/pricing/", "official-doc", "무료·유료 한도는 적용 시점에 공식 정책을 다시 확인합니다.", "Recheck free and paid limits in the official policy at adoption time."),
      ref("gemini-pricing", "Gemini API pricing", "https://ai.google.dev/gemini-api/docs/pricing", "official-doc", "무료 티어 모델·한도 변경을 정적 문서가 아닌 공식 페이지에서 확인합니다.", "Verify changing free-tier models and limits from the official page."),
    ],
  },
  {
    id: "ai-proposal-provenance",
    category: "ai-cost",
    status: "live",
    eyebrow: "ROLE REFERENCES · CANDIDATES · PROVENANCE · APPROVAL",
    title: {
      ko: "AI를 자동 편집기가 아니라 검토 가능한 제안 시스템으로 구성합니다.",
      en: "AI is a reviewable proposal system, not an automatic editor.",
    },
    summary: {
      ko: "텍스트·이미지·영상·2D↔3D 작업을 provider-neutral intent, 역할별 reference, 후보 이력, private provenance와 사용자 승인 revision으로 연결합니다.",
      en: "Text, image, video and 2D↔3D work connect through provider-neutral intents, role-based references, candidate history, private provenance and user-approved revisions.",
    },
    problem: {
      ko: "공급자별 prompt와 reference 옵션을 UI에 직접 노출하거나 AI 결과를 원본에 즉시 덮어쓰면 재실행·비교·취소·권리 확인과 실제 사용 모델 추적이 어려워집니다.",
      en: "Exposing provider-specific prompts and reference controls directly—or overwriting sources immediately—breaks rerun, comparison, cancellation, rights review and actual model tracking.",
    },
    pattern: {
      ko: "character·method·style reference를 별도 역할로 정규화하고, 네트워크 요청 전에 operation ID·provider·prompt digest·reference digest를 pending provenance로 기록합니다. 결과는 후보로 남기며 사용자가 선택한 경우에만 source revision과 함께 원자적으로 commit합니다.",
      en: "Character, method and style references are normalized separately. Before network I/O, operation ID, provider, prompt digest and reference digests enter pending provenance. Results remain candidates and commit atomically with a source revision only after user selection.",
    },
    boundary: {
      ko: "AI는 문서·레이어·게시 권위를 소유하지 않습니다. raw prompt·개인 자격증명·내부 target ID는 공개 provenance에서 제외하며, 실패한 교체 작업은 이전 검토 결과와 provenance를 함께 보존합니다.",
      en: "AI never owns document, layer or publishing authority. Raw prompts, personal credentials and internal target IDs are excluded from public provenance, and failed replacement preserves the previously reviewed result and provenance together.",
    },
    technologies: ["provider-neutral intent", "role-based references", "Zod validation", "OpenAI-compatible transport", "AbortController", "SHA-256 provenance", "candidate workflow", "exact-origin CORS", "personal Creator Runtime"],
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/ai/studio-ai-image-reference-roles.ts", label: { ko: "provider-neutral 이미지 참조 역할", en: "Provider-neutral image reference roles" } },
      { kind: "code", path: "apps/web/src/domains/creator/ai/studio-ai-provenance.ts", label: { ko: "문서 범위 AI provenance와 공개 projection", en: "Document-scoped AI provenance and public projection" } },
      { kind: "code", path: "apps/web/src/domains/creator/ai/studio-scenario-image-generation.ts", label: { ko: "후보 생성·재시도·승인 경계", en: "Candidate generation, retry and approval boundary" } },
      { kind: "code", path: "apps/web/src/shared/ai/user-ai-transport.ts", label: { ko: "사용자 공급자 전송·URL 정책", en: "User-provider transport and URL policy" } },
      { kind: "code", path: "services/creator-inference/browser_app.py", label: { ko: "개인 Creator Runtime 브리지", en: "Personal Creator Runtime bridge" } },
    ],
    reuseSteps: [
      { ko: "공급자 API보다 먼저 제품 작업 intent와 허용 가능한 입력·출력을 정의합니다.", en: "Define product intents and allowed inputs/outputs before provider APIs." },
      { ko: "subject·style·method·mask처럼 reference 역할을 분리하고 canonical 순서를 고정합니다.", en: "Separate reference roles such as subject, style, method and mask and fix canonical ordering." },
      { ko: "첫 await 전에 provider·model request·prompt/reference digest와 source revision을 기록합니다.", en: "Record provider, requested model, prompt/reference digests and source revision before the first await." },
      { ko: "결과는 원본 대체가 아니라 비교·승인·폐기 가능한 후보로 저장합니다.", en: "Store results as comparable, approvable and rejectable candidates rather than source replacements." },
      { ko: "개인 runtime은 HTTPS·exact-origin CORS·bounded upload·result digest와 취소를 요구합니다.", en: "Require HTTPS, exact-origin CORS, bounded upload, result digests and cancellation for personal runtimes." },
    ],
    references: [
      ref("openai-images", "OpenAI Images API guide", "https://platform.openai.com/docs/guides/images", "official-doc", "이미지 generation·edit의 provider capability 차이를 적용 시점에 확인합니다.", "Recheck generation/edit capability differences at adoption time."),
      ref("onnx-web", "ONNX Runtime Web", "https://onnxruntime.ai/docs/tutorials/web/", "official-doc", "브라우저 로컬 추론 후보의 backend·모델·성능 제약을 검토합니다.", "Reference for backend, model and performance constraints of browser-local inference."),
      ref("mediapipe-tasks", "MediaPipe Tasks", "https://ai.google.dev/edge/mediapipe/solutions/guide", "official-doc", "포즈·분할·랜드마크처럼 브라우저에서 가능한 결정론적 보조 기능을 검토합니다.", "Reference for deterministic browser-side helpers such as pose, segmentation and landmarks."),
    ],
  },
  {
    id: "browser-local-ai",
    category: "ai-cost",
    status: "experimental",
    eyebrow: "ONNX WEBGPU · MEDIAPIPE · LOCAL INFERENCE",
    title: {
      ko: "브라우저 로컬 AI도 모델·메모리·동시성·결과 권위를 명시해야 합니다.",
      en: "Browser-local AI still needs explicit model, memory, concurrency and result authority.",
    },
    summary: {
      ko: "ONNX Runtime Web의 WebGPU/WASM 실행과 MediaPipe Vision task를 네트워크 없는 만능 폴백으로 취급하지 않고, model registry·digest·tensor budget·epoch와 초기화 arbiter 뒤에 둡니다.",
      en: "ONNX Runtime Web on WebGPU/WASM and MediaPipe Vision tasks are not treated as universal offline fallbacks; they sit behind model registries, digests, tensor budgets, epochs and an initialization arbiter.",
    },
    problem: {
      ko: "로컬 추론도 수백 MB 모델, GPU/WASM 메모리, webcam 권한, 오래된 결과와 task factory 전역 상태 때문에 UI 중단·privacy 오해·동시 초기화 충돌을 만들 수 있습니다.",
      en: "Local inference can still involve large models, GPU/WASM memory, webcam permission, stale results and global task-factory state, causing UI stalls, privacy misconceptions and initialization races.",
    },
    pattern: {
      ko: "모델 ID·버전·SHA-256·입출력 schema를 registry에 고정하고 byte·tensor 상한을 로드 전에 검사합니다. WebGPU 또는 WASM provider를 작업 단위로 명시해 한 번만 실행하며 자동 backend fallback을 금지합니다. request·stroke·document epoch가 달라진 결과는 폐기하고 MediaPipe task 생성은 process-wide FIFO로 직렬화합니다.",
      en: "Model ID, version, SHA-256 and I/O schemas are pinned in a registry, with byte and tensor budgets checked before load. Each job explicitly selects WebGPU or WASM for one attempt with no automatic backend fallback. Results with stale request, stroke or document epochs are discarded, and MediaPipe task creation is serialized through a process-wide FIFO.",
    },
    boundary: {
      ko: "브라우저에서 실행된다고 무료·오프라인·비공개가 자동 보장되지는 않습니다. 모델 다운로드 출처, webcam 동의, device capability, 메모리와 배터리 비용을 표시하고 결과는 사용자 승인 전 문서에 commit하지 않습니다.",
      en: "Running in the browser does not automatically make inference free, offline or private. Model origin, webcam consent, device capability, memory and battery cost remain visible, and results do not commit before user approval.",
    },
    technologies: ["ONNX Runtime Web", "WebGPU execution provider", "WASM execution provider", "MediaPipe Tasks Vision", "model SHA-256", "tensor byte budget", "epoch fencing", "FIFO task arbiter"],
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/studio-onnx-inference-provider.ts", label: { ko: "ONNX 모델·provider·budget·epoch 계약", en: "ONNX model, provider, budget and epoch contract" } },
      { kind: "test", path: "apps/web/src/domains/creator/studio-onnx-inference-provider-boundary.test.ts", label: { ko: "backend 자동 fallback 금지와 경계 회귀", en: "No-auto-fallback and boundary regressions" } },
      { kind: "code", path: "apps/web/src/domains/creator/studio-mediapipe-vision-init-arbiter.ts", label: { ko: "MediaPipe process-wide 초기화 arbiter", en: "Process-wide MediaPipe initialization arbiter" } },
      { kind: "test", path: "apps/web/src/domains/creator/studio-mediapipe-vision-init-arbiter.test.ts", label: { ko: "FIFO·abort·module retry 회귀", en: "FIFO, abort and module-retry regressions" } },
    ],
    reuseSteps: [
      { ko: "모델 파일을 코드 의존성이 아니라 버전·digest·schema가 있는 배포 자산으로 등록합니다.", en: "Register model files as versioned, digested, schema-bound release assets rather than code dependencies." },
      { ko: "모델·입력·출력 tensor byte와 element 상한을 allocation 전에 검사합니다.", en: "Validate model and input/output tensor byte and element limits before allocation." },
      { ko: "WebGPU·WASM provider 선택을 명시하고 실패한 실행을 다른 backend로 몰래 재전송하지 않습니다.", en: "Select WebGPU or WASM explicitly and never silently replay failed inference on another backend." },
      { ko: "문서·요청 epoch와 AbortSignal로 stale 결과와 해제 뒤 응답을 폐기합니다.", en: "Use document/request epochs and AbortSignal to discard stale and post-disposal results." },
      { ko: "여러 task가 전역 runtime을 공유하는지 확인하고 factory 초기화를 직렬화합니다.", en: "Check whether tasks share ambient runtime state and serialize factory initialization when necessary." },
    ],
    references: [
      ref("onnxruntime-web", "ONNX Runtime Web", "https://onnxruntime.ai/docs/get-started/with-javascript/web.html", "official-doc", "WebGPU·WASM backend와 브라우저 지원 범위를 적용 시점에 확인합니다.", "Recheck WebGPU/WASM backends and browser support at adoption time."),
      ref("mediapipe-vision", "MediaPipe Tasks Vision", "https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js", "official-doc", "브라우저 vision task의 모델·실행 모드·입력 계약을 확인합니다.", "Reference for browser vision-task models, running modes and input contracts."),
      ref("mdn-webgpu", "MDN WebGPU API", "https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API", "official-doc", "device capability와 secure-context 요구사항을 확인합니다.", "Reference for device capability and secure-context requirements."),
    ],
  },
  {
    id: "ai-assisted-engineering",
    category: "ai-cost",
    status: "documented",
    eyebrow: "AI REVIEW · MCP TOOLS · DETERMINISTIC GATES",
    title: {
      ko: "AI는 개발 속도를 높이지만 merge·배포·제품 사실의 권위가 되지 않습니다.",
      en: "AI accelerates engineering without becoming the authority for merge, release or product truth.",
    },
    summary: {
      ko: "코드 탐색·초안·리뷰·문서·테스트 후보·Blender 작업에는 AI와 MCP를 사용하되, typed tool allowlist, 저장소 diff, 결정론적 테스트, 실제 브라우저 artifact와 사람 승인을 완료 조건으로 둡니다.",
      en: "AI and MCP assist code search, drafting, review, documentation, test candidates and Blender work, while typed tool allowlists, repository diffs, deterministic tests, real-browser artifacts and human approval define completion.",
    },
    problem: {
      ko: "AI 리뷰나 에이전트가 성공 메시지를 남겨도 provider 정책·계정 상태·도구 권한 때문에 실제 검사가 실행되지 않았거나, 근거 없는 기능·성공·라이선스 주장을 만들 수 있습니다.",
      en: "An AI reviewer or agent may report success even when provider policy, account state or tool permissions prevented execution, and it can invent unsupported capability, success or licensing claims.",
    },
    pattern: {
      ko: "AI가 제안한 변경은 일반 diff와 동일하게 검토하고, 자동 리뷰 설정과 실제 PR comment·workflow run을 함께 확인합니다. MCP는 결과 중심 allowlist만 공개하고 arbitrary shell·eval을 막습니다. 스크린샷·성능·라이선스·브라우저 결과는 실행 가능한 gate가 생성하며 AI 문장은 그 증거를 링크합니다.",
      en: "AI-proposed changes are reviewed as ordinary diffs, and automated-review configuration is checked together with actual PR comments and workflow runs. MCP exposes outcome-oriented allowlists and blocks arbitrary shell/eval. Executable gates produce screenshots, performance, license and browser evidence that AI-authored text must link to.",
    },
    boundary: {
      ko: "AI 응답만으로 테스트 통과·운영 배포·전문 품질·법률 판단을 선언하지 않습니다. 자격증명, 개인 원고와 운영 데이터는 도구 입력에서 최소화하며 merge·유료 자원·게시 같은 비가역 행동은 사람의 명시적 승인 뒤에 둡니다.",
      en: "AI output alone never declares tests passed, production deployed, professional quality or legal compliance. Credentials, private manuscripts and operations data are minimized, while merge, paid resources and publishing require explicit human approval.",
    },
    technologies: ["Model Context Protocol", "typed tool allowlist", "CodeRabbit", "Codex connector", "GitHub Actions", "Playwright evidence", "license audit", "human approval gate"],
    evidence: [
      { kind: "code", path: ".coderabbit.yaml", label: { ko: "AI 자동 리뷰 경로·초안 정책", en: "AI automated-review path and draft policy" } },
      { kind: "document", path: "docs/coderabbit-auto-review.md", label: { ko: "AI 리뷰가 실제 실행되지 않은 사례와 운영 절차", en: "Observed AI-review non-execution and operating procedure" } },
      { kind: "document", path: "AGENTS.md", label: { ko: "저장소 에이전트 작업·검증 경계", en: "Repository agent work and verification boundaries" } },
      { kind: "code", path: "tools/blender/toonstudio_blender_kit/mcp.py", label: { ko: "임의 코드 실행을 막는 MCP facade", en: "MCP facade blocking arbitrary code execution" } },
      { kind: "workflow", path: ".github/workflows/non-studio-experience-quality.yml", label: { ko: "AI 문장이 아닌 실제 브라우저 품질 gate", en: "Real browser quality gate independent of AI prose" } },
    ],
    reuseSteps: [
      { ko: "AI가 맡을 수 있는 탐색·제안·요약과 사람이 소유할 merge·배포·권리 판단을 구분합니다.", en: "Separate AI-assisted exploration, suggestion and summarization from human-owned merge, release and rights decisions." },
      { ko: "MCP·에이전트 도구는 결과 중심 typed command와 최소 권한만 노출합니다.", en: "Expose only outcome-oriented typed commands and least privilege to MCP and agents." },
      { ko: "AI 리뷰 설정 파일뿐 아니라 실제 comment, check run, workflow와 artifact 생성을 검증합니다.", en: "Verify actual comments, check runs, workflows and artifacts—not only AI-review configuration." },
      { ko: "생성된 코드·문서의 모든 상태·수치·라이선스 주장을 실행 근거나 공식 출처에 연결합니다.", en: "Connect every generated status, metric and licensing claim to executable evidence or an official source." },
      { ko: "비가역 작업은 dry run, diff, explicit approval과 rollback receipt를 요구합니다.", en: "Require dry runs, diffs, explicit approval and rollback receipts for irreversible work." },
    ],
    references: [
      ref("mcp-spec", "Model Context Protocol specification", "https://modelcontextprotocol.io/specification/latest", "standard", "도구·리소스·transport의 권한 경계를 검토합니다.", "Reference for tool, resource and transport permission boundaries."),
      ref("github-actions", "GitHub Actions documentation", "https://docs.github.com/actions", "official-doc", "AI 제안과 분리된 결정론적 검증·artifact 실행 기반입니다.", "Reference for deterministic validation and artifacts independent of AI suggestions."),
      ref("coderabbit-docs", "CodeRabbit documentation", "https://docs.coderabbit.ai/", "official-doc", "자동 리뷰 조건과 설정은 실제 계정·저장소 동작과 함께 확인합니다.", "Review automated-review conditions together with actual account and repository behavior."),
    ],
  },
  {
    id: "free-first-infrastructure",
    category: "ai-cost",
    status: "configured",
    eyebrow: "STATIC FIRST · SCALE TO ZERO · HARD BUDGET",
    title: {
      ko: "무료 인프라는 자동 유료 승격 없는 정적 우선·수동 릴리스 구조로 설계합니다.",
      en: "Free-first infrastructure uses static-first delivery, scale-to-zero and no automatic paid promotion.",
    },
    summary: {
      ko: "정적 요청은 Cloudflare Static Assets, 대형 불변 파일은 R2, 임시 실시간은 Durable Objects, API는 Render scale-to-zero, 영속 원장은 Neon 호환 PostgreSQL로 역할을 분리합니다.",
      en: "Static requests use Cloudflare Static Assets, large immutable files use R2, ephemeral realtime uses Durable Objects, the API scales to zero on Render, and Neon-compatible PostgreSQL owns the ledger.",
    },
    problem: {
      ko: "모든 요청을 API나 Worker로 통과시키면 무료 호출량과 cold start가 동시에 증가하고, 자동 배포·자동 failover는 검토되지 않은 SHA나 유료 자원을 활성화할 수 있습니다.",
      en: "Routing every request through an API or Worker increases both invocation count and cold starts, while automatic deploy or failover can activate unreviewed code or paid resources.",
    },
    pattern: {
      ko: "정적 파일은 Worker 호출 전에 직접 제공하고, edge liveness는 Core API를 깨우지 않습니다. 배포는 검토한 40자 SHA를 수동 승인하며, provider gateway가 일일 요청·비용·동시성·payload 상한과 circuit breaker를 먼저 검사합니다.",
      en: "Static files bypass Worker invocations, and edge liveness does not wake the Core API. Deployment uses a manually approved 40-character SHA, while provider gateways enforce daily request, cost, concurrency, payload and circuit-breaker limits first.",
    },
    boundary: {
      ko: "‘무료 우선’은 무제한 무료·무중단·SLA 보장이 아닙니다. cold start와 quota 실패를 보이는 상태로 유지하고, 유료 승격은 별도 승인과 비용 근거가 있어야 합니다.",
      en: "Free-first does not promise unlimited service, zero downtime or an SLA. Cold starts and quota failure remain visible; paid promotion requires separate approval and evidence.",
    },
    technologies: ["Cloudflare Static Assets", "Cloudflare Worker", "R2", "Durable Objects", "Render scale-to-zero", "Neon PostgreSQL", "manual SHA release", "hard budget gateway"],
    evidence: [
      { kind: "document", path: "docs/operations/minimum-cost-deployment-policy.md", label: { ko: "최소 비용 배포 권위와 수동 릴리스", en: "Minimum-cost deployment authority and manual release" } },
      { kind: "document", path: "docs/operations/quality-preserving-cost-policy.md", label: { ko: "비용 절감 시 품질 불변 정책", en: "Quality-preserving cost policy" } },
      { kind: "code", path: "deploy/cloudflare-static/src/index.ts", label: { ko: "정적·edge 요청 분리", en: "Static and edge request separation" } },
      { kind: "code", path: "apps/api/src/platform/backend-capabilities/backend-capability-gateway-contract.ts", label: { ko: "공급자 예산·idempotency 계약", en: "Provider budget and idempotency contract" } },
    ],
    reuseSteps: [
      { ko: "요청 유형별로 정적·edge·동적 API·실시간·영속 원장을 분리합니다.", en: "Separate static, edge, dynamic API, realtime and durable-ledger workloads." },
      { ko: "무료 한도 전에 애플리케이션 hard cap을 더 낮게 설정하고 fail closed합니다.", en: "Set application hard caps below provider free limits and fail closed." },
      { ko: "자동 Git 배포 대신 검토한 immutable SHA와 release receipt를 사용합니다.", en: "Use reviewed immutable SHAs and release receipts instead of automatic Git deployment." },
      { ko: "cold start·quota·provider outage를 성공처럼 숨기지 않는 readiness와 UI를 둡니다.", en: "Expose cold start, quota and provider outages through readiness and UI rather than masking them as success." },
    ],
    references: [
      ref("cloudflare-static", "Cloudflare Workers Static Assets", "https://developers.cloudflare.com/workers/static-assets/", "official-doc", "정적 파일이 Worker 코드 실행 없이 제공되는 경계를 확인합니다.", "Documents the boundary for serving assets without Worker code execution."),
      ref("cloudflare-r2", "Cloudflare R2", "https://developers.cloudflare.com/r2/", "official-doc", "대형 불변 객체와 Range 제공의 공식 기준입니다.", "Official reference for large immutable objects and range delivery."),
      ref("cloudflare-do", "Cloudflare Durable Objects", "https://developers.cloudflare.com/durable-objects/", "official-doc", "room 단위 임시 실시간 상태의 단일 조정 지점으로 검토합니다.", "Reference for a single coordination point for room-scoped realtime state."),
      ref("render-free", "Render free instances", "https://render.com/docs/free", "official-doc", "무료 인스턴스의 sleep·cold start 제약을 적용 시점에 확인합니다.", "Recheck free-instance sleep and cold-start constraints at adoption time."),
      ref("neon-scale-zero", "Neon scale to zero", "https://neon.com/docs/manage/endpoints/", "official-doc", "유휴 compute 중지와 재개 특성을 확인합니다.", "Reference for idle compute suspension and resume behavior."),
    ],
  },
  {
    id: "blender-mcp-pipeline",
    category: "three-d-dcc",
    status: "configured",
    eyebrow: "BLENDER · MCP · DETERMINISTIC DCC",
    title: {
      ko: "Blender MCP는 임의 Python 실행기가 아니라 allowlist 기반 제작 명령 표면입니다.",
      en: "Blender MCP is an allowlisted production command surface, not an arbitrary Python executor.",
    },
    summary: {
      ko: "브라우저는 장면·캐릭터 문서 권위를 유지하고 Blender는 topology, shape key, hair LOD, MToon/VRM, 품질 렌더와 패키징을 반복 가능한 headless 단계로 담당합니다.",
      en: "The browser retains scene and character document authority while Blender handles topology, shape keys, hair LODs, MToon/VRM, review renders and packaging as reproducible headless stages.",
    },
    problem: {
      ko: "LLM이나 외부 MCP가 Blender의 모든 operator·filesystem·shell에 접근하면 재현성, 보안, undo 경계와 결과 검증을 보장할 수 없습니다.",
      en: "Giving an LLM or external MCP unrestricted Blender operators, filesystem and shell access breaks reproducibility, security, undo boundaries and output verification.",
    },
    pattern: {
      ko: "MCP facade는 export, inspect, hair build, face shape, validate, review render, package처럼 제한된 명령과 typed payload만 받습니다. eval·exec·shell·network·임의 operator를 거부하며 모든 결과는 JSON-safe receipt와 SHA-256 패키지로 돌아옵니다.",
      en: "The MCP facade accepts only typed commands such as export, inspect, hair build, face shape, validate, review render and package. It rejects eval, exec, shell, network and arbitrary operators, returning JSON-safe receipts and SHA-256 packages.",
    },
    boundary: {
      ko: "Blender 결과는 프로젝트 정본이 아니라 검증된 입력 자산입니다. 브라우저 문서에 반영하려면 package preflight와 사용자 승인 revision을 거쳐야 합니다.",
      en: "Blender output is a verified input asset, not project authority. Package preflight and a user-approved revision are required before browser documents adopt it.",
    },
    technologies: ["Blender Python API", "MCP tool allowlist", "headless pipeline", "VRM/GLB", "MToon", "shape keys", "LOD", "SHA-256 receipt"],
    evidence: [
      { kind: "code", path: "tools/blender/toonstudio_blender_kit/mcp.py", label: { ko: "Blender MCP 명령 allowlist", en: "Blender MCP command allowlist" } },
      { kind: "document", path: "docs/studio/blender-character-pipeline.md", label: { ko: "DCC·브라우저 권위와 품질 예산", en: "DCC/browser authority and quality budgets" } },
      { kind: "workflow", path: ".github/workflows/blender-character-pipeline.yml", label: { ko: "실제 Blender 검증 workflow", en: "Real Blender validation workflow" } },
      { kind: "code", path: "apps/web/src/domains/creator/vrm/studio-vrm-blender-character-package.ts", label: { ko: "브라우저 패키지 무결성 preflight", en: "Browser package integrity preflight" } },
    ],
    reuseSteps: [
      { ko: "LLM이 실행할 수 있는 도구를 결과 중심 명령으로 작게 정의합니다.", en: "Define a small set of outcome-oriented tools an LLM may invoke." },
      { ko: "파일 경로·문자열·숫자 범위를 검증하고 shell·network·임의 코드 실행을 차단합니다.", en: "Validate paths, strings and numeric ranges; block shell, network and arbitrary code execution." },
      { ko: "GUI 조작과 같은 핵심 로직을 headless 함수·CLI에서도 재현할 수 있게 만듭니다.", en: "Keep core logic reproducible through headless functions and CLI, not only GUI actions." },
      { ko: "출력 파일, 품질 점수, 도구 버전과 digest를 하나의 receipt로 묶습니다.", en: "Bind outputs, quality scores, tool versions and digests in one receipt." },
    ],
    references: [
      ref("mcp-sdk", "Model Context Protocol TypeScript SDK", "https://ts.sdk.modelcontextprotocol.io/", "official-doc", "도구·리소스·프롬프트와 transport의 표준 경계를 참고합니다.", "Reference for standard tool, resource, prompt and transport boundaries."),
      ref("blender-python", "Blender Python API", "https://docs.blender.org/api/current/index.html", "official-doc", "지원 Blender 버전의 bpy API와 operator context 제약을 확인합니다.", "Check bpy APIs and operator-context constraints for the supported Blender version."),
    ],
  },
  {
    id: "multi-engine-3d",
    category: "three-d-dcc",
    status: "experimental",
    eyebrow: "THREE WEBGPU · BABYLON SPECIALIST · DOCUMENT AUTHORITY",
    title: {
      ko: "3D 엔진을 교체하는 대신 하나의 장면 문서 아래 전문 엔진을 제한적으로 배치합니다.",
      en: "Specialist engines sit under one scene document instead of replacing the product with an engine.",
    },
    summary: {
      ko: "Three WebGPU/TSL과 WebGL2 경로를 주 runtime으로, Babylon을 CAD/BIM·진단용 지연 로드 specialist로 두고, Rapier·BVH·Manifold·OpenCascade·rhino3dm·web-ifc를 역할별 kernel로 분리합니다.",
      en: "Three WebGPU/TSL with WebGL2 compatibility is the primary runtime, Babylon is a lazy CAD/BIM and diagnostic specialist, and Rapier, BVH, Manifold, OpenCascade, rhino3dm and web-ifc are role-specific kernels.",
    },
    problem: {
      ko: "여러 엔진이 scene, camera, material, undo와 파일 저장을 각각 소유하면 같은 프로젝트가 엔진마다 다른 상태가 되고 복구·내보내기 결과도 달라집니다.",
      en: "If multiple engines own scenes, cameras, materials, undo and persistence, one project diverges into engine-specific states and inconsistent exports.",
    },
    pattern: {
      ko: "StudioScene3dDocument가 배치·카메라·조명·출력의 유일한 정본이고 각 엔진은 projection·render·import 결과만 제공합니다. specialist는 사용자가 명시적으로 실행할 때만 동적 import되고, 결과는 renderer-neutral beauty/depth/normal/stable-ID 계약으로 돌아옵니다.",
      en: "StudioScene3dDocument is the sole authority for placement, camera, lighting and output. Engines provide projections, renders or imports; specialists load only after explicit actions and return renderer-neutral beauty, depth, normal and stable-ID artifacts.",
    },
    boundary: {
      ko: "WebGPU XPBD, OpenSubdiv, libigl, Gaussian Splat 등은 문서화·실험 단계이며 품질·메모리·브라우저 soak gate를 통과하기 전 운영 기능으로 표시하지 않습니다.",
      en: "WebGPU XPBD, OpenSubdiv, libigl and Gaussian Splat remain documented or experimental until quality, memory and browser soak gates pass.",
    },
    technologies: ["Three.js WebGPU", "TSL", "WebGL2", "Babylon.js", "Rapier", "three-mesh-bvh", "Manifold", "OpenCascade", "glTF", "KTX2", "meshopt"],
    evidence: [
      { kind: "document", path: "docs/studio/studio-3d-next-platform-architecture-2026-09-10.md", label: { ko: "차세대 3D 엔진·제품 권위 설계", en: "Next-generation 3D engine and product-authority design" } },
      { kind: "code", path: "apps/web/src/domains/creator/scene3d/studio-scene3d-document.ts", label: { ko: "엔진 중립 Scene3D 문서", en: "Engine-neutral Scene3D document" } },
      { kind: "code", path: "apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-specialist-runtime.ts", label: { ko: "Babylon 지연 로드 specialist runtime", en: "Lazy Babylon specialist runtime" } },
      { kind: "code", path: "packages/studio-engine-registry/src/registry.ts", label: { ko: "엔진 capability registry", en: "Engine capability registry" } },
    ],
    reuseSteps: [
      { ko: "엔진을 고르기 전에 제품이 소유할 scene/document schema를 정의합니다.", en: "Define the product-owned scene/document schema before choosing engines." },
      { ko: "primary renderer와 specialist kernel의 책임·load 시점·dispose 조건을 분리합니다.", en: "Separate responsibilities, load timing and disposal rules for the primary renderer and specialist kernels." },
      { ko: "출력은 live canvas screenshot이 아니라 명시적 render target과 동일 frame state에서 생성합니다.", en: "Generate output from explicit render targets and the same frame state, not live-canvas screenshots." },
      { ko: "device loss, context loss, import 증폭, template switch와 장시간 GPU memory soak를 gate로 둡니다.", en: "Gate device loss, context loss, import amplification, template switching and long GPU-memory soaks." },
    ],
    references: [
      ref("three-webgpu", "Three.js WebGPURenderer", "https://threejs.org/docs/pages/WebGPURenderer.html", "official-doc", "WebGPU 우선·WebGL2 backend 경계를 검토합니다.", "Reference for WebGPU-first rendering with a WebGL2 backend."),
      ref("three-tsl", "Three Shading Language", "https://threejs.org/docs/pages/TSL.html", "official-doc", "WGSL·GLSL 대상 하나의 shader authoring 계층을 검토합니다.", "Reference for one shader authoring layer targeting WGSL and GLSL."),
      ref("babylon-spec", "Babylon.js specifications", "https://www.babylonjs.com/specifications/", "official-doc", "specialist 엔진으로 사용할 capability 범위를 비교합니다.", "Compare capability scope when using Babylon as a specialist."),
      ref("khronos-gltf", "Khronos glTF", "https://www.khronos.org/gltf/", "standard", "엔진 간 전달 가능한 3D 자산 표준입니다.", "Portable 3D asset standard across engine boundaries."),
    ],
  },
  {
    id: "open-api-provenance",
    category: "open-data",
    status: "live",
    eyebrow: "OPEN API · SCHEMA GATE · RIGHTS PROVENANCE",
    title: {
      ko: "Open API 응답은 화면 데이터가 아니라 검증되지 않은 외부 입력으로 취급합니다.",
      en: "Open API responses are untrusted external input, not ready-to-render data.",
    },
    summary: {
      ko: "미술·3D·웹툰·지원사업 API를 provider adapter 뒤에 두고 hostname, response shape, 공개 이용 표시, 이미지 host, rate limit, cache와 출처를 검증합니다.",
      en: "Art, 3D, webtoon and funding APIs sit behind provider adapters that validate hosts, response shapes, rights markers, image hosts, rate limits, caches and provenance.",
    },
    problem: {
      ko: "공급자가 CC0 flag나 이미지 URL을 잘못 주거나 응답 schema를 바꾸면 제한 자료 노출, SSRF·추적 이미지, 빈 결과 위장과 출처 소실이 발생할 수 있습니다.",
      en: "A forged CC0 flag, unsafe image URL or schema change can expose restricted assets, enable tracking/SSRF, mask outages as empty results or lose provenance.",
    },
    pattern: {
      ko: "adapter는 exact host·path와 응답 schema를 확인하고, 제공처별 공개 도메인/CC0 조건을 모두 충족한 항목만 정규화합니다. 메타데이터 참고와 재사용 가능한 asset을 분리하고, 실패 시 임의 샘플을 만들지 않으며 사용자의 로컬 노트는 계속 사용할 수 있게 합니다.",
      en: "Adapters verify exact hosts, paths and response schemas, normalizing only items that satisfy provider-specific public-domain/CC0 rules. Metadata references remain distinct from reusable assets, outages never fabricate samples, and local notes remain usable.",
    },
    boundary: {
      ko: "robots 허용, API 제공, CC0 표시는 모든 초상·상표·문화재·계약 권리를 자동 해결하지 않습니다. 출처 원문과 제3자 권리를 제작 시점에 다시 확인합니다.",
      en: "Robots permission, API access or a CC0 marker does not automatically resolve portrait, trademark, cultural-property or contractual rights. Source terms and third-party rights are rechecked at use time.",
    },
    technologies: ["provider adapter", "Zod/schema validation", "host allowlist", "CC0/public-domain gate", "provenance receipt", "bounded cache", "AbortSignal", "visible provider errors"],
    evidence: [
      { kind: "code", path: "apps/api/src/modules/creator-resources/resource-engine.ts", label: { ko: "공급자 중립 Open API 엔진", en: "Provider-neutral Open API engine" } },
      { kind: "code", path: "apps/api/src/modules/creator-resources/open-art-providers.ts", label: { ko: "AIC·Cleveland 권리·host gate", en: "AIC and Cleveland rights/host gates" } },
      { kind: "code", path: "apps/api/src/modules/creator-resources/polyhaven-provider.ts", label: { ko: "Poly Haven schema·CC0 adapter", en: "Poly Haven schema and CC0 adapter" } },
      { kind: "code", path: "apps/api/src/server/kmas-reference.ts", label: { ko: "KMAS timeout·rate·cache adapter", en: "KMAS timeout, rate and cache adapter" } },
    ],
    reuseSteps: [
      { ko: "공급자마다 exact URL, request budget, response schema와 rights predicate를 정의합니다.", en: "Define exact URLs, request budgets, response schemas and rights predicates per provider." },
      { ko: "원본 응답을 UI에 바로 전달하지 말고 내부 provider-neutral model로 정규화합니다.", en: "Normalize into an internal provider-neutral model instead of passing upstream responses to the UI." },
      { ko: "출처 URL·creator·credit·license·fetchedAt을 항목과 함께 보존합니다.", en: "Preserve source URL, creator, credit, license and fetched timestamp with every item." },
      { ko: "timeout·429·schema drift·부분 실패를 빈 성공으로 바꾸지 않고 명시적 상태로 전달합니다.", en: "Expose timeout, 429, schema drift and partial failure explicitly instead of returning empty success." },
    ],
    references: [
      ref("aic-api", "Art Institute of Chicago API", "https://api.artic.edu/docs/", "open-api", "공개 작품 검색·필드·pagination 원문입니다.", "Official source for artwork search, fields and pagination."),
      ref("met-api", "The Metropolitan Museum of Art Collection API", "https://metmuseum.github.io/", "open-api", "공개 도메인 객체·상세 조회 계약을 확인합니다.", "Official contract for public-domain object search and details."),
      ref("cleveland-api", "Cleveland Museum of Art Open Access API", "https://openaccess-api.clevelandart.org/", "open-api", "CC0와 open access 응답 구조를 확인합니다.", "Official source for CC0/open-access response structure."),
      ref("polyhaven-api", "Poly Haven API", "https://api.polyhaven.com/", "open-api", "CC0 HDRI·texture·model 메타데이터 원문입니다.", "Official source for CC0 HDRI, texture and model metadata."),
    ],
  },
  {
    id: "recovery-integrity",
    category: "reliability",
    status: "live",
    eyebrow: "JOURNAL · HASH · LAST KNOWN GOOD",
    title: {
      ko: "복구는 예외 처리 UI가 아니라 저장·연산·동기화의 별도 제품 경로입니다.",
      en: "Recovery is a separate product path across storage, compute and sync—not an error dialog.",
    },
    summary: {
      ko: "OPFS journal, SQLite metadata, append-only revision, worker termination, device-loss fencing, hash 검증과 last-known-good 화면을 함께 사용합니다.",
      en: "OPFS journals, SQLite metadata, append-only revisions, worker termination, device-loss fencing, hash verification and last-known-good surfaces work together.",
    },
    problem: {
      ko: "브라우저 종료, quota, Worker terminate, GPU loss, 외부 파일 변경이 동시에 일어나면 ‘다시 시도’만으로 어느 데이터가 정본인지 판단할 수 없습니다.",
      en: "Browser termination, quota limits, worker termination, GPU loss and external file changes can overlap, making a simple retry insufficient to identify canonical data.",
    },
    pattern: {
      ko: "작업 의도와 commit을 journal로 분리하고, revision·digest·expected version으로 compare-and-swap합니다. 실패한 연산은 기존 화면·원본 blob을 보존하며, 복구 UI는 발견된 checkpoint와 손실 가능성을 명시합니다.",
      en: "Intent and commit are journaled separately, while revisions, digests and expected versions enforce compare-and-swap. Failed operations retain the prior surface and original blobs; recovery UI exposes checkpoints and possible loss.",
    },
    boundary: {
      ko: "자동 복구는 의미가 확실한 byte·revision에만 적용합니다. 충돌한 양쪽 수정, 호환 변환 손실과 AI 결과는 자동 승자를 고르지 않습니다.",
      en: "Automatic recovery applies only to semantically certain bytes and revisions. Concurrent edits, compatibility loss and AI output never receive an automatic winner.",
    },
    technologies: ["OPFS", "SQLite WASM", "append-only revision", "SHA-256", "compare-and-swap", "recovery journal", "last-known-good", "device-loss fencing"],
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/studio-opfs-recovery-journal.ts", label: { ko: "OPFS 복구 journal", en: "OPFS recovery journal" } },
      { kind: "code", path: "apps/web/src/domains/creator/studio-device-loss-recovery.ts", label: { ko: "GPU device loss 복구 상태", en: "GPU device-loss recovery state" } },
      { kind: "code", path: "apps/web/src/domains/creator/live/studio-crdt-recovery-vault.ts", label: { ko: "CRDT 복구 vault", en: "CRDT recovery vault" } },
      { kind: "document", path: "docs/adr/0013-v12-external-recovery-package-cas.md", label: { ko: "외부 복구 패키지 CAS 결정", en: "External recovery package CAS decision" } },
    ],
    reuseSteps: [
      { ko: "정상 저장과 복구 저장을 같은 함수가 아니라 같은 revision 계약으로 연결합니다.", en: "Connect normal save and recovery through one revision contract, not one monolithic function." },
      { ko: "intent, prepared bytes, committed pointer와 cleanup을 각각 기록합니다.", en: "Record intent, prepared bytes, committed pointer and cleanup separately." },
      { ko: "외부 I/O 전후에 version·digest를 다시 비교하고 stale overwrite를 차단합니다.", en: "Recheck version and digest before and after external I/O to prevent stale overwrite." },
      { ko: "복구 테스트에는 강제 종료·quota·손상·부분 commit·동시 수정이 포함돼야 합니다.", en: "Recovery tests must include termination, quota, corruption, partial commit and concurrent edits." },
    ],
    references: [
      ref("opfs", "MDN Origin private file system", "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system", "official-doc", "브라우저 전용 파일 저장소의 수명과 접근 경계를 확인합니다.", "Reference for lifecycle and access boundaries of browser-private file storage."),
      ref("webgpu-lost", "GPUDevice.lost", "https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost", "official-doc", "WebGPU device loss를 terminal 상태로 다루는 기준입니다.", "Reference for treating WebGPU device loss as a terminal runtime state."),
    ],
  },
  {
    id: "performance-quality-cost",
    category: "reliability",
    status: "live",
    eyebrow: "MEASURED BUDGET · LAZY ACTIVATION · NO SILENT DOWNGRADE",
    title: {
      ko: "성능과 비용 최적화는 품질을 낮추는 대신 작업량과 활성화 시점을 줄입니다.",
      en: "Performance and cost optimization reduce work and activation—not output quality.",
    },
    summary: {
      ko: "dirty region, retained state, lazy engine import, Worker, transferable buffer, bundle activation closure와 장시간 soak를 측정 가능한 예산으로 관리합니다.",
      en: "Dirty regions, retained state, lazy engine imports, workers, transferables, bundle activation closures and long soaks are managed as measurable budgets.",
    },
    problem: {
      ko: "대형 창작 앱은 초기 bundle·GPU 메모리·첫 획 latency·Worker startup·readback가 서로 영향을 주므로 단일 Lighthouse 점수나 평균 시간으로 회귀를 찾기 어렵습니다.",
      en: "Initial bundle, GPU memory, first-stroke latency, worker startup and readback interact, so one Lighthouse score or average timing cannot reveal regressions.",
    },
    pattern: {
      ko: "기능별 activation closure, 첫 사용 cold path, steady-state hot path, 긴 획, template churn과 30분 이상 session을 별도 gate로 둡니다. preview는 축소할 수 있지만 최종 정본의 모델·해상도·색·출력은 비용 때문에 바꾸지 않습니다.",
      en: "Feature activation closures, first-use cold paths, steady-state hot paths, long strokes, template churn and 30+ minute sessions have separate gates. Previews may shrink, but cost never changes canonical models, resolution, color or output.",
    },
    boundary: {
      ko: "벤치마크는 특정 장비의 절대 성능을 보장하지 않습니다. 측정 환경·기준선·회귀 허용폭·실행 명령을 함께 공개해야 합니다.",
      en: "Benchmarks do not guarantee absolute performance on every device; environment, baseline, regression tolerance and commands must travel with the number.",
    },
    technologies: ["bundle activation ratchet", "dirty-region rendering", "retained GPU resources", "cold/hot path budgets", "long-stroke benchmark", "long-session soak", "quality-preserving cost policy"],
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/studio-performance-budget.ts", label: { ko: "Studio 성능 예산 모델", en: "Studio performance budget model" } },
      { kind: "test", path: "scripts/__tests__/check-studio-bundle-ratchet.test.mjs", label: { ko: "번들 activation 회귀 gate", en: "Bundle activation regression gate" } },
      { kind: "workflow", path: "scripts/verify-studio-long-session.mts", label: { ko: "장시간 session·GPU 진단", en: "Long-session and GPU diagnostics" } },
      { kind: "document", path: "docs/operations/quality-preserving-cost-policy.md", label: { ko: "품질을 보존하는 비용 정책", en: "Quality-preserving cost policy" } },
    ],
    reuseSteps: [
      { ko: "초기 로드, 첫 사용, 반복 사용, 저장·내보내기를 별도 latency budget으로 둡니다.", en: "Assign separate latency budgets to initial load, first use, steady state, save and export." },
      { ko: "평균만 보지 말고 p95·최악·메모리 증분·activation chunk를 함께 측정합니다.", en: "Measure p95, worst case, memory delta and activation chunks—not averages alone." },
      { ko: "비용 최적화는 cache·dedupe·lazy·Worker·lossless encoding 순서로 적용합니다.", en: "Optimize cost through cache, dedupe, lazy activation, workers and lossless encoding first." },
      { ko: "기준선을 완화하지 말고 책임 분리·지연 로드·데이터 구조 개선으로 회귀를 해소합니다.", en: "Fix regressions through responsibility separation, lazy loading and data-structure changes rather than relaxing baselines." },
    ],
    references: [
      ref("web-vitals", "web.dev Web Vitals", "https://web.dev/articles/vitals", "official-doc", "공개 페이지의 사용자 중심 기본 지표로 사용하되 전문 편집기 지표를 대체하지 않습니다.", "Use as public-page user-centric metrics without replacing editor-specific budgets."),
      ref("performance-api", "MDN Performance API", "https://developer.mozilla.org/en-US/docs/Web/API/Performance_API", "official-doc", "브라우저 내부 구간 측정과 mark·measure 기준입니다.", "Reference for in-browser marks and measures."),
    ],
  },
] as const satisfies readonly EngineeringFieldNote[];

export const ENGINEERING_OPEN_APIS = [
  {
    id: "aic",
    provider: "Art Institute of Chicago",
    status: "live",
    purpose: { ko: "공개 미술 작품을 캐릭터·의상·소품 참고 자료로 검색", en: "Search public artworks for character, costume and prop reference" },
    access: { ko: "키 없는 공식 검색 API, provider rate와 pagination을 준수", en: "Official keyless search API with bounded pagination and provider limits" },
    rightsGate: { ko: "is_public_domain=true, copyright notice 없음, image_id·host 검증", en: "Requires is_public_domain=true, no copyright notice, and validated image IDs/hosts" },
    resilience: { ko: "schema drift·429·unsafe image는 항목 단위로 제외하고 로컬 연구 노트는 유지", en: "Schema drift, 429 and unsafe images fail per item while local research notes remain available" },
    evidence: [{ kind: "code", path: "apps/api/src/modules/creator-resources/open-art-providers.ts", label: { ko: "AIC adapter", en: "AIC adapter" } }],
    officialUrl: "https://api.artic.edu/docs/",
  },
  {
    id: "cleveland",
    provider: "Cleveland Museum of Art",
    status: "live",
    purpose: { ko: "CC0 작품과 제작 출처 메타데이터 검색", en: "Search CC0 artworks and production provenance metadata" },
    access: { ko: "Open Access API, has_image와 bounded page 조건", en: "Open Access API with has_image and bounded page rules" },
    rightsGate: { ko: "share_license_status=CC0이며 copyright 필드가 비어 있어야 함", en: "Requires share_license_status=CC0 and an empty copyright field" },
    resilience: { ko: "공급자별 image host와 응답 shape가 다르면 fail closed", en: "Fails closed on unexpected provider image hosts or response shapes" },
    evidence: [{ kind: "test", path: "apps/api/src/modules/creator-resources/open-art-providers.test.ts", label: { ko: "Cleveland 권리·schema 회귀", en: "Cleveland rights and schema regression" } }],
    officialUrl: "https://openaccess-api.clevelandart.org/",
  },
  {
    id: "met",
    provider: "The Metropolitan Museum of Art",
    status: "live",
    purpose: { ko: "공개 도메인 작품 ID 검색 후 상세 메타데이터 조회", en: "Search public-domain object IDs and resolve detailed metadata" },
    access: { ko: "검색과 객체 상세 API를 분리하고 조회 개수·동시성을 제한", en: "Separates search and object detail APIs with bounded count and concurrency" },
    rightsGate: { ko: "상세 objectID 일치, isPublicDomain=true, rightsAndReproduction 없음", en: "Requires matching objectID, isPublicDomain=true and no rightsAndReproduction restriction" },
    resilience: { ko: "검색 결과 flag만 신뢰하지 않고 상세 응답을 다시 검증", en: "Revalidates detail responses instead of trusting search flags alone" },
    evidence: [{ kind: "code", path: "apps/api/src/modules/creator-resources/resource-engine.ts", label: { ko: "Met 2단계 adapter", en: "Two-stage Met adapter" } }],
    officialUrl: "https://metmuseum.github.io/",
  },
  {
    id: "polyhaven",
    provider: "Poly Haven",
    status: "live",
    purpose: { ko: "CC0 HDRI·texture·3D model 메타데이터 탐색", en: "Discover CC0 HDRI, texture and 3D model metadata" },
    access: { ko: "키 없는 assets API를 type별 조회하고 캐시", en: "Queries and caches the keyless assets API by type" },
    rightsGate: { ko: "API hostname/path·thumbnail CDN allowlist·CC0 출처 URL 보존", en: "Validates API host/path, thumbnail CDN allowlist and preserves CC0 source URLs" },
    resilience: { ko: "유형 일부가 실패해도 성공 유형과 부분 실패를 구분", en: "Distinguishes successful asset types from partial provider failure" },
    evidence: [{ kind: "code", path: "apps/api/src/modules/creator-resources/polyhaven-provider.ts", label: { ko: "Poly Haven adapter", en: "Poly Haven adapter" } }],
    officialUrl: "https://api.polyhaven.com/",
  },
  {
    id: "kmas",
    provider: "KMAS · 한국만화영상진흥원",
    status: "configured",
    purpose: { ko: "웹툰·만화 제목, 작가, 장르, 플랫폼, ISBN과 작품 설명 조회", en: "Retrieve webtoon/comic titles, creators, genres, platforms, ISBNs and descriptions" },
    access: { ko: "승인된 서버 키 필요, HTTPS host allowlist와 bounded concurrency 적용", en: "Requires an approved server key with HTTPS host allowlist and bounded concurrency" },
    rightsGate: { ko: "공식 메타데이터 출처를 표시하고 원문·표지 재사용 권리와 분리", en: "Attributes official metadata while separating it from cover and full-text reuse rights" },
    resilience: { ko: "NOT_CONFIGURED·RATE_LIMITED·TIMEOUT·UNAVAILABLE을 분리하고 가짜 결과 금지", en: "Separates NOT_CONFIGURED, RATE_LIMITED, TIMEOUT and UNAVAILABLE with no fabricated results" },
    evidence: [{ kind: "code", path: "apps/api/src/server/kmas-reference.ts", label: { ko: "KMAS 검색 adapter", en: "KMAS search adapter" } }],
    officialUrl: "https://www.kmas.or.kr/guide/openapi",
  },
  {
    id: "bizinfo",
    provider: "기업마당 Bizinfo",
    status: "configured",
    purpose: { ko: "웹툰·콘텐츠 창작자 관련 지원사업과 마감 참고", en: "Find funding programs and deadlines relevant to webtoon/content creators" },
    access: { ko: "서버 API key 필요, 최근 bounded 결과만 정규화", en: "Requires a server API key and normalizes a bounded set of recent results" },
    rightsGate: { ko: "공고 메타데이터와 원문 링크만 제공하며 신청 자격은 원문 확인", en: "Provides notice metadata and source links; eligibility must be checked in the original notice" },
    resilience: { ko: "상대 URL 정규화, malformed item 제외, 일정 파일도 원문 기반으로 생성", en: "Normalizes relative URLs, drops malformed items and generates calendar files from source metadata" },
    evidence: [{ kind: "code", path: "apps/api/src/modules/creator-resources/resource-engine.ts", label: { ko: "Bizinfo provider adapter", en: "Bizinfo provider adapter" } }],
    officialUrl: "https://www.bizinfo.go.kr/",
  },
  {
    id: "wikimedia",
    provider: "Wikimedia Commons · Wikipedia",
    status: "live",
    purpose: { ko: "역사·문화 키워드와 원문 링크를 연구 참고로 제공", en: "Provide historical/cultural keywords and source links for research" },
    access: { ko: "공개 MediaWiki API, 검색 metadata 중심", en: "Public MediaWiki API used primarily for search metadata" },
    rightsGate: { ko: "본문·이미지를 자동 재배포하지 않고 항목별 원문 라이선스 확인", en: "Does not automatically republish article text or images; item licenses require source review" },
    resilience: { ko: "검색 snippet을 창작 원문이나 사실 판정으로 취급하지 않음", en: "Never treats search snippets as reusable source text or definitive fact judgment" },
    evidence: [{ kind: "test", path: "e2e/open-creation.spec.ts", label: { ko: "Wikipedia 본문·이미지 미복제 회귀", en: "Regression preventing Wikipedia text/image replication" } }],
    officialUrl: "https://www.mediawiki.org/wiki/API:Main_page",
  },
  {
    id: "unsplash",
    provider: "Unsplash",
    status: "configured",
    purpose: { ko: "사용자 키가 있을 때 사진 reference 탐색", en: "Search photographic references when a user key is configured" },
    access: { ko: "BYOK와 공식 endpoint만 허용", en: "Allows BYOK and official endpoints only" },
    rightsGate: { ko: "API terms·attribution·download tracking 조건을 코드 라이선스와 별도 관리", en: "Tracks API terms, attribution and download-tracking obligations separately from code licensing" },
    resilience: { ko: "키가 없으면 기능을 비활성으로 표시하고 다른 유료 키로 자동 fallback하지 않음", en: "Shows the feature as unavailable without a key and never falls back to another paid credential" },
    evidence: [{ kind: "code", path: "apps/web/src/shared/ai/free-ai-policy.ts", label: { ko: "외부 endpoint·BYOK 보안 정책의 공통 경계", en: "Shared external-endpoint and BYOK security boundary" } }],
    officialUrl: "https://unsplash.com/developers",
  },
] as const satisfies readonly EngineeringOpenApiNote[];

export const ENGINEERING_TROUBLESHOOTING_CASES = [
  {
    id: "oauth-duplicate-callback",
    status: "live",
    title: { ko: "로그인 성공 뒤 같은 OAuth callback이 다시 들어와 bad_state로 끝남", en: "A repeated OAuth callback produced bad_state after a successful login" },
    symptom: { ko: "첫 callback은 세션을 발급했지만 같은 code/state가 다시 전달되면 소비된 state로 판단하고 오류 화면으로 이동했습니다.", en: "The first callback created a session, but a replay of the same code/state was rejected because the state had already been consumed." },
    rootCause: { ko: "중복 callback과 진짜 provider 거절을 같은 실패로 처리했고, 오래된 callback이 다른 탭의 새 state cookie까지 먼저 지울 수 있었습니다.", en: "Duplicate callbacks and real provider rejection shared one failure path, and a stale callback could delete a newer login state from another tab." },
    fix: { ko: "현재 브라우저 state가 정확히 일치할 때만 cookie를 소비하고, 이미 유효한 세션이 있으면 비밀값 없이 duplicate_callback_recovered 이벤트를 남기며 성공으로 복구합니다.", en: "State cookies are consumed only after an exact match; an existing valid session recovers the replay and logs a secret-free duplicate_callback_recovered event." },
    prevention: { ko: "stale callback이 새 state를 삭제하지 않는지, provider 거절을 중복 성공으로 오인하지 않는지 회귀 테스트합니다.", en: "Regression tests ensure stale callbacks do not delete fresh state and provider rejection is never misclassified as recovered success." },
    evidence: [
      { kind: "code", path: "apps/api/src/modules/auth/auth.controller.ts", label: { ko: "callback 검증·복구 구현", en: "Callback validation and recovery" } },
      { kind: "test", path: "apps/api/src/modules/auth/auth.controller.oauth-google.test.ts", label: { ko: "Google·Naver 중복·거절 회귀", en: "Google/Naver duplicate and rejection regressions" } },
    ],
  },
  {
    id: "service-worker-reload-loop",
    status: "live",
    title: { ko: "서비스워커 갱신 후 controllerchange가 반복되어 reload loop 발생 가능", en: "Repeated controllerchange after service-worker updates could cause a reload loop" },
    symptom: { ko: "새 worker가 활성화될 때 페이지가 연속으로 다시 로드되거나 stale cache에서 같은 실패가 반복될 수 있었습니다.", en: "A newly activated worker could repeatedly reload the page or repeat the same failure from stale caches." },
    rootCause: { ko: "controllerchange를 성공 신호로만 보고 reload 횟수·시간·동일 버전 여부를 제한하지 않으면 worker lifecycle과 페이지 lifecycle이 서로 재귀합니다.", en: "Treating controllerchange as unconditional success lets worker and page lifecycles recurse without a time/version guard." },
    fix: { ko: "세션·로컬 저장소에 one-shot reload guard와 짧은 시간창을 기록하고, 반복되면 registration unregister와 관련 cache 제거로 안전 모드 복구합니다.", en: "A one-shot session/local guard bounds reloads; repeated changes trigger unregister and cache cleanup for safe recovery." },
    prevention: { ko: "schema/content hash drift, waiting worker, 빠른 controllerchange, cache corruption과 저장 중 업데이트를 테스트합니다.", en: "Tests cover schema/content-hash drift, waiting workers, rapid controller changes, cache corruption and updates during saves." },
    evidence: [
      { kind: "code", path: "apps/web/src/app/service-worker/studio-service-worker-registration.ts", label: { ko: "reload guard·비상 cleanup", en: "Reload guard and emergency cleanup" } },
      { kind: "test", path: "scripts/studio-offline-resilience.test.mjs", label: { ko: "오프라인·업데이트 회귀", en: "Offline and update regression" } },
    ],
  },
  {
    id: "webgpu-device-loss",
    status: "live",
    title: { ko: "WebGPU device loss 뒤 부분 초기화된 runtime을 계속 사용", en: "A partially initialized runtime remained usable after WebGPU device loss" },
    symptom: { ko: "GPU reset 이후 진행 중 readback·필터·3D capture가 멈추거나 다음 작업이 같은 손실 device를 재사용할 수 있었습니다.", en: "After a GPU reset, readback, filters or 3D capture could hang and later work could reuse the lost device." },
    rootCause: { ko: "device.lost를 일반 작업 오류로만 처리해 shared singleton과 in-flight operation의 소유권이 끊기지 않았습니다.", en: "Device loss was treated as an ordinary job error, leaving shared singletons and in-flight ownership alive." },
    fix: { ko: "runtime을 terminal lost로 표시하고 specialist abort를 전파하며 singleton을 비웁니다. 마지막 정상 frame은 유지하고 새 작업은 명시적 재초기화 전 거부합니다.", en: "The runtime enters a terminal lost state, aborts specialist work, clears singletons, preserves the last known good frame and rejects new work until explicit reinitialization." },
    prevention: { ko: "초기화 중·render 중·readback 중 device loss, partial dispose와 재생성 시나리오를 각각 테스트합니다.", en: "Tests inject loss during initialization, rendering and readback, including partial disposal and recreation." },
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-specialist-runtime.ts", label: { ko: "Babylon WebGPU loss fencing", en: "Babylon WebGPU loss fencing" } },
      { kind: "code", path: "apps/web/src/domains/creator/studio-device-loss-recovery.ts", label: { ko: "공통 device loss 복구 모델", en: "Shared device-loss recovery model" } },
      { kind: "test", path: "apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-specialist-runtime.test.ts", label: { ko: "loss·abort·dispose 회귀", en: "Loss, abort and disposal regression" } },
    ],
  },
  {
    id: "babylon-readback-race",
    status: "live",
    title: { ko: "Babylon WebGPU beauty와 depth 동시 readback에서 queue 충돌", en: "Concurrent Babylon WebGPU beauty and depth readbacks raced on one queue" },
    symptom: { ko: "beauty는 성공하지만 depth가 실패하거나 channel·row orientation이 backend마다 달라 합성 결과가 뒤집히는 문제가 발생할 수 있었습니다.", en: "Beauty could succeed while depth failed, and backend-specific channel or row orientation could flip composites." },
    rootCause: { ko: "swap-chain과 RTT readback가 같은 GPU queue를 공유하는데 병렬로 시작했고, BGRA/RGBA와 bottom-left/top-left 계약이 암묵적이었습니다.", en: "Swap-chain and RTT readbacks shared one GPU queue but started concurrently, while BGRA/RGBA and row-origin contracts were implicit." },
    fix: { ko: "beauty·depth readback을 하나의 lease로 직렬화하고 stage별 typed error, BGRA channel swap, canonical row orientation과 drain·dispose 순서를 고정했습니다.", en: "Beauty and depth readbacks are serialized under one lease with typed stage errors, BGRA conversion, canonical row orientation and deterministic drain/disposal." },
    prevention: { ko: "WebGPU/WebGL, beauty-only, depth failure, abort, device loss와 orientation fixture를 분리해 검증합니다.", en: "Separate fixtures cover WebGPU/WebGL, beauty-only, depth failure, abort, device loss and orientation." },
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-artifact-capture.ts", label: { ko: "직렬 readback·정규화", en: "Serialized readback and normalization" } },
      { kind: "test", path: "apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-artifact-readback.test.ts", label: { ko: "queue·stage·depth 회귀", en: "Queue, stage and depth regressions" } },
    ],
  },
  {
    id: "wasm-worker-poison",
    status: "live",
    title: { ko: "WASM Embind cleanup 실패 뒤 Worker heap 재사용 위험", en: "A failed WASM Embind cleanup could poison a reusable worker heap" },
    symptom: { ko: "한 번 실패한 대형 GLB·KTX2 작업 뒤 무관한 다음 파일 검증도 비결정적으로 실패할 수 있었습니다.", en: "After one failed large GLB or KTX2 job, an unrelated later validation could fail nondeterministically." },
    rootCause: { ko: "native object delete 또는 decoder cleanup 실패 후 JS 예외만 반환하고 같은 WASM memory와 Worker를 계속 사용했습니다.", en: "The worker returned a JS error after native cleanup failure but kept reusing the same WASM memory and worker." },
    fix: { ko: "치명적 cleanup 오류를 protocol에 표시하고 클라이언트가 Worker를 terminate합니다. 다음 요청은 lazy-created clean instance에서 실행됩니다.", en: "Fatal cleanup errors are marked in the protocol so the client terminates the worker; the next request lazily creates a clean instance." },
    prevention: { ko: "cleanup throw, timeout, abort, oversized payload와 busy worker 재사용을 테스트하고 heap·job metrics를 기록합니다.", en: "Tests cover cleanup throws, timeout, abort, oversized payloads and busy-worker reuse while recording heap/job metrics." },
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation.worker.ts", label: { ko: "치명적 cleanup 신호", en: "Fatal cleanup signaling" } },
      { kind: "code", path: "apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation-worker-client.ts", label: { ko: "poisoned Worker 종료·재생성", en: "Poisoned worker termination and recreation" } },
      { kind: "test", path: "apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation-worker-client.test.ts", label: { ko: "수명주기 회귀", en: "Lifecycle regression" } },
    ],
  },
  {
    id: "opfs-partial-commit",
    status: "live",
    title: { ko: "브라우저 종료가 OPFS 본문과 metadata pointer 사이에 발생", en: "Browser termination occurred between OPFS bytes and metadata pointer commit" },
    symptom: { ko: "파일 byte는 존재하지만 최신 revision pointer가 없거나, pointer는 갱신됐지만 마지막 chunk가 완성되지 않은 상태가 생길 수 있었습니다.", en: "Bytes could exist without the newest revision pointer, or a pointer could advance before the final chunk completed." },
    rootCause: { ko: "대형 파일 쓰기와 metadata 업데이트를 한 번의 원자 작업처럼 가정했지만 서로 다른 저장 계층에는 공통 transaction이 없었습니다.", en: "Large-file writes and metadata updates were assumed atomic even though the storage layers share no transaction." },
    fix: { ko: "prepare→digest→journal→pointer commit→cleanup 순서와 recovery marker를 도입해 시작 시 마지막 완전 checkpoint를 재구성합니다.", en: "A prepare→digest→journal→pointer-commit→cleanup sequence and recovery markers reconstruct the last complete checkpoint at startup." },
    prevention: { ko: "각 단계 직후 강제 종료, 손상 chunk, quota 초과, stale pointer와 cleanup 재진입을 fault-injection으로 검증합니다.", en: "Fault injection terminates after every stage and covers corrupt chunks, quota exhaustion, stale pointers and cleanup re-entry." },
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/studio-opfs-recovery-journal.ts", label: { ko: "OPFS journal", en: "OPFS journal" } },
      { kind: "test", path: "apps/web/src/domains/creator/studio-opfs-recovery-runtime.test.ts", label: { ko: "부분 commit 복구 회귀", en: "Partial-commit recovery regression" } },
    ],
  },
  {
    id: "open-api-schema-rights-drift",
    status: "live",
    title: { ko: "Open API의 공개 이용 flag·schema·이미지 host가 바뀜", en: "Open API rights flags, schemas and image hosts drifted" },
    symptom: { ko: "검색 결과는 보이지만 제한 작품이 섞이거나, 외부 image URL이 임의 host를 가리키고, 오류가 빈 목록처럼 보일 수 있었습니다.", en: "Results could include restricted works, external image URLs could point to arbitrary hosts, and outages could look like empty search results." },
    rootCause: { ko: "공급자의 top-level flag와 TypeScript cast를 신뢰하고 detail·host·rights field를 독립적으로 재검증하지 않았습니다.", en: "The adapter trusted provider flags and TypeScript casts without independently checking detail data, hosts and rights fields." },
    fix: { ko: "provider별 exact schema와 rights predicate, image host allowlist, detail re-fetch와 명시적 오류 envelope를 적용했습니다.", en: "Provider-specific exact schemas, rights predicates, image-host allowlists, detail refetch and explicit error envelopes were added." },
    prevention: { ko: "forged CC0, wrong object ID, unsafe image, malformed pagination, 429와 부분 제공처 실패 fixture를 유지합니다.", en: "Fixtures cover forged CC0, wrong object IDs, unsafe images, malformed pagination, 429 and partial provider failure." },
    evidence: [
      { kind: "test", path: "apps/api/src/modules/creator-resources/open-art-providers.test.ts", label: { ko: "권리·host 공격 fixture", en: "Rights and host attack fixtures" } },
      { kind: "test", path: "apps/api/src/modules/creator-resources/free-resource-providers.test.ts", label: { ko: "공급자 schema·출처 회귀", en: "Provider schema and provenance regression" } },
      { kind: "test", path: "e2e/open-creation.spec.ts", label: { ko: "실브라우저 rate·CORS·손상 데이터 검증", en: "Browser rate, CORS and corrupt-data verification" } },
    ],
  },
  {
    id: "ai-ambiguous-retry",
    status: "configured",
    title: { ko: "AI timeout 뒤 자동 fallback이 중복 추론·과금 위험을 만듦", en: "AI fallback after timeout created duplicate inference and billing risk" },
    symptom: { ko: "사용자는 실패로 보지만 첫 공급자가 이미 작업을 수락했을 수 있어 다음 공급자 재전송 시 두 결과와 두 비용이 생길 수 있습니다.", en: "The user saw failure although the first provider may have accepted the job, so retrying elsewhere could produce two results and two charges." },
    rootCause: { ko: "모든 네트워크 오류를 ‘추론 전 실패’로 가정하고 fallback 가능한 오류 목록에 포함했습니다.", en: "All network errors were assumed to occur before inference and were treated as safe fallback signals." },
    fix: { ko: "HTTP 402·429 등 명확한 pre-inference 거절만 다음 무료 공급자로 이동하고 timeout·5xx·malformed success는 ambiguous로 종료합니다. 요청 fingerprint와 idempotency receipt를 저장합니다.", en: "Only clear pre-inference rejection such as 402/429 advances to another free provider; timeout, 5xx and malformed success end as ambiguous. Request fingerprints and idempotency receipts are retained." },
    prevention: { ko: "provider accepted 후 connection drop, timeout race, receipt replay, 다른 payload로 같은 key 재사용을 테스트합니다.", en: "Tests cover connection drop after acceptance, timeout races, receipt replay and reuse of a key with a different payload." },
    evidence: [
      { kind: "document", path: "apps/api/src/modules/studio-ai/README.md", label: { ko: "안전한 advance 규칙", en: "Safe provider-advance rules" } },
      { kind: "test", path: "apps/api/src/modules/studio-ai/studio-ai.service.test.ts", label: { ko: "AI quota·retry·receipt 회귀", en: "AI quota, retry and receipt regression" } },
      { kind: "code", path: "apps/api/src/db/migrations/0019_studio_ai_request_receipt.sql", label: { ko: "내구성 idempotency receipt", en: "Durable idempotency receipt" } },
    ],
  },
  {
    id: "mediapipe-init-race",
    status: "live",
    title: { ko: "여러 MediaPipe Vision task를 동시에 초기화하면 ambient Module 상태가 충돌", en: "Concurrent MediaPipe Vision task initialization raced through ambient Module state" },
    symptom: { ko: "pose·hand·face·segmentation 기능을 동시에 처음 열 때 하나의 task 생성이 실패하거나 잘못된 runtime factory를 참조할 수 있었습니다.", en: "Opening pose, hand, face and segmentation features together for the first time could fail task creation or bind the wrong runtime factory." },
    rootCause: { ko: "각 기능은 별도 singleton promise를 가졌지만 tasks-vision의 createFromOptions가 정착하는 동안 ambient Module·ModuleFactory 전역을 공유했습니다.", en: "Each feature had its own singleton promise, but tasks-vision shared ambient Module and ModuleFactory globals while createFromOptions settled." },
    fix: { ko: "모든 Vision task 생성을 process-wide FIFO arbiter로 직렬화하고, 시작 전 abort된 요청은 queue에서 제거하며 module import 실패는 다음 시도에서 재생성하도록 했습니다.", en: "All Vision task creation is serialized through a process-wide FIFO arbiter; requests aborted before start leave the queue, and module-import failure resets for a clean retry." },
    prevention: { ko: "서로 다른 owner 동시 요청, queued abort, active 작업 실패, module import retry와 순서 보존을 단위 테스트합니다.", en: "Unit tests cover concurrent owners, queued aborts, active-task failure, module-import retry and FIFO ordering." },
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator/studio-mediapipe-vision-init-arbiter.ts", label: { ko: "process-wide FIFO arbiter", en: "Process-wide FIFO arbiter" } },
      { kind: "test", path: "apps/web/src/domains/creator/studio-mediapipe-vision-init-arbiter.test.ts", label: { ko: "동시 초기화·abort·retry 회귀", en: "Concurrent initialization, abort and retry regressions" } },
    ],
  },
  {
    id: "cross-origin-isolation-media",
    status: "live",
    title: { ko: "교차 출처 격리 환경에서 Open API 썸네일과 캔버스 입력이 차단", en: "Cross-origin isolation blocked Open API thumbnails and canvas inputs" },
    symptom: { ko: "검색 결과 metadata는 보이지만 외부 썸네일이 로드되지 않거나 canvas 픽셀 읽기 단계에서 보안 오류가 발생할 수 있었습니다.", en: "Search metadata rendered while external thumbnails failed to load or canvas pixel reads raised security errors." },
    rootCause: { ko: "COOP·COEP가 필요한 WASM·SharedArrayBuffer 환경에서 이미지가 anonymous CORS와 허용된 host·응답 header 없이 로드됐습니다.", en: "In a COOP/COEP environment required by WASM and SharedArrayBuffer, images loaded without anonymous CORS, allowed hosts and compatible response headers." },
    fix: { ko: "공급자 image host를 allowlist하고 crossOrigin=anonymous·referrerPolicy=no-referrer를 설정하며, CORS가 보장되지 않는 URL은 canvas 처리 대상으로 사용하지 않습니다.", en: "Provider image hosts are allowlisted, crossOrigin=anonymous and referrerPolicy=no-referrer are set, and URLs without compatible CORS are excluded from canvas processing." },
    prevention: { ko: "실제 브라우저에서 자연 너비, crossorigin 속성, 허용 origin, canvas read와 실패 placeholder를 함께 검증합니다.", en: "Real-browser tests verify natural width, crossorigin attributes, allowed origins, canvas reads and failure placeholders together." },
    evidence: [
      { kind: "code", path: "apps/web/src/domains/creator-resources/OpenCreationPage.tsx", label: { ko: "anonymous CORS·referrer policy 이미지", en: "Anonymous-CORS and referrer-policy image" } },
      { kind: "test", path: "e2e/open-creation.spec.ts", label: { ko: "교차 출처 격리 썸네일 실브라우저 회귀", en: "Cross-origin-isolated thumbnail browser regression" } },
      { kind: "code", path: "apps/web/src/domains/creator/canvas/studio-canvas-image-io.ts", label: { ko: "canvas 이미지 CORS 입력 경계", en: "Canvas image CORS input boundary" } },
    ],
  },
  {
    id: "ai-review-automation-gap",
    status: "documented",
    title: { ko: "AI 자동 리뷰 설정은 존재하지만 draft PR 리뷰가 실제로 실행되지 않음", en: "AI review configuration existed, but draft PR review did not actually run" },
    symptom: { ko: "자동 리뷰가 켜졌다고 가정했지만 PR은 리뷰 없이 머지 시점에 가까워졌고, check status만 보면 AI 리뷰 대기·실패 여부도 알 수 없었습니다.", en: "Automated review was assumed active, yet the PR approached merge without review, and check status alone did not reveal pending or skipped AI review." },
    rootCause: { ko: "provider의 draft 기본값, 저장소·계정 tier 조건과 comment-only 리뷰 경로를 저장소 설정 하나로 해결할 수 있다고 가정했습니다.", en: "Repository configuration was assumed to override provider draft defaults, account/repository tier gates and comment-only review reporting." },
    fix: { ko: ".coderabbit.yaml에서 draft 리뷰를 명시하고 실제 PR에서 설정 로드 여부를 확인했습니다. 외부 gate가 남으면 수동 trigger를 사용하고 check run뿐 아니라 PR comment·reaction을 함께 확인합니다.", en: "Draft review is explicit in .coderabbit.yaml and verified on an actual PR. When external gates remain, a manual trigger is used and PR comments/reactions are inspected in addition to check runs." },
    prevention: { ko: "AI 리뷰는 required CI로 간주하지 않고, 실행 조건·관측 방법·provider 외부 제한·수동 대체 절차를 운영 문서에 유지합니다.", en: "AI review is not treated as required CI; execution conditions, observation methods, provider-side limits and manual fallback remain documented." },
    evidence: [
      { kind: "code", path: ".coderabbit.yaml", label: { ko: "draft 자동 리뷰 설정", en: "Draft automated-review configuration" } },
      { kind: "document", path: "docs/coderabbit-auto-review.md", label: { ko: "실측 원인·검증·수동 대체 기록", en: "Observed cause, validation and manual fallback record" } },
    ],
  },
] as const satisfies readonly EngineeringTroubleshootingCase[];

export const ENGINEERING_REFERENCE_PRODUCTS = [
  {
    id: "clip-studio",
    name: "Clip Studio Paint",
    role: "applied-pattern",
    lesson: { ko: "작가 중심 3D 포즈·선화·톤·페이지 제작 흐름과 소재 생태계", en: "Artist-first 3D posing, line/tone, page workflow and material ecosystem" },
    applied: { ko: "3D를 별도 데모가 아니라 컷·레이어·검수·출력 흐름 안에 연결하는 기준으로 사용", en: "Used as a bar for connecting 3D to panels, layers, review and output rather than a separate demo" },
    boundary: { ko: "기능명·UI·소재를 복제하지 않고 공개 문서와 사용자 작업 흐름만 비교", en: "No feature-name, UI or asset copying; only public documentation and user workflow patterns are compared" },
    url: "https://www.clipstudio.net/en/",
  },
  {
    id: "photoshop",
    name: "Adobe Photoshop",
    role: "applied-pattern",
    lesson: { ko: "비파괴 레이어·mask·filter·색관리·PSD 왕복 기대 수준", en: "Expectations for nondestructive layers, masks, filters, color and PSD round trips" },
    applied: { ko: "원본 blob 보존, 호환성 손실 보고, filter authority와 export preflight 설계에 반영", en: "Informed original-blob preservation, compatibility-loss reports, filter authority and export preflight" },
    boundary: { ko: "완전 호환을 주장하지 않고 항목별 preserved·converted·rasterized·blocked를 공개", en: "No blanket compatibility claim; each item is marked preserved, converted, rasterized or blocked" },
    url: "https://www.adobe.com/products/photoshop.html",
  },
  {
    id: "procreate",
    name: "Procreate",
    role: "applied-pattern",
    lesson: { ko: "직접 조작, 낮은 메뉴 부담, 빠른 첫 획과 제스처 중심 창작 경험", en: "Direct manipulation, low chrome, fast first stroke and gesture-led creation" },
    applied: { ko: "펜 입력 중 플로팅 UI를 비우고 캔버스 집중 상태를 비파괴적으로 적용", en: "Informed stroke-time chrome reduction and nondestructive canvas focus mode" },
    boundary: { ko: "iPad 네이티브 성능을 웹에서 동일하다고 주장하지 않고 별도 latency budget으로 측정", en: "Native iPad performance is not claimed for the web; latency is measured under separate budgets" },
    url: "https://procreate.com/",
  },
  {
    id: "blender",
    name: "Blender",
    role: "specialist",
    lesson: { ko: "자동화 가능한 DCC, topology·rig·render·export와 headless 검증", en: "Automatable DCC for topology, rigging, rendering, export and headless verification" },
    applied: { ko: "브라우저 편집기 밖의 deterministic authoring·quality gate·asset release 단계", en: "Used as a deterministic authoring, quality-gate and asset-release stage outside the browser editor" },
    boundary: { ko: "브라우저 장면 문서 권위를 대체하지 않고 package를 통해서만 반입", en: "Does not replace browser scene authority; output enters only through verified packages" },
    url: "https://www.blender.org/",
  },
  {
    id: "vroid",
    name: "VRoid Studio",
    role: "applied-pattern",
    lesson: { ko: "preset·slider·직접 texture·hair guide로 낮춘 캐릭터 제작 진입장벽", en: "Lower character-authoring barriers through presets, sliders, direct texture and hair guides" },
    applied: { ko: "캐릭터 shaper의 semantic part, 안전한 범위와 VRM 전달 흐름에 반영", en: "Informed semantic parts, safe ranges and VRM delivery in Character Shaper" },
    boundary: { ko: "primitive 기반 샘플을 전문 품질로 표시하지 않고 authored asset admission을 별도 운영", en: "Primitive samples are not presented as professional quality; authored asset admission remains separate" },
    url: "https://vroid.com/en/studio",
  },
  {
    id: "metahuman",
    name: "MetaHuman",
    role: "reference-only",
    lesson: { ko: "고품질 face topology, material, LOD, corrective deformation과 품질 검수 기준", en: "Quality bar for face topology, materials, LODs, corrective deformation and review" },
    applied: { ko: "캐릭터 asset admission과 golden view·silhouette·material·deformation 점수 기준 참고", en: "Reference for character asset admission and golden-view, silhouette, material and deformation scores" },
    boundary: { ko: "MetaHuman runtime·asset을 포함하거나 동등 품질을 주장하지 않음", en: "Does not embed MetaHuman runtime/assets or claim equivalent quality" },
    url: "https://www.metahuman.com/en-US",
  },
  {
    id: "character-creator",
    name: "Reallusion Character Creator",
    role: "reference-only",
    lesson: { ko: "body morph, garment fit, skinning, corrective shape와 DCC round trip", en: "Body morphs, garment fitting, skinning, corrective shapes and DCC round trips" },
    applied: { ko: "hair·garment fit cage, collision relief, body hide mask와 contact solver 설계의 품질 기준", en: "Quality reference for hair/garment fit cages, collision relief, body hide masks and contact solving" },
    boundary: { ko: "상용 asset·format을 복제하지 않고 공개 기능 수준만 벤치마크", en: "Benchmarks public capability only; no commercial assets or formats are copied" },
    url: "https://www.reallusion.com/character-creator/",
  },
  {
    id: "sketchup",
    name: "SketchUp",
    role: "applied-pattern",
    lesson: { ko: "건축 배경 모델링, scene/camera, component와 대규모 3D 자산 탐색", en: "Architectural background modeling, scenes/cameras, components and large 3D asset discovery" },
    applied: { ko: "BG3D scene preset, reusable shot, asset catalog과 명시적 import preflight에 반영", en: "Informed BG3D scene presets, reusable shots, asset catalog and explicit import preflight" },
    boundary: { ko: "CAD/BIM 정밀도를 일반 scene editor에 섞지 않고 OpenCascade·web-ifc specialist로 격리", en: "CAD/BIM precision is isolated in OpenCascade/web-ifc specialists rather than mixed into the normal scene editor" },
    url: "https://www.sketchup.com/",
  },
  {
    id: "acon3d",
    name: "ACON3D",
    role: "reference-only",
    lesson: { ko: "웹툰 제작용 3D·소재 탐색, 미리보기, 구매·라이선스와 작업 적용 흐름", en: "Webtoon-oriented 3D/material discovery, preview, licensing and production use flow" },
    applied: { ko: "마켓 제작 적합성 passport와 renderer·license·format preflight 구조 참고", en: "Reference for marketplace production-fit passports and renderer, license and format preflight" },
    boundary: { ko: "상용 카탈로그·메타데이터를 수집하거나 동일 자산을 제공하지 않음", en: "No collection of commercial catalog metadata and no redistribution of equivalent assets" },
    url: "https://www.acon3d.com/",
  },
  {
    id: "google-drive",
    name: "Google Drive API",
    role: "applied-pattern",
    lesson: { ko: "사용자 소유 파일, app-created file scope, resumable upload와 변경 revision", en: "User-owned files, app-created-file scope, resumable uploads and change revisions" },
    applied: { ko: "drive.file 최소 권한, 사용자 선택 백업과 source revision·digest 연결에 반영", en: "Informed drive.file least privilege, user-selected backups and source revision/digest binding" },
    boundary: { ko: "Drive를 Studio DB나 자동 동기화 권위로 사용하지 않고 provider token·오류·충돌을 별도 계약으로 관리", en: "Drive is not the Studio database or implicit sync authority; provider tokens, failures and conflicts remain separate contracts" },
    url: "https://developers.google.com/drive/api/guides/about-sdk",
  },
  {
    id: "dropbox",
    name: "Dropbox Platform",
    role: "applied-pattern",
    lesson: { ko: "App Folder 최소 범위, content hash와 upload session 기반 대용량 파일 전달", en: "App Folder least privilege, content hashes and upload sessions for large-file delivery" },
    applied: { ko: "개인 클라우드 adapter의 provider-neutral upload·digest·retry 경계에 반영", en: "Informed provider-neutral upload, digest and retry boundaries in personal-cloud adapters" },
    boundary: { ko: "공급자 conflict와 rate limit을 로컬 저장 성공으로 위장하지 않고 사용자에게 명시", en: "Provider conflicts and rate limits are never disguised as successful local saves" },
    url: "https://www.dropbox.com/developers",
  },
  {
    id: "onedrive",
    name: "Microsoft OneDrive · Graph",
    role: "applied-pattern",
    lesson: { ko: "App Folder, upload session, eTag와 Graph 기반 파일 revision", en: "App Folder, upload sessions, eTags and Graph-backed file revisions" },
    applied: { ko: "Files.ReadWrite.AppFolder 최소 권한과 expected-version 동기화 계약에 반영", en: "Informed Files.ReadWrite.AppFolder least privilege and expected-version synchronization" },
    boundary: { ko: "Microsoft 계정 연결이 없거나 consent가 철회되면 로컬 정본을 유지하고 cloud 기능만 비활성화", en: "Local authority remains intact when Microsoft consent is absent or revoked; only cloud features disable" },
    url: "https://learn.microsoft.com/graph/onedrive-concept-overview",
  },
  {
    id: "remotion",
    name: "Remotion",
    role: "specialist",
    lesson: { ko: "React 기반 결정론적 영상 composition, frame 단위 재현과 코드 리뷰 가능한 발표 자산", en: "React-based deterministic compositions, frame-level reproducibility and reviewable presentation assets" },
    applied: { ko: "웹 runtime과 분리된 brand/technology film 패키지, 수동 render artifact와 manifest에 사용", en: "Used for isolated brand/technology-film packages, manual render artifacts and manifests" },
    boundary: { ko: "웹 앱 번들에 포함하지 않고 자동 게시하지 않으며 조직·렌더 방식별 라이선스를 별도 확인", en: "Excluded from the web bundle and automatic publishing, with licensing rechecked by organization and render mode" },
    url: "https://www.remotion.dev/",
  },
  {
    id: "supersplat",
    name: "PlayCanvas SuperSplat",
    role: "planned-evaluation",
    lesson: { ko: "Gaussian Splat 편집·정리·viewer와 WebGPU 중심 고밀도 배경 표현", en: "Gaussian Splat editing, cleanup, viewing and WebGPU-oriented dense background rendering" },
    applied: { ko: "topology 편집이 필요 없는 captured location을 위한 specialist entity 후보", en: "Candidate specialist entity for captured locations that do not need editable topology" },
    boundary: { ko: "primary Three scene이나 문서 권위를 대체하지 않으며 현재 운영 기능으로 표시하지 않음", en: "Will not replace the primary Three scene or document authority and is not presented as live" },
    url: "https://playcanvas.com/supersplat",
  },
  {
    id: "filament",
    name: "Google Filament",
    role: "reference-only",
    lesson: { ko: "PBR material·lighting·tone mapping과 모바일 지향 renderer 설계", en: "PBR materials, lighting, tone mapping and mobile-oriented renderer design" },
    applied: { ko: "material·lighting 품질 모델 참고", en: "Reference for material and lighting quality models" },
    boundary: { ko: "또 하나의 완전한 scene renderer를 embed해 Three 권위를 중복하지 않음", en: "Not embedded as another full scene renderer that would duplicate Three authority" },
    url: "https://google.github.io/filament/",
  },
  {
    id: "godot-web",
    name: "Godot Web",
    role: "not-adopted",
    lesson: { ko: "게임 엔진의 scene/runtime/export 생태계와 Web 배포 제약", en: "Game-engine scene/runtime/export ecosystem and web deployment constraints" },
    applied: { ko: "엔진 채택보다 제품 문서 권위와 React UI 통합 비용을 먼저 평가해야 한다는 반례", en: "A counterexample showing why product document authority and React integration cost must precede engine adoption" },
    boundary: { ko: "별도 WASM application runtime이 Studio 상태를 중복 소유하고 WebGPU 목표와 맞지 않아 embed하지 않음", en: "Not embedded because a separate WASM app runtime would duplicate Studio state and not fit the WebGPU target" },
    url: "https://godotengine.org/",
  },
] as const satisfies readonly EngineeringReferenceProduct[];

export const ENGINEERING_IMPLEMENTATION_INVENTORY: EngineeringImplementationInventory = Object.freeze({
  reviewedAt: "2026-09-25",
  workerEntries: 64,
  workerClients: 58,
  serviceWorkerRuntimeFiles: 9,
  localInferenceRuntimes: Object.freeze(["ONNX Runtime Web", "MediaPipe Tasks Vision"]),
  blenderMcpCommands: 8,
  openApiProviders: ENGINEERING_OPEN_APIS.length,
});

export const ENGINEERING_REFERENCE_ROLE_META: Record<
  EngineeringReferenceRole,
  { readonly label: LocalizedText; readonly description: LocalizedText }
> = {
  "applied-pattern": {
    label: { ko: "패턴 적용", en: "Pattern applied" },
    description: { ko: "공개된 작업 흐름이나 품질 기준을 제품 계약으로 재해석했습니다.", en: "Public workflow or quality patterns were translated into product contracts." },
  },
  specialist: {
    label: { ko: "전문 도구", en: "Specialist tool" },
    description: { ko: "제품 정본을 소유하지 않는 제한된 제작 단계에서 사용합니다.", en: "Used in a bounded production stage without owning product authority." },
  },
  "reference-only": {
    label: { ko: "참고 기준", en: "Reference only" },
    description: { ko: "품질·UX·아키텍처 비교 기준이며 제품에 포함하지 않습니다.", en: "A quality, UX or architecture benchmark not embedded in the product." },
  },
  "not-adopted": {
    label: { ko: "채택하지 않음", en: "Not adopted" },
    description: { ko: "중복 권위·비용·호환성 때문에 현재 구조에서 제외했습니다.", en: "Excluded because of duplicated authority, cost or compatibility." },
  },
  "planned-evaluation": {
    label: { ko: "평가 예정", en: "Planned evaluation" },
    description: { ko: "명확한 gate를 통과하기 전에는 운영 기능으로 표시하지 않습니다.", en: "Not presented as live until explicit gates pass." },
  },
};
