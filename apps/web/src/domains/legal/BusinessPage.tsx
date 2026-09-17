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
import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import {
  BUSINESS_INQUIRY_TYPES,
  BUSINESS_INQUIRY_TYPE_LABELS,
  isBusinessInquiryType,
  validateBusinessInquiryInput,
  type BusinessInquiryType,
} from "@toonspectrum/core/business-inquiry";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api, getApiErrorMessage } from "@/infrastructure/api";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";

const TYPE_DETAILS: Record<BusinessInquiryType, { icon: typeof Handshake; description: string }> = {
  investment: {
    icon: Building2,
    description: "서비스와 팀에 대한 투자·IR 대화를 비공개로 시작합니다.",
  },
  partnership: {
    icon: Handshake,
    description: "플랫폼 연동, 공동 사업, 교육·제작 협업을 제안합니다.",
  },
  content_ip: {
    icon: Sparkles,
    description: "웹툰·일러스트·캐릭터·출판 등 콘텐츠와 IP 협업을 논의합니다.",
  },
  sponsorship: {
    icon: HandCoins,
    description: "ToonSpectrum 프로젝트 후원, 브랜드 협찬, 스폰서십을 문의합니다.",
  },
  ir_material: {
    icon: FileText,
    description: "검토에 필요한 공개 가능한 IR 자료를 요청합니다.",
  },
  meeting: {
    icon: CalendarClock,
    description: "구체적인 안건이 있다면 미팅 가능 여부를 문의합니다.",
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
  useDocumentTitle("투자 · 제휴 · 후원 문의");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedType = searchParams.get("type");
  const initialType = isBusinessInquiryType(requestedType) ? requestedType : "partnership";
  const [type, setType] = useState<BusinessInquiryType>(initialType);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const selected = TYPE_DETAILS[type];
  const privacySummary = useMemo(
    () => "문의 처리와 회신을 위해 담당자 이름, 이메일, 선택 입력한 기관·웹사이트와 문의 내용을 수집합니다.",
    [],
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
      setError(parsed.error ?? "문의 내용을 확인해 주세요.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await api.post<{ received: true; id?: string }>("/business/inquiries", parsed.value);
      setSuccess(true);
      setForm(INITIAL_FORM);
    } catch (requestError) {
      setError(await getApiErrorMessage(requestError, "문의를 접수하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container size="wide" className="py-8 sm:py-12 lg:py-16">
      <PublicStoryHero
        eyebrow="BUSINESS · IR · SPONSORSHIP"
        title="함께 성장할 대화를 비공개로 시작하세요."
        description="투자·IR, 사업 제휴, 콘텐츠/IP 협업, 광고·스폰서십 문의를 한곳에서 접수합니다. 공개 피드백 게시판과 분리되어 문의 내용과 연락처가 커뮤니티에 노출되지 않습니다."
        image="materials"
        imageAlt="웹툰 제작 재료와 협업 아이디어를 표현한 작업실 콘셉트 아트"
        caption="PRIVATE BUSINESS INQUIRY · 비공개 비즈니스 문의"
      >
        <a
          href="#business-inquiry-form"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
        >
          문의 작성하기 <Send size={16} aria-hidden="true" />
        </a>
        <Link
          href="/contact"
          className="ml-4 inline-flex min-h-12 items-center text-sm font-semibold text-fg-2 hover:text-accent"
        >
          일반 문의 경로 보기
        </Link>
      </PublicStoryHero>

      <section className="mt-8" aria-labelledby="business-types-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Choose a route</p>
            <h2 id="business-types-title" className="mt-1 text-xl font-bold text-fg">문의 유형을 선택하세요</h2>
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-fg-3">
            <LockKeyhole size={14} aria-hidden="true" /> 공개 게시판에 게시되지 않습니다.
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
                <p className="mt-4 font-bold text-fg">{BUSINESS_INQUIRY_TYPE_LABELS[item]}</p>
                <p className="mt-1 text-sm leading-6 text-fg-2">{detail.description}</p>
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
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Private inquiry</p>
            <h2 className="mt-1 text-2xl font-bold tracking-[-0.025em] text-fg">{BUSINESS_INQUIRY_TYPE_LABELS[type]}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">{selected.description}</p>
          </div>

          {success ? (
            <div role="status" className="mt-6 rounded-2xl border border-accent/35 bg-accent-soft p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={21} aria-hidden="true" />
                <div>
                  <p className="font-bold text-fg">문의가 접수됐습니다.</p>
                  <p className="mt-1 text-sm leading-6 text-fg-2">입력한 이메일을 기준으로 검토 후 필요한 경우 회신드리겠습니다.</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-fg">
              회사·기관명 <span className="text-xs font-normal text-fg-3">선택</span>
              <input
                value={form.organization}
                onChange={(event) => setField("organization", event.target.value)}
                maxLength={120}
                autoComplete="organization"
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm font-normal text-fg outline-none transition-colors focus:border-accent"
                placeholder="회사, 투자기관, 스튜디오 등"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-fg">
              담당자 이름 <span className="text-danger">*</span>
              <input
                required
                value={form.contactName}
                onChange={(event) => setField("contactName", event.target.value)}
                maxLength={80}
                autoComplete="name"
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm font-normal text-fg outline-none transition-colors focus:border-accent"
                placeholder="회신받을 담당자 이름"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-fg">
              이메일 <span className="text-danger">*</span>
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
              회사·프로젝트 웹사이트 <span className="text-xs font-normal text-fg-3">선택</span>
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
            문의 내용 <span className="text-danger">*</span>
            <textarea
              required
              value={form.message}
              onChange={(event) => setField("message", event.target.value)}
              minLength={10}
              maxLength={5000}
              rows={9}
              className="resize-y rounded-xl border border-line bg-panel p-3 text-sm font-normal leading-6 text-fg outline-none transition-colors focus:border-accent"
              placeholder="제안 배경, 함께 논의하고 싶은 내용, 필요한 자료나 다음 단계를 적어 주세요. 민감한 계약 정보나 계정 비밀번호는 입력하지 마세요."
            />
            <span className="text-right text-xs font-normal text-fg-3">{form.message.length.toLocaleString()} / 5,000</span>
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
              <strong className="font-semibold text-fg">개인정보 수집·이용에 동의합니다.</strong><br />
              {privacySummary} 자세한 내용은 <Link href="/privacy" className="font-semibold text-accent hover:underline">개인정보처리방침</Link>을 확인하세요.
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
            {submitting ? "접수 중…" : "비공개 문의 보내기"}
            <Send size={16} aria-hidden="true" />
          </button>
        </form>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-panel/55 p-5">
            <h2 className="flex items-center gap-2 font-bold text-fg"><Building2 size={18} className="text-accent" /> 투자 문의 안내</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              이 화면은 IR 대화와 자료·미팅 요청을 접수하는 창구입니다. 지분·증권 청약, 투자금 결제, 예상 수익률 제시는 제공하지 않습니다.
            </p>
          </section>
          <section className="rounded-2xl border border-line bg-panel/55 p-5">
            <h2 className="flex items-center gap-2 font-bold text-fg"><HandCoins size={18} className="text-accent" /> 후원 · 스폰서십</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              현재는 프로젝트 후원·브랜드 스폰서십 의향을 비공개로 접수합니다. 이 경로는 세액공제용 기부금 모집이 아니며, 사이트 내 직접 후원 결제는 아직 받지 않습니다.
            </p>
            <button
              type="button"
              onClick={() => chooseType("sponsorship")}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-accent"
            >
              후원·스폰서십 문의 선택
            </button>
          </section>
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="flex items-center gap-2 font-bold text-fg"><LockKeyhole size={18} className="text-accent" /> 최소 정보만 받습니다</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-fg-2">
              <li>• 첨부파일은 받지 않아 민감 문서의 불필요한 업로드를 막습니다.</li>
              <li>• IP 주소와 브라우저·기기 식별 정보는 문의 데이터로 저장하지 않습니다.</li>
              <li>• 공개 토론이 필요한 제안은 <Link href="/feedback" className="font-semibold text-accent hover:underline">피드백 보드</Link>를 이용할 수 있습니다.</li>
            </ul>
          </section>
        </aside>
      </div>
    </Container>
  );
}
