import type { LocalizedText } from "./engineering-story-content";

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export interface SeminarPrepQuestion {
  readonly question: LocalizedText;
  /** 2~3문장 답변 요지 — 코드에서 확인된 것만 */
  readonly answer: LocalizedText;
  readonly glossaryId?: string;
}

export const SEMINAR_PREP_QUESTIONS: readonly SeminarPrepQuestion[] = [
  {
    question: t("왜 굳이 브라우저에서 하나요? 네이티브 앱이 낫지 않나요?", "Why the browser at all? Wouldn't a native app be better?"),
    answer: t(
      "설치 장벽이 없고 URL 하나로 공유·협업이 됩니다. PWA와 오프라인 구조로 핵심 작업인 드로잉은 끊겨도 돕니다. 네이티브를 대체한다는 주장이 아니라, 브라우저가 작업을 어디까지 책임질 수 있는지 보여주는 사례입니다.",
      "No install barrier; share and collaborate with a single URL. PWA plus offline structure keeps drawing — the core task — alive without internet. This isn't a claim to replace native apps, but a case study in how far a browser can go.",
    ),
    glossaryId: "pwa",
  },
  {
    question: t("WASM이 뭔가요? 왜 Rust인가요?", "What is WASM, and why Rust?"),
    answer: t(
      "WASM은 빠른 코드를 브라우저에서 네이티브 속도로 돌리는 실행 형식입니다. Rust는 메모리 실수를 컴파일 때 잡아주고 GC가 없어 성능이 예측 가능합니다. 수채화 렌더러 Hokusai가 Rust로 짜여 WASM으로 묶여 있습니다.",
      "WASM runs fast code in the browser at near-native speed. Rust catches memory mistakes at compile time with no GC, so performance is predictable. The Hokusai watercolor renderer is written in Rust and shipped as WASM.",
    ),
    glossaryId: "wasm",
  },
  {
    question: t("오프라인에서 정말 그림이 그려지나요?", "Can you really draw offline?"),
    answer: t(
      "네. 서비스워커가 /offline-draw/index.html 독립 화면을 미리 받아 두고 로컬 드로잉 구조와 연결됩니다. 단 “전부 오프라인”이 아니라 그림 그리기처럼 미리 준비된 범위만 보장한다는 원칙입니다.",
      "Yes. The service worker precaches a standalone /offline-draw/index.html wired to the local drawing rescue. The honest principle: offline is a prepared scope — like drawing — not a blanket promise.",
    ),
    glossaryId: "offline-shell",
  },
  {
    question: t("AI는 어디까지 쓰고, 사람은 뭘 하나요?", "Where does AI stop and humans take over?"),
    answer: t(
      "AI는 제안, 사람은 확정입니다. 라우터는 허용된 무료 경로부터 시도하고, 확정적인 거절(권한·한도 초과)일 때만 다음 무료 경로로 넘깁니다. 시간 초과·5xx처럼 결과가 모호하면 다시 보내지 않고, 유료 경로는 사용자가 직접 키를 넣고 승인해야만 씁니다.",
      "AI proposes, humans decide. The router tries allowlisted free paths first and advances only on definitive rejections (auth or quota). Ambiguous failures such as timeouts or 5xx are never replayed, and paid paths run only when the user supplies a key and approves.",
    ),
    glossaryId: "ai-routing",
  },
  {
    question: t("비용 구조는요? 무료로 운영되나요?", "What about costs? Is it free to run?"),
    answer: t(
      "무료 우선 설계입니다. 정적 사이트는 Cloudflare, API는 Render 무료 플랜, 원장은 Neon PostgreSQL, 실시간은 Durable Objects로 나누고 유료 전환은 자동으로 하지 않습니다. 대가는 콜드 스타트와 SLA 부재이며, 필요하면 비용과 운영 책임을 함께 승인해 올립니다.",
      "Free-first design. Static site on Cloudflare, API on Render's free plan, ledger on Neon PostgreSQL and realtime on Durable Objects, with no automatic paid upgrades. The trade-off is cold starts and no SLA; when needed, cost and operational responsibility are upgraded together by approval.",
    ),
  },
  {
    question: t("CSP·Procreate와 차별점은 뭔가요?", "How is it different from CSP or Procreate?"),
    answer: t(
      "최고의 단일 드로잉 앱을 노리는 게 아닙니다. 기획→콘티→드로잉→3D→검수→발행의 연결이 차별점입니다. 브러시 엔진도 MyPaint·Hokusai 등을 역할별로 나눠 씁니다.",
      "We're not chasing the single best drawing app. The differentiator is the connected pipeline: planning → boards → drawing → 3D → review → publish. Brush engines (MyPaint, Hokusai, …) are used per role.",
    ),
    glossaryId: "libmypaint",
  },
  {
    question: t("3D를 왜 넣었나요?", "Why include 3D?"),
    answer: t(
      "보여주기용이 아니라 밑그림 재료입니다. LT 변환으로 3D 배경·소품을 만화의 선화·톤으로 바꿔 작가가 바로 위에 펜을 댑니다. VRM 표준 뼈대라 포즈 도구와도 이어집니다.",
      "Not for show — as underdrawing material. LT conversion turns 3D backgrounds and props into comic lineart and tones the artist inks over directly. VRM standard bones connect it to the posing tools.",
    ),
    glossaryId: "lt-conversion",
  },
  {
    question: t("여러 명이 같이 작업하면 충돌 안 나나요?", "Doesn't simultaneous editing cause conflicts?"),
    answer: t(
      "CRDT로 정해진 규칙대로 자동 병합합니다. 다만 CRDT가 권한이나 모든 파일 충돌을 해결해주진 않으니 의미적 범위를 정해 뒀고, 대화 연결(WebRTC)과 문서 동기화는 별도 채널로 분리했습니다.",
      "CRDT merges by fixed rules automatically. But it doesn't solve authorization or every file conflict, so its semantic scope is bounded — and the call connection (WebRTC) is a separate channel from document sync.",
    ),
    glossaryId: "crdt",
  },
  {
    question: t("오픈소스 라이선스 문제는 없나요?", "Any open-source licensing issues?"),
    answer: t(
      "/about/technology/licenses에 라이선스 그룹별 의무·주의사항을 공개합니다. “오픈소스”라는 한 단어로 묶지 않고 도구마다 따로 검토합니다. Hokusai는 MIT/Apache 이중 라이선스입니다.",
      "Obligations and cautions per license group are published at /about/technology/licenses — reviewed tool by tool, never lumped as “open source”. Hokusai is dual MIT/Apache licensed.",
    ),
    glossaryId: "oss-license",
  },
  {
    question: t("우리 팀에 적용하려면 어디서 시작하나요?", "Where should our team start adopting this?"),
    answer: t(
      "기술 스토리의 각 챕터 끝에 reuseSteps 재사용 절차가 있습니다. 포인터 샘플 스키마 고정 → 미리보기·확정 역할 분리 → 긴 획·저사양 검증 순서로 시작하세요.",
      "Each engineering story chapter ends with reuseSteps. Start by freezing the pointer-sample schema, then separating preview/commit roles, then validating long strokes and low-end devices.",
    ),
  },
];

export const SEMINAR_PREP_CHECKLIST: readonly LocalizedText[] = [
  t("타이머(T)를 켜고 30분 리허설 1회 — 구간 예산보다 늦으면 핵심 기술 구간에서 줄이기", "One 30-minute rehearsal with the timer (T) — if behind budget, trim inside the core technology section"),
  t("데모 탭 4개를 미리 열고 각 단계의 실패 시 대체 화면 확인", "Pre-open the four demo tabs and check each step's fallback"),
  t("오프라인 발표본 HTML을 내려받아 네트워크 없이 열리는지 확인", "Download the offline deck HTML and confirm it opens without a network"),
  t("프로젝터 연결 후 발표자 창을 열고, 청중 화면에서 전체 화면(F)이 동작하는지 확인", "After connecting the projector, open the presenter window and confirm fullscreen (F) on the audience screen"),
  t("예상 질문 10개를 소리 내어 답변 — 1개당 1분 안에", "Answer all 10 anticipated questions aloud — under a minute each"),
  t("용어집에서 헷갈리는 용어 5개 다시 보기 — WASM·CRDT·LT 변환·VRM·PWA", "Revisit five shaky glossary terms — WASM, CRDT, LT conversion, VRM, PWA"),
];
