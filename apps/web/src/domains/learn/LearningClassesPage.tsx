import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAccountGate } from "@/domains/auth/public/account-gate";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { computeBalance, useCurrentOwnerAssetPointEvents } from "@/domains/account/public/asset-points";

import { LESSONS } from "./learning-content";
import {
  cancelClassEnrollment,
  enrollInClass,
  refundClassPoints,
  type ClassEnrollResult,
} from "./learning-class-points";
import {
  CLASS_PRODUCTS,
  formatPoints,
  getActiveEnrollment,
  getClassLessonIds,
  loadClassEnrollments,
  saveClassEnrollments,
  type ClassEnrollmentState,
  type ClassProduct,
} from "./learning-classes";
import { getLessonState, type LearningLevel } from "./learning-paths";
import { useLearningProgress, type LearningStore } from "./use-learning-progress";

import "./learning-classes.css";

const LEVEL_LABELS: Readonly<Record<LearningLevel, string>> = {
  starter: "처음 시작",
  growing: "기초를 익힌 뒤",
  advanced: "완성·게시 단계",
};

const SAVE_WARNING = "수강 등록 기록을 이 기기에 저장하지 못했습니다. 새로고침하면 등록 내역이 사라질 수 있습니다.";

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function lessonUrl(id: string): string {
  return `/learn/lessons/${encodeURIComponent(id)}`;
}

function formatEnrolledDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR");
}

type FlowStage = "idle" | "confirming" | "insufficient";

function ClassCard({
  product,
  enrolledAt,
  balance,
  learningStore,
  onEnroll,
  onCancel,
}: {
  product: ClassProduct;
  enrolledAt: string | null;
  balance: number;
  learningStore: LearningStore;
  onEnroll: (product: ClassProduct) => Promise<ClassEnrollResult>;
  onCancel: (product: ClassProduct) => number;
}) {
  const { ensureAccount } = useAccountGate();
  const [stage, setStage] = useState<FlowStage>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [shortage, setShortage] = useState<{ balance: number; pointPrice: number } | null>(null);
  const [notice, setNotice] = useState("");
  const lessonIds = getClassLessonIds(product);
  const lessonsDone = lessonIds.filter((id) => getLessonState(learningStore.progress, id) === "completed").length;
  const enrolledDate = enrolledAt ? formatEnrolledDate(enrolledAt) : "";
  const isFree = product.pointPrice <= 0;
  const shortageBalance = shortage?.balance ?? balance;
  const missingPoints = Math.max(0, product.pointPrice - shortageBalance);

  function beginEnroll() {
    // 게스트·미로그인은 표준 계정 게이트가 로그인 유도를 띄우고, 등록은 시작되지 않는다.
    // 포인트 지갑과 수강 기록이 계정에 귀속되므로 로그인이 필요하다.
    if (!ensureAccount("save")) return;
    setNotice("");
    if (isFree) {
      void submitEnroll();
      return;
    }
    if (balance < product.pointPrice) {
      setShortage({ balance, pointPrice: product.pointPrice });
      setStage("insufficient");
      return;
    }
    setStage("confirming");
  }

  async function submitEnroll() {
    setSubmitting(true);
    const result = await onEnroll(product);
    setSubmitting(false);
    if (result.kind === "enrolled") {
      setStage("idle");
      setNotice(
        result.pointPricePaid > 0
          ? `${formatPoints(result.pointPricePaid)}를 사용해 수강 등록이 완료됐습니다.`
          : "무료로 수강 등록이 완료됐습니다.",
      );
      return;
    }
    if (result.kind === "insufficient-points") {
      setShortage({ balance: result.balance, pointPrice: result.pointPrice });
      setStage("insufficient");
      setNotice("");
      return;
    }
    setStage("idle");
    setNotice(
      result.kind === "storage-unavailable"
        ? "포인트 지갑을 불러오지 못했습니다. 잠시 뒤 다시 시도하세요."
        : "수강 등록을 완료하지 못했습니다. 잠시 뒤 다시 시도하세요.",
    );
  }

  function handleCancel() {
    const refundedPoints = onCancel(product);
    setNotice(
      refundedPoints > 0
        ? `수강을 취소하고 ${formatPoints(refundedPoints)}를 돌려받았습니다.`
        : "수강을 취소했습니다.",
    );
  }

  return (
    <article className="learn-class-card" aria-labelledby={`class-${product.id}-title`}>
      <div className="learn-class-card-top">
        <span className="learn-tag">{LEVEL_LABELS[product.level]}</span>
        <span className="learn-small">{product.instructor}</span>
      </div>
      <h2 id={`class-${product.id}-title`}>{product.title}</h2>
      <p className="learn-class-summary">{product.summary}</p>

      <h3>이 클래스를 마치면</h3>
      <ul className="learn-class-outcomes">
        {product.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}
      </ul>

      <h3>커리큘럼 · {product.curriculum.length}주</h3>
      <ol className="learn-class-curriculum">
        {product.curriculum.map((week) => (
          <li key={week.week}>
            <span className="learn-class-week">W{String(week.week).padStart(2, "0")}</span>
            <div>
              <strong>{week.title}</strong>
              <p>{week.summary}</p>
              <div className="learn-class-lessons">
                {week.lessonIds.map((lessonId) => {
                  const lesson = learningStore.progress.lessons[lessonId];
                  const title = lessonTitle(lessonId);
                  return title ? (
                    <Link key={lessonId} to={lessonUrl(lessonId)}>
                      {title}{lesson?.completed ? " · 완료" : ""}
                    </Link>
                  ) : null;
                })}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="learn-class-progress" role="status">
        연결 강좌 {lessonsDone}/{lessonIds.length} 완료 — 등록 없이도 강좌와 실습 미션은 그대로 이용할 수 있습니다.
      </p>

      <div className="learn-class-buybox">
        <div className="learn-class-price">
          <strong>{isFree ? "무료" : formatPoints(product.pointPrice)}</strong>
          <span className="learn-class-price-note">{isFree ? "포인트 없이 바로 등록" : "활동 포인트로 등록"}</span>
        </div>

        {enrolledAt ? (
          <div className="learn-class-enrolled">
            <p role="status">수강 중{enrolledDate ? ` · ${enrolledDate} 등록` : ""}</p>
            <button type="button" className="learn-secondary" onClick={handleCancel}>수강 취소</button>
          </div>
        ) : stage === "confirming" ? (
          <div className="learn-class-confirm" role="group" aria-label={`${product.title} 등록 확인`}>
            <p>
              등록하면 <strong>{formatPoints(product.pointPrice)}</strong>가 차감됩니다.
              현재 잔액 {formatPoints(balance)} → 등록 후 {formatPoints(balance - product.pointPrice)}.
              현금 결제는 없습니다.
            </p>
            <div className="learn-actions">
              <button type="button" className="learn-primary" disabled={submitting} onClick={() => void submitEnroll()}>
                {submitting ? "등록 중…" : "포인트 사용하고 등록"}
              </button>
              <button type="button" className="learn-secondary" disabled={submitting} onClick={() => setStage("idle")}>
                돌아가기
              </button>
            </div>
          </div>
        ) : stage === "insufficient" ? (
          <div className="learn-class-confirm" role="group" aria-label={`${product.title} 포인트 부족 안내`}>
            <p>
              포인트가 <strong>{formatPoints(missingPoints)}</strong> 부족합니다.
              필요 {formatPoints(product.pointPrice)} · 현재 잔액 {formatPoints(shortageBalance)}.
            </p>
            <p>
              포인트는 현금으로 살 수 없고 활동으로만 모을 수 있습니다.
              하루 첫 로그인 10P, 컷츠 클립 게시 30P처럼 작품 활동과 학습을 이어 가면 쌓입니다.
            </p>
            <div className="learn-actions">
              <button type="button" className="learn-secondary" onClick={() => setStage("idle")}>
                닫기
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="learn-primary" disabled={submitting} onClick={beginEnroll}>
            {submitting ? "등록 중…" : "수강 등록하기"}
          </button>
        )}
        {notice && <p className="learn-small" role="status">{notice}</p>}
      </div>
    </article>
  );
}

function lessonTitle(lessonId: string): string | null {
  return LESSONS.find((lesson) => lesson.id === lessonId)?.title ?? null;
}

export function LearningClassesPage() {
  const { data: session } = useSession();
  const learningStore = useLearningProgress();
  // 수강 등록은 계정 전용 — 저장 키를 계정으로 나눈다(게스트는 빈 파티션).
  const enrollmentOwnerKey = session?.user?.id ?? "guest";
  const [enrollments, setEnrollments] = useState<ClassEnrollmentState>(() =>
    loadClassEnrollments(browserStorage(), enrollmentOwnerKey),
  );
  // 세션은 비동기로 확정되므로, 소유자가 정해지면 그 파티션을 다시 읽는다.
  useEffect(() => {
    setEnrollments(loadClassEnrollments(browserStorage(), enrollmentOwnerKey));
  }, [enrollmentOwnerKey]);
  // 잔액은 지갑 스토어 구독으로 파생한다 — 차감·환불·하이드레이션이 끝나면 자동으로 갱신된다.
  const pointEvents = useCurrentOwnerAssetPointEvents();
  const balance = computeBalance(pointEvents, new Date());
  const [warning, setWarning] = useState("");

  useEffect(() => { document.title = "클래스 · 툰스튜디오 아카데미"; }, []);

  function persist(next: ClassEnrollmentState): boolean {
    setEnrollments(next);
    const saved = saveClassEnrollments(browserStorage(), next, enrollmentOwnerKey);
    setWarning(saved ? "" : SAVE_WARNING);
    return saved;
  }

  async function handleEnroll(product: ClassProduct): Promise<ClassEnrollResult> {
    const result = enrollInClass({
      enrollments,
      classId: product.id,
      userId: session?.user?.id ?? null,
    });
    if (result.kind === "enrolled") {
      const saved = persist(result.state);
      if (!saved && result.spendEventId) {
        // 등록 기록을 저장하지 못하면 차감만 남지 않도록 포인트를 되돌린다.
        refundClassPoints(result.spendEventId);
      }
    }
    return result;
  }

  function handleCancel(product: ClassProduct): number {
    const { state, refundedPoints } = cancelClassEnrollment({
      enrollments,
      classId: product.id,
    });
    persist(state);
    return refundedPoints;
  }

  const enrolledCount = CLASS_PRODUCTS.filter((product) => getActiveEnrollment(enrollments, product.id)).length;

  return (
    <div className="learn-page learn-classes-page" lang="ko">
      <header className="learn-lesson-header">
        <p className="learn-eyebrow">TOONSTUDIO CLASSES</p>
        <h1>강좌에서 끝내지 않고,<br />완성까지 가는 클래스.</h1>
        <p className="learn-intro">
          클래스는 주차별 커리큘럼으로 강좌와 스튜디오 실습 미션을 하나로 묶은 과정입니다.
          현금 결제는 없고, 무료이거나 활동으로 모은 포인트로 등록합니다.
          연결된 강좌와 실습 미션은 등록 없이도 지금처럼 이용할 수 있습니다.
        </p>
        <p className="learn-class-balance" role="status">
          내 포인트 <strong>{formatPoints(balance)}</strong> · 포인트는 현금으로 살 수 없고 활동으로만 모을 수 있습니다.
        </p>
      </header>

      <aside className="learn-caution">
        <h2>포인트는 활동으로 모아요</h2>
        <p>
          하루 첫 로그인 10P, 컷츠 클립 게시 30P처럼 매일의 활동이 포인트로 쌓입니다.
          포인트 클래스에 등록할 때만 차감되고, 수강을 취소하면 그대로 돌려받습니다.
        </p>
      </aside>

      {warning && <p className="learn-caution" role="status">{warning}</p>}
      {enrolledCount > 0 && <p className="learn-small" role="status">내 수강 클래스 {enrolledCount}건 · 등록 내역은 이 브라우저에 저장됩니다.</p>}

      <div className="learn-class-grid">
        {CLASS_PRODUCTS.map((product) => (
          <ClassCard
            key={product.id}
            product={product}
            enrolledAt={getActiveEnrollment(enrollments, product.id)?.enrolledAt ?? null}
            balance={balance}
            learningStore={learningStore}
            onEnroll={handleEnroll}
            onCancel={handleCancel}
          />
        ))}
      </div>

      <section className="learn-banner">
        <div>
          <p className="learn-eyebrow">FREE FIRST</p>
          <h2>먼저 무료 강좌로 시작해 보세요.</h2>
          <p>클래스의 모든 연결 강좌는 무료로 열려 있습니다. 진도를 쌓으며 포인트도 함께 모아 보세요.</p>
        </div>
        <Link className="learn-secondary" to="/learn">전체 강좌 보기 →</Link>
      </section>
    </div>
  );
}
