import type {
  EngineeringChapter,
  EngineeringEvidence,
  EngineeringEvidenceKind,
  EngineeringGuide,
} from "./engineering-story-content";

const evidence = (
  kind: EngineeringEvidenceKind,
  path: string,
  ko: string,
  en: string,
): EngineeringEvidence => ({ kind, path, label: { ko, en } });

/**
 * Product-facing chapters that close the gap between a feature list and the operating boundaries
 * required to reuse ToonStudio engineering patterns in another product.
 */
export const ENGINEERING_ADVANCED_CHAPTERS = [
  {
    id: "social-identity-lifecycle",
    order: 26,
    status: "configured",
    eyebrow: "26 · SOCIAL IDENTITY LIFECYCLE",
    title: {
      ko: "소셜 로그인은 버튼이 아니라 계정 생애주기입니다",
      en: "Social login is an account lifecycle, not a row of buttons",
    },
    thesis: {
      ko: "공급자 인증, ToonSpectrum 세션, 계정 연결·해제와 탈퇴를 분리해 한 공급자의 장애나 정책 변경이 제품 계정 전체를 소유하지 않게 합니다.",
      en: "Provider authentication, the ToonSpectrum session, account linking, unlinking and deletion stay separate so one provider never owns the whole product account.",
    },
    problem: {
      ko: "인가 코드 성공만 구현하면 중복 callback, state 재사용, 검증되지 않은 이메일 병합, 공급자 연결 해제와 탈퇴 웹훅에서 계정 일관성이 깨집니다.",
      en: "Implementing only the happy authorization-code path leaves duplicate callbacks, state reuse, unverified email merges, provider unlinking and deletion webhooks inconsistent.",
    },
    decision: {
      ko: "공급자별 redirect와 최소 scope를 고정하고 state·PKCE·nonce를 서버에서 검증한 뒤 HttpOnly 자체 세션을 발급합니다. provider subject를 정본으로 삼고 계정 병합은 명시적 재인증 흐름으로 제한합니다.",
      en: "Provider redirects and minimal scopes are fixed, state, PKCE and nonce are verified server-side, and only then is a first-party HttpOnly session issued. Provider subjects remain authoritative and account merges require explicit reauthentication.",
    },
    userValue: {
      ko: "사용자는 어떤 계정이 연결됐는지, 무엇을 해제하면 어떤 세션이 종료되는지, 마지막 로그인 수단을 제거하면 어떻게 되는지 예측할 수 있습니다.",
      en: "Users can predict which accounts are connected, which sessions end after unlinking and what happens when the final login method is removed.",
    },
    tradeoff: {
      ko: "공급자 콘솔, 검수, secret 회전, unlink webhook과 장애 대응을 지속 운영해야 하며 모든 공급자를 한 번에 노출하면 선택 피로와 개인정보 범위가 커집니다.",
      en: "Provider consoles, review, secret rotation, unlink webhooks and incident response require ongoing operations; exposing every provider at once increases choice fatigue and data scope.",
    },
    technologies: ["OAuth 2.0", "OpenID Connect", "PKCE S256", "nonce", "HttpOnly", "SameSite", "unlink webhook"],
    evidence: [
      evidence("document", "docs/social-login-provider-setup.md", "공급자 신청·scope·운영 절차", "Provider registration, scopes and operations"),
      evidence("code", "apps/api/src/modules/auth", "서버 callback과 제품 세션 경계", "Server callbacks and product-session boundary"),
      evidence("code", "apps/web/src/domains/auth", "공급자 상태와 오류를 드러내는 로그인 UI", "Login UI exposing provider status and failures"),
      evidence("test", "scripts/verify-social-login-production.test.mjs", "운영 소셜 로그인 검증 계약", "Production social-login verification contract"),
    ],
    reuseSteps: [
      { ko: "로그인 성공보다 먼저 provider subject, 제품 user ID와 session ID의 소유권을 구분합니다.", en: "Separate ownership of provider subject, product user ID and session ID before implementing the happy path." },
      { ko: "공급자별 redirect, scope, state·PKCE·nonce와 callback 중복 처리 규칙을 표로 고정합니다.", en: "Freeze provider redirects, scopes, state, PKCE, nonce and duplicate-callback rules in one matrix." },
      { ko: "검증 이메일 자동 병합, 명시적 재인증 연결, unlink와 마지막 로그인 수단 제거를 각각 테스트합니다.", en: "Test verified-email merging, explicit reauthenticated linking, unlinking and removal of the final login method separately." },
      { ko: "운영 secret은 브라우저·문서·VITE 환경변수와 분리하고 회전·철회 runbook을 둡니다.", en: "Keep operating secrets out of browser bundles, documents and VITE variables, with rotation and revocation runbooks." },
    ],
  },
  {
    id: "share-distribution-boundary",
    order: 27,
    status: "live",
    eyebrow: "27 · SHARE & DISTRIBUTION",
    title: {
      ko: "공유는 버튼 하나가 아니라 유입·미리보기·개인정보 계약입니다",
      en: "Sharing is an acquisition, preview and privacy contract—not one button",
    },
    thesis: {
      ko: "기기 공유, 채널별 URL, 링크 복사, QR과 Open Graph를 하나의 공유 payload에서 만들되 각 채널 실패가 다른 공유 경로를 막지 않게 합니다.",
      en: "Native sharing, channel URLs, copy, QR and Open Graph derive from one share payload while each channel fails independently.",
    },
    problem: {
      ko: "플랫폼별 URL을 화면마다 직접 만들면 canonical URL·UTM·제목·표지 정보가 어긋나고, 모바일 취소를 오류로 표시하거나 analytics에 민감한 전체 URL을 보내기 쉽습니다.",
      en: "Hand-building platform URLs in each screen drifts canonical URL, UTM, title and cover data, while mobile cancellation may look like an error and analytics may leak sensitive full URLs.",
    },
    decision: {
      ko: "정규화된 share payload와 capability detection을 두고 Web Share API를 우선 사용합니다. 카카오 SDK는 필요할 때 SRI로 로드하고 나머지는 공식 share URL·Clipboard·QR fallback으로 분리합니다.",
      en: "A normalized share payload and capability detection prefer the Web Share API. The Kakao SDK is lazily loaded with SRI, while official share URLs, Clipboard and QR remain independent fallbacks.",
    },
    userValue: {
      ko: "사용자는 설치 앱과 브라우저 환경에 맞는 공유 방식을 선택하고 취소해도 작업 흐름을 잃지 않으며, 공유된 작품은 일관된 미리보기로 열립니다.",
      en: "Users can choose the sharing path suited to their device, cancel without losing context and open shared work with a consistent preview.",
    },
    tradeoff: {
      ko: "Web Share와 Clipboard 지원 범위가 다르고 카카오 도메인 등록·CSP가 필요합니다. 공유 완료 이벤트는 실제 수신·열람을 보장하지 않으므로 전환과 동일하게 해석하지 않습니다.",
      en: "Web Share and Clipboard support differ and Kakao requires domain registration and CSP. A completed share action does not prove receipt or viewing and must not be treated as conversion.",
    },
    technologies: ["Web Share API", "Clipboard API", "Open Graph", "Kakao SDK", "QR", "UTM", "CSP", "SRI"],
    evidence: [
      evidence("code", "apps/web/src/shared/lib/share.ts", "채널 중립 공유 payload와 fallback", "Channel-neutral share payload and fallbacks"),
      evidence("test", "apps/web/src/shared/lib/__tests__/share.test.ts", "URL·UTM·취소·fallback 회귀 검사", "URL, UTM, cancellation and fallback regression tests"),
      evidence("test", "apps/web/src/shared/lib/__tests__/kakao-share.test.ts", "지연 로드 카카오 공유 검사", "Lazy Kakao-sharing tests"),
      evidence("document", "docs/social-sharing.md", "공유 채널·보안·배포 점검", "Share channels, security and release checks"),
    ],
    reuseSteps: [
      { ko: "화면별 문자열 대신 canonical URL, title, text, image와 content ID를 가진 payload를 정의합니다.", en: "Define a payload containing canonical URL, title, text, image and content ID instead of screen-specific strings." },
      { ko: "native share, 공식 URL, copy와 QR을 capability와 실패 유형별 독립 adapter로 만듭니다.", en: "Build native share, official URLs, copy and QR as independent adapters by capability and failure type." },
      { ko: "UTM은 기존 query와 hash를 보존하고 내부 이벤트에는 channel·result·route만 기록합니다.", en: "Preserve existing query and hash when adding UTM, and record only channel, result and route internally." },
      { ko: "실제 crawler user agent로 canonical·OG image·description을 검증하고 모바일 취소를 정상 상태로 처리합니다.", en: "Validate canonical and Open Graph data with real crawler user agents and treat mobile cancellation as a normal outcome." },
    ],
  },
  {
    id: "collaborative-crdt-boundary",
    order: 28,
    status: "experimental",
    eyebrow: "28 · COLLABORATIVE CRDT",
    title: {
      ko: "CRDT에는 협업 의미를, 대형 결과물에는 별도 저장 권위를",
      en: "CRDT owns collaborative meaning; large artifacts keep separate authority",
    },
    thesis: {
      ko: "Yjs는 레이어·벡터·스타일러스 의미 연산과 순서를 수렴시키고, 래스터 타일·PSD·GLB 같은 대형 바이너리는 해시와 receipt로 참조합니다.",
      en: "Yjs converges layer, vector and stylus semantic operations, while large raster tiles, PSD and GLB artifacts are referenced through hashes and receipts.",
    },
    problem: {
      ko: "캔버스 픽셀이나 큰 파일을 그대로 CRDT update에 넣으면 room 메모리, sync 지연과 compaction 비용이 폭증하고, undo·삭제·재접속 의미가 데이터 구조에 묻힙니다.",
      en: "Putting canvas pixels or large files directly in CRDT updates explodes room memory, sync latency and compaction cost while burying undo, deletion and reconnect semantics inside raw data.",
    },
    decision: {
      ko: "버전된 semantic operation과 bounded binary envelope를 사용하고 room authority, durable receipt와 asset storage를 분리합니다. 래스터는 immutable log와 Worker checkpoint로 재생·복구합니다.",
      en: "Versioned semantic operations and bounded binary envelopes separate room authority, durable receipts and asset storage. Raster work replays and recovers through an immutable log and Worker checkpoints.",
    },
    userValue: {
      ko: "오프라인·재접속·동시 편집에서도 레이어와 획의 의도가 수렴하고, 대형 원본 때문에 전체 협업 세션이 멈추지 않습니다.",
      en: "Layer and stroke intent converges across offline work, reconnects and concurrent edits without a large source asset stalling the whole session.",
    },
    tradeoff: {
      ko: "CRDT가 권한·저장·미디어 전송을 자동 해결하지 않습니다. schema migration, tombstone·삭제 승인, snapshot compaction과 room resource limit을 별도로 운영해야 합니다.",
      en: "CRDT does not automatically solve authorization, persistence or media transport. Schema migration, deletion acknowledgement, snapshot compaction and room resource limits remain explicit operations.",
    },
    technologies: ["Yjs", "CRDT", "Socket.IO", "binary envelope", "state vector", "Worker checkpoint", "PostgreSQL receipt"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/live/studio-crdt-document.ts", "Yjs 문서와 semantic operation 권위", "Yjs document and semantic-operation authority"),
      evidence("code", "apps/web/src/domains/creator/contracts/studio-crdt-binary-envelope.ts", "bounded binary transport envelope", "Bounded binary transport envelope"),
      evidence("test", "apps/web/src/domains/creator/live/studio-crdt-raster-worker-client.test.ts", "래스터 checkpoint Worker 검사", "Raster-checkpoint Worker tests"),
      evidence("document", "docs/studio-crdt-webgpu-architecture-2026-07-16.md", "CRDT·WebGPU·저장 권위 설계", "CRDT, WebGPU and storage-authority design"),
    ],
    reuseSteps: [
      { ko: "먼저 동시에 수정 가능한 의미 단위를 문장으로 정의하고 CRDT shared type을 그 뒤에 고릅니다.", en: "Describe the concurrently editable semantic units first, then choose CRDT shared types." },
      { ko: "문서 의미, room transport, durable receipt와 binary asset store에 각각 하나의 권위를 둡니다.", en: "Assign one authority each to document meaning, room transport, durable receipts and binary asset storage." },
      { ko: "update·awareness·asset 크기, room 인원, replay와 compaction 예산을 제한합니다.", en: "Bound update, awareness and asset sizes, room population, replay and compaction budgets." },
      { ko: "순서가 다른 update, offline fork, schema 구버전, 삭제와 늦은 재접속을 수렴 테스트로 고정합니다.", en: "Lock down convergence for reordered updates, offline forks, old schemas, deletion and late reconnects." },
    ],
  },
  {
    id: "brush-render-authority",
    order: 29,
    status: "experimental",
    eyebrow: "29 · BRUSH RENDER AUTHORITY",
    title: {
      ko: "보이는 획과 저장되는 획이 같은 계약을 따르게 만들기",
      en: "Making the visible stroke and the stored stroke obey one contract",
    },
    thesis: {
      ko: "포인터 입력, 예측 미리보기, 재료 simulation, 합성, 타일 commit과 history 기록을 분리하되 동일한 stroke identity와 renderer role을 유지합니다.",
      en: "Pointer input, predicted preview, media simulation, compositing, tile commit and history remain separate while sharing stroke identity and renderer roles.",
    },
    problem: {
      ko: "미리보기 엔진과 저장 엔진이 암묵적으로 갈라지면 빠르게 보인 선이 pointer-up 뒤 달라지고, undo·재생·공동 편집·내보내기에서 같은 획을 복원하지 못합니다.",
      en: "When preview and document engines diverge implicitly, a fast line changes after pointer-up and cannot be reproduced by undo, replay, collaboration or export.",
    },
    decision: {
      ko: "renderer registry에 preview·live·commit·export 역할과 document authority를 선언하고, normalized samples·brush revision·seed·material parameters를 commit receipt로 남깁니다. Worker와 GPU backend는 이 계약 뒤에서 교체합니다.",
      en: "The renderer registry declares preview, live, commit and export roles plus document authority. Normalized samples, brush revision, seed and material parameters form the commit receipt while Worker and GPU backends remain replaceable behind it.",
    },
    userValue: {
      ko: "획은 즉시 반응하면서도 저장·Undo·재생·내보내기에서 형태와 재료 특성이 유지되고, 저사양 기기에서는 안전한 backend로 낮출 수 있습니다.",
      en: "Strokes respond immediately yet preserve shape and media behavior through save, undo, replay and export, with a safe backend available on constrained devices.",
    },
    tradeoff: {
      ko: "완전한 픽셀 동일성과 지각 품질은 다른 목표입니다. GPU·WASM·Canvas 경로마다 결정성, 색공간, precision과 긴 획 메모리 예산을 따로 측정해야 합니다.",
      en: "Exact pixel identity and perceptual quality are different goals. Determinism, color space, precision and long-stroke memory budgets must be measured per GPU, WASM and Canvas path.",
    },
    technologies: ["Pointer Events", "prediction", "WebGPU", "CanvasKit", "Rust/WASM", "OffscreenCanvas", "tile commit", "renderer registry"],
    evidence: [
      evidence("code", "packages/studio-engine-registry/src/renderer-roles.ts", "renderer 역할과 문서 권위 registry", "Renderer roles and document-authority registry"),
      evidence("code", "apps/web/src/domains/creator/brush-lab/brush-studio-v5-runtime-types.ts", "preview·live·commit·export phase 계약", "Preview, live, commit and export phase contract"),
      evidence("test", "scripts/verify-studio-gpu-committed-parity.mts", "GPU 표시와 committed 결과 패리티", "GPU display-to-commit parity"),
      evidence("document", "docs/engines/native-brush-benchmark-optimization-2026-09-19.md", "브러시 benchmark와 최적화 근거", "Brush benchmark and optimization evidence"),
    ],
    reuseSteps: [
      { ko: "포인터 sample schema와 좌표·압력·tilt·time 보정 위치를 먼저 고정합니다.", en: "Freeze the pointer-sample schema and where coordinate, pressure, tilt and time normalization occurs." },
      { ko: "preview, live simulation, document commit, history와 export의 입출력·권위를 표로 만듭니다.", en: "Map inputs, outputs and authority for preview, live simulation, document commit, history and export." },
      { ko: "짧은 선뿐 아니라 긴 획, 빠른 방향 전환, 저속 압력 변화와 device loss를 검증합니다.", en: "Verify long strokes, rapid turns, slow pressure changes and device loss—not only short lines." },
      { ko: "fallback이 켜져도 문서 receipt와 재생 의미가 바뀌지 않게 하고 품질 차이는 사용자에게 설명합니다.", en: "Keep document receipts and replay meaning stable across fallbacks and explain quality differences to users." },
    ],
  },
  {
    id: "webrtc-media-authority",
    order: 30,
    status: "experimental",
    eyebrow: "30 · WEBRTC MEDIA AUTHORITY",
    title: {
      ko: "문서 협업과 실시간 미디어를 서로 다른 권위로 운영하기",
      en: "Operating document collaboration and realtime media as separate authorities",
    },
    thesis: {
      ko: "Socket.IO는 참가 승인과 시그널링을, RTCDataChannel은 직접 제어 메시지를, RTP는 음성·영상·화면 공유를 맡고 프로젝트 문서와 미디어 수신자 권위는 서로 섞지 않습니다.",
      en: "Socket.IO owns admission and signaling, RTCDataChannel direct control messages and RTP voice, video and screen media, without mixing document or recipient authority.",
    },
    problem: {
      ko: "시그널링 서버, STUN·TURN, 문서 동기화와 실제 미디어 경로를 하나의 ‘실시간 연결’로 취급하면 거리 UI와 실제 수신자가 어긋나고 권한 취소·네트워크 변경·늦은 SDP가 개인정보와 자원 누수로 이어집니다.",
      en: "Treating signaling, STUN or TURN, document sync and media routes as one realtime connection lets spatial UI drift from actual recipients and turns revoked authority, network changes and late SDP into privacy and resource leaks.",
    },
    decision: {
      ko: "room membership과 immutable conversation scope로 peer를 제한하고, 권한 프롬프트 뒤 revision을 다시 확인한 다음에만 track을 연결합니다. perfect negotiation, bounded ICE queue, restartIce, short-lived TURN policy refresh와 명시적 track·peer teardown을 각각 운영합니다.",
      en: "Room membership and immutable conversation scope bound peers, and authority revision is rechecked after every permission prompt before tracks attach. Perfect negotiation, bounded ICE queues, restartIce, short-lived TURN refresh and explicit track and peer teardown remain separate controls.",
    },
    userValue: {
      ko: "사용자는 누가 실제 음성·영상·화면을 받는지 확인하고 권한 요청 전에도 공간을 탐색할 수 있으며, 네트워크가 바뀌거나 방을 나가면 연결과 장치가 예측 가능하게 복구·종료됩니다.",
      en: "Users can see actual media recipients, explore before granting device access and rely on predictable recovery or teardown when networks change or they leave a room.",
    },
    tradeoff: {
      ko: "현재 소규모 P2P huddle은 원격 peer를 세 명으로 제한하고 STUN-only 경로가 있으며, 실제 검증 일부는 단일 Chromium loopback입니다. WAN·제한 NAT·물리 장치·대규모 방송은 TURN과 SFU를 포함한 별도 증거가 필요합니다.",
      en: "The small P2P huddle caps remote peers at three and includes a STUN-only path, while some evidence uses one Chromium loopback. WAN, restrictive NAT, physical devices and large broadcast require separate TURN and SFU evidence.",
    },
    technologies: ["WebRTC", "RTCPeerConnection", "RTCDataChannel", "ICE", "STUN/TURN", "getUserMedia", "getDisplayMedia", "Socket.IO signaling"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts", "P2P 협상·미디어·ICE 복구 controller", "P2P negotiation, media and ICE recovery controller"),
      evidence("code", "apps/web/src/domains/creator/studio-screen-share.ts", "양방향 동의형 화면 공유", "Two-sided-consent screen sharing"),
      evidence("code", "apps/web/src/domains/creator/studio-voice-ice-policy.ts", "단기 TURN 정책과 기존 peer 갱신", "Short-lived TURN policy and existing-peer refresh"),
      evidence("document", "docs/studio-p2p-huddle.md", "시그널링·데이터·미디어 권위 경계", "Signaling, data and media authority boundary"),
      evidence("document", "docs/studio/virtual-studio-completion-acceptance-20260920.md", "실제 브라우저 수신자·media edge 검증", "Real-browser recipient and media-edge evidence"),
      evidence("document", "docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md", "WebRTC 권위·복구·벤치마크 정리", "WebRTC authority, recovery and benchmark review"),
    ],
    reuseSteps: [
      { ko: "identity, admission, recipient, signaling, direct data, media와 durable document 권위를 한 표에서 분리합니다.", en: "Separate identity, admission, recipients, signaling, direct data, media and durable-document authority in one matrix." },
      { ko: "마이크·카메라·화면 권한은 사용자 동작 뒤 요청하고 응답 시 session generation과 권한 revision을 다시 확인합니다.", en: "Request microphone, camera and screen access after user intent, then recheck session generation and authority revision on response." },
      { ko: "SDP·ICE 크기와 queue, peer 수, rate, reconnect 횟수, TURN TTL과 teardown을 제한합니다.", en: "Bound SDP and ICE size and queues, peer count, rate, reconnect attempts, TURN TTL and teardown." },
      { ko: "loopback, 실제 장치, 서로 다른 NAT, TURN relay와 대규모 SFU를 서로 다른 검증 단계로 기록합니다.", en: "Record loopback, physical devices, distinct NATs, TURN relay and large-scale SFU as separate evidence stages." },
    ],
  },
  {
    id: "virtual-studio-world-authority",
    order: 31,
    status: "experimental",
    eyebrow: "31 · VIRTUAL STUDIO WORLD",
    title: {
      ko: "가상 공간을 장식이 아니라 제작 상태의 또 다른 투영으로",
      en: "Treating the virtual world as another projection of production state",
    },
    thesis: {
      ko: "아바타·방·책상·보드와 대화는 공간 UI를 제공하지만 프로젝트, 권한, 작업 상태와 미디어 수신자는 기존 도메인 계약이 계속 소유합니다.",
      en: "Avatars, rooms, desks, boards and conversation provide a spatial UI while existing domain contracts keep authority over projects, permissions, work state and media recipients.",
    },
    problem: {
      ko: "Phaser scene 내부에 업무 규칙·협업 상태·미디어 권한까지 넣으면 목록 화면과 공간 화면이 서로 다른 진실을 만들고, 대형 component와 네트워크 결합이 함께 커집니다.",
      en: "Putting work rules, collaboration state and media permissions inside a Phaser scene creates conflicting truths between list and spatial views while coupling a giant component to networking.",
    },
    decision: {
      ko: "world manifest와 compiler, 순수 actor·interaction·conversation policy, 명시적 live/huddle adapter를 분리합니다. 공간 object는 승인된 action registry를 호출하고 프로젝트 graph·권한 원장을 다시 구현하지 않습니다.",
      en: "World manifests and compilation, pure actor, interaction and conversation policies, and explicit live/huddle adapters remain separate. Spatial objects call an allowlisted action registry rather than reimplementing project graphs or permission ledgers.",
    },
    userValue: {
      ko: "사용자는 같은 프로젝트를 공간·목록 중 익숙한 방식으로 탐색하고, 사람·방·도구를 찾으며, 제작 활동이 보이는 살아 있는 작업실을 사용할 수 있습니다.",
      en: "Users can navigate the same project through spatial or list views, find people, rooms and tools, and work inside a studio where production activity is visible.",
    },
    tradeoff: {
      ko: "공간 메타포는 발견성을 높이지만 이동·시각·멀미·저사양 접근 장벽도 만듭니다. keyboard·reduced motion·목록 대체 경로와 명시적인 media privacy를 항상 유지해야 합니다.",
      en: "Spatial metaphors improve discovery but add mobility, vision, motion and low-end device barriers. Keyboard, reduced-motion and list alternatives plus explicit media privacy must always remain available.",
    },
    technologies: ["Phaser", "world manifest", "action registry", "Socket.IO", "WebRTC adapter", "project graph", "reduced motion"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePage.tsx", "공간 화면과 도구·social adapter 조립", "Spatial page and tool/social adapter composition"),
      evidence("code", "apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-manifest.ts", "버전된 world manifest", "Versioned world manifest"),
      evidence("document", "docs/studio/virtual-studio-living-world-design-20260920.md", "Living World 모듈·권위 설계", "Living World modules and authority design"),
      evidence("document", "docs/studio/virtual-studio-benchmark-20260920.md", "Gather·WorkAdventure·Kumospace 비교", "Gather, WorkAdventure and Kumospace benchmark"),
    ],
    reuseSteps: [
      { ko: "공간에서 보일 수 있는 상태와 실제 권한·업무 원장을 먼저 분리합니다.", en: "Separate spatially visible state from real authorization and work ledgers first." },
      { ko: "world manifest, renderer, actor locomotion, interaction policy와 network adapter를 독립 module로 둡니다.", en: "Keep world manifest, renderer, actor locomotion, interaction policy and network adapter as independent modules." },
      { ko: "방·객체는 임의 script 대신 허용된 action ID와 schema-validated payload만 실행하게 합니다.", en: "Let rooms and objects invoke only allowlisted action IDs with schema-validated payloads, never arbitrary scripts." },
      { ko: "keyboard·검색·목록·reduced motion 경로와 mic·camera의 실제 수신자 표시를 수락 조건에 포함합니다.", en: "Include keyboard, search, list and reduced-motion paths plus actual microphone and camera recipient disclosure in acceptance criteria." },
    ],
  },
] as const satisfies readonly EngineeringChapter[];

export const ENGINEERING_ADVANCED_GUIDES = [
  {
    id: "social-identity-lifecycle",
    status: "configured",
    title: { ko: "소셜 로그인 생애주기 설계", en: "Social identity lifecycle" },
    summary: {
      ko: "로그인 성공뿐 아니라 callback 중복, 계정 연결, unlink와 탈퇴까지 하나의 상태 기계로 설계합니다.",
      en: "Design login success, duplicate callbacks, account linking, unlinking and deletion as one state machine.",
    },
    outcome: {
      ko: "공급자 장애·정책 변경과 제품 계정·세션을 분리한 인증 경계를 얻습니다.",
      en: "A product-account and session boundary isolated from provider outages and policy changes.",
    },
    steps: [
      { ko: "provider subject, verified contact, product user와 product session 식별자를 분리합니다.", en: "Separate provider subject, verified contact, product user and product session identifiers." },
      { ko: "공급자별 redirect, scope, response mode, PKCE·nonce·state와 cookie 정책을 표로 고정합니다.", en: "Freeze provider redirects, scopes, response modes, PKCE, nonce, state and cookie policy in a matrix." },
      { ko: "callback은 일회성 state와 provider code를 소비하고 중복 요청을 멱등 또는 명시적 오류로 닫습니다.", en: "Consume one-time state and provider codes and close duplicate callbacks idempotently or with an explicit error." },
      { ko: "계정 연결에는 기존 세션과 새 provider 모두의 재인증을 요구하고 자동 이메일 병합 범위를 제한합니다.", en: "Require reauthentication of both the current session and new provider for account linking and tightly bound email merging." },
      { ko: "unlink webhook, 마지막 로그인 수단 제거, 전체 탈퇴와 session revoke를 별도 시나리오로 검증합니다.", en: "Verify unlink webhooks, removal of the final login method, full deletion and session revocation separately." },
    ],
    checklist: [
      { ko: "client secret과 장기 token이 브라우저 번들에 없음", en: "No client secrets or long-lived tokens in browser bundles" },
      { ko: "redirect exact match·state·PKCE 또는 nonce 검증", en: "Exact redirect matching and state, PKCE or nonce verification" },
      { ko: "verified contact가 없을 때도 provider subject로 안전하게 로그인", en: "Safe provider-subject login even without a verified contact" },
      { ko: "unlink·탈퇴·secret rotation runbook 존재", en: "Unlink, deletion and secret-rotation runbooks exist" },
    ],
  },
  {
    id: "share-distribution",
    status: "live",
    title: { ko: "공유·유입·미리보기 파이프라인", en: "Share, acquisition and preview pipeline" },
    summary: {
      ko: "하나의 canonical payload에서 native share, 채널 URL, copy, QR과 Open Graph를 만듭니다.",
      en: "Derive native share, channel URLs, copy, QR and Open Graph from one canonical payload.",
    },
    outcome: {
      ko: "채널별 장애와 지원 차이를 격리하면서 일관된 링크·미리보기·측정 규칙을 유지합니다.",
      en: "Consistent links, previews and measurement rules with channel capability and failure isolated.",
    },
    steps: [
      { ko: "canonical URL, content ID, locale, title, text와 image를 가진 immutable payload를 만듭니다.", en: "Create an immutable payload containing canonical URL, content ID, locale, title, text and image." },
      { ko: "native share 가능 여부와 canShare payload를 사용자 동작 시점에 검사합니다.", en: "Check native-share support and canShare payload at the time of user activation." },
      { ko: "각 공식 share URL과 SDK adapter가 URL encoding·popup·app switch를 독립 처리하게 합니다.", en: "Let every official share URL and SDK adapter independently handle encoding, popups and app switching." },
      { ko: "Clipboard 실패에는 selection 기반 copy fallback을 두고 QR 모듈은 패널을 열 때만 로드합니다.", en: "Add a selection-based copy fallback for Clipboard failures and lazy-load QR only when the panel opens." },
      { ko: "crawler preview와 analytics를 별도 검증하고 share intent와 downstream conversion을 구분합니다.", en: "Verify crawler previews and analytics independently and separate share intent from downstream conversion." },
    ],
    checklist: [
      { ko: "canonical과 OG URL·title·description·image 일치", en: "Canonical and Open Graph URL, title, description and image agree" },
      { ko: "사용자 취소는 오류 toast나 error metric으로 기록하지 않음", en: "User cancellation is not shown as an error or recorded as an error metric" },
      { ko: "UTM 추가가 기존 query·hash를 파괴하지 않음", en: "UTM addition preserves existing query and hash" },
      { ko: "analytics에 전체 공유 URL·제목·개인정보를 보내지 않음", en: "Analytics receives no full shared URL, title or personal data" },
    ],
  },
  {
    id: "crdt-semantic-scope",
    status: "experimental",
    title: { ko: "CRDT 의미 범위와 자산 경계", en: "CRDT semantic scope and asset boundary" },
    summary: {
      ko: "협업 의미 연산만 CRDT가 소유하고 대형 결과물·권한·내구 저장은 별도 계층에 둡니다.",
      en: "Let CRDT own collaborative semantic operations while large artifacts, authorization and durable storage remain separate.",
    },
    outcome: {
      ko: "오프라인·재접속 수렴성과 room resource 예산을 함께 통제할 수 있습니다.",
      en: "Offline and reconnect convergence with controlled room resource budgets.",
    },
    steps: [
      { ko: "동시 수정 단위를 layer, object, property, ordered operation과 awareness로 분류합니다.", en: "Classify concurrent units as layers, objects, properties, ordered operations and awareness." },
      { ko: "binary asset는 content hash와 durable receipt로 참조하고 CRDT update에 원본 bytes를 넣지 않습니다.", en: "Reference binary assets through content hashes and durable receipts instead of putting source bytes in CRDT updates." },
      { ko: "schema version, migration, invalid update rejection과 update size limit을 transport보다 먼저 정의합니다.", en: "Define schema versioning, migration, invalid-update rejection and update-size limits before choosing transport." },
      { ko: "room leader/authority, persistence snapshot, compaction과 reconnect protocol을 별도 계약으로 둡니다.", en: "Keep room authority, persistence snapshots, compaction and reconnect protocols as separate contracts." },
      { ko: "재정렬·중복·offline fork·삭제·구버전 client 시나리오를 convergence test로 만듭니다.", en: "Create convergence tests for reordered, duplicate, offline-fork, deletion and old-client scenarios." },
    ],
    checklist: [
      { ko: "CRDT update·awareness·room·asset 크기 제한", en: "Limits for CRDT updates, awareness, rooms and assets" },
      { ko: "권한 검사는 CRDT merge와 별도 server boundary에서 수행", en: "Authorization enforced at a server boundary separate from CRDT merge" },
      { ko: "대형 binary와 media stream이 CRDT 문서 밖에 있음", en: "Large binaries and media streams remain outside the CRDT document" },
      { ko: "schema migration과 snapshot compaction을 실제 구버전으로 검증", en: "Schema migration and snapshot compaction verified with real old versions" },
    ],
  },
  {
    id: "brush-preview-commit",
    status: "experimental",
    title: { ko: "브러시 preview·commit 권위 분리", en: "Brush preview and commit authority" },
    summary: {
      ko: "즉시 반응하는 표시 경로와 저장·재생 가능한 최종 문서 경로를 같은 stroke receipt로 연결합니다.",
      en: "Connect immediate display and durable replayable document paths through one stroke receipt.",
    },
    outcome: {
      ko: "GPU·WASM·Canvas backend를 바꿔도 Undo·재생·내보내기의 의미가 유지됩니다.",
      en: "Undo, replay and export semantics remain stable while GPU, WASM and Canvas backends change.",
    },
    steps: [
      { ko: "raw pointer와 normalized sample schema를 분리하고 device-specific pressure·tilt 보정을 한 곳에서 수행합니다.", en: "Separate raw pointer events from normalized samples and centralize device-specific pressure and tilt correction." },
      { ko: "stroke ID, brush revision, seed, material parameters와 layer transform을 immutable receipt로 만듭니다.", en: "Create an immutable receipt containing stroke ID, brush revision, seed, material parameters and layer transform." },
      { ko: "preview, simulation, composite, tile commit와 history append의 deadline·cancellation·authority를 선언합니다.", en: "Declare deadlines, cancellation and authority for preview, simulation, compositing, tile commit and history append." },
      { ko: "Worker에는 transferable sample buffer를 보내고 늦은 응답이 다음 stroke를 덮어쓰지 못하게 generation을 검사합니다.", en: "Send transferable sample buffers to Workers and use generations so late responses cannot overwrite newer strokes." },
      { ko: "committed parity, 긴 획 memory, device loss와 fallback 품질을 실제 browser에서 측정합니다.", en: "Measure committed parity, long-stroke memory, device loss and fallback quality in real browsers." },
    ],
    checklist: [
      { ko: "preview와 commit이 동일 stroke identity·brush revision을 사용", en: "Preview and commit use the same stroke identity and brush revision" },
      { ko: "pointer-up·cancel·device loss 뒤 자원·history 상태가 결정적", en: "Resources and history are deterministic after pointer-up, cancellation and device loss" },
      { ko: "backend fallback에서 receipt·Undo·export 의미 유지", en: "Receipts, undo and export semantics survive backend fallback" },
      { ko: "latency뿐 아니라 perceptual quality·memory·committed parity 검증", en: "Perceptual quality, memory and committed parity verified alongside latency" },
    ],
  },
  {
    id: "webrtc-media-boundary",
    status: "experimental",
    title: { ko: "WebRTC 미디어 권위와 복구 설계", en: "WebRTC media authority and recovery" },
    summary: {
      ko: "시그널링, peer admission, 실제 수신자, device permission과 media transport를 durable 문서 협업에서 분리합니다.",
      en: "Separate signaling, peer admission, actual recipients, device permission and media transport from durable document collaboration.",
    },
    outcome: {
      ko: "네트워크 변경과 권한 취소에도 누구에게 어떤 track이 전달되는지 설명하고 검증할 수 있습니다.",
      en: "Explain and verify which tracks reach which recipients through network changes and revoked authority.",
    },
    steps: [
      { ko: "identity·room admission·conversation membership과 media recipient scope를 먼저 정의합니다.", en: "Define identity, room admission, conversation membership and media-recipient scope first." },
      { ko: "시그널링 envelope와 SDP·ICE payload를 versioning하고 크기·queue·rate를 제한합니다.", en: "Version signaling envelopes and SDP and ICE payloads, then bound size, queues and rate." },
      { ko: "getUserMedia·getDisplayMedia 응답 뒤 session generation과 권한 revision을 재검증합니다.", en: "Revalidate session generation and authority revision after getUserMedia or getDisplayMedia resolves." },
      { ko: "perfect negotiation, pending ICE, restartIce, TURN credential refresh와 device switch를 독립 상태로 처리합니다.", en: "Handle perfect negotiation, pending ICE, restartIce, TURN credential refresh and device switching as explicit states." },
      { ko: "leave·block·unmount·track ended에서 sender, receiver, track, stream, handler와 peer를 모두 정리합니다.", en: "Clean up sender, receiver, tracks, streams, handlers and peers on leave, block, unmount and track end." },
    ],
    checklist: [
      { ko: "공간상 근접 표시와 실제 media peer scope가 같은 recipient authority를 사용", en: "Spatial proximity and actual media peer scope share one recipient authority" },
      { ko: "권한 프롬프트가 열린 동안 방·역할 변경 시 늦은 stream을 즉시 중지", en: "Late streams stop immediately when room or role changes during a permission prompt" },
      { ko: "STUN-only와 TURN relay, loopback과 WAN 결과를 별도 상태로 표시", en: "STUN-only versus TURN relay and loopback versus WAN are reported separately" },
      { ko: "연결 종료 뒤 열린 track·timer·event handler·peer connection이 없음", en: "No live tracks, timers, handlers or peer connections remain after teardown" },
    ],
  },
  {
    id: "virtual-studio-authority",
    status: "experimental",
    title: { ko: "가상 스튜디오 권위와 접근성", en: "Virtual-studio authority and accessibility" },
    summary: {
      ko: "공간 UI를 프로젝트·협업 도메인의 projection으로 만들고 목록·키보드 대체 경로를 동등하게 유지합니다.",
      en: "Build the spatial UI as a projection of project and collaboration domains while retaining equivalent list and keyboard paths.",
    },
    outcome: {
      ko: "살아 있는 공간 경험을 추가해도 권한·업무 상태·미디어 privacy가 분열되지 않습니다.",
      en: "A living spatial experience without fragmenting authorization, work state or media privacy.",
    },
    steps: [
      { ko: "공간에 투영할 project, member, activity, room과 tool 상태를 read model로 정의합니다.", en: "Define project, member, activity, room and tool state as spatial read models." },
      { ko: "world manifest를 versioned schema로 만들고 compiler가 collision, spawn, object action과 provenance를 검증하게 합니다.", en: "Use a versioned world-manifest schema and compile collision, spawn, object actions and provenance." },
      { ko: "movement·animation·NPC·interaction policy를 renderer와 network에서 분리해 순수 테스트합니다.", en: "Separate and pure-test movement, animation, NPC and interaction policies from renderer and networking." },
      { ko: "social·huddle·conversation은 기존 membership·recipient authority를 adapter로 사용합니다.", en: "Make social, huddle and conversation adapters consume existing membership and recipient authority." },
      { ko: "search, map, list, keyboard, reduced motion, low-power와 permission-on-use 경로를 같이 검증합니다.", en: "Verify search, map, list, keyboard, reduced-motion, low-power and permission-on-use paths together." },
    ],
    checklist: [
      { ko: "공간 화면이 project·permission 원장을 복제하지 않음", en: "Spatial view does not duplicate project or permission ledgers" },
      { ko: "object action은 allowlist와 schema 검증을 통과", en: "Object actions pass allowlists and schema validation" },
      { ko: "mic·camera·screen share의 실제 수신자와 잠금 상태 표시", en: "Actual recipients and lock state shown for microphone, camera and screen share" },
      { ko: "공간을 사용하지 않아도 모든 핵심 업무를 목록·키보드로 완료", en: "Every core task remains completable through list and keyboard without the spatial view" },
    ],
  },
] as const satisfies readonly EngineeringGuide[];
