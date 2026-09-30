import {
  Building2,
  CalendarClock,
  CheckCircle2,
  FileText,
  HandCoins,
  Handshake,
  LockKeyhole,
  Send,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import {
  BUSINESS_INQUIRY_TYPES,
  isBusinessInquiryType,
  validateBusinessInquiryInput,
  type BusinessInquiryType,
} from "@toonstudio/core/business-inquiry";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { api, getApiErrorMessage } from "@/platform/api";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";
import { formatNumber } from "@toonstudio/core";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("BusinessPage", ko, en);

const TYPE_DETAILS: Record<BusinessInquiryType, { icon: typeof Handshake; ko: string; en: string }> = {
  investment: {
    icon: Building2,
    ko: "서비스와 팀에 대한 투자·IR 대화를 비공개로 시작합니다.",
    en: "Start a private investment and IR conversation about the service and the team.",
  },
  partnership: {
    icon: Handshake,
    ko: "플랫폼 연동, 공동 사업, 교육·제작 협업을 제안합니다.",
    en: "Propose platform integration, joint ventures, or education and production partnerships.",
  },
  content_ip: {
    icon: Sparkles,
    ko: "웹툰·일러스트·캐릭터·출판 등 콘텐츠와 IP 협업을 논의합니다.",
    en: "Discuss content and IP collaborations — webtoons, illustrations, characters, publishing.",
  },
  sponsorship: {
    icon: HandCoins,
    ko: "ToonStudio 프로젝트 후원, 브랜드 협찬, 스폰서십을 문의합니다.",
    en: "Ask about supporting ToonStudio projects, brand sponsorships and partnerships.",
  },
  ir_material: {
    icon: FileText,
    ko: "검토에 필요한 공개 가능한 IR 자료를 요청합니다.",
    en: "Request publicly shareable IR materials for your review.",
  },
  meeting: {
    icon: CalendarClock,
    ko: "구체적인 안건이 있다면 미팅 가능 여부를 문의합니다.",
    en: "Ask whether a meeting is possible when you have a concrete agenda.",
  },
};

interface FormState {
  organization: string;
  contactName: string;
  email: string;
  website: string;
  message: string;
  consentAccepted: boolean;
  faxNumber: string;
}

const INITIAL_FORM: FormState = {
  organization: "",
  contactName: "",
  email: "",
  website: "",
  message: "",
  consentAccepted: false,
  faxNumber: "",
};

export function BusinessPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("투자 · 제휴 · 후원 문의", "Investment, partnership & sponsorship inquiries"));
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedType = searchParams.get("type");
  const initialType = isBusinessInquiryType(requestedType) ? requestedType : "partnership";
  const [type, setType] = useState<BusinessInquiryType>(initialType);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // packages/core의 BUSINESS_INQUIRY_TYPE_LABELS는 코어 파일이라 건드리지 않고
  // 페이지 레벨에서 이중언어 라벨을 감싼다.
  const typeLabels: Record<BusinessInquiryType, string> = {
    investment: bi("투자 · IR 문의", "Investment & IR"),
    partnership: bi("사업 제휴", "Business partnership"),
    content_ip: bi("콘텐츠 · IP 제휴", "Content & IP partnership"),
    sponsorship: bi("후원 · 스폰서십", "Sponsorship"),
    ir_material: bi("IR 자료 요청", "IR materials request"),
    meeting: bi("미팅 요청", "Meeting request"),
  };

  const selected = TYPE_DETAILS[type];
  // NOTE: bi() resolves against the active locale at render time, so keep it
  // out of useMemo — useBilingualI18nRevision() above re-renders on locale change.
  const privacySummary = bi(
    "문의 처리와 회신을 위해 담당자 이름, 이메일, 선택 입력한 기관·웹사이트와 문의 내용을 수집합니다.",
    "We collect the contact name, email, and the optionally provided organization, website and inquiry text to process and respond to the inquiry.",
  );

  const chooseType = (nextType: BusinessInquiryType) => {
    setType(nextType);
    setSuccess(false);
    setError("");
    const next = new URLSearchParams(searchParams);
    next.set("type", nextType);
    setSearchParams(next, { replace: true });
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      type,
      ...form,
      sourcePath: "/business",
      consentAccepted: form.consentAccepted === true ? true : false,
    };
    const parsed = validateBusinessInquiryInput(payload);
    if (!parsed.value) {
      setError(parsed.error ?? bi("문의 내용을 확인해 주세요.", "Please check your inquiry details."));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await api.post<{ received: true; id?: string }>("/business/inquiries", parsed.value);
      setSuccess(true);
      setForm(INITIAL_FORM);
    } catch (requestError) {
      setError(await getApiErrorMessage(requestError, bi("문의를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.", "We couldn't receive your inquiry. Please try again in a moment.")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container size="wide" className="py-8 sm:py-12 lg:py-16">
      <PublicStoryHero
        purpose="collaborate"
        eyebrow="BUSINESS · IR · SPONSORSHIP"
        title={bi("함께 성장할 대화를 비공개로 시작하세요.", "Start a private conversation about growing together.")}
        description={bi(
          "투자·IR, 사업 제휴, 콘텐츠/IP 협업, 광고·스폰서십 문의를 한곳에서 접수합니다. 공개 피드백 게시판과 분리되어 문의 내용과 연락처가 커뮤니티에 노출되지 않습니다.",
          "One intake for investment/IR, business partnerships, content/IP collaboration and ads/sponsorships. Kept separate from the public feedback board so your inquiry and contact details never appear in the community.",
        )}
        image="materials"
        imageAlt={bi("웹툰 제작 재료와 협업 아이디어를 표현한 작업실 콘셉트 아트", "Atelier concept art expressing webtoon production materials and collaboration ideas")}
        caption={bi("PRIVATE BUSINESS INQUIRY · 비공개 비즈니스 문의", "PRIVATE BUSINESS INQUIRY")}
      >
        <a
          href="#business-inquiry-form"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
        >
          {bi("문의 작성하기", "Write an inquiry")} <Send size={16} aria-hidden="true" />
        </a>
        <Link
          href="/contact"
          className="ml-4 inline-flex min-h-12 items-center text-sm font-semibold text-fg-2 hover:text-accent"
        >
          {bi("일반 문의 경로 보기", "See general inquiry paths")}
        </Link>
      </PublicStoryHero>

      <section className="mt-8" aria-labelledby="business-types-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">{bi("문의 경로 선택", "CHOOSE AN INQUIRY PATH")}</p>
            <h2 id="business-types-title" className="mt-1 text-xl font-bold text-fg">{bi("문의 유형을 선택하세요", "Choose the inquiry type")}</h2>
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-fg-3">
            <LockKeyhole size={14} aria-hidden="true" /> {bi("공개 게시판에 게시되지 않습니다.", "Never posted to the public board.")}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {BUSINESS_INQUIRY_TYPES.map((item) => {
            const detail = TYPE_DETAILS[item];
            const Icon = detail.icon;
            const active = item === type;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={active}
                onClick={() => chooseType(item)}
                className={`min-h-32 rounded-2xl border p-5 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active
                    ? "border-accent bg-accent-soft shadow-sm"
                    : "border-line bg-card/70 hover:-translate-y-0.5 hover:border-accent/45 hover:bg-raised"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-accent">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  {active ? <CheckCircle2 size={18} className="text-accent" aria-hidden="true" /> : null}
                </div>
                <p className="mt-4 font-bold text-fg">{typeLabels[item]}</p>
                <p className="mt-1 text-sm leading-6 text-fg-2">{bi(detail.ko, detail.en)}</p>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          id="business-inquiry-form"
          onSubmit={submit}
          noValidate
          className="rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-7"
        >
          <div className="border-b border-line pb-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">{bi("비공개 문의", "PRIVATE INQUIRY")}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-[-0.025em] text-fg">{typeLabels[type]}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">{bi(selected.ko, selected.en)}</p>
          </div>

          {success ? (
            <div role="status" className="mt-6 rounded-2xl border border-accent/35 bg-accent-soft p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={21} aria-hidden="true" />
                <div>
                  <p className="font-bold text-fg">{bi("문의가 접수됐습니다.", "Your inquiry has been received.")}</p>
                  <p className="mt-1 text-sm leading-6 text-fg-2">{bi("입력한 이메일을 기준으로 검토 후 필요한 경우 회신드리겠습니다.", "We'll review it and reply to the email you entered if needed.")}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-fg">
              {bi("회사·기관명", "Organization")} <span className="text-xs font-normal text-fg-3">{bi("선택", "Optional")}</span>
              <input
                value={form.organization}
                onChange={(event) => setField("organization", event.target.value)}
                maxLength={120}
                autoComplete="organization"
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm font-normal text-fg outline-none transition-colors focus:border-accent"
                placeholder={bi("회사, 투자기관, 스튜디오 등", "Company, investor, studio, etc.")}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-fg">
              {bi("담당자 이름", "Contact name")} <span className="text-danger">*</span>
              <input
                required
                value={form.contactName}
                onChange={(event) => setField("contactName", event.target.value)}
                maxLength={80}
                autoComplete="name"
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm font-normal text-fg outline-none transition-colors focus:border-accent"
                placeholder={bi("회신받을 담당자 이름", "Name of the person to reply to")}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-fg">
              {bi("이메일", "Email")} <span className="text-danger">*</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                maxLength={254}
                autoComplete="email"
                inputMode="email"
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm font-normal text-fg outline-none transition-colors focus:border-accent"
                placeholder="name@company.com"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-fg">
              {bi("회사·프로젝트 웹사이트", "Company / project website")} <span className="text-xs font-normal text-fg-3">{bi("선택", "Optional")}</span>
              <input
                type="url"
                value={form.website}
                onChange={(event) => setField("website", event.target.value)}
                maxLength={300}
                autoComplete="url"
                inputMode="url"
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm font-normal text-fg outline-none transition-colors focus:border-accent"
                placeholder="https://"
              />
            </label>
          </div>

          <label className="mt-5 grid gap-2 text-sm font-semibold text-fg">
            {bi("문의 내용", "Inquiry details")} <span className="text-danger">*</span>
            <textarea
              required
              value={form.message}
              onChange={(event) => setField("message", event.target.value)}
              minLength={10}
              maxLength={5000}
              rows={9}
              className="resize-y rounded-xl border border-line bg-panel p-3 text-sm font-normal leading-6 text-fg outline-none transition-colors focus:border-accent"
              placeholder={bi("제안 배경, 함께 논의하고 싶은 내용, 필요한 자료나 다음 단계를 적어 주세요. 민감한 계약 정보나 계정 비밀번호는 입력하지 마세요.", "Describe the background, what you'd like to discuss, needed materials and next steps. Do not enter sensitive contract details or account passwords.")}
            />
            <span className="text-right text-xs font-normal text-fg-3">{formatNumber(form.message.length)} / 5,000</span>
          </label>

          <div className="absolute -left-[10000px] top-auto size-px overflow-hidden" aria-hidden="true">
            <label>
              Fax number
              <input
                tabIndex={-1}
                autoComplete="off"
                value={form.faxNumber}
                onChange={(event) => setField("faxNumber", event.target.value)}
              />
            </label>
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panel/55 p-4">
            <input
              type="checkbox"
              checked={form.consentAccepted}
              onChange={(event) => setField("consentAccepted", event.target.checked)}
              className="mt-1 size-4 accent-[var(--color-accent)]"
            />
            <span className="text-sm leading-6 text-fg-2">
              <strong className="font-semibold text-fg">{bi("개인정보 수집·이용에 동의합니다.", "I agree to the collection and use of personal information.")}</strong><br />
              {privacySummary} {bi("자세한 내용은", "See the")} <Link href="/privacy" className="font-semibold text-accent hover:underline">{bi("개인정보처리방침", "Privacy Policy")}</Link>{bi("을 확인하세요.", " for details.")}
            </span>
          </label>

          {error ? (
            <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {submitting ? bi("접수 중…", "Submitting…") : bi("비공개 문의 보내기", "Send private inquiry")}
            <Send size={16} aria-hidden="true" />
          </button>
        </form>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-panel/55 p-5">
            <h2 className="flex items-center gap-2 font-bold text-fg"><Building2 size={18} className="text-accent" /> {bi("투자 문의 안내", "About investment inquiries")}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {bi(
                "이 화면은 IR 대화와 자료·미팅 요청을 접수하는 창구입니다. 지분·증권 청약, 투자금 결제, 예상 수익률 제시는 제공하지 않습니다.",
                "This screen receives IR conversations and materials/meeting requests. It does not offer equity subscriptions, investment payments or return projections.",
              )}
            </p>
          </section>
          <section className="rounded-2xl border border-line bg-panel/55 p-5">
            <h2 className="flex items-center gap-2 font-bold text-fg"><HandCoins size={18} className="text-accent" /> {bi("후원 · 스폰서십", "Donations & sponsorship")}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {bi(
                "현재는 프로젝트 후원·브랜드 스폰서십 의향을 비공개로 접수합니다. 이 경로는 세액공제용 기부금 모집이 아니며, 사이트 내 직접 후원 결제는 아직 받지 않습니다.",
                "Currently we privately receive interest in project support and brand sponsorships. This path is not a tax-deductible donation drive, and we do not yet accept direct support payments on the site.",
              )}
            </p>
            <button
              type="button"
              onClick={() => chooseType("sponsorship")}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-accent"
            >
              {bi("후원·스폰서십 문의 선택", "Choose sponsorship inquiry")}
            </button>
          </section>
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="flex items-center gap-2 font-bold text-fg"><LockKeyhole size={18} className="text-accent" /> {bi("최소 정보만 받습니다", "We ask for the minimum only")}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-fg-2">
              <li>• {bi("첨부파일은 받지 않아 민감 문서의 불필요한 업로드를 막습니다.", "We don't accept attachments, preventing unnecessary uploads of sensitive documents.")}</li>
              <li>• {bi("IP 주소와 브라우저·기기 식별 정보는 문의 데이터로 저장하지 않습니다.", "We don't store IP addresses or browser/device identifiers with inquiry data.")}</li>
              <li>• {bi("공개 토론이 필요한 제안은", "For proposals needing public discussion, use the")} <Link href="/feedback" className="font-semibold text-accent hover:underline">{bi("피드백 보드", "feedback board")}</Link>{bi("를 이용할 수 있습니다.", ".")}</li>
            </ul>
          </section>
        </aside>
      </div>
    </Container>
  );
}
