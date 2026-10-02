import {
  BookOpen,
  CalendarDays,
  FileText,
  MessageSquare,
  Palette,
  Save,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { WorkflowVisual } from "@/shared/components/site-experience/workflow-illustration";

/**
 * 웹툰 제작 일곱 단계(/about/workflow). 각 단계는 실제 작업공간 한 곳으로 이어지고,
 * 단계의 결과물이 다음 담당자와 다음 작업공간의 입력이 된다.
 */
export type WorkflowStageId = "plan" | "world" | "script" | "art" | "review" | "save" | "release";

interface WorkflowStageCopy {
  /** 탭에 들어가는 짧은 이름. */
  readonly tab: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly cta: string;
  readonly outputs: readonly [string, string, string];
}

export interface WorkflowStage {
  readonly id: WorkflowStageId;
  readonly icon: LucideIcon;
  readonly art: WorkflowVisual;
  readonly href: string;
  readonly ko: WorkflowStageCopy;
  readonly en: WorkflowStageCopy;
}

export const WORKFLOW_STAGES = [
  {
    id: "plan",
    icon: BookOpen,
    art: "plan",
    href: "/story-lab",
    ko: {
      tab: "기획",
      title: "작품 기획",
      summary: "무엇을, 누구에게, 어떤 감정으로 전할지 정합니다.",
      body: "장르와 독자, 로그라인, 시놉시스, 세계관과 주요 갈등을 정리하고 에피소드의 목표를 세웁니다.",
      cta: "스토리 연구실 열기",
      outputs: ["로그라인", "시놉시스", "에피소드 목표"],
    },
    en: {
      tab: "Plan",
      title: "Plan the work",
      summary: "Define what the story says, who it is for and how it should feel.",
      body: "Shape the genre, audience, logline, synopsis, world and central conflict, then set a goal for each episode.",
      cta: "Open Story Lab",
      outputs: ["Logline", "Synopsis", "Episode goal"],
    },
  },
  {
    id: "world",
    icon: UsersRound,
    art: "assets",
    href: "/studio/assets/characters/new",
    ko: {
      tab: "캐릭터·세계",
      title: "캐릭터와 세계 설정",
      summary: "인물과 공간이 반복해서 등장해도 흔들리지 않도록 기준을 만듭니다.",
      body: "캐릭터의 외형, 성격, 표정과 의상, 관계를 정리하고 주요 장소와 소품의 기준 이미지를 준비합니다.",
      cta: "캐릭터 만들기",
      outputs: ["캐릭터 시트", "관계와 설정", "장소·소품 기준"],
    },
    en: {
      tab: "Cast & world",
      title: "Define characters and world",
      summary: "Create stable references for recurring people, places and props.",
      body: "Organize appearance, personality, expression, wardrobe and relationships, then prepare references for important locations and objects.",
      cta: "Create a character",
      outputs: ["Character sheet", "Relationships", "Location references"],
    },
  },
  {
    id: "script",
    icon: FileText,
    art: "storyboard",
    href: "/studio/comic",
    ko: {
      tab: "대본·콘티",
      title: "대본과 콘티",
      summary: "이야기를 장면, 대사와 컷의 흐름으로 바꿉니다.",
      body: "에피소드를 장면으로 나누고 행동과 대사를 배치한 뒤, 세로 스크롤 리듬과 카메라 구도를 콘티로 점검합니다.",
      cta: "웹툰 작업공간 열기",
      outputs: ["장면 대본", "컷 구성", "스크롤 리듬"],
    },
    en: {
      tab: "Script & board",
      title: "Write the script and storyboard",
      summary: "Turn the story into scenes, dialogue and panel rhythm.",
      body: "Break an episode into scenes, place action and dialogue, then test vertical pacing and camera composition in the storyboard.",
      cta: "Open the webtoon workspace",
      outputs: ["Scene script", "Panel plan", "Scroll rhythm"],
    },
  },
  {
    id: "art",
    icon: Palette,
    art: "create",
    href: "/studio/new",
    ko: {
      tab: "작화",
      title: "러프·선화·채색",
      summary: "장면을 레이어와 단계로 나누어 실제 원고로 완성합니다.",
      body: "러프에서 비례와 구도를 잡고, 선화와 채색, 배경, 효과와 말풍선을 분리해 수정 가능한 상태로 작업합니다.",
      cta: "새 프로젝트 시작하기",
      outputs: ["러프", "선화·채색", "배경·말풍선"],
    },
    en: {
      tab: "Art",
      title: "Rough, ink and color",
      summary: "Build the final page in editable layers and production stages.",
      body: "Establish proportion and composition in the rough, then separate ink, color, backgrounds, effects and speech balloons for safer revision.",
      cta: "Start a new project",
      outputs: ["Rough", "Ink and color", "Backgrounds and balloons"],
    },
  },
  {
    id: "review",
    icon: MessageSquare,
    art: "review",
    href: "/collaborate",
    ko: {
      tab: "검수·협업",
      title: "검수와 협업",
      summary: "수정 의견이 원고와 역할 사이에서 사라지지 않도록 전달합니다.",
      body: "스토리, 콘티, 작화와 편집 담당이 검수 기준을 공유하고 수정 요청, 완료 여부와 다음 담당자를 명확하게 남깁니다.",
      cta: "협업 흐름 둘러보기",
      outputs: ["검수 의견", "수정 상태", "담당자 전달"],
    },
    en: {
      tab: "Review",
      title: "Review and collaborate",
      summary: "Keep feedback visible across pages, roles and handoffs.",
      body: "Story, storyboard, art and editing roles share review criteria and make revision requests, completion state and the next owner explicit.",
      cta: "Explore collaboration",
      outputs: ["Review notes", "Revision state", "Role handoff"],
    },
  },
  {
    id: "save",
    icon: Save,
    art: "recovery",
    href: "/studio",
    ko: {
      tab: "저장·내보내기",
      title: "저장과 내보내기",
      summary: "공개보다 먼저 작업을 안전하게 남기고 다른 목적지로 옮길 준비를 합니다.",
      body: "프로젝트 저장과 복구 지점을 확인하고, 중요한 원고는 별도 파일로 내보냅니다. 비공개 보관, 외부 플랫폼 업로드와 공유 목적을 구분합니다.",
      cta: "내 작업 열기",
      outputs: ["프로젝트 저장", "복구 지점", "내보내기 파일"],
    },
    en: {
      tab: "Save & export",
      title: "Save and export",
      summary: "Protect the work before deciding where or whether to publish it.",
      body: "Check project saves and recovery points, then export important pages as separate files. Keep private storage, external upload and sharing purposes distinct.",
      cta: "Open My work",
      outputs: ["Project save", "Recovery point", "Export file"],
    },
  },
  {
    id: "release",
    icon: CalendarDays,
    art: "publish",
    href: "/publishing",
    ko: {
      tab: "연재·운영",
      title: "연재와 제작 운영",
      summary: "한 화의 완성에서 끝내지 않고 다음 마감과 버전을 이어갑니다.",
      body: "연재 일정, 에피소드 진행률, 수정 이력, 소개 자료와 권리 정보를 점검해 반복 가능한 제작 흐름으로 만듭니다.",
      cta: "연재·출판 준비 보기",
      outputs: ["연재 일정", "진행률", "소개·권리 자료"],
    },
    en: {
      tab: "Release",
      title: "Release and production operations",
      summary: "Continue from one finished episode into the next deadline and version.",
      body: "Review the release calendar, episode progress, revision history, pitch materials and rights information to build a repeatable production flow.",
      cta: "Open publishing preparation",
      outputs: ["Release calendar", "Progress", "Pitch and rights material"],
    },
  },
] as const satisfies readonly WorkflowStage[];

/** 예전 `#workflow-stage-N` 앵커를 탭으로 연다(공유 링크가 막다른 길이 되지 않게). */
export const WORKFLOW_STAGE_ANCHORS: Readonly<Record<string, WorkflowStageId>> = Object.fromEntries(
  WORKFLOW_STAGES.map((stage, index) => [`#workflow-stage-${index + 1}`, stage.id]),
);

/** 역할이 나뉘어도 흐름이 이어지도록 각 역할이 다음 사람에게 넘기는 결과물. */
export const WORKFLOW_HANDOFFS = [
  { id: "story", ko: { title: "스토리", detail: "대본·감정선·장면 목적" }, en: { title: "Story", detail: "Script, emotional arc and scene goal" } },
  { id: "board", ko: { title: "콘티", detail: "컷 분할·구도·스크롤 리듬" }, en: { title: "Storyboard", detail: "Panel split, composition and scroll rhythm" } },
  { id: "art", ko: { title: "작화", detail: "러프·선화·채색·배경" }, en: { title: "Art", detail: "Rough, ink, color and backgrounds" } },
  { id: "edit", ko: { title: "편집·검수", detail: "말풍선·효과·수정·최종 승인" }, en: { title: "Edit & review", detail: "Balloons, effects, revisions and approval" } },
] as const;
