import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Palette,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";

import {
  createStudioAiProjectHandoff,
  writeStudioAiProjectHandoff,
} from "../ai/studio-ai-project-handoff";
import {
  productionAiAssistDisclosure,
  type ProductionAiAssistPlan,
} from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";

const lightingLabels = {
  soft: "부드러운 확산광",
  dramatic: "명암 대비가 큰 극적 조명",
  backlight: "역광",
  night: "야간 조명",
} as const;
const colorLabels = {
  preserve: "기존 색을 유지",
  warm: "따뜻한 색온도",
  cool: "차가운 색온도",
  monochrome: "단색 명암",
} as const;

function planPrompt(plan: ProductionAiAssistPlan, process: ProductionManuscriptProcess): string {
  const scope = plan.scope === "selection"
    ? "현재 선택 영역"
    : plan.scope === "active-panel" ? "현재 컷" : "현재 페이지";
  const output = plan.output === "new-layer"
    ? "원본을 덮지 말고 새 음영 레이어"
    : "원본을 덮지 말고 새 revision 후보";
  return [
    `대상 원고: ${process.artifact.title}`,
    `${scope}에 ${lightingLabels[plan.lighting]} 기준의 음영·광원 보조를 제안해줘.`,
    `${colorLabels[plan.color]} 원칙을 지키고 캐릭터 선과 말풍선은 훼손하지 마.`,
    `결과는 ${output}로 적용할 수 있게 미리보기와 마스크 경계를 제공해줘.`,
    "실행 전 처리 범위·공급자·예상 비용·외부 전송 여부를 다시 확인해.",
    "사용자가 명시적으로 승인하기 전에는 문서를 변경하지 마.",
  ].join("\n");
}

export function ProductionFocusedAiWorkflow({
  workId,
  process,
  editorHref,
}: {
  readonly workId: string;
  readonly process: ProductionManuscriptProcess | null;
  readonly editorHref: string | null;
}) {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<ProductionAiAssistPlan>({
    scope: "selection",
    lighting: "soft",
    color: "preserve",
    provider: "project-default",
    output: "new-layer",
  });
  const [notice, setNotice] = useState("");
  const disclosures = useMemo(() => productionAiAssistDisclosure(plan), [plan]);
  const prompt = process ? planPrompt(plan, process) : "";

  const launch = () => {
    if (!process || !editorHref) return;
    try {
      const handoff = createStudioAiProjectHandoff({
        projectId: workId,
        documentId: process.artifact.id,
        tool: "palette",
        prompt,
        source: "review",
      });
      writeStudioAiProjectHandoff(window.sessionStorage, handoff);
      setNotice("편집기에서 선택 영역과 실행 조건을 다시 확인합니다. 아직 생성이나 과금은 시작되지 않았습니다.");
      navigate(editorHref);
    } catch {
      setNotice("AI 보조 요청을 안전하게 전달하지 못했습니다. 편집기에서 직접 도우미를 열어 주세요.");
    }
  };
  return <section className="rounded-3xl border border-accent/30 bg-card p-4 sm:p-6" aria-labelledby="focused-ai-title" data-production-focused-ai="">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="flex items-center gap-2 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">
          <Sparkles className="size-4" aria-hidden="true" /> FOCUSED AI ASSIST
        </p>
        <h2 id="focused-ai-title" className="mt-2 text-xl font-black text-fg">선택 영역 음영·광원 보조를 끝까지 안내합니다</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">범용 AI 메뉴가 아니라 반복 작업 하나를 준비합니다. Production에서는 실행하지 않고, 편집기에서 대상 픽셀·공급자·비용·외부 전송을 다시 확인한 뒤 새 레이어나 revision으로 적용합니다.</p>
      </div>
      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-good/30 bg-good/10 px-3 text-xs font-bold text-good">
        <CheckCircle2 className="size-4" aria-hidden="true" /> 원본 비파괴
      </span>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-xs font-bold text-fg-2">처리 범위
        <select value={plan.scope} onChange={(event) => setPlan({ ...plan, scope: event.target.value as ProductionAiAssistPlan["scope"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="selection">선택 영역</option><option value="active-panel">현재 컷</option><option value="active-page">현재 페이지</option>
        </select>
      </label>
      <label className="text-xs font-bold text-fg-2">조명
        <select value={plan.lighting} onChange={(event) => setPlan({ ...plan, lighting: event.target.value as ProductionAiAssistPlan["lighting"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="soft">부드러운 확산광</option><option value="dramatic">극적 대비</option><option value="backlight">역광</option><option value="night">야간</option>
        </select>
      </label>
      <label className="text-xs font-bold text-fg-2">색상
        <select value={plan.color} onChange={(event) => setPlan({ ...plan, color: event.target.value as ProductionAiAssistPlan["color"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="preserve">기존 색 유지</option><option value="warm">따뜻하게</option><option value="cool">차갑게</option><option value="monochrome">단색 명암</option>
        </select>
      </label>
      <label className="text-xs font-bold text-fg-2">처리 방식
        <select value={plan.provider} onChange={(event) => setPlan({ ...plan, provider: event.target.value as ProductionAiAssistPlan["provider"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="project-default">프로젝트 기본</option><option value="local">로컬 우선</option><option value="external">외부 공급자</option>
        </select>
      </label>
      <label className="text-xs font-bold text-fg-2">적용 결과
        <select value={plan.output} onChange={(event) => setPlan({ ...plan, output: event.target.value as ProductionAiAssistPlan["output"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="new-layer">새 레이어</option><option value="new-revision">새 revision 후보</option>
        </select>
      </label>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
      <article className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2"><Palette className="size-4 text-accent" aria-hidden="true" /><h3 className="font-black text-fg">편집기로 전달할 작업 지시</h3></div>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-card p-3 text-xs leading-5 text-fg-2">{prompt || "이미지 원고를 선택하면 작업 지시가 만들어집니다."}</pre>
      </article>
      <article className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2"><ExternalLink className="size-4 text-accent" aria-hidden="true" /><h3 className="font-black text-fg">실행 전 공개 사항</h3></div>
        <ul className="mt-3 space-y-2">{disclosures.map((item) => <li key={item} className="flex items-start gap-2 text-xs leading-5 text-fg-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />{item}</li>)}</ul>
      </article>
    </div>

    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-fg-3">실패·취소·재시도와 중복 청구 방지는 실제 편집기 실행 경계에서 확인합니다.</p>
      <button type="button" disabled={!process || !editorHref} onClick={launch} className={buttonClass({ className: "min-h-11 gap-2" })}>
        <WandSparkles className="size-4" aria-hidden="true" /> 편집기에서 미리보기·비용 확인 <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </div>
    {notice ? <p className="mt-3 text-xs text-fg-2" role="status">{notice}</p> : null}
  </section>;
}
