import { LESSONS } from "./learning-content";
import type { LearningLevel } from "./learning-paths";

/**
 * 클래스 카탈로그와 수강 등록 상태.
 *
 * 클래스는 현금 결제를 받지 않는다(2026-10-02 정책 확정): 무료(0P)이거나
 * 활동으로 모은 포인트만 차감한다. 포인트 차감·환불은
 * `learning-class-points.ts` 어댑터 한 곳에서 지갑 원장과 연결한다.
 * 커리큘럼은 기존 강좌(LESSONS)를 참조만 하며 강좌 콘텐츠를 복제하지 않는다.
 * 등록 기록은 브라우저 로컬이 단일 출처이고, 저장값은 신뢰하지 않고 검증한다.
 */
export interface ClassCurriculumWeek {
  week: number;
  title: string;
  summary: string;
  lessonIds: readonly string[];
}

export interface ClassProduct {
  id: string;
  title: string;
  summary: string;
  instructor: string;
  level: LearningLevel;
  /** 등록에 필요한 활동 포인트. 0이면 무료 클래스. 현금 가격은 존재하지 않는다. */
  pointPrice: number;
  outcomes: readonly string[];
  curriculum: readonly ClassCurriculumWeek[];
}

export const CLASS_PRODUCTS: readonly ClassProduct[] = [
  {
    id: "first-episode-masterclass",
    title: "첫 회차 완성 마스터클래스",
    summary: "로그라인 한 줄에서 게시 가능한 첫 회차까지, 강좌와 스튜디오 실습 미션을 주차별로 엮은 대표 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "starter",
    // 구 현금 가격 99,000원을 포인트 정책 환산(100원 = 1P)으로 바꾼 값이다.
    pointPrice: 990,
    outcomes: [
      "상황·변화·반응이 읽히는 3컷 콘티와 첫 회차 러프",
      "대사 순서가 한눈에 읽히는 말풍선 배치",
      "원본과 게시본을 분리한 최종 검수 기록",
    ],
    curriculum: [
      { week: 1, title: "이야기와 호흡 설계", summary: "목표를 행동으로 바꾸고 컷 간격으로 읽는 호흡을 설계합니다.", lessonIds: ["story-board", "scroll-rhythm"] },
      { week: 2, title: "대사와 말풍선", summary: "대화 순서와 글자 공간을 설계해 읽기 흐름을 만듭니다.", lessonIds: ["lettering"] },
      { week: 3, title: "툰스튜디오 첫 3컷 실습", summary: "배운 연출을 실제 작업 화면의 러프로 옮깁니다.", lessonIds: ["studio-first-page"] },
      { week: 4, title: "게시 검수와 완성", summary: "게시 크기로 다시 확인하고 검수 기록을 남깁니다.", lessonIds: ["publish-check"] },
    ],
  },
  {
    id: "visual-finish-class",
    title: "작화·채색 완성 클래스",
    summary: "투시와 실루엣으로 공간과 초점을 잡고, 선화와 레이어 채색을 수정 가능한 구조로 완성하는 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "growing",
    // 무료 클래스 — 포인트 없이 바로 등록한다.
    pointPrice: 0,
    outcomes: [
      "아이레벨과 소실점이 일관된 공간 초안",
      "작게 보아도 행동이 읽히는 캐릭터 한 컷",
      "밑색·음영·클리핑이 분리된 채색 구조와 내보내기",
    ],
    curriculum: [
      { week: 1, title: "공간과 카메라", summary: "아이레벨과 소실점으로 장면의 공간 관계를 잡습니다.", lessonIds: ["camera-perspective"] },
      { week: 2, title: "실루엣과 선화", summary: "외곽으로 행동을 읽히게 하고 선마다 역할을 부여합니다.", lessonIds: ["character-silhouette", "inking"] },
      { week: 3, title: "레이어 채색", summary: "밑색·음영·클리핑을 분리해 수정 가능한 구조를 만듭니다.", lessonIds: ["color-layers"] },
      { week: 4, title: "스튜디오 레이어 실습", summary: "원본을 유지한 채 색 수정과 내보내기를 실습합니다.", lessonIds: ["studio-layer-practice"] },
    ],
  },
];

const PRODUCT_BY_ID = new Map(CLASS_PRODUCTS.map((product) => [product.id, product]));

export function getClassProduct(classId: string): ClassProduct | undefined {
  return PRODUCT_BY_ID.get(classId);
}

export function getClassLessonIds(product: ClassProduct): string[] {
  return [...new Set(product.curriculum.flatMap((week) => week.lessonIds))];
}

/** 포인트 표기. 0P인 무료 클래스의 "무료" 라벨은 화면이 따로 정한다. */
export function formatPoints(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `${safe.toLocaleString("ko-KR")}P`;
}

/** 카탈로그 무결성 — 존재하지 않는 강좌를 참조하면 안 된다. */
export function validateClassCatalog(products: readonly ClassProduct[] = CLASS_PRODUCTS): string[] {
  const lessonIds = new Set(LESSONS.map((lesson) => lesson.id));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    if (seen.has(product.id)) problems.push(`중복된 클래스 id: ${product.id}`);
    seen.add(product.id);
    if (!Number.isInteger(product.pointPrice) || product.pointPrice < 0) {
      problems.push(`포인트 가격이 올바르지 않은 클래스: ${product.id}`);
    }
    product.curriculum.forEach((week, index) => {
      if (week.week !== index + 1) problems.push(`주차 순서가 어긋난 클래스: ${product.id}`);
      for (const lessonId of week.lessonIds) {
        if (!lessonIds.has(lessonId)) problems.push(`없는 강좌를 참조하는 클래스: ${product.id} → ${lessonId}`);
      }
    });
  }
  return problems;
}

export type EnrollmentStatus = "enrolled" | "cancelled";

export interface ClassEnrollment {
  classId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  updatedAt: string;
  /** 포인트로 등록한 경우 지갑 원장의 차감 이벤트 ID(수강 취소 시 환불에 쓴다). 무료 등록이면 null. */
  spendEventId: string | null;
  /** 등록 당시 차감한 포인트. 무료 등록이면 0. */
  pointPricePaid: number;
}

export interface ClassEnrollmentState {
  version: 1;
  enrollments: Record<string, ClassEnrollment>;
}

export const CLASS_ENROLLMENT_STORAGE_KEY = "toonstudio:learning-classes:v1";

const MAX_TIMESTAMP_LENGTH = 64;

export function emptyClassEnrollments(): ClassEnrollmentState {
  return { version: 1, enrollments: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TIMESTAMP_LENGTH ? value : fallback;
}

function boundedEventId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TIMESTAMP_LENGTH ? value : null;
}

function nonNegativeAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

/** 저장된 등록 기록은 신뢰하지 않는다 — 모르는 클래스·깨진 상태는 버린다. */
export function parseClassEnrollments(raw: string | null): ClassEnrollmentState {
  if (!raw || raw.length > 100_000) return emptyClassEnrollments();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return emptyClassEnrollments(); }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.enrollments)) return emptyClassEnrollments();
  const enrollments: Record<string, ClassEnrollment> = {};
  for (const [classId, record] of Object.entries(value.enrollments)) {
    if (!PRODUCT_BY_ID.has(classId) || !isRecord(record)) continue;
    if (record.status !== "enrolled" && record.status !== "cancelled") continue;
    enrollments[classId] = {
      classId,
      status: record.status,
      enrolledAt: boundedTimestamp(record.enrolledAt, ""),
      updatedAt: boundedTimestamp(record.updatedAt, ""),
      spendEventId: boundedEventId(record.spendEventId),
      pointPricePaid: nonNegativeAmount(record.pointPricePaid),
    };
  }
  return { version: 1, enrollments };
}

export function loadClassEnrollments(storage: Pick<Storage, "getItem"> | null): ClassEnrollmentState {
  if (!storage) return emptyClassEnrollments();
  try { return parseClassEnrollments(storage.getItem(CLASS_ENROLLMENT_STORAGE_KEY)); }
  catch { return emptyClassEnrollments(); }
}

export function saveClassEnrollments(storage: Pick<Storage, "setItem"> | null, state: ClassEnrollmentState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CLASS_ENROLLMENT_STORAGE_KEY, JSON.stringify(parseClassEnrollments(JSON.stringify(state))));
    return true;
  } catch {
    return false;
  }
}

export function getActiveEnrollment(state: ClassEnrollmentState, classId: string): ClassEnrollment | null {
  const enrollment = state.enrollments[classId];
  return enrollment?.status === "enrolled" ? enrollment : null;
}

/** 수강 등록 — 이미 등록된 클래스는 최초 등록 시각을 유지한다. */
export function enrollClass(
  state: ClassEnrollmentState,
  classId: string,
  input: { now: string; spendEventId?: string | null; pointPricePaid?: number },
): ClassEnrollmentState {
  if (!PRODUCT_BY_ID.has(classId)) return state;
  const existing = state.enrollments[classId];
  if (existing?.status === "enrolled") return state;
  return {
    ...state,
    enrollments: {
      ...state.enrollments,
      [classId]: {
        classId,
        status: "enrolled",
        enrolledAt: existing?.enrolledAt || input.now,
        updatedAt: input.now,
        spendEventId: input.spendEventId ?? null,
        pointPricePaid: input.pointPricePaid ?? 0,
      },
    },
  };
}

export function cancelEnrollment(state: ClassEnrollmentState, classId: string, now: string): ClassEnrollmentState {
  const existing = state.enrollments[classId];
  if (!existing || existing.status !== "enrolled") return state;
  return {
    ...state,
    enrollments: {
      ...state.enrollments,
      [classId]: { ...existing, status: "cancelled", updatedAt: now },
    },
  };
}
