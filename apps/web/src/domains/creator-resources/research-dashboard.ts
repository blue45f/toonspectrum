import {
  attributionMarkdown,
  deadlineLabel,
  RESOURCE_LABELS,
  STORY_FIELDS,
  storyMarkdown,
} from "@/shared/lib/creator-resources";

import type {
  CreatorResource,
  CreatorWorkspace,
  ResourceProvider,
} from "@/shared/lib/creator-resources";

const DAY_MS = 86_400_000;
const RESOURCE_PROVIDERS: readonly ResourceProvider[] = ["met", "openlibrary", "openbd", "kakao", "bizinfo"];

const SOURCE_REVIEW_DAYS: Record<ResourceProvider, number> = {
  met: 180,
  openlibrary: 180,
  openbd: 180,
  kakao: 90,
  bizinfo: 7,
};

export const RESEARCH_SEARCH_MODES = [
  {
    id: "assets",
    label: "시각 레퍼런스",
    description: "복식·소품·미술 자료",
    path: "/research/assets",
    placeholder: "예: 1920년대 기차역",
    suggestions: ["조선 후기 복식", "비 오는 밤 골목", "아르누보 장신구"],
  },
  {
    id: "books",
    label: "글로벌 판본",
    description: "작품명·작가·ISBN",
    path: "/research/books",
    placeholder: "예: Alice in Wonderland",
    suggestions: ["Alice in Wonderland", "夏目漱石", "9784088820118"],
  },
  {
    id: "opportunities",
    label: "작가 기회",
    description: "지원사업·공모·마감",
    path: "/opportunities",
    placeholder: "예: 웹툰 창작자 지원",
    suggestions: ["웹툰 창작자", "콘텐츠 제작 지원", "해외 진출"],
  },
] as const;

export type ResearchSearchMode = typeof RESEARCH_SEARCH_MODES[number]["id"];

export interface SourceFreshness {
  ageDays: number;
  thresholdDays: number;
  needsReview: boolean;
  label: string;
}

export interface ResearchStage {
  id: "capture" | "compare" | "shape" | "prepare";
  label: string;
  description: string;
  criterion: string;
  href: string;
  action: string;
  complete: boolean;
  status: "complete" | "current" | "queued";
}

export interface ResearchWorkspaceSummary {
  savedCount: number;
  providerCount: number;
  providerBreakdown: Array<{ provider: ResourceProvider; label: string; count: number }>;
  publicDomainCount: number;
  rightsReviewCount: number;
  staleCount: number;
  storyCompleted: number;
  storyTotal: number;
  publishingCompleted: number;
  recipeCompleted: number;
  upcomingDeadlineCount: number;
  nearestDeadline: CreatorResource | null;
  completedStages: number;
  stages: ResearchStage[];
}

export interface ResearchNextAction {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  label: string;
  reloadDocument?: boolean;
}

export interface ResearchCoverageItem {
  id: "visual" | "edition" | "diversity" | "governance" | "story" | "production";
  eyebrow: string;
  label: string;
  evidence: string;
  description: string;
  status: "covered" | "attention" | "missing";
  href: string;
  action: string;
}

export interface ResearchBriefContext {
  title?: string;
  question?: string;
  context?: string;
  intentLabel?: string;
  recentSearches?: ReadonlyArray<{
    mode: ResearchSearchMode;
    query: string;
    searchedAt: string;
  }>;
}

export function normalizeResearchQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function isResearchQueryValid(value: string): boolean {
  const query = normalizeResearchQuery(value);
  return query.length >= 2 && query.length <= 80;
}

export function researchSearchHref(mode: ResearchSearchMode, value: string): string {
  const selected = RESEARCH_SEARCH_MODES.find((entry) => entry.id === mode) ?? RESEARCH_SEARCH_MODES[0];
  const query = normalizeResearchQuery(value);
  return `${selected.path}?${new URLSearchParams({ q: query, page: "1" }).toString()}`;
}

export function resourceLicenseLabel(license: CreatorResource["license"]): string {
  if (license === "CC0") return "CC0 공개 자료";
  if (license === "book-promotion") return "도서 소개 목적";
  return "메타데이터 · 원문 확인";
}

export function sourceFreshness(item: CreatorResource, now = new Date()): SourceFreshness {
  const thresholdDays = SOURCE_REVIEW_DAYS[item.provider];
  const fetchedAt = Date.parse(item.fetchedAt);
  if (!Number.isFinite(fetchedAt)) {
    return { ageDays: thresholdDays, thresholdDays, needsReview: true, label: "조회일 확인 필요" };
  }
  const ageDays = Math.max(0, Math.floor((now.getTime() - fetchedAt) / DAY_MS));
  const needsReview = ageDays >= thresholdDays;
  const label = needsReview
    ? `재확인 권장 · ${ageDays}일 전`
    : ageDays === 0
      ? "오늘 조회"
      : `${ageDays}일 전 조회`;
  return { ageDays, thresholdDays, needsReview, label };
}

function todayKst(now: Date): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function buildStages(values: {
  savedCount: number;
  providerCount: number;
  storyCompleted: number;
  publishingCompleted: number;
}): ResearchStage[] {
  const raw: Array<Omit<ResearchStage, "status">> = [
    {
      id: "capture",
      label: "발견",
      description: "장면에 필요한 첫 근거를 보드에 저장합니다.",
      criterion: "자료 1개 이상",
      href: "/research/assets",
      action: "첫 자료 찾기",
      complete: values.savedCount >= 1,
    },
    {
      id: "compare",
      label: "교차 확인",
      description: "서로 다른 제공처의 자료를 나란히 살펴봅니다.",
      criterion: "자료 3개 · 제공처 2곳 이상",
      href: "/research/books",
      action: "판본·자료 더 찾기",
      complete: values.savedCount >= 3 && values.providerCount >= 2,
    },
    {
      id: "shape",
      label: "이야기 설계",
      description: "조사 결과를 인물·욕망·갈등·전환점으로 바꿉니다.",
      criterion: "기획 항목 4개 이상",
      href: "/story-lab",
      action: "스토리 연구실 열기",
      complete: values.storyCompleted >= 4,
    },
    {
      id: "prepare",
      label: "제작 준비",
      description: "연재·출판에 필요한 확인 항목을 실제로 점검합니다.",
      criterion: "준비 체크 1개 이상",
      href: "/publishing",
      action: "준비 상태 점검",
      complete: values.publishingCompleted >= 1,
    },
  ];
  let currentAssigned = false;
  return raw.map((stage) => {
    if (stage.complete) return { ...stage, status: "complete" };
    if (!currentAssigned) {
      currentAssigned = true;
      return { ...stage, status: "current" };
    }
    return { ...stage, status: "queued" };
  });
}

export function summarizeResearchWorkspace(workspace: CreatorWorkspace, now = new Date()): ResearchWorkspaceSummary {
  const providerCounts = new Map<ResourceProvider, number>(RESOURCE_PROVIDERS.map((provider) => [provider, 0]));
  let publicDomainCount = 0;
  let rightsReviewCount = 0;
  let staleCount = 0;

  for (const item of workspace.saved) {
    providerCounts.set(item.provider, (providerCounts.get(item.provider) ?? 0) + 1);
    if (item.license === "CC0") publicDomainCount += 1;
    else rightsReviewCount += 1;
    if (sourceFreshness(item, now).needsReview) staleCount += 1;
  }

  const providerBreakdown = RESOURCE_PROVIDERS
    .map((provider) => ({ provider, label: RESOURCE_LABELS[provider], count: providerCounts.get(provider) ?? 0 }))
    .filter((entry) => entry.count > 0);
  const storyCompleted = STORY_FIELDS.filter((field) => Boolean(workspace.story[field]?.trim())).length;
  const publishingCompleted = workspace.checks.filter((item) => item.startsWith("publish-")).length;
  const recipeCompleted = workspace.checks.filter((item) => item.startsWith("recipe-")).length;
  const today = todayKst(now);
  const upcomingDeadlines = workspace.saved
    .filter((item) => item.provider === "bizinfo" && Boolean(item.deadline) && item.deadline! >= today)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!) || a.title.localeCompare(b.title, "ko"));
  const stages = buildStages({
    savedCount: workspace.saved.length,
    providerCount: providerBreakdown.length,
    storyCompleted,
    publishingCompleted,
  });

  return {
    savedCount: workspace.saved.length,
    providerCount: providerBreakdown.length,
    providerBreakdown,
    publicDomainCount,
    rightsReviewCount,
    staleCount,
    storyCompleted,
    storyTotal: STORY_FIELDS.length,
    publishingCompleted,
    recipeCompleted,
    upcomingDeadlineCount: upcomingDeadlines.length,
    nearestDeadline: upcomingDeadlines[0] ?? null,
    completedStages: stages.filter((stage) => stage.complete).length,
    stages,
  };
}

export function buildResearchCoverage(summary: ResearchWorkspaceSummary): ResearchCoverageItem[] {
  const providerCount = (provider: ResourceProvider) => (
    summary.providerBreakdown.find((entry) => entry.provider === provider)?.count ?? 0
  );
  const visualCount = providerCount("met");
  const editionCount = providerCount("openlibrary") + providerCount("openbd") + providerCount("kakao");
  const governanceIssues = summary.rightsReviewCount + summary.staleCount;

  return [
    {
      id: "visual",
      eyebrow: "화면 근거",
      label: "시각 레퍼런스",
      evidence: visualCount ? `공개 미술 자료 ${visualCount}개` : "확인된 시각 자료 없음",
      description: visualCount
        ? "형태·재료·복식·공간을 화면으로 확인할 근거가 있습니다. 실제 사용 범위는 각 원문 조건을 따릅니다."
        : "장면의 형태와 시대성을 추측만으로 결정하기 전에 공개 이용이 확인된 시각 자료를 저장하세요.",
      status: visualCount ? "covered" : "missing",
      href: "/research/assets",
      action: visualCount ? "시각 자료 보강" : "첫 시각 자료 찾기",
    },
    {
      id: "edition",
      eyebrow: "문헌 근거",
      label: "작품·판본 맥락",
      evidence: editionCount ? `도서·판본 자료 ${editionCount}개` : "확인된 판본 자료 없음",
      description: editionCount
        ? "작품명·작가·ISBN과 출판 메타데이터를 통해 시각 자료와 다른 종류의 맥락을 확보했습니다."
        : "원작·판본·출판 정보를 함께 보면 시대와 설정을 한 이미지에만 의존하는 위험을 줄일 수 있습니다.",
      status: editionCount ? "covered" : "missing",
      href: "/research/books",
      action: editionCount ? "판본 더 비교" : "판본 근거 찾기",
    },
    {
      id: "diversity",
      eyebrow: "교차 확인",
      label: "제공처 다양성",
      evidence: `${summary.providerCount}개 제공처 · 저장 ${summary.savedCount}개`,
      description: summary.providerCount >= 2
        ? "서로 다른 유형의 제공처를 비교할 수 있습니다. 제목과 설명이 비슷해도 원문 범위와 이용조건은 각각 확인하세요."
        : summary.savedCount
          ? "현재 자료가 한 제공처에 치우쳐 있습니다. 다른 유형의 근거를 추가해 과도한 추정을 줄이세요."
          : "첫 자료를 저장한 뒤 다른 제공처의 근거를 하나 더해 비교할 수 있습니다.",
      status: summary.providerCount >= 2 ? "covered" : summary.savedCount ? "attention" : "missing",
      href: visualCount ? "/research/books" : "/research/assets",
      action: summary.providerCount >= 2 ? "근거 더 넓히기" : "다른 제공처 찾기",
    },
    {
      id: "governance",
      eyebrow: "출처 관리",
      label: "이용조건·조회일",
      evidence: summary.savedCount
        ? `원문 조건 확인 ${summary.rightsReviewCount}개 · 재확인 ${summary.staleCount}개`
        : "점검할 저장 자료 없음",
      description: !summary.savedCount
        ? "자료를 저장하면 이용조건 분류와 제공처별 조회일 재확인 신호를 함께 보여줍니다."
        : governanceIssues
          ? "메타데이터 이용과 이미지·본문 재사용은 다릅니다. 제작 또는 제출 전에 표시된 원문과 조회일을 다시 확인하세요."
          : "현재 저장 자료는 표시된 재확인 기준 안에 있습니다. 이 상태가 권리 허가나 링크 생존을 보증하지는 않습니다.",
      status: !summary.savedCount ? "missing" : governanceIssues ? "attention" : "covered",
      href: summary.savedCount ? "#saved-board" : "/research/assets",
      action: summary.savedCount ? "저장 자료 점검" : "자료 저장하기",
    },
    {
      id: "story",
      eyebrow: "의사결정",
      label: "이야기 전환",
      evidence: `기획 항목 ${summary.storyCompleted}/${summary.storyTotal}`,
      description: summary.storyCompleted >= 4
        ? "조사 결과가 인물과 갈등의 선택으로 일부 전환되었습니다. 빈 항목을 채우며 첫 화 구조를 다듬으세요."
        : summary.storyCompleted
          ? "자료를 모으는 것에서 멈추지 말고 주인공·욕망·장애물·전환점 중 빈 항목을 구체화하세요."
          : "근거를 이야기의 선택으로 바꾸는 기록이 아직 없습니다. 핵심 네 항목부터 시작하세요.",
      status: summary.storyCompleted >= 4 ? "covered" : summary.storyCompleted ? "attention" : "missing",
      href: "/story-lab",
      action: summary.storyCompleted ? "이야기 계속 설계" : "Story Lab 시작",
    },
    {
      id: "production",
      eyebrow: "실행 준비",
      label: "제작·제출 점검",
      evidence: `출판 준비 체크 ${summary.publishingCompleted}개`,
      description: summary.publishingCompleted
        ? "권리·원고·소개 자료 중 실제 확인한 항목이 있습니다. 남은 조건은 제출 직전에 원문과 대조하세요."
        : "제작을 시작하기 전에 권리, 원고 규격, 소개 자료 중 한 항목이라도 확인하면 막판 재작업을 줄일 수 있습니다.",
      status: summary.publishingCompleted ? "covered" : "missing",
      href: "/publishing",
      action: summary.publishingCompleted ? "준비 상태 계속 점검" : "제출 조건 확인",
    },
  ];
}

export function researchNextAction(summary: ResearchWorkspaceSummary): ResearchNextAction {
  if (summary.savedCount === 0) {
    return {
      eyebrow: "지금 시작하기",
      title: "첫 장면의 근거를 하나 저장하세요",
      description: "복식·소품·공간처럼 화면에 바로 반영할 수 있는 공개 자료부터 모으면 다음 단계가 선명해집니다.",
      href: "/research/assets",
      label: "창작 레퍼런스 열기",
    };
  }
  if (summary.savedCount < 3 || summary.providerCount < 2) {
    const hasVisualSource = summary.providerBreakdown.some((entry) => entry.provider === "met");
    return {
      eyebrow: "다음 추천",
      title: "한 출처에 기대지 말고 비교 근거를 더하세요",
      description: "시각 자료와 판본·서지 정보를 함께 보면 시대·소품·설정의 과도한 추정을 줄일 수 있습니다.",
      href: hasVisualSource ? "/research/books" : "/research/assets",
      label: hasVisualSource ? "글로벌 판본 탐색" : "시각 자료 더 찾기",
    };
  }
  if (summary.storyCompleted < 4) {
    return {
      eyebrow: "다음 추천",
      title: "모은 자료를 이야기의 선택으로 바꾸세요",
      description: "주인공, 욕망, 장애물, 첫 화 전환점 중 네 가지부터 정리하면 조사만 반복하는 상태를 벗어날 수 있습니다.",
      href: "/story-lab",
      label: "스토리 연구실 열기",
    };
  }
  if (summary.staleCount > 0) {
    return {
      eyebrow: "재확인 필요",
      title: `${summary.staleCount}개 자료의 원문 상태를 다시 확인하세요`,
      description: "지원공고와 외부 메타데이터는 바뀔 수 있습니다. 제작·제출 전에 원문과 조회일을 갱신하세요.",
      href: "#saved-board",
      label: "저장 자료 점검",
    };
  }
  if (summary.publishingCompleted === 0) {
    return {
      eyebrow: "다음 추천",
      title: "제작 이후의 제출 조건을 미리 점검하세요",
      description: "권리, 원고 규격, 소개 자료를 한 항목이라도 확인해 두면 막판 재작업을 줄일 수 있습니다.",
      href: "/publishing",
      label: "연재·출판 준비실 열기",
    };
  }
  return {
    eyebrow: "제작으로 연결",
    title: "조사와 기획을 실제 장면으로 옮길 차례입니다",
    description: "저장한 출처와 기획 브리프를 곁에 두고 첫 장면을 제작하세요. 원문 이용조건 확인은 계속 유지해야 합니다.",
    href: "/studio",
    label: "스튜디오 열기",
    reloadDocument: true,
  };
}

function cleanBriefText(value: string | undefined, maximum = 240): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, maximum);
}

function researchContextMarkdown(context: ResearchBriefContext | undefined): string {
  if (!context) return "";
  const title = cleanBriefText(context.title, 80);
  const question = cleanBriefText(context.question, 180);
  const constraints = cleanBriefText(context.context, 240);
  const intent = cleanBriefText(context.intentLabel, 40);
  const searches = (context.recentSearches ?? []).slice(0, 8).map((entry) => {
    const mode = RESEARCH_SEARCH_MODES.find((candidate) => candidate.id === entry.mode)?.label ?? "리서치";
    const query = cleanBriefText(entry.query, 80);
    const date = new Date(entry.searchedAt);
    const searchedAt = Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
      : "시간 확인 필요";
    return query ? `- ${mode}: ${query} · ${searchedAt}` : "";
  }).filter(Boolean);
  if (!title && !question && !constraints && !searches.length) return "";

  const focus = [
    title ? `- 리서치 이름: ${title}` : "",
    intent ? `- 조사 렌즈: ${intent}` : "",
    question ? `- 핵심 질문: ${question}` : "",
    constraints ? `- 시대·장소·제약: ${constraints}` : "",
  ].filter(Boolean);
  return [
    "## 이번 리서치 초점",
    focus.join("\n"),
    searches.length ? `### 최근 검색 경로\n\n${searches.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

export function buildResearchBriefMarkdown(
  workspace: CreatorWorkspace,
  now = new Date(),
  context?: ResearchBriefContext,
): string {
  const summary = summarizeResearchWorkspace(workspace, now);
  const generatedAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const story = storyMarkdown(workspace.story).replace("# 웹툰 기획 워크시트", "## 이야기 설계");
  const sources = workspace.saved.length
    ? attributionMarkdown(workspace.saved).replace("# 창작 자료 출처 기록", "## 조사 자료와 출처")
    : "## 조사 자료와 출처\n\n아직 저장한 자료가 없습니다.";
  const deadline = summary.nearestDeadline
    ? `${summary.nearestDeadline.title} · ${deadlineLabel(summary.nearestDeadline.deadline, now)}`
    : "확인된 예정 마감 없음";
  const focus = researchContextMarkdown(context);

  return [
    "# ToonStudio 창작 리서치 브리프",
    "이 문서는 현재 브라우저의 창작 보드와 직접 작성한 기획을 묶은 작업용 기록입니다. 권리 허가서나 법률 검토를 대신하지 않습니다.",
    `- 생성일: ${generatedAt}\n- 저장 자료: ${summary.savedCount}개\n- 제공처: ${summary.providerCount}곳\n- 작성한 기획 항목: ${summary.storyCompleted}/${summary.storyTotal}\n- 다가오는 마감: ${deadline}`,
    focus,
    story,
    sources,
    "## 제작 전 최종 확인\n\n- 메타데이터와 도서 소개 자료는 이미지·본문 재사용 허가가 아닙니다.\n- 지원사업 일정과 접수 조건은 제출 직전에 공식 원문에서 다시 확인하세요.\n- 출처 표기와 이용조건은 실제 사용 범위에 맞게 별도로 검토하세요.",
  ].filter(Boolean).join("\n\n");
}
