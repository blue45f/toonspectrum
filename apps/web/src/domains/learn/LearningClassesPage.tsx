import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAccountGate } from "@/domains/auth/public/account-gate";
import { useSession } from "@/domains/auth/public/session/auth-session-store";

import { LESSONS } from "./learning-content";
import { classCheckoutAdapter } from "./learning-class-checkout";
import {
  CLASS_PRODUCTS,
  applyEnrollment,
  cancelEnrollment,
  formatKrwPrice,
  getActiveEnrollment,
  getClassDiscountPercent,
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

const SAVE_WARNING = "신청 기록을 이 기기에 저장하지 못했습니다. 새로고침하면 신청 내역이 사라질 수 있습니다.";

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function lessonUrl(id: string): string {
  return `/learn/lessons/${encodeURIComponent(id)}`;
}

function formatAppliedDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR");
}

type FlowStage = "idle" | "confirming" | "submitting";

function ClassCard({
  product,
  enrolledAt,
  learningStore,
  onApply,
  onCancel,
}: {
  product: ClassProduct;
  enrolledAt: string | null;
  learningStore: LearningStore;
  onApply: (product: ClassProduct) => Promise<boolean>;
  onCancel: (product: ClassProduct) => void;
}) {
  const { ensureAccount } = useAccountGate();
  const [stage, setStage] = useState<FlowStage>("idle");
  const [notice, setNotice] = useState("");
  const lessonIds = getClassLessonIds(product);
  const lessonsDone = lessonIds.filter((id) => getLessonState(learningStore.progress, id) === "completed").length;
  const discount = getClassDiscountPercent(product);
  const appliedDate = enrolledAt ? formatAppliedDate(enrolledAt) : "";

  function beginApply() {
    // 게스트·미로그인은 표준 계정 게이트가 로그인 유도를 띄우고, 신청은 시작되지 않는다.
    if (!ensureAccount("payment")) return;
    setNotice("");
    setStage("confirming");
  }

  async function confirmApply() {
    setStage("submitting");
    const accepted = await onApply(product);
    setStage("idle");
    setNotice(accepted ? "사전 신청이 접수됐습니다. 결제가 열리면 신청 순서대로 안내합니다." : "신청을 접수하지 못했습니다. 잠시 뒤 다시 시도하세요.");
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
        연결 강좌 {lessonsDone}/{lessonIds.length} 완료 — 신청 없이도 강좌와 실습 미션은 그대로 이용할 수 있습니다.
      </p>

      <div className="learn-class-buybox">
        <div className="learn-class-price">
          {discount > 0 && <span className="learn-class-list-price">{formatKrwPrice(product.listPriceKrw)}</span>}
          <strong>{formatKrwPrice(product.priceKrw)}</strong>
          {discount > 0 && <span className="learn-class-discount">{discount}% 할인 예정가</span>}
        </div>

        {enrolledAt ? (
          <div className="learn-class-enrolled">
            <p role="status">사전 신청 완료{appliedDate ? ` · ${appliedDate}` : ""}</p>
            <button type="button" className="learn-secondary" onClick={() => onCancel(product)}>신청 취소</button>
          </div>
        ) : stage === "confirming" || stage === "submitting" ? (
          <div className="learn-class-confirm" role="group" aria-label={`${product.title} 신청 확인`}>
            <p>
              결제 오픈 전이라 지금은 <strong>사전 신청</strong>으로만 접수합니다.
              결제 금액 {formatKrwPrice(product.priceKrw)}은 결제가 열릴 때 다시 확인하고, 지금은 어떤 금액도 청구되지 않습니다.
            </p>
            <div className="learn-actions">
              <button type="button" className="learn-primary" disabled={stage === "submitting"} onClick={() => void confirmApply()}>
                {stage === "submitting" ? "접수 중…" : "사전 신청 확정"}
              </button>
              <button type="button" className="learn-secondary" disabled={stage === "submitting"} onClick={() => setStage("idle")}>
                돌아가기
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="learn-primary" onClick={beginApply}>수강 신청하기</button>
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
  const [enrollments, setEnrollments] = useState<ClassEnrollmentState>(() => loadClassEnrollments(browserStorage()));
  const [warning, setWarning] = useState("");

  useEffect(() => { document.title = "유료 클래스 · 툰스튜디오 아카데미"; }, []);

  function persist(next: ClassEnrollmentState) {
    setEnrollments(next);
    setWarning(saveClassEnrollments(browserStorage(), next) ? "" : SAVE_WARNING);
  }

  async function handleApply(product: ClassProduct): Promise<boolean> {
    const result = await classCheckoutAdapter.checkout({
      classId: product.id,
      userId: session?.user?.id ?? null,
    });
    if (result.kind !== "accepted") return false;
    persist(applyEnrollment(enrollments, product.id, result.appliedAt));
    return true;
  }

  function handleCancel(product: ClassProduct) {
    persist(cancelEnrollment(enrollments, product.id, new Date().toISOString()));
  }

  const appliedCount = CLASS_PRODUCTS.filter((product) => getActiveEnrollment(enrollments, product.id)).length;

  return (
    <div className="learn-page learn-classes-page" lang="ko">
      <header className="learn-lesson-header">
        <p className="learn-eyebrow">TOONSTUDIO PAID CLASSES</p>
        <h1>강좌에서 끝내지 않고,<br />완성까지 가는 클래스.</h1>
        <p className="learn-intro">
          유료 클래스는 주차별 커리큘럼으로 강좌와 스튜디오 실습 미션을 하나로 묶은 과정입니다.
          연결된 강좌와 실습 미션은 신청 없이도 지금처럼 이용할 수 있고, 클래스는 순서와 완성 목표를 잡아 주는 상품입니다.
        </p>
      </header>

      <aside className="learn-caution">
        <h2>지금은 결제 오픈 전, 사전 신청 기간입니다</h2>
        <p>
          신청해도 결제는 일어나지 않고 금액이 청구되지 않습니다. 결제가 열리면 신청 순서대로 안내하며,
          그때 가격을 다시 확인한 뒤에 결제를 진행합니다.
        </p>
      </aside>

      {warning && <p className="learn-caution" role="status">{warning}</p>}
      {appliedCount > 0 && <p className="learn-small" role="status">내 사전 신청 {appliedCount}건 · 신청 내역은 이 브라우저에 저장됩니다.</p>}

      <div className="learn-class-grid">
        {CLASS_PRODUCTS.map((product) => (
          <ClassCard
            key={product.id}
            product={product}
            enrolledAt={getActiveEnrollment(enrollments, product.id)?.appliedAt ?? null}
            learningStore={learningStore}
            onApply={handleApply}
            onCancel={handleCancel}
          />
        ))}
      </div>

      <section className="learn-banner">
        <div>
          <p className="learn-eyebrow">FREE FIRST</p>
          <h2>먼저 무료 강좌로 시작해 보세요.</h2>
          <p>클래스의 모든 연결 강좌는 무료로 열려 있습니다. 진도를 쌓은 뒤 필요할 때 신청해도 늦지 않습니다.</p>
        </div>
        <Link className="learn-secondary" to="/learn">전체 강좌 보기 →</Link>
      </section>
    </div>
  );
}
