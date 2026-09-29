import type { LocalizedText } from "./engineering-story-content";

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export interface SeminarPrepStep {
  readonly lessonId: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly title: LocalizedText;
  /** 무대에서 바로 말할 수 있는 한 줄 */
  readonly speakLine: LocalizedText;
}

export interface SeminarPrepQuestion {
  readonly question: LocalizedText;
  /** 2~3문장 답변 요지 — 코드에서 확인된 것만 */
  readonly answer: LocalizedText;
  readonly glossaryId?: string;
}

/**
 * 내일 세미나용 30분 추천 구성.
 * 32개 레슨 중 청중이 끝까지 따라올 수 있는 9개만 고르고, 각 구간에 말하기 한 줄을 붙였다.
 * (Q&A 5분 버퍼 포함 30분)
 */
export const SEMINAR_PREP_PATH_30MIN: readonly SeminarPrepStep[] = [
  {
    lessonId: "seminar-opening",
    startMinute: 0,
    endMinute: 2,
    title: t("오프닝 — 질문 던지기", "Opening — pose the question"),
    speakLine: t(
      "“그리던 파일을 다른 도구로 옮기다가 레이어를 잃은 적 있으세요?” — 오늘의 질문은 기능 개수가 아니라, 브라우저가 작업을 어디까지 지켜주는가입니다.",
      "“Ever lost layers moving a file between tools?” — today's question isn't feature count, but how far a browser can protect creative work.",
    ),
  },
  {
    lessonId: "seminar-problem",
    startMinute: 2,
    endMinute: 5,
    title: t("문제 — 카페에서 대화하는 한 컷", "Problem — one panel in a café"),
    speakLine: t(
      "대본→배경→포즈→대사→검수. 도구는 각각 좋은데, 어느 버전이 원본인지 모르면 수정할 때마다 일을 반복합니다.",
      "Script → background → pose → dialogue → review. Each tool is fine, but without knowing which version is authoritative, every revision repeats the work.",
    ),
  },
  {
    lessonId: "seminar-architecture",
    startMinute: 5,
    endMinute: 8,
    title: t("아키텍처 — 식당 비유", "Architecture — the restaurant analogy"),
    speakLine: t(
      "React 화면은 주문받는 곳, 문서와 렌더러는 주방입니다. 주문 상태와 재료를 한 곳에 몰면 변경이 서로 물고 늘어집니다.",
      "The React UI takes orders; the document and renderer are the kitchen. Mixing order state with ingredients tangles every change.",
    ),
  },
  {
    lessonId: "seminar-input",
    startMinute: 8,
    endMinute: 12,
    title: t("브러시 — 손의 점이 선이 되기까지", "Brush — from hand samples to strokes"),
    speakLine: t(
      "같은 손 움직임도 연필·펜·수채화가 달라야 합니다. 샘플→안정화→브러시 자국→합성, 4단계를 분리했기에 가능합니다.",
      "The same hand motion must differ for pencil, pen and watercolor. Four separated stages — samples → stabilization → marks → compositing — make it possible.",
    ),
  },
  {
    lessonId: "seminar-natural-media",
    startMinute: 12,
    endMinute: 16,
    title: t("자연매체 — Rust와 Hokusai 이야기", "Natural media — the Rust + Hokusai story"),
    speakLine: t(
      "수채화는 투명한 선이 아니라 재료의 반응입니다. Rust로 짠 Hokusai 엔진을 WASM으로 묶어 브라우저에서 돌립니다 — 바이트까지 재현되는 빌드로요.",
      "Watercolor isn't a transparent line, it's a material's reaction. The Rust-based Hokusai engine ships as WASM — with byte-reproducible builds.",
    ),
  },
  {
    lessonId: "seminar-offline",
    startMinute: 16,
    endMinute: 20,
    title: t("오프라인 — 랜턴 비유", "Offline — the lantern analogy"),
    speakLine: t(
      "정전 때 집 전체는 못 밝혀도 랜턴 하나는 켤 수 있어야죠. 인터넷이 끊겨도 그림은 그려집니다 — 미리 준비된 범위 안에서요.",
      "A blackout can't light the whole house, but one lantern should work. Drawing survives losing the internet — within the prepared scope.",
    ),
  },
  {
    lessonId: "seminar-scene3d",
    startMinute: 20,
    endMinute: 24,
    title: t("3D — 보여주기용이 아니라 밑그림용", "3D — underdrawing, not decoration"),
    speakLine: t(
      "3D를 왜 넣었냐고요? 보여주려고가 아니라 그리기 위해서입니다. LT 변환으로 3D를 만화 선화로 바꿔 바로 위에 펜을 댑니다.",
      "Why 3D? Not to show off — to draw on. LT conversion turns 3D into comic lineart you ink directly over.",
    ),
  },
  {
    lessonId: "seminar-ai-routing",
    startMinute: 24,
    endMinute: 27,
    title: t("AI — 제안은 기계, 확정은 사람", "AI — machines propose, humans decide"),
    speakLine: t(
      "AI에게 맡기는 일과 사람이 확정하는 일을 나눕니다. 비용 라우터가 일의 난이도에 따라 무료·저렴·고급 AI를 골라 씁니다.",
      "Separate what AI proposes from what humans approve. A cost router picks free, cheap or premium AI per task difficulty.",
    ),
  },
  {
    lessonId: "seminar-cost",
    startMinute: 27,
    endMinute: 29,
    title: t("비용 — 무료 우선 설계", "Cost — free-first design"),
    speakLine: t(
      "BGM은 파일이 없어 라이선스 0원, 날씨는 키 없는 무료 API. 무료 우선이란 공짜라는 뜻이 아니라, 돈 드는 지점을 숨기지 않는다는 뜻입니다.",
      "BGM has no files so zero licensing cost; weather uses a keyless free API. Free-first doesn't mean free — it means cost boundaries stay visible.",
    ),
  },
  {
    lessonId: "seminar-quality",
    startMinute: 29,
    endMinute: 30,
    title: t("클로징 — Q&A로 넘기기", "Closing — hand over to Q&A"),
    speakLine: t(
      "좋은 데모를 반복 가능한 증거로 바꾸는 게 우리의 품질 기준입니다. 질문 받겠습니다 — 용어집과 챕터 근거가 준비돼 있습니다.",
      "Our quality bar: turn a good demo into repeatable evidence. Questions welcome — the glossary and chapter evidence are ready.",
    ),
  },
];

/** 예상 질문 TOP 10 — 답변은 코드에서 확인된 사실만 */
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
      "AI는 제안, 사람은 확정입니다. 비용 라우터가 작업 난이도에 따라 무료·저렴·고급 AI를 골라 쓰고, 돈이 드는 지점은 숨기지 않고 드러냅니다.",
      "AI proposes, humans decide. A cost router picks free, cheap or premium AI per task difficulty, and cost boundaries stay visible instead of hidden.",
    ),
    glossaryId: "ai-routing",
  },
  {
    question: t("비용 구조는요? 무료로 운영되나요?", "What about costs? Is it free to run?"),
    answer: t(
      "무료 우선 설계입니다. BGM은 음원 파일 자체가 없어 라이선스 비용 0원, 날씨는 API 키 없는 Open-Meteo 무료 API를 씁니다. “무료”가 아니라 비용 경계를 명확히 하는 게 핵심입니다.",
      "Free-first design. BGM has no audio files so zero licensing cost; weather uses the keyless free Open-Meteo API. The point isn't “free” — it's making cost boundaries explicit.",
    ),
    glossaryId: "procedural-bgm",
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
  t("덱 타이머로 30분 리허설 1회 — 29분에 클로징이 끝나야 합니다", "One 30-minute rehearsal with the deck timer — closing must land by minute 29"),
  t("데모 3종의 실패 대안 확인 (브랜드 필름→스토리보드, 제품투어→설명 문단, 라이브→오프라인 덱)", "Verify fallbacks for all 3 demos (brand film → storyboard, product tour → description, live → offline deck)"),
  t("오프라인 발표본 HTML 다운로드 — 네트워크 없이 열리는지 확인", "Download the offline deck HTML — confirm it opens with no network"),
  t("예상 질문 10개를 소리 내어 답변 — 1개당 1분 안에", "Answer all 10 anticipated questions aloud — under a minute each"),
  t("용어집에서 헷갈리는 용어 5개에 별표 — WASM·CRDT·LT변환·VRM·PWA", "Star 5 shaky terms in the glossary — WASM, CRDT, LT conversion, VRM, PWA"),
  t("발표자 노트 표시 켜고 전체 슬라이드 1회 통독", "Turn on speaker notes and read through every slide once"),
];
