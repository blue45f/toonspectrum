import { ArrowRight, Check, Info, Minus, Sparkles } from "lucide-react";

import { MEMBERSHIP_PLAN_POLICIES } from "@toonstudio/core/membership-wallet";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/container";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";

const number = new Intl.NumberFormat("ko-KR");

const freePlan = MEMBERSHIP_PLAN_POLICIES.free;
const proPlan = MEMBERSHIP_PLAN_POLICIES.pro;

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${number.format(bytes / 1_000_000_000)} GB`;
  }
  return `${number.format(bytes / 1_000_000)} MB`;
}

type PlanValue = string | boolean;

const COMPARISON_ROWS: ReadonlyArray<{
  readonly label: string;
  readonly free: PlanValue;
  readonly pro: PlanValue;
  readonly note?: string;
}> = [
  {
    label: "월 요금",
    free: "₩0 · 무료",
    pro: "요금제 준비 중",
    note: "Pro 유료 구독 도입 전 가격·환불·자동갱신을 별도로 고지합니다.",
  },
  { label: "저장공간", free: formatBytes(Number(freePlan.entitlements["storage.bytes"])), pro: formatBytes(Number(proPlan.entitlements["storage.bytes"])) },
  {
    label: "월 Studio Credit",
    free: `${number.format(Number(freePlan.entitlements["credit.monthlyIncluded"]))} C`,
    pro: `${number.format(Number(proPlan.entitlements["credit.monthlyIncluded"]))} C`,
    note: "매월 지급·이월 없음. ToonStudio 비용형 AI·서버 렌더에만 사용합니다.",
  },
  { label: "일일 Credit 한도", free: `${number.format(Number(freePlan.entitlements["credit.dailyLimit"]))} C`, pro: `${number.format(Number(proPlan.entitlements["credit.dailyLimit"]))} C` },
  { label: "월 AI 토큰", free: number.format(Number(freePlan.entitlements["ai.monthlyTokens"])), pro: number.format(Number(proPlan.entitlements["ai.monthlyTokens"])) },
  { label: "파일 1개 최대 크기", free: formatBytes(Number(freePlan.entitlements["upload.file.maxBytes"])), pro: formatBytes(Number(proPlan.entitlements["upload.file.maxBytes"])) },
  { label: "버전 보관", free: `${number.format(Number(freePlan.entitlements["retention.versionsDays"]))}일`, pro: `${number.format(Number(proPlan.entitlements["retention.versionsDays"]))}일` },
  { label: "협업 멤버", free: `${number.format(Number(freePlan.entitlements["collaboration.members"]))}명`, pro: `${number.format(Number(proPlan.entitlements["collaboration.members"]))}명` },
  { label: "고해상도 내보내기", free: freePlan.entitlements["export.highResolution"], pro: proPlan.entitlements["export.highResolution"] },
  { label: "WebGPU 내보내기", free: freePlan.entitlements["feature.webgpuExport"], pro: proPlan.entitlements["feature.webgpuExport"] },
  { label: "CMYK 소프트프루프", free: freePlan.entitlements["feature.cmykSoftProof"], pro: proPlan.entitlements["feature.cmykSoftProof"] },
  { label: "커스텀 플러그인", free: freePlan.entitlements["feature.customPlugins"], pro: proPlan.entitlements["feature.customPlugins"] },
  { label: "마켓 판매", free: freePlan.entitlements["market.sell"], pro: proPlan.entitlements["market.sell"] },
];

const FAQ_ITEMS: ReadonlyArray<{ readonly question: string; readonly answer: string; readonly link?: { readonly href: string; readonly label: string } }> = [
  {
    question: "지금 Pro를 결제할 수 있나요?",
    answer:
      "아니요. 현재는 실제 결제를 받지 않습니다. Pro 유료 구독을 도입하더라도 가격·환불·자동갱신 정책을 별도로 고지하기 전에는 유료 구독으로 취급하지 않습니다.",
    link: { href: "/membership", label: "멤버십 정책 보기" },
  },
  {
    question: "Free는 정말 무료인가요?",
    answer:
      "네. 기본 창작·커뮤니티 기능과 개인 작업을 위한 시작 등급으로 무료이며, 저장공간 10GB·공정 사용 한도 같은 안전 기준은 베타 기간에도 적용됩니다.",
  },
  {
    question: "Pro 요금은 언제 정해지나요?",
    answer:
      "준비 중입니다. 요금이 확정되면 가격·환불·자동갱신 정책을 이 페이지와 멤버십 정책에 먼저 고지합니다. 출시 소식에 대한 문의는 아래 문의 채널로 보내주세요.",
    link: { href: "/contact", label: "출시 소식 문의하기" },
  },
  {
    question: "결제 없이 Pro급 기능을 이용할 수 있나요?",
    answer:
      "멤버십은 현재 베타 혜택·창작자 지원·운영상 권한 부여에 사용하는 등급이라 베타·프로모션·운영 정책으로 별도 부여될 수 있습니다. 멤버십 상향은 포인트를 자동 소모하지 않습니다.",
    link: { href: "/membership", label: "멤버십 정책 보기" },
  },
  {
    question: "포인트와 Studio Credit은 요금제와 어떤 관계인가요?",
    answer:
      "활동 포인트는 현금성 재화가 아니며 지급일로부터 365일 동안 유효합니다. Studio Credit은 매월 멤버십 포함분으로 지급되고 다음 월로 이월되지 않습니다. 개인 API 키·개인 Creator Runtime·브라우저 로컬 작업에는 Credit을 차감하지 않습니다.",
  },
];

function PlanCell({ value }: { readonly value: PlanValue }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center gap-1.5 font-bold text-fg">
        <Check size={16} className="text-accent" aria-hidden="true" />
        <span>지원</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-fg-3">
        <Minus size={16} aria-hidden="true" />
        <span>미지원</span>
      </span>
    );
  }
  return <span className="font-bold text-fg">{value}</span>;
}

export function PricingPage() {
  const title = "요금제 · ToonStudio";
  const description =
    "ToonStudio 요금제를 확인하세요. Free는 무료로 시작하고, Pro는 고급 창작 기능을 준비 중입니다. 현재는 실제 결제를 받지 않습니다.";

  useDocumentTitle(title);
  useMetaDescription(description);
  usePageSocialMeta({ canonicalPath: "/pricing", title, description });

  return (
    <div className="min-h-[calc(100dvh-var(--site-header-height,4.25rem))] bg-canvas py-7 sm:py-10 lg:py-12">
      <Container size="wide">
        <header className="relative overflow-hidden rounded-[2rem] border border-line-strong bg-panel p-6 sm:p-9">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,oklch(0.75_0.16_70/0.12),transparent_32%),radial-gradient(circle_at_10%_95%,oklch(0.7_0.18_315/0.10),transparent_36%)]" />
          <div className="relative max-w-4xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-black tracking-[0.14em] text-accent">
              <Sparkles size={14} aria-hidden /> PRICING
            </p>
            <h1 className="mt-5 font-display text-4xl font-black tracking-[-0.04em] text-fg sm:text-6xl">
              무료로 시작하고,
              <br />
              필요할 때 넓히세요.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-fg-2 sm:text-lg">
              기본 창작 기능은 Free로 무료이며, 고용량 제작·고급 협업을 위한 Pro는 준비 중입니다.
            </p>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-card/70 p-4">
              <Info size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <p className="text-sm leading-6 text-fg-2">
                <strong className="text-fg">현재는 실제 결제를 받지 않습니다.</strong>{" "}
                멤버십은 현재 구매 상품이 아니며, Pro 유료 구독 도입 전에는 가격·환불·자동갱신
                정책을 별도로 고지합니다. 아래 한도와 비교는 멤버십 정책과 같은 기준으로 표시됩니다.
              </p>
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-2" aria-label="요금제 선택">
          <article className="rounded-[2rem] border border-line bg-panel p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-accent">Free</p>
            <p className="mt-3 font-display text-4xl font-black text-fg">
              ₩0 <span className="text-base font-bold text-fg-3">/ 무료</span>
            </p>
            <p className="mt-3 text-sm leading-6 text-fg-2">{freePlan.description}</p>
            <ul className="mt-5 space-y-2 text-sm leading-6 text-fg-2">
              <li>• 저장공간 {formatBytes(Number(freePlan.entitlements["storage.bytes"]))}</li>
              <li>• 월 Studio Credit {number.format(Number(freePlan.entitlements["credit.monthlyIncluded"]))} C</li>
              <li>• 협업 멤버 {number.format(Number(freePlan.entitlements["collaboration.members"]))}명</li>
            </ul>
            <Link
              href="/studio/new"
              className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fg px-5 py-3 text-sm font-bold text-canvas transition-transform hover:-translate-y-0.5 motion-reduce:transform-none"
            >
              무료로 시작하기
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>

          <article className="relative rounded-[2rem] border-2 border-accent/50 bg-panel p-6 shadow-sm sm:p-8">
            <span className="absolute -top-3.5 left-6 rounded-full bg-accent px-3 py-1 text-xs font-black text-on-accent">
              준비 중
            </span>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-accent">Pro</p>
            <p className="mt-3 font-display text-4xl font-black text-fg">
              출시 전 <span className="text-base font-bold text-fg-3">/ 요금 고지 예정</span>
            </p>
            <p className="mt-3 text-sm leading-6 text-fg-2">{proPlan.description}</p>
            <ul className="mt-5 space-y-2 text-sm leading-6 text-fg-2">
              <li>• 저장공간 {formatBytes(Number(proPlan.entitlements["storage.bytes"]))}</li>
              <li>• 월 Studio Credit {number.format(Number(proPlan.entitlements["credit.monthlyIncluded"]))} C</li>
              <li>• 고해상도·WebGPU 내보내기, CMYK 소프트프루프 지원</li>
            </ul>
            <Link
              href="/contact"
              className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-5 py-3 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
            >
              Pro 출시 문의하기
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
        </section>

        <section className="mt-10" aria-labelledby="pricing-compare-title">
          <p className="text-xs font-black tracking-[0.14em] text-accent">COMPARE PLANS</p>
          <h2 id="pricing-compare-title" className="mt-2 text-3xl font-black tracking-tight text-fg">
            Free · Pro 비교
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-2">
            비교 수치는 멤버십 정책의 자원 한도와 같은 기준입니다. Pro 열의 한도는 등급 기준이며,
            유료 결제와는 무관합니다.
          </p>
          <div className="mt-6 overflow-x-auto rounded-[1.75rem] border border-line/70">
            <table className="w-full min-w-[34rem] border-collapse bg-panel text-left">
              <caption className="sr-only">Free 요금제와 Pro 요금제 비교표</caption>
              <thead>
                <tr className="border-b border-line/70">
                  <th scope="col" className="px-4 py-4 text-xs font-black tracking-wide text-fg-3 sm:px-6">
                    <span className="sr-only">항목</span>
                  </th>
                  <th scope="col" className="px-4 py-4 text-sm font-black text-fg sm:px-6">Free</th>
                  <th scope="col" className="px-4 py-4 text-sm font-black text-fg sm:px-6">
                    <span className="inline-flex items-center gap-2">
                      Pro
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.66rem] font-black text-accent">
                        준비 중
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-line/50 last:border-0">
                    <th scope="row" className="px-4 py-3.5 text-sm font-semibold text-fg-3 sm:px-6">
                      {row.label}
                    </th>
                    <td className="px-4 py-3.5 text-sm sm:px-6">
                      <PlanCell value={row.free} />
                    </td>
                    <td className="px-4 py-3.5 text-sm sm:px-6">
                      <PlanCell value={row.pro} />
                      {row.note ? <p className="mt-1 text-xs leading-5 text-fg-3">{row.note}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="pricing-faq-title">
          <p className="text-xs font-black tracking-[0.14em] text-accent">FAQ</p>
          <h2 id="pricing-faq-title" className="mt-2 text-3xl font-black tracking-tight text-fg">
            자주 묻는 질문
          </h2>
          <div className="mt-6 space-y-3">
            {FAQ_ITEMS.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border border-line bg-panel p-5 open:bg-card/60 sm:p-6"
              >
                <summary className="cursor-pointer list-none text-base font-bold text-fg marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {item.question}
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-accent transition-transform group-open:rotate-90 motion-reduce:transform-none"
                    />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-7 text-fg-2">{item.answer}</p>
                {item.link ? (
                  <Link
                    href={item.link.href}
                    className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-accent"
                  >
                    {item.link.label}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ) : null}
              </details>
            ))}
          </div>
        </section>

        <section
          className="mt-10 rounded-[2rem] border border-line/70 bg-panel/70 p-6 shadow-sm sm:p-8 lg:p-10"
          aria-labelledby="pricing-more-title"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 id="pricing-more-title" className="text-2xl font-black tracking-tight text-fg">
                세부 자원 한도와 운영 원칙이 궁금하다면
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-2">
                멤버십·포인트·용량 정책 페이지에서 저장공간, Studio Credit, 활동 포인트, 공정 사용
                한도의 전체 기준을 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/membership"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-fg px-5 py-3 text-sm font-bold text-canvas transition-transform hover:-translate-y-0.5 motion-reduce:transform-none"
              >
                멤버십 정책 보기
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
              >
                문의하기
              </Link>
            </div>
          </div>
        </section>
      </Container>
    </div>
  );
}

export default PricingPage;
