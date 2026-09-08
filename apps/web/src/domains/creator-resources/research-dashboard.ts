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

export function buildResearchBriefMarkdown(workspace: CreatorWorkspace, now = new Date()): string {
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

  return [
    "# ToonStudio 창작 리서치 브리프",
    "이 문서는 현재 브라우저의 창작 보드와 직접 작성한 기획을 묶은 작업용 기록입니다. 권리 허가서나 법률 검토를 대신하지 않습니다.",
    `- 생성일: ${generatedAt}\n- 저장 자료: ${summary.savedCount}개\n- 제공처: ${summary.providerCount}곳\n- 작성한 기획 항목: ${summary.storyCompleted}/${summary.storyTotal}\n- 다가오는 마감: ${deadline}`,
    story,
    sources,
    "## 제작 전 최종 확인\n\n- 메타데이터와 도서 소개 자료는 이미지·본문 재사용 허가가 아닙니다.\n- 지원사업 일정과 접수 조건은 제출 직전에 공식 원문에서 다시 확인하세요.\n- 출처 표기와 이용조건은 실제 사용 범위에 맞게 별도로 검토하세요.",
  ].join("\n\n");
}
