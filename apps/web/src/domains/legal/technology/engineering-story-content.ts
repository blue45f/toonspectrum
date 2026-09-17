export type EngineeringLocale = "ko" | "en";

export interface LocalizedText {
  readonly ko: string;
  readonly en: string;
}

export type EngineeringStatus =
  | "live"
  | "configured"
  | "experimental"
  | "documented"
  | "planned"
  | "retired"
  | "reference-only";

export type EngineeringEvidenceKind = "code" | "test" | "workflow" | "document";

export interface EngineeringEvidence {
  readonly kind: EngineeringEvidenceKind;
  readonly label: LocalizedText;
  readonly path: string;
}

export interface EngineeringChapter {
  readonly id: string;
  readonly order: number;
  readonly status: EngineeringStatus;
  readonly eyebrow: string;
  readonly title: LocalizedText;
  readonly thesis: LocalizedText;
  readonly problem: LocalizedText;
  readonly decision: LocalizedText;
  readonly userValue: LocalizedText;
  readonly tradeoff: LocalizedText;
  readonly technologies: readonly string[];
  readonly evidence: readonly EngineeringEvidence[];
  readonly reuseSteps: readonly LocalizedText[];
}

export interface EngineeringGuide {
  readonly id: string;
  readonly status: EngineeringStatus;
  readonly title: LocalizedText;
  readonly summary: LocalizedText;
  readonly outcome: LocalizedText;
  readonly steps: readonly LocalizedText[];
  readonly checklist: readonly LocalizedText[];
  readonly code?: string;
}

export interface EngineeringLicenseGroup {
  readonly id: string;
  readonly title: LocalizedText;
  readonly examples: readonly string[];
  readonly obligation: LocalizedText;
  readonly caution: LocalizedText;
}

export const ENGINEERING_STATUS_META: Record<
  EngineeringStatus,
  { readonly label: LocalizedText; readonly description: LocalizedText }
> = {
  live: {
    label: { ko: "운영 경로", en: "Live path" },
    description: {
      ko: "현재 제품 또는 검증 파이프라인에서 실행되는 경로입니다.",
      en: "Runs in the product or its verified delivery pipeline.",
    },
  },
  configured: {
    label: { ko: "설정 완료", en: "Configured" },
    description: {
      ko: "코드와 운영 계약이 있으며 공급자 등록이나 환경 설정이 필요합니다.",
      en: "Code and operating contracts exist, with provider or environment setup still required.",
    },
  },
  experimental: {
    label: { ko: "실험 기능", en: "Experimental" },
    description: {
      ko: "품질과 호환성을 검증 중이며 대체 경로를 유지합니다.",
      en: "Quality and compatibility are still being validated with a fallback retained.",
    },
  },
  documented: {
    label: { ko: "문서화", en: "Documented" },
    description: {
      ko: "정책과 의사결정이 공개 문서로 관리됩니다.",
      en: "Policy and decisions are maintained as public documentation.",
    },
  },
  planned: {
    label: { ko: "설계 단계", en: "Planned" },
    description: {
      ko: "구현 계약과 검증 기준을 먼저 정의한 단계입니다.",
      en: "Implementation contracts and verification criteria are defined first.",
    },
  },
  retired: {
    label: { ko: "제외", en: "Retired" },
    description: {
      ko: "현재 제품 범위에서 제외된 경로입니다.",
      en: "Excluded from the current product scope.",
    },
  },
  "reference-only": {
    label: { ko: "참고 연동", en: "Reference integration" },
    description: {
      ko: "외부 도구를 선택적으로 연결할 수 있으나 품질 게이트의 정본은 아닙니다.",
      en: "May be connected optionally, but is not the source of truth for quality gates.",
    },
  },
};

const evidence = (
  kind: EngineeringEvidenceKind,
  path: string,
  ko: string,
  en: string,
): EngineeringEvidence => ({ kind, path, label: { ko, en } });

export const ENGINEERING_CHAPTERS = [
  {
    id: "product-intent",
    order: 1,
    status: "documented",
    eyebrow: "01 · PRODUCT INTENT",
    title: { ko: "왜 브라우저 웹툰 제작실인가", en: "Why a browser-native webtoon studio" },
    thesis: {
      ko: "도구를 더 만드는 것이 아니라 기획부터 연재까지 끊긴 제작 맥락을 하나의 프로젝트 흐름으로 연결합니다.",
      en: "The goal is not another isolated tool, but one project context from planning through serialization.",
    },
    problem: {
      ko: "대본, 콘티, 드로잉, 3D, 파일, 일정과 검수가 서로 다른 도구에 흩어지면 다음 담당자가 맥락을 다시 복원해야 합니다.",
      en: "When scripts, boards, drawing, 3D, files, schedules and review live apart, every handoff must rebuild context.",
    },
    decision: {
      ko: "Workspace와 Project를 중심으로 회차, 컷, 자산, 검수와 게시 기록을 연결하는 제품 경계를 먼저 정의했습니다.",
      en: "Workspace and Project form the product boundary connecting episodes, cuts, assets, review and publishing records.",
    },
    userValue: {
      ko: "사용자는 도구를 옮길 때마다 작업 목적과 현재 상태를 다시 설명하지 않아도 됩니다.",
      en: "Creators do not need to restate purpose and progress each time they change tools.",
    },
    tradeoff: {
      ko: "모든 전문 기능을 한 번에 대체한다고 주장하지 않고 실제 연결된 범위와 설계 범위를 구분합니다.",
      en: "The product distinguishes connected capabilities from designed scope instead of claiming instant replacement of every specialist tool.",
    },
    technologies: ["React", "TypeScript", "Route registry", "Domain contracts"],
    evidence: [
      evidence("code", "apps/web/src/app/routes", "기능 경계를 드러내는 라우트 레지스트리", "Route registry exposing product boundaries"),
      evidence("document", "docs", "제품 원칙과 운영 문서", "Product principles and operations documentation"),
    ],
    reuseSteps: [
      { ko: "사용자가 실제로 끝내려는 한 가지 여정을 먼저 정의합니다.", en: "Define one journey the user must actually finish." },
      { ko: "페이지가 아니라 도메인 객체와 상태 전이를 먼저 설계합니다.", en: "Design domain objects and state transitions before pages." },
      { ko: "실제 기능과 미래 설계를 같은 표현으로 표시하지 않습니다.", en: "Never label live capability and future design the same way." },
    ],
  },
  {
    id: "architecture",
    order: 2,
    status: "live",
    eyebrow: "02 · ARCHITECTURE",
    title: { ko: "도메인 경계와 의존 방향", en: "Domain boundaries and dependency direction" },
    thesis: {
      ko: "웹 화면, 서버 API, 공용 계약, 생성·검증 도구가 서로의 구현 세부사항을 침범하지 않도록 나눕니다.",
      en: "Web UI, server API, shared contracts and verification tools are separated so implementation details do not leak across boundaries.",
    },
    problem: {
      ko: "기능이 빠르게 늘어날수록 화면 간 직접 참조와 공용 폴더의 무분별한 확장이 변경 비용을 키웁니다.",
      en: "As features grow, direct page coupling and an unbounded shared folder make every change more expensive.",
    },
    decision: {
      ko: "apps/web, apps/api, packages, scripts와 도메인별 디렉터리를 분리하고 아키텍처 검증 스크립트로 의존 방향을 확인합니다.",
      en: "apps/web, apps/api, packages, scripts and domain directories stay separate, with architecture scripts checking dependency direction.",
    },
    userValue: {
      ko: "한 작업공간의 변경이 다른 작업공간을 예기치 않게 망가뜨릴 가능성을 낮춥니다.",
      en: "A change in one workspace is less likely to break another unexpectedly.",
    },
    tradeoff: {
      ko: "초기 파일 수와 계약 정의가 늘어나지만 장기적으로 테스트와 교체 범위가 명확해집니다.",
      en: "More files and contracts are required early, but testing and replacement boundaries become clearer.",
    },
    technologies: ["Domain modules", "Lazy routes", "ESLint boundaries", "Architecture validation"],
    evidence: [
      evidence("code", "apps/web/src/domains", "웹 도메인 모듈", "Web domain modules"),
      evidence("code", "apps/api/src", "서버 애플리케이션 경계", "Server application boundary"),
      evidence("test", "scripts/validate-architecture.mjs", "아키텍처 규칙 검증", "Architecture rule verification"),
    ],
    reuseSteps: [
      { ko: "최상위 실행 단위와 공용 계약의 소유자를 정합니다.", en: "Assign owners to top-level runtimes and shared contracts." },
      { ko: "허용하지 않을 의존 방향을 테스트 가능한 규칙으로 만듭니다.", en: "Turn forbidden dependency directions into testable rules." },
      { ko: "라우트와 대형 엔진은 기본 번들에서 지연 분리합니다.", en: "Lazy-split routes and specialist engines from the default bundle." },
    ],
  },
  {
    id: "open-source",
    order: 3,
    status: "live",
    eyebrow: "03 · OPEN SOURCE",
    title: { ko: "오픈소스를 역할별로 조합하는 법", en: "Composing open source by responsibility" },
    thesis: {
      ko: "라이브러리 이름보다 무엇을 최종 소유하고 무엇은 보조하는지 먼저 정의합니다.",
      en: "Define what each library owns and assists before listing technology names.",
    },
    problem: {
      ko: "여러 렌더러와 브러시 라이브러리가 같은 결과를 동시에 소유하면 화면, 저장, Undo와 내보내기 결과가 달라질 수 있습니다.",
      en: "If several renderers or brush libraries own the same result, display, storage, undo and export may diverge.",
    },
    decision: {
      ko: "입력 보정, outline, 자연 재료, 합성, 최종 문서 commit, 내보내기의 권위를 분리합니다.",
      en: "Input smoothing, outline, natural media, compositing, document commit and export have distinct authority.",
    },
    userValue: {
      ko: "빠른 미리보기와 재현 가능한 최종 원고를 동시에 유지할 수 있습니다.",
      en: "Fast previews can coexist with a reproducible final document.",
    },
    tradeoff: {
      ko: "어댑터와 패리티 테스트가 필요하고 각 라이브러리의 라이선스와 배포 형태를 별도로 관리해야 합니다.",
      en: "Adapters, parity tests and separate license and distribution review are required.",
    },
    technologies: ["CanvasKit / Skia", "WebGPU", "Three.js", "Babylon.js", "Yjs", "perfect-freehand"],
    evidence: [
      evidence("test", "scripts/generate-studio-renderer-roles.mts", "렌더러 역할 검증", "Renderer responsibility verification"),
      evidence("test", "scripts/verify-studio-brushes.mts", "브러시 통합 검증", "Brush integration verification"),
      evidence("workflow", "scripts/generate-third-party-notices.mjs", "서드파티 고지 생성", "Third-party notice generation"),
    ],
    reuseSteps: [
      { ko: "각 라이브러리의 입력, 출력, 권위와 대체 경로를 표로 만듭니다.", en: "Map every library's inputs, outputs, authority and fallback." },
      { ko: "동일 역할을 두 엔진이 최종 소유하지 않게 합니다.", en: "Do not let two engines finally own the same responsibility." },
      { ko: "버전, 라이선스와 실제 번들 포함 여부를 자동 수집합니다.", en: "Automatically collect versions, licenses and bundle inclusion." },
    ],
  },
  {
    id: "authentication",
    order: 4,
    status: "configured",
    eyebrow: "04 · AUTHENTICATION",
    title: { ko: "로그인은 공급자보다 세션 경계가 먼저", en: "Session boundaries before provider logos" },
    thesis: {
      ko: "Google, Kakao, Naver와 GitHub는 서버형 Authorization Code 흐름으로 연결하고 공급자 토큰을 제품 세션과 분리합니다.",
      en: "Google, Kakao, Naver and GitHub use a server-side authorization-code flow, separated from the product session.",
    },
    problem: {
      ko: "브라우저에 client secret이나 장기 토큰을 두거나 공급자 토큰을 그대로 앱 세션으로 사용하면 회수와 계정 병합이 어려워집니다.",
      en: "Browser secrets, long-lived tokens or provider tokens used as app sessions make revocation and account linking difficult.",
    },
    decision: {
      ko: "state, PKCE, 최소 scope, 서버 callback 검증과 HttpOnly 자체 세션을 기본 계약으로 둡니다.",
      en: "state, PKCE, minimal scopes, server callback validation and an HttpOnly first-party session form the base contract.",
    },
    userValue: {
      ko: "사용자는 연결된 계정을 확인하고 연결 해제와 탈퇴 범위를 이해할 수 있습니다.",
      en: "Users can understand connected accounts, unlinking and deletion scope.",
    },
    tradeoff: {
      ko: "공급자 콘솔 등록과 검수가 필요하며 Toss 인증은 일반 웹 OAuth와 다른 제품·보안 범위로 현재 허용 목록에서 제외합니다.",
      en: "Provider registration and review are required; Toss authentication remains outside the allowlist because its product and security scope differs from general web OAuth.",
    },
    technologies: ["OAuth 2.0", "Authorization Code", "PKCE", "HttpOnly session", "CSRF state"],
    evidence: [
      evidence("code", "apps/web/src/domains/auth", "로그인 UI와 공급자 경계", "Login UI and provider boundary"),
      evidence("code", "apps/api/src", "서버 callback과 세션 소유", "Server callback and session ownership"),
      evidence("test", "apps/api", "허용 공급자와 실패 흐름 테스트", "Allowlisted provider and failure-path tests"),
    ],
    reuseSteps: [
      { ko: "Redirect URI와 최소 scope를 공급자별로 문서화합니다.", en: "Document redirect URIs and minimal scopes per provider." },
      { ko: "공급자 token과 서비스 session을 분리합니다.", en: "Separate provider tokens from the service session." },
      { ko: "연결 해제, 탈퇴, 계정 병합을 성공 로그인과 함께 설계합니다.", en: "Design unlinking, deletion and account linking alongside successful login." },
    ],
  },
  {
    id: "storage",
    order: 5,
    status: "live",
    eyebrow: "05 · STORAGE",
    title: { ko: "로컬 우선 저장과 개인 클라우드", en: "Local-first storage and personal cloud" },
    thesis: {
      ko: "대형 작업 데이터는 브라우저 로컬 저장소에 두고 메타데이터와 복구 저널, 사용자 소유 백업을 역할별로 분리합니다.",
      en: "Large work data stays browser-local while metadata, recovery journals and user-owned backups have separate roles.",
    },
    problem: {
      ko: "모든 원고를 네트워크 왕복에 의존하면 작업 반응성과 장애 복구가 모두 외부 상태에 묶입니다.",
      en: "Putting every document operation behind a network round trip couples responsiveness and recovery to external state.",
    },
    decision: {
      ko: "OPFS, IndexedDB와 SQLite WASM을 역할별로 사용하고 Google Drive, Dropbox, OneDrive는 명시적 사용자 백업 경로로 둡니다.",
      en: "OPFS, IndexedDB and SQLite WASM serve distinct local roles, with Google Drive, Dropbox and OneDrive as explicit user-owned backup paths.",
    },
    userValue: {
      ko: "연결 상태가 불안정해도 작업을 이어가고 복구 가능한 마지막 상태를 확인할 수 있습니다.",
      en: "Work can continue across unstable connections with a visible recoverable state.",
    },
    tradeoff: {
      ko: "브라우저 용량, 기기 교체와 저장소 권한 만료를 별도로 안내하고 중요한 원고의 내보내기를 권장해야 합니다.",
      en: "Browser quota, device changes and expired storage access need explicit guidance, with export recommended for important work.",
    },
    technologies: ["OPFS", "IndexedDB", "SQLite WASM", "Google Drive", "Dropbox", "OneDrive"],
    evidence: [
      evidence("test", "scripts/verify-studio-autosave-opfs-session.mts", "OPFS 자동 저장 검증", "OPFS autosave verification"),
      evidence("test", "scripts/verify-studio-autosave-two-tab-leader.mts", "다중 탭 저장 리더 검증", "Multi-tab save-leader verification"),
      evidence("code", "apps/web/src/domains/creator", "프로젝트 저장과 복구 UI", "Project storage and recovery UI"),
    ],
    reuseSteps: [
      { ko: "binary, metadata, journal과 backup의 저장 책임을 분리합니다.", en: "Separate binary, metadata, journal and backup responsibilities." },
      { ko: "강제 종료와 두 탭 동시 편집을 실패 시나리오로 테스트합니다.", en: "Test hard shutdown and simultaneous two-tab editing." },
      { ko: "외부 저장소는 최소 폴더 권한과 명시적 동의로 연결합니다.", en: "Connect external storage with minimal folder access and explicit consent." },
    ],
  },
  {
    id: "brush-engine",
    order: 6,
    status: "experimental",
    eyebrow: "06 · BRUSH ENGINE",
    title: { ko: "브러시 입력에서 문서 commit까지", en: "From brush input to document commit" },
    thesis: {
      ko: "포인터 이벤트를 바로 픽셀로 그리지 않고 입력 보정, 경로, tip, 재료, 합성과 문서 기록 단계로 나눕니다.",
      en: "Pointer events are not painted directly; smoothing, paths, tips, media, compositing and document recording form distinct stages.",
    },
    problem: {
      ko: "실시간 미리보기만 빠르고 저장 결과가 다르거나 긴 획에서 지연이 누적되면 전문 작업에 사용할 수 없습니다.",
      en: "A fast preview is insufficient if saved output diverges or long strokes accumulate latency.",
    },
    decision: {
      ko: "실시간 표시와 최종 committed 결과를 비교하고 GPU, Canvas와 WASM 경로에 동일한 역할 계약을 적용합니다.",
      en: "Realtime display is compared with committed output, and GPU, Canvas and WASM paths share the same responsibility contract.",
    },
    userValue: {
      ko: "브러시가 즉시 반응하면서 Undo, 재생, 내보내기에서도 같은 획을 재현할 수 있습니다.",
      en: "Brushes remain responsive while undo, replay and export reproduce the same stroke.",
    },
    tradeoff: {
      ko: "고급 자연 재료는 기기별 편차가 있어 단계적 활성화와 안전한 폴백이 필요합니다.",
      en: "Advanced natural media varies by device and needs staged enablement with a safe fallback.",
    },
    technologies: ["Pointer Events", "perfect-freehand", "CanvasKit", "WebGPU", "Rust / WASM", "Tile rendering"],
    evidence: [
      evidence("test", "scripts/verify-studio-brush-latency.mts", "브러시 지연 예산 검증", "Brush latency budget verification"),
      evidence("test", "scripts/verify-studio-long-stroke.mts", "긴 획 안정성 검증", "Long-stroke stability verification"),
      evidence("test", "scripts/verify-studio-gpu-committed-parity.mts", "표시와 commit 패리티", "Display-to-commit parity"),
    ],
    reuseSteps: [
      { ko: "입력 보정과 최종 문서 기록을 별도 인터페이스로 만듭니다.", en: "Give input smoothing and final document recording separate interfaces." },
      { ko: "짧은 데모가 아니라 긴 획과 고밀도 포인터를 측정합니다.", en: "Measure long strokes and dense pointer streams, not only short demos." },
      { ko: "하드웨어 기능 감지와 폴백 결과 패리티를 함께 검증합니다.", en: "Verify capability detection and fallback result parity together." },
    ],
  },
  {
    id: "performance",
    order: 7,
    status: "live",
    eyebrow: "07 · PERFORMANCE",
    title: { ko: "웹 성능을 기능 계약으로 다루기", en: "Treating web performance as a feature contract" },
    thesis: {
      ko: "번들, 메인 스레드, GPU 메모리, 저장 지연과 복구 시간을 각각 측정 가능한 예산으로 관리합니다.",
      en: "Bundle weight, main-thread work, GPU memory, storage latency and recovery time are managed as measurable budgets.",
    },
    problem: {
      ko: "평균적인 랜딩 페이지 지표만으로는 긴 획, 대형 파일과 3D 장면에서 발생하는 병목을 알 수 없습니다.",
      en: "Generic landing-page metrics do not expose bottlenecks in long strokes, large files or 3D scenes.",
    },
    decision: {
      ko: "라우트 지연 로딩, Worker와 WASM, 변경 영역 갱신, 타일 렌더링과 전용 검증 스크립트를 조합합니다.",
      en: "Route lazy loading, workers, WASM, dirty-region updates, tile rendering and specialist verification scripts work together.",
    },
    userValue: {
      ko: "복잡한 작업공간을 열어도 첫 화면과 실제 조작 반응성을 분리해 최적화할 수 있습니다.",
      en: "Initial load and real interaction responsiveness can be optimized independently for complex workspaces.",
    },
    tradeoff: {
      ko: "성능 수치에는 장비, 브라우저, 데이터 규모와 측정 커밋을 항상 함께 기록해야 합니다.",
      en: "Every performance number must include device, browser, data scale and measured commit.",
    },
    technologies: ["Lazy loading", "Web Workers", "WASM", "WebGPU", "Performance budgets", "Range requests"],
    evidence: [
      evidence("test", "scripts/check-studio-bundle.mjs", "스튜디오 번들 예산", "Studio bundle budget"),
      evidence("test", "tests/benchmarks", "엔진 벤치마크 하네스", "Engine benchmark harness"),
      evidence("test", "scripts/verify-studio-ux-task-benchmark.mts", "사용자 작업 지연 검증", "User-task latency verification"),
    ],
    reuseSteps: [
      { ko: "사용자가 느끼는 대표 작업을 성능 시나리오로 정의합니다.", en: "Define representative user tasks as performance scenarios." },
      { ko: "raw, gzip, 실행 시간과 메모리 예산을 분리합니다.", en: "Separate raw, gzip, execution-time and memory budgets." },
      { ko: "측정 환경과 커밋을 결과에 포함합니다.", en: "Include the measurement environment and commit with results." },
    ],
  },
  {
    id: "licenses",
    order: 8,
    status: "live",
    eyebrow: "08 · LICENSES",
    title: { ko: "코드와 창작 자산의 권리를 따로 관리", en: "Separate code rights from creative-asset rights" },
    thesis: {
      ko: "npm 패키지뿐 아니라 폰트, 브러시 프리셋, 이미지, 3D 모델, AI 모델과 생성 결과의 권리를 별도 항목으로 추적합니다.",
      en: "Rights are tracked separately for npm packages, fonts, brush presets, images, 3D models, AI models and generated output.",
    },
    problem: {
      ko: "코드 라이선스가 허용돼도 포함된 에셋이나 모델 약관이 상업 배포를 제한할 수 있습니다.",
      en: "A permissive code license does not guarantee that bundled assets or model terms allow commercial distribution.",
    },
    decision: {
      ko: "빌드에서 서드파티 고지를 생성하고 배포 형태와 수정 여부, 저작자 표시, 소스 제공 의무를 검토합니다.",
      en: "The build generates third-party notices while distribution form, modification, attribution and source obligations are reviewed.",
    },
    userValue: {
      ko: "사용자는 어떤 구성요소가 어떤 권리 조건으로 제공되는지 확인할 수 있습니다.",
      en: "Users can see which components are provided under which rights conditions.",
    },
    tradeoff: {
      ko: "새 패키지나 에셋을 도입할 때 기능 검토와 함께 라이선스 검토 시간이 필요합니다.",
      en: "Every new package or asset adds license review alongside feature review.",
    },
    technologies: ["SPDX", "THIRD_PARTY_NOTICES", "License allowlist", "Asset provenance"],
    evidence: [
      evidence("workflow", "scripts/generate-third-party-notices.mjs", "고지 자동 생성", "Automated notice generation"),
      evidence("workflow", "package.json#audit:licenses", "CI 라이선스 검사", "CI license audit"),
      evidence("code", "apps/web/public", "배포 자산 경계", "Distributed asset boundary"),
    ],
    reuseSteps: [
      { ko: "코드, 데이터, 미디어, 모델과 출력물 권리를 구분합니다.", en: "Separate rights for code, data, media, models and output." },
      { ko: "실제 번들에 포함되는 항목을 기준으로 고지를 생성합니다.", en: "Generate notices from what actually ships." },
      { ko: "강한 copyleft와 네트워크 제공 의무는 배포 구조와 함께 검토합니다.", en: "Review strong copyleft and network-use obligations with deployment architecture." },
    ],
  },
  {
    id: "crawling",
    order: 9,
    status: "documented",
    eyebrow: "09 · DATA ACQUISITION",
    title: { ko: "크롤링보다 출처와 재사용 권리부터", en: "Source and reuse rights before crawling" },
    thesis: {
      ko: "공식 API와 공개 데이터, 표준 피드를 우선하고 수집 가능성과 재사용 가능성을 별도로 판단합니다.",
      en: "Official APIs, open data and standard feeds come first, while collectability and reuse rights are evaluated separately.",
    },
    problem: {
      ko: "robots 허용만으로 콘텐츠 재배포 권리나 개인정보 처리 근거가 생기지는 않습니다.",
      en: "robots permission does not itself grant redistribution rights or a legal basis for personal-data processing.",
    },
    decision: {
      ko: "로그인, CAPTCHA, 성인 인증과 유료 본문 우회를 금지하고 제한된 수집, 정규화, 출처 기록과 사람 승인을 거칩니다.",
      en: "Login, CAPTCHA, age-gate and paid-content bypass are prohibited; limited collection, normalization, provenance and human approval are required.",
    },
    userValue: {
      ko: "추천과 자료 페이지에서 정보의 출처와 최신성을 확인할 수 있습니다.",
      en: "Reference and recommendation pages can expose source and freshness.",
    },
    tradeoff: {
      ko: "수집량보다 정확성, 갱신 주기와 삭제 요청 대응을 우선합니다.",
      en: "Accuracy, refresh cadence and deletion handling take priority over collection volume.",
    },
    technologies: ["robots.txt", "Structured feeds", "Schema validation", "Provenance", "Human review"],
    evidence: [
      evidence("document", "apps/web/src/domains/legal/CrawlerPolicyPage.tsx", "공개 수집 정책", "Public acquisition policy"),
      evidence("workflow", "scripts/crawl.mjs", "수동 카탈로그 수집", "Manual catalogue acquisition"),
      evidence("test", "scripts/validate-catalog.mjs", "카탈로그 스키마 검증", "Catalogue schema validation"),
    ],
    reuseSteps: [
      { ko: "공급자별 허용 근거, 필드와 갱신 주기를 등록합니다.", en: "Register legal basis, fields and cadence per provider." },
      { ko: "수집, 정규화, 게시 승인을 별도 단계로 둡니다.", en: "Separate collection, normalization and publication approval." },
      { ko: "삭제와 정정 요청이 원본까지 추적되게 provenance를 보존합니다.", en: "Preserve provenance so corrections and deletion requests reach the source record." },
    ],
  },
  {
    id: "quality",
    order: 10,
    status: "live",
    eyebrow: "10 · QUALITY",
    title: { ko: "테스트를 사용자 여정과 연결", en: "Connecting tests to user journeys" },
    thesis: {
      ko: "Vitest, Playwright와 도메인 전용 검증을 계층화하고 외부 QA 도구는 사람이 읽기 쉬운 보조 포털로만 연결합니다.",
      en: "Vitest, Playwright and domain-specific checks are layered, while external QA tools remain a human-readable companion portal.",
    },
    problem: {
      ko: "단위 테스트가 통과해도 브라우저 저장 권한, GPU 기능, 실제 라우팅과 복구 흐름은 실패할 수 있습니다.",
      en: "Unit tests can pass while browser storage permissions, GPU capabilities, real routing or recovery still fail.",
    },
    decision: {
      ko: "타입·lint, 도메인 테스트, 브라우저 시나리오, 성능·보안·라이선스 검사를 서로 다른 품질 게이트로 둡니다.",
      en: "Types and lint, domain tests, browser scenarios, performance, security and license checks remain distinct quality gates.",
    },
    userValue: {
      ko: "지원되지 않는 상태를 성공처럼 숨기지 않고 실패 원인과 대체 경로를 안내할 수 있습니다.",
      en: "Unsupported states are not disguised as success; causes and fallback paths can be explained.",
    },
    tradeoff: {
      ko: "Testifly 같은 외부 도구는 선택형 가시화 계층이며 CI 통과 여부의 정본으로 사용하지 않습니다.",
      en: "External tools such as Testifly are optional visibility layers, not the source of truth for CI pass or failure.",
    },
    technologies: ["Vitest", "Testing Library", "Playwright", "CSP checks", "Testifly optional portal"],
    evidence: [
      evidence("test", "apps/web/src", "컴포넌트와 도메인 테스트", "Component and domain tests"),
      evidence("test", "e2e", "실제 브라우저 검증", "Real-browser verification"),
      evidence("workflow", "package.json#ci", "통합 품질 게이트", "Integrated quality gate"),
    ],
    reuseSteps: [
      { ko: "실패 비용에 따라 테스트 계층을 나눕니다.", en: "Layer tests according to failure cost." },
      { ko: "브라우저 API는 실제 브라우저와 권한 상태에서 검증합니다.", en: "Verify browser APIs in a real browser and permission state." },
      { ko: "외부 QA 포털은 CI 결과를 복제하지 말고 링크와 설명을 제공합니다.", en: "Let an external QA portal explain and link to CI rather than duplicate its authority." },
    ],
  },
  {
    id: "infrastructure",
    order: 11,
    status: "configured",
    eyebrow: "11 · INFRASTRUCTURE",
    title: { ko: "무료 우선 인프라와 명시적 승격", en: "Free-first infrastructure with explicit promotion" },
    thesis: {
      ko: "정적 자산, 동적 API, 실시간 상태와 영속 데이터를 분리하고 무료 티어 한도를 넘을 때 자동 과금 대신 승인된 승격을 사용합니다.",
      en: "Static assets, dynamic APIs, realtime state and durable data are separated, with approved promotion rather than automatic paid scaling.",
    },
    problem: {
      ko: "모든 기능을 하나의 서버에 두면 트래픽 특성, cold start와 비용을 개별적으로 통제하기 어렵습니다.",
      en: "Putting every capability on one server makes traffic shape, cold starts and cost difficult to control independently.",
    },
    decision: {
      ko: "Cloudflare 정적·edge 경로, R2 대형 자산, Render API, Durable Objects 실시간 상태와 PostgreSQL 원장을 역할별로 둡니다.",
      en: "Cloudflare static and edge paths, R2 large assets, Render APIs, Durable Objects realtime state and PostgreSQL records have distinct roles.",
    },
    userValue: {
      ko: "초기 비용을 낮추면서도 서비스별 병목과 장애 범위를 명확히 파악할 수 있습니다.",
      en: "Early cost stays low while bottlenecks and failure domains remain understandable.",
    },
    tradeoff: {
      ko: "무료 티어에는 cold start와 한도가 있으며 SLA가 필요할 때는 비용과 운영 책임을 함께 승격해야 합니다.",
      en: "Free tiers include cold starts and limits; SLA upgrades must promote both cost and operational responsibility.",
    },
    technologies: ["Cloudflare", "R2", "Render", "Durable Objects", "PostgreSQL / Neon"],
    evidence: [
      evidence("code", "deploy", "edge와 배포 구성", "Edge and deployment configuration"),
      evidence("test", "scripts/verify-free-infrastructure-policy.mjs", "무료 우선 구성 검증", "Free-first configuration verification"),
      evidence("workflow", ".github/workflows", "검토 가능한 배포·렌더 워크플로", "Reviewable deployment and render workflows"),
    ],
    reuseSteps: [
      { ko: "정적, 동적, 실시간, 대형 파일과 원장 데이터를 먼저 분류합니다.", en: "Classify static, dynamic, realtime, large-file and ledger data first." },
      { ko: "무료 한도, cold start와 장애 시 폴백을 문서화합니다.", en: "Document free limits, cold starts and failure fallback." },
      { ko: "자동 유료 승격 대신 예산 승인과 관찰 지표를 연결합니다.", en: "Connect budget approval and observability instead of automatic paid promotion." },
    ],
  },
  {
    id: "ai-routing",
    order: 12,
    status: "configured",
    eyebrow: "12 · AI ROUTING",
    title: { ko: "AI 공급자를 제품 계약 뒤에 숨기기", en: "Putting AI providers behind a product contract" },
    thesis: {
      ko: "사용자 작업 의도와 공급자 API를 분리하고 무료 공용 풀, BYOK, 동의와 예산 정책을 명시합니다.",
      en: "User intent is separated from provider APIs, with explicit shared-free, BYOK, consent and budget policies.",
    },
    problem: {
      ko: "화면이 특정 모델 요청 형식에 직접 의존하면 가격, 정책과 품질 변경이 제품 전체로 퍼집니다.",
      en: "When UI depends directly on one model request format, pricing, policy and quality changes spread through the product.",
    },
    decision: {
      ko: "provider-neutral intent, 서버 어댑터, capability metadata, 명시적 fallback과 사용자 승인 단계를 둡니다.",
      en: "Provider-neutral intent, server adapters, capability metadata, explicit fallback and user approval form the contract.",
    },
    userValue: {
      ko: "외부 전송 여부와 개인 키 사용을 알고 후보를 비교한 뒤 선택할 수 있습니다.",
      en: "Users can understand external transfer and personal-key use before comparing and choosing candidates.",
    },
    tradeoff: {
      ko: "모호한 공급자 오류를 다른 모델로 자동 재전송하지 않아 일부 요청은 사용자 재시도가 필요합니다.",
      en: "Ambiguous provider failures are not silently replayed elsewhere, so some requests require user retry.",
    },
    technologies: ["Provider adapters", "BYOK", "Capability registry", "Consent", "Budget guard"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator", "AI 작업 의도와 승인 UI", "AI intent and approval UI"),
      evidence("code", "apps/api/src", "서버 공급자 어댑터", "Server provider adapters"),
      evidence("test", "scripts/verify-studio-ai-quality.mts", "AI 품질 경계 검증", "AI quality-boundary verification"),
    ],
    reuseSteps: [
      { ko: "모델명이 아닌 사용자의 작업 의도를 요청 스키마로 만듭니다.", en: "Model user intent rather than model names in the request schema." },
      { ko: "동의, 예산, 재시도와 fallback 정책을 요청 전에 결정합니다.", en: "Decide consent, budget, retry and fallback before sending." },
      { ko: "후보와 최종 승인 결과를 프로젝트 revision에 기록합니다.", en: "Record candidates and approved results in project revisions." },
    ],
  },
  {
    id: "image-generation",
    order: 13,
    status: "configured",
    eyebrow: "13 · IMAGE GENERATION",
    title: { ko: "이미지 생성에 기준 이미지의 역할을 보존", en: "Preserving reference roles in image generation" },
    thesis: {
      ko: "캐릭터, 방법과 스타일 참고 이미지를 같은 첨부 파일로 취급하지 않고 역할과 해시를 함께 기록합니다.",
      en: "Character, method and style references are not treated as identical attachments; role and hash travel with each asset.",
    },
    problem: {
      ko: "참고 이미지의 목적이 사라지면 공급자별 prompt 변환과 결과 비교가 일관되지 않습니다.",
      en: "When reference purpose is lost, provider-specific prompt conversion and result comparison become inconsistent.",
    },
    decision: {
      ko: "asset id, SHA-256, reference role과 승인된 결과 revision을 provider-neutral 작업 계약에 포함합니다.",
      en: "Asset id, SHA-256, reference role and approved result revision are part of a provider-neutral work contract.",
    },
    userValue: {
      ko: "왜 이 결과가 생성됐는지와 어떤 기준 이미지를 사용했는지 추적할 수 있습니다.",
      en: "Creators can trace why an output exists and which references shaped it.",
    },
    tradeoff: {
      ko: "공급자마다 지원하는 reference 종류와 권리 조건이 달라 capability 검사가 필요합니다.",
      en: "Provider support and rights conditions differ by reference type, requiring capability checks.",
    },
    technologies: ["Asset provenance", "SHA-256", "Reference roles", "Candidate review", "Revision history"],
    evidence: [
      evidence("test", "scripts/verify-studio-ai-image-references.mts", "AI 이미지 참조 계약 검증", "AI image-reference contract verification"),
      evidence("code", "apps/web/src/domains/creator", "후보 비교와 승인 흐름", "Candidate comparison and approval flow"),
    ],
    reuseSteps: [
      { ko: "업로드 파일에 reference role과 권리 메모를 저장합니다.", en: "Store reference role and rights notes with uploads." },
      { ko: "provider adapter가 지원하지 않는 역할은 전송 전에 차단합니다.", en: "Block unsupported roles before the provider request." },
      { ko: "선택된 결과만 프로젝트 revision으로 승격합니다.", en: "Promote only selected output into a project revision." },
    ],
  },
  {
    id: "sound-generation",
    order: 14,
    status: "experimental",
    eyebrow: "14 · SOUND",
    title: { ko: "사운드 생성과 권리 정보를 같은 흐름에", en: "Keeping generated sound and rights in one flow" },
    thesis: {
      ko: "실제 오디오 파일 생성에 성공했을 때만 결과를 표시하고 공급자, 동의와 권리 메모를 함께 저장합니다.",
      en: "A result appears only after a real audio file is created, with provider, consent and rights notes stored together.",
    },
    problem: {
      ko: "텍스트 응답을 음악 생성 성공처럼 표시하거나 생성물의 사용 범위를 누락하면 편집 단계에서 위험이 커집니다.",
      en: "Treating text as successful music generation or omitting usage scope creates risk during editing.",
    },
    decision: {
      ko: "서버 전용 키, 중복 호출 방지, 일일 예산, 로컬 라이브러리와 명시적 승인 후 사용을 기본으로 둡니다.",
      en: "Server-only keys, deduplication, daily budget, a local library and explicit approval are the defaults.",
    },
    userValue: {
      ko: "사용자는 실제 재생 가능한 파일과 권리 상태를 함께 확인할 수 있습니다.",
      en: "Users can review a playable file and its rights state together.",
    },
    tradeoff: {
      ko: "자동 게시, 영상 혼합과 클라우드 동기화는 별도 승인된 기능이 아니면 제공되는 것처럼 표시하지 않습니다.",
      en: "Automatic publishing, video mixing and cloud sync are not presented as available without separately approved capabilities.",
    },
    technologies: ["Audio provider adapters", "Budget limits", "Deduplication", "OPFS library", "Rights metadata"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator", "오디오 결과와 로컬 라이브러리", "Audio results and local library"),
      evidence("code", "apps/api/src", "서버 전용 공급자 호출", "Server-only provider invocation"),
    ],
    reuseSteps: [
      { ko: "성공 조건을 실제 media artifact 생성으로 정의합니다.", en: "Define success as creation of a real media artifact." },
      { ko: "권리와 외부 전송 동의를 요청 전후에 보존합니다.", en: "Preserve rights and external-transfer consent around the request." },
      { ko: "게시와 동기화는 생성과 별도 capability로 다룹니다.", en: "Treat publishing and synchronization as separate capabilities." },
    ],
  },
  {
    id: "delivery",
    order: 15,
    status: "live",
    eyebrow: "15 · DELIVERY",
    title: { ko: "웹, 발표와 영상이 같은 원본을 사용", en: "One source for web, decks and film" },
    thesis: {
      ko: "기술 설명을 구조화된 콘텐츠로 관리해 웹 문서, 발표 모드, Remotion 장면과 자막이 서로 다른 사실을 말하지 않게 합니다.",
      en: "Structured content feeds web documentation, presentation mode, Remotion scenes and captions so they do not tell different stories.",
    },
    problem: {
      ko: "페이지, 투자 자료와 세미나 대본을 별도로 관리하면 상태와 수치가 빠르게 어긋납니다.",
      en: "Separately maintained pages, investor decks and seminar scripts quickly drift in status and numbers.",
    },
    decision: {
      ko: "EngineeringChapter 계약을 중심으로 대상별 길이만 달리하고 모든 공개 항목에 상태와 증거를 연결합니다.",
      en: "The EngineeringChapter contract stays central while audience-specific outputs vary in length, with status and evidence attached throughout.",
    },
    userValue: {
      ko: "투자자, 개발자와 창작자는 같은 사실을 각자 필요한 깊이로 볼 수 있습니다.",
      en: "Investors, developers and creators see the same facts at the depth they need.",
    },
    tradeoff: {
      ko: "영상 artifact는 자동 게시하지 않고 workflow 결과를 사람이 검토한 뒤 배포합니다.",
      en: "Film artifacts are never auto-published; workflow output is reviewed by a person before distribution.",
    },
    technologies: ["Structured content", "React presentation", "Remotion", "VTT captions", "Review artifacts"],
    evidence: [
      evidence("code", "apps/web/src/domains/legal/technology", "공용 기술 스토리 콘텐츠", "Shared engineering-story content"),
      evidence("code", "media/brand-film/src/TechnologyStoryFilm.tsx", "Remotion 기술 필름", "Remotion engineering film"),
      evidence("workflow", ".github/workflows/technology-story-film.yml", "검토용 영상 artifact", "Reviewable film artifacts"),
    ],
    reuseSteps: [
      { ko: "웹, 발표와 영상에 필요한 공통 필드를 먼저 정의합니다.", en: "Define shared fields required by web, deck and film." },
      { ko: "대상별로 내용을 복사하지 말고 필터와 요약만 달리합니다.", en: "Use filters and summaries rather than copying content per audience." },
      { ko: "artifact 생성과 공개 배포 사이에 사람 검토 단계를 둡니다.", en: "Keep human review between artifact generation and public distribution." },
    ],
  },
] as const satisfies readonly EngineeringChapter[];

export const ENGINEERING_GUIDES = [
  {
    id: "oauth",
    status: "configured",
    title: { ko: "서버형 OAuth 로그인", en: "Server-side OAuth login" },
    summary: {
      ko: "브라우저에 secret이나 장기 토큰을 남기지 않고 공급자 계정과 제품 세션을 분리합니다.",
      en: "Separate provider identity from the product session without browser secrets or long-lived tokens.",
    },
    outcome: { ko: "Google·Kakao·Naver·GitHub 어댑터를 같은 계약으로 운영", en: "Operate Google, Kakao, Naver and GitHub adapters under one contract" },
    steps: [
      { ko: "공급자 콘솔에서 앱과 정확한 callback URI를 등록합니다.", en: "Register the app and exact callback URI with each provider." },
      { ko: "서버에서 state, PKCE verifier와 짧은 로그인 시도를 생성합니다.", en: "Create state, PKCE verifier and a short-lived login attempt on the server." },
      { ko: "callback에서 state와 code를 검증한 뒤 최소 프로필만 읽습니다.", en: "Validate state and code at callback, then read only the minimal profile." },
      { ko: "공급자 토큰과 분리된 HttpOnly 제품 세션을 발급합니다.", en: "Issue an HttpOnly product session separate from provider tokens." },
      { ko: "연결 해제, 탈퇴와 계정 병합 테스트를 추가합니다.", en: "Add unlinking, deletion and account-linking tests." },
    ],
    checklist: [
      { ko: "client secret이 웹 번들에 없음", en: "No client secret in the web bundle" },
      { ko: "최소 scope와 callback allowlist", en: "Minimal scopes and callback allowlist" },
      { ko: "실패 callback과 중복 계정 처리", en: "Failure callbacks and duplicate-account handling" },
    ],
    code: "GET /auth/:provider/start\nGET /auth/:provider/callback\nPOST /auth/session/logout\nDELETE /auth/connections/:provider",
  },
  {
    id: "cloud-storage",
    status: "configured",
    title: { ko: "개인 클라우드 백업", en: "Personal cloud backup" },
    summary: {
      ko: "서비스 서버가 원고를 영구 소유하지 않고 사용자가 선택한 앱 폴더로 명시적으로 백업합니다.",
      en: "Back up explicitly to a user-selected app folder without making the service server the permanent document owner.",
    },
    outcome: { ko: "Google Drive·Dropbox·OneDrive 최소 권한 연결", en: "Minimal-access Google Drive, Dropbox and OneDrive connections" },
    steps: [
      { ko: "로컬 원본, 메타데이터와 백업 archive 형식을 분리합니다.", en: "Separate local source, metadata and backup archive formats." },
      { ko: "공급자별 앱 전용 폴더 권한을 우선합니다.", en: "Prefer app-folder permissions for each provider." },
      { ko: "access token은 짧게 유지하고 refresh token은 서버에서 암호화합니다.", en: "Keep access tokens short-lived and encrypt refresh tokens server-side." },
      { ko: "업로드 전 checksum과 충돌 정책을 결정합니다.", en: "Decide checksum and conflict policy before upload." },
      { ko: "권한 만료와 공급자 장애에서 로컬 작업을 보존합니다.", en: "Preserve local work when access expires or the provider fails." },
    ],
    checklist: [
      { ko: "사용자 동작 없이 자동 업로드하지 않음", en: "No upload without a user action" },
      { ko: "백업 시각과 checksum 표시", en: "Visible backup time and checksum" },
      { ko: "연결 해제 후 로컬 데이터 보존", en: "Local data survives disconnect" },
    ],
  },
  {
    id: "brush-pipeline",
    status: "experimental",
    title: { ko: "브라우저 브러시 파이프라인", en: "Browser brush pipeline" },
    summary: {
      ko: "입력, 표시와 최종 문서 commit을 분리해 빠른 피드백과 재현성을 함께 확보합니다.",
      en: "Separate input, presentation and final document commit to preserve responsiveness and reproducibility.",
    },
    outcome: { ko: "긴 획과 폴백에서도 동일한 저장 결과", en: "Equivalent saved output across long strokes and fallbacks" },
    steps: [
      { ko: "Pointer event를 시간·압력·기울기 샘플로 정규화합니다.", en: "Normalize pointer events into time, pressure and tilt samples." },
      { ko: "입력 보정과 outline 또는 tip 생성을 분리합니다.", en: "Separate input smoothing from outline or tip generation." },
      { ko: "실시간 GPU 표시와 문서 command 기록을 병렬로 수행합니다.", en: "Run realtime GPU presentation and document command recording in parallel." },
      { ko: "Canvas 또는 CPU 폴백에 같은 command를 재생합니다.", en: "Replay the same commands through Canvas or CPU fallback." },
      { ko: "긴 획 지연과 committed parity를 CI에서 검증합니다.", en: "Verify long-stroke latency and committed parity in CI." },
    ],
    checklist: [
      { ko: "단일 최종 문서 권위", en: "One final document authority" },
      { ko: "GPU 자원 해제와 메모리 예산", en: "GPU resource cleanup and memory budget" },
      { ko: "Undo·재생·export 패리티", en: "Undo, replay and export parity" },
    ],
    code: "Pointer samples → smoothing → path/tip → material → composite\n                 ↘ document command → undo/replay/export",
  },
  {
    id: "performance-budget",
    status: "live",
    title: { ko: "작업 중심 성능 예산", en: "Task-centered performance budgets" },
    summary: {
      ko: "페이지 점수보다 프로젝트 열기, 긴 획, 저장, 복구와 3D 조작 같은 실제 작업을 측정합니다.",
      en: "Measure real tasks such as opening projects, long strokes, save, recovery and 3D manipulation rather than one page score.",
    },
    outcome: { ko: "환경과 커밋이 포함된 재현 가능한 성능 보고서", en: "Reproducible performance reports with environment and commit" },
    steps: [
      { ko: "대표 프로젝트 규모와 저사양 기준 장비를 정의합니다.", en: "Define representative project size and baseline hardware." },
      { ko: "첫 로드, 조작 지연, 저장, 복구와 메모리를 각각 측정합니다.", en: "Measure first load, interaction latency, save, recovery and memory separately." },
      { ko: "경고와 실패 예산을 나누고 회귀 원인을 파일과 기능에 연결합니다.", en: "Separate warning and failure budgets and connect regressions to files and features." },
      { ko: "결과에 브라우저, 장비, 데이터와 commit SHA를 기록합니다.", en: "Record browser, device, data and commit SHA with results." },
    ],
    checklist: [
      { ko: "raw·gzip·실행 비용 분리", en: "Raw, gzip and execution cost separated" },
      { ko: "긴 작업과 메모리 누수 포함", en: "Long tasks and memory leaks included" },
      { ko: "실패 시 대체 경로 검증", en: "Fallback verified on failure" },
    ],
  },
  {
    id: "ethical-crawling",
    status: "documented",
    title: { ko: "출처 중심 데이터 수집", en: "Provenance-first data acquisition" },
    summary: {
      ko: "수집 기술보다 허용 근거, 출처, 갱신과 삭제 처리 계약을 먼저 만듭니다.",
      en: "Create permission, provenance, refresh and deletion contracts before acquisition code.",
    },
    outcome: { ko: "수동 승인 가능한 정적 카탈로그", en: "A manually approvable static catalogue" },
    steps: [
      { ko: "공식 API·오픈데이터·피드 제공 여부를 먼저 확인합니다.", en: "Check for official APIs, open data and feeds first." },
      { ko: "robots, 이용약관과 재사용 권리를 별도로 기록합니다.", en: "Record robots, terms and reuse rights separately." },
      { ko: "제한된 속도로 수집하고 원본 필드와 시각을 보존합니다.", en: "Collect at a bounded rate and preserve source fields and timestamps." },
      { ko: "정규화·중복 제거 후 diff를 사람이 승인합니다.", en: "Have a person approve the diff after normalization and deduplication." },
      { ko: "정정·삭제 요청을 공급자 레코드까지 추적합니다.", en: "Trace correction and deletion requests back to provider records." },
    ],
    checklist: [
      { ko: "로그인·CAPTCHA·유료 본문 우회 금지", en: "No login, CAPTCHA or paid-content bypass" },
      { ko: "출처와 수집 시각 공개", en: "Source and acquisition time exposed" },
      { ko: "무제한 실시간 수집 없음", en: "No unbounded realtime scraping" },
    ],
  },
  {
    id: "quality-gates",
    status: "live",
    title: { ko: "CI와 선택형 Testifly 포털", en: "CI with an optional Testifly portal" },
    summary: {
      ko: "코드 품질의 정본은 저장소 CI에 두고 Testifly는 이해관계자가 읽기 쉬운 테스트 카탈로그로만 사용합니다.",
      en: "Keep repository CI as the source of truth and use Testifly only as a stakeholder-readable test catalogue.",
    },
    outcome: { ko: "자동 품질 게이트와 수동 피드백의 명확한 역할 분리", en: "Clear roles for automated gates and manual feedback" },
    steps: [
      { ko: "타입·lint·단위·브라우저·성능·라이선스 검사를 독립 job으로 둡니다.", en: "Keep type, lint, unit, browser, performance and license checks independent." },
      { ko: "사용자 여정마다 소유 테스트와 실패 시 대응자를 기록합니다.", en: "Record an owning test and failure responder per user journey." },
      { ko: "Testifly에는 시나리오 설명과 CI 링크만 동기화합니다.", en: "Sync scenario descriptions and CI links to Testifly." },
      { ko: "외부 포털 장애가 merge 판단을 바꾸지 않게 합니다.", en: "Do not let external portal outages change merge decisions." },
    ],
    checklist: [
      { ko: "지원되지 않는 상태를 성공 처리하지 않음", en: "Unsupported states never reported as success" },
      { ko: "실제 브라우저 API 검증", en: "Real-browser API verification" },
      { ko: "CI 결과와 수동 검수 이력 연결", en: "CI results linked to manual review history" },
    ],
  },
  {
    id: "free-first-infra",
    status: "configured",
    title: { ko: "무료 우선 인프라", en: "Free-first infrastructure" },
    summary: {
      ko: "서비스 특성별로 정적, API, 실시간, 파일과 DB를 분리하고 유료 승격 조건을 사전에 정의합니다.",
      en: "Separate static, API, realtime, file and database workloads, with paid-promotion conditions defined in advance.",
    },
    outcome: { ko: "초기 비용을 낮추되 자동 유료 승격이 없는 구성", en: "Low initial cost without automatic paid promotion" },
    steps: [
      { ko: "정적 페이지와 변경이 적은 자산을 edge에 둡니다.", en: "Place static pages and immutable assets at the edge." },
      { ko: "동적 API는 scale-to-zero와 cold start를 허용할 범위를 정합니다.", en: "Define where scale-to-zero and cold starts are acceptable for APIs." },
      { ko: "대형 불변 파일과 실시간 상태를 별도 저장소에 둡니다.", en: "Keep large immutable files and realtime state in separate stores." },
      { ko: "DB는 원장 데이터만 보관하고 대형 binary를 분리합니다.", en: "Use the database for ledger data, not large binaries." },
      { ko: "한도 도달 알림과 승인된 승격 runbook을 만듭니다.", en: "Create quota alerts and an approved promotion runbook." },
    ],
    checklist: [
      { ko: "무료 티어 한도와 cold start 공개", en: "Free-tier limits and cold starts documented" },
      { ko: "자동 결제·자동 확장 없음", en: "No automatic billing or scale-up" },
      { ko: "백업과 장애 복구 책임자 명확", en: "Clear backup and recovery ownership" },
    ],
  },
  {
    id: "ai-provider-contract",
    status: "configured",
    title: { ko: "공급자 중립 AI 계약", en: "Provider-neutral AI contract" },
    summary: {
      ko: "화면에서 모델 API를 직접 부르지 않고 작업 의도, 동의, 예산과 승인 결과를 안정적인 계약으로 유지합니다.",
      en: "Keep task intent, consent, budget and approved output stable instead of calling model APIs directly from UI.",
    },
    outcome: { ko: "공급자를 바꿔도 유지되는 제작 흐름", en: "A production flow that survives provider changes" },
    steps: [
      { ko: "작업 의도와 입력 자산 스키마를 공급자와 분리합니다.", en: "Separate task intent and input-asset schema from providers." },
      { ko: "capability registry에서 모델별 지원 기능을 확인합니다.", en: "Resolve model support through a capability registry." },
      { ko: "외부 전송과 BYOK 사용을 요청 전에 표시합니다.", en: "Disclose external transfer and BYOK before the request." },
      { ko: "모호한 오류는 자동 fallback하지 않고 사용자가 선택하게 합니다.", en: "Do not silently fallback on ambiguous errors; let the user choose." },
      { ko: "승인된 결과와 provenance만 프로젝트에 commit합니다.", en: "Commit only approved output and provenance to the project." },
    ],
    checklist: [
      { ko: "서버 전용 키와 비밀값 마스킹", en: "Server-only keys and secret masking" },
      { ko: "요청별 비용·공급자 표시", en: "Provider and cost shown per request" },
      { ko: "후보·승인·폐기 이력 보존", en: "Candidate, approval and rejection history retained" },
    ],
  },
  {
    id: "worker-isolation",
    status: "live",
    title: { ko: "Web Worker 작업 격리", en: "Web Worker task isolation" },
    summary: {
      ko: "무거운 연산을 옮기는 것보다 요청·취소·메모리·commit 권위를 먼저 정의합니다.",
      en: "Define request, cancellation, memory and commit authority before moving heavy work off-thread.",
    },
    outcome: { ko: "UI 응답성을 지키는 작업별 Worker 프로토콜", en: "Task-specific worker protocols that protect UI responsiveness" },
    steps: [
      { ko: "작업 시간, payload 크기와 DOM 의존성을 기준으로 Worker 후보를 고릅니다.", en: "Choose worker candidates by duration, payload size and DOM dependency." },
      { ko: "requestId, schema, progress, timeout, abort와 error envelope를 정의합니다.", en: "Define request IDs, schemas, progress, timeout, abort and error envelopes." },
      { ko: "대형 binary는 transferable로 넘기고 원본 소유권 전환을 명시합니다.", en: "Transfer large binaries and make ownership changes explicit." },
      { ko: "late response와 취소 후 응답을 generation fence로 버립니다.", en: "Discard late and post-cancel responses through generation fencing." },
      { ko: "cleanup 실패 시 Worker를 종료하고 clean instance를 지연 생성합니다.", en: "Terminate workers after cleanup failure and lazily create clean instances." },
    ],
    checklist: [
      { ko: "Worker가 문서 정본을 소유하지 않음", en: "Workers do not own canonical documents" },
      { ko: "payload·queue·heap 상한", en: "Payload, queue and heap bounds" },
      { ko: "timeout·abort·poisoned runtime 회귀", en: "Timeout, abort and poisoned-runtime regressions" },
    ],
    code: "UI intent → validate → transfer → Worker/WASM\n         → typed result → main-thread commit",
  },
  {
    id: "pwa-offline-update",
    status: "live",
    title: { ko: "PWA 오프라인·업데이트 정책", en: "PWA offline and update policy" },
    summary: {
      ko: "서비스워커 캐시와 작업 데이터 저장을 분리하고 버전 불일치와 reload loop를 복구합니다.",
      en: "Separate service-worker caches from work storage and recover version drift and reload loops.",
    },
    outcome: { ko: "오래된 runtime이 원고를 손상시키지 않는 설치형 웹 앱", en: "An installable web app where stale runtime code cannot damage work" },
    steps: [
      { ko: "API·HTML·해시 자산·편집 runtime을 요청 클래스로 나눕니다.", en: "Classify API, HTML, hashed assets and editor runtime requests." },
      { ko: "클래스별 network/cache 전략, TTL, byte와 entry 상한을 둡니다.", en: "Assign network/cache strategy, TTL, byte and entry limits per class." },
      { ko: "빌드 manifest에서 precache plan과 content hash를 생성합니다.", en: "Generate a precache plan and content hash from the build manifest." },
      { ko: "controllerchange를 one-shot reload로 제한합니다.", en: "Limit controllerchange to a one-shot reload." },
      { ko: "반복 실패 시 unregister·cache cleanup·온라인 복구 경로를 제공합니다.", en: "Provide unregister, cache cleanup and online recovery after repeated failure." },
    ],
    checklist: [
      { ko: "프로젝트 원본을 Cache Storage에 저장하지 않음", en: "Project sources never live in Cache Storage" },
      { ko: "저장 중 업데이트·오프라인 재시작 검증", en: "Updates during save and offline restart verified" },
      { ko: "manifest·icon·shortcut·설치 접근성", en: "Manifest, icons, shortcuts and install accessibility" },
    ],
  },
  {
    id: "blender-mcp",
    status: "configured",
    title: { ko: "Blender MCP 안전한 제작 자동화", en: "Safe Blender MCP production automation" },
    summary: {
      ko: "LLM에 임의 Python을 주지 않고 결과 중심 allowlist 명령과 검증 receipt를 제공합니다.",
      en: "Expose outcome-oriented allowlisted commands and verification receipts instead of arbitrary Python." },
    outcome: { ko: "재현 가능한 캐릭터·3D asset authoring pipeline", en: "A reproducible character and 3D asset authoring pipeline" },
    steps: [
      { ko: "브라우저 문서와 DCC 출력의 권위를 분리합니다.", en: "Separate browser document authority from DCC output." },
      { ko: "inspect, build, validate, render, export 같은 제한된 명령을 정의합니다.", en: "Define bounded commands such as inspect, build, validate, render and export." },
      { ko: "경로·payload·operator를 allowlist하고 shell·network를 차단합니다.", en: "Allowlist paths, payloads and operators while blocking shell and network access." },
      { ko: "headless Blender에서 같은 pipeline을 재현합니다.", en: "Reproduce the same pipeline in headless Blender." },
      { ko: "digest·quality score·도구 버전이 포함된 package receipt를 검증합니다.", en: "Verify package receipts containing digests, quality scores and tool versions." },
    ],
    checklist: [
      { ko: "eval·exec·임의 operator 없음", en: "No eval, exec or arbitrary operators" },
      { ko: "출력은 검증 후 사용자 승인", en: "Outputs require verification and user approval" },
      { ko: "실제 Blender CI와 package preflight", en: "Real-Blender CI and package preflight" },
    ],
    code: "MCP tool → typed Blender command → headless pipeline\n         → GLB/VRM + review images + SHA-256 receipt",
  },
  {
    id: "multi-engine-3d",
    status: "experimental",
    title: { ko: "문서 권위 중심 멀티 3D 엔진", en: "Document-authority-first multi-engine 3D" },
    summary: {
      ko: "Three를 주 runtime으로 두고 Babylon·CAD·physics kernel은 명시적 specialist로 지연 활성화합니다.",
      en: "Use Three as the primary runtime and activate Babylon, CAD and physics kernels as explicit specialists." },
    outcome: { ko: "엔진을 바꿔도 저장·undo·출력이 흔들리지 않는 장면", en: "Scenes whose save, undo and output survive engine changes" },
    steps: [
      { ko: "제품이 소유할 engine-neutral scene schema를 먼저 정의합니다.", en: "Define an engine-neutral product-owned scene schema first." },
      { ko: "primary renderer와 specialist별 capability·입출력·dispose를 기록합니다.", en: "Record capability, I/O and disposal for the primary renderer and each specialist." },
      { ko: "specialist는 사용자 명시 동작에서만 동적 import합니다.", en: "Dynamically import specialists only after explicit user action." },
      { ko: "beauty·depth·normal·stable ID를 renderer-neutral artifact로 반환합니다.", en: "Return beauty, depth, normal and stable IDs as renderer-neutral artifacts." },
      { ko: "device loss, context loss, import 증폭과 long-session memory를 검증합니다.", en: "Verify device/context loss, import amplification and long-session memory." },
    ],
    checklist: [
      { ko: "엔진 객체를 문서에 직렬화하지 않음", en: "Engine objects are never serialized into documents" },
      { ko: "명시적 backend 선택과 실패 표시", en: "Explicit backend selection and visible failure" },
      { ko: "GPU 자원 ref-count·dispose·soak gate", en: "GPU ref-count, disposal and soak gates" },
    ],
  },
  {
    id: "open-api-provenance",
    status: "live",
    title: { ko: "권리·출처 중심 Open API adapter", en: "Rights- and provenance-first Open API adapters" },
    summary: {
      ko: "외부 응답을 신뢰하지 않고 제공처별 schema·rights·host·rate·cache 계약 뒤에서 정규화합니다.",
      en: "Normalize untrusted upstream responses behind provider-specific schema, rights, host, rate and cache contracts." },
    outcome: { ko: "출처와 실패가 보이는 재사용 가능한 외부 데이터 연결", en: "Reusable external-data integration with visible provenance and failures" },
    steps: [
      { ko: "공식 API, exact host와 지원 endpoint를 먼저 고정합니다.", en: "Pin official APIs, exact hosts and supported endpoints first." },
      { ko: "응답 schema와 공개 도메인·CC0 predicate를 공급자별로 정의합니다.", en: "Define response schemas and public-domain/CC0 predicates per provider." },
      { ko: "내부 provider-neutral model에 출처·credit·license·fetchedAt을 보존합니다.", en: "Preserve source, credit, license and fetchedAt in a provider-neutral model." },
      { ko: "429·timeout·schema drift와 부분 실패를 명시적으로 전달합니다.", en: "Expose 429, timeout, schema drift and partial failure explicitly." },
      { ko: "원문 삭제·권리 변경 시 캐시와 카탈로그를 추적해 갱신합니다.", en: "Trace cached/catalogued items back to source for deletion or rights changes." },
    ],
    checklist: [
      { ko: "공개 API와 재배포 권리를 구분", en: "Public API access separated from redistribution rights" },
      { ko: "unsafe URL·image host·malformed payload 차단", en: "Unsafe URLs, image hosts and malformed payloads blocked" },
      { ko: "빈 성공으로 장애를 숨기지 않음", en: "Outages never hidden as empty success" },
    ],
  },
] as const satisfies readonly EngineeringGuide[];

export const ENGINEERING_LICENSE_GROUPS = [
  {
    id: "permissive",
    title: { ko: "MIT · BSD · ISC", en: "MIT · BSD · ISC" },
    examples: ["React ecosystem", "utility libraries", "many UI packages"],
    obligation: { ko: "저작권과 라이선스 고지를 배포물에 보존합니다.", en: "Preserve copyright and license notices in distribution." },
    caution: { ko: "코드 라이선스와 포함된 폰트·이미지의 권리는 별도 확인합니다.", en: "Review bundled fonts and images separately from code licensing." },
  },
  {
    id: "apache",
    title: { ko: "Apache-2.0", en: "Apache-2.0" },
    examples: ["infrastructure clients", "graphics and data tooling"],
    obligation: { ko: "LICENSE와 NOTICE, 변경 고지와 특허 조항을 검토합니다.", en: "Review LICENSE, NOTICE, modification notices and patent terms." },
    caution: { ko: "상표 사용 권한은 자동으로 부여되지 않습니다.", en: "Trademark permission is not automatically granted." },
  },
  {
    id: "weak-copyleft",
    title: { ko: "MPL-2.0 · LGPL", en: "MPL-2.0 · LGPL" },
    examples: ["file-level copyleft", "dynamically linked libraries"],
    obligation: { ko: "수정 파일 또는 재링크 가능한 배포 의무를 구조와 함께 검토합니다.", en: "Review modified-file or relinkable-distribution obligations with architecture." },
    caution: { ko: "WASM 번들과 정적 링크는 배포 방식에 따라 판단이 달라질 수 있습니다.", en: "WASM bundles and static linking may change the distribution analysis." },
  },
  {
    id: "strong-copyleft",
    title: { ko: "GPL · AGPL", en: "GPL · AGPL" },
    examples: ["strong copyleft tools", "network-copyleft services"],
    obligation: { ko: "결합 저작물과 네트워크 제공 의무를 배포 전에 검토합니다.", en: "Review combined-work and network-use source obligations before distribution." },
    caution: { ko: "프로덕션 번들 도입은 법률·구조 검토 없이 진행하지 않습니다.", en: "Do not add to production bundles without legal and architectural review." },
  },
  {
    id: "creative-assets",
    title: { ko: "Creative Commons · OFL · 상용 에셋", en: "Creative Commons · OFL · commercial assets" },
    examples: ["fonts", "brush presets", "images", "3D models", "sound"],
    obligation: { ko: "저작자 표시, 변경, 재배포와 상업 이용 범위를 자산별로 보존합니다.", en: "Retain attribution, modification, redistribution and commercial-use scope per asset." },
    caution: { ko: "동일한 이름의 라이선스라도 버전과 추가 약관을 확인합니다.", en: "Check license version and additional terms even when names match." },
  },
  {
    id: "ai-terms",
    title: { ko: "AI 모델 · API · 생성 결과", en: "AI models · APIs · generated output" },
    examples: ["model weights", "hosted APIs", "training references", "generated media"],
    obligation: { ko: "모델, 서비스 약관, 입력 권리와 출력 사용 범위를 각각 기록합니다.", en: "Record model, service terms, input rights and output usage scope separately." },
    caution: { ko: "오픈소스 코드 라이선스만으로 모델이나 결과의 권리를 판단하지 않습니다.", en: "Do not infer model or output rights from the surrounding code license." },
  },
] as const satisfies readonly EngineeringLicenseGroup[];

export const ENGINEERING_VIDEO_FORMATS = [
  {
    id: "overview",
    duration: "90s",
    title: { ko: "전체 기술 개요", en: "Engineering overview" },
    purpose: { ko: "사이트 방문자와 세미나 오프닝", en: "Site visitors and seminar opening" },
    composition: "TechnologyStoryLandscape",
  },
  {
    id: "investor",
    duration: "45s",
    title: { ko: "투자자 핵심 요약", en: "Investor summary" },
    purpose: { ko: "문제·기술 방어력·확장성", en: "Problem, technical defensibility and scale" },
    composition: "TechnologyStoryInvestor",
  },
  {
    id: "portrait",
    duration: "60s",
    title: { ko: "세로형 기술 소개", en: "Portrait engineering story" },
    purpose: { ko: "지원서·SNS·행사 디스플레이", en: "Applications, social and event displays" },
    composition: "TechnologyStoryPortrait",
  },
] as const;

export const localize = <T extends LocalizedText>(copy: T, locale: EngineeringLocale): string => copy[locale];
