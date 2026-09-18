export type EventStatus = "upcoming" | "active" | "ended";

export interface EventCopy {
  readonly ko: string;
  readonly en: string;
}

export interface MarketingEventBenefit {
  readonly id: string;
  readonly title: EventCopy;
  readonly body: EventCopy;
  readonly emphasis: EventCopy;
}

export interface MarketingEvent {
  readonly id: string;
  readonly slug: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly firstVisitExposure: boolean;
  readonly eyebrow: EventCopy;
  readonly title: EventCopy;
  readonly summary: EventCopy;
  readonly benefits: readonly MarketingEventBenefit[];
  readonly signupFreeMonths: number;
  readonly publicCreatorFreeMonths: number;
  readonly minimumPublicContentCount: number;
  readonly minimumPublicDays: number;
  readonly primaryCta: EventCopy;
  readonly secondaryCta: EventCopy;
  readonly notices: readonly EventCopy[];
}

export const BETA_OPEN_EVENT: MarketingEvent = {
  id: "beta-open-2026",
  slug: "beta-open",
  startsAt: "2026-09-18T00:00:00+09:00",
  endsAt: null,
  firstVisitExposure: true,
  eyebrow: { ko: "BETA OPEN · 창작자 첫 혜택", en: "BETA OPEN · FOUNDING CREATOR BENEFIT" },
  title: {
    ko: "지금 가입하면, 최대 1년 동안 전부 무료.",
    en: "Join during beta and use everything free for up to a year.",
  },
  summary: {
    ko: "베타 오픈 기간에는 주요 서비스를 이용료 없이 사용할 수 있습니다. 저장공간·업로드·동시 처리에는 서비스 안정성을 위한 공정 사용 한도가 적용되며, 가입 혜택은 베타 종료 이후에도 이어집니다.",
    en: "Major services are free of charge during beta. Fair-use limits still apply to storage, uploads, and concurrent processing, while signup benefits can continue after beta ends.",
  },
  signupFreeMonths: 6,
  publicCreatorFreeMonths: 12,
  minimumPublicContentCount: 1,
  minimumPublicDays: 30,
  primaryCta: { ko: "가입하고 6개월 무료 받기", en: "Join for 6 months free" },
  secondaryCta: { ko: "바로 시작하기", en: "Start creating" },
  benefits: [
    {
      id: "beta-unlimited",
      title: { ko: "베타 기간 주요 서비스 이용료 무료", en: "Major services free during beta" },
      body: {
        ko: "베타가 열려 있는 동안 웹툰·일러스트·드로잉·프로젝트 도구와 주요 신규 기능을 이용료 없이 사용할 수 있습니다. 저장공간·파일 크기·동시 처리량 등에는 공정 사용 및 기술 안전 한도가 적용됩니다.",
        en: "Use webtoon, illustration, drawing, project tools, and major new beta features at no charge while beta is open. Fair-use and technical safety limits apply to storage, file sizes, and concurrent processing.",
      },
      emphasis: { ko: "지금은 전 기능 무료", en: "Everything is free during beta" },
    },
    {
      id: "signup-six-months",
      title: { ko: "베타 가입자는 가입일부터 6개월 무료", en: "Beta members get 6 months free" },
      body: {
        ko: "베타 기간 중 회원가입하면 가입일부터 6개월 동안 대상 서비스를 이용료 없이 이용할 수 있으며, 공정 사용 및 기술 안전 한도는 동일하게 적용됩니다.",
        en: "Create an account during beta and receive eligible services at no charge for six months from signup, with the same fair-use and technical safety limits.",
      },
      emphasis: { ko: "회원가입만 해도 6개월", en: "6 months just for joining" },
    },
    {
      id: "creator-one-year",
      title: { ko: "공개 창작자는 최대 1년 무료", en: "Public creators get up to 1 year free" },
      body: {
        ko: "베타 기간 중 가입하고 일러스트·웹툰 등 공개 콘텐츠를 1개 이상 등록해 30일 이상 공개 상태로 유지하면 가입일부터 최대 1년 무료 혜택을 받을 수 있습니다.",
        en: "Join during beta, publish at least one illustration, webtoon, or other eligible public work, and keep it public for 30 days to unlock up to one year free from your signup date.",
      },
      emphasis: { ko: "창작물 공개 시 최대 1년", en: "Publish a work, unlock up to a year" },
    },
  ],
  notices: [
    {
      ko: "6개월 혜택과 1년 혜택은 합산되지 않으며, 조건 충족 시 무료 이용 기간이 가입일 기준 최대 1년으로 확대됩니다.",
      en: "The 6-month and 1-year benefits do not stack. Meeting the creator condition extends the free period to a maximum of one year from signup.",
    },
    {
      ko: "공개 콘텐츠 혜택은 대상 콘텐츠를 30일 이상 공개 상태로 유지한 뒤 확정되며, 운영 정책을 위반하거나 비정상적·자동화된 대량 이용으로 판단되는 경우 적용이 제한될 수 있습니다.",
      en: "The public-content benefit is confirmed after an eligible work remains public for at least 30 days. Policy violations or abnormal automated bulk use may be excluded.",
    },
    {
      ko: "베타 종료 또는 무료 혜택 종료 이후 일부 기능 또는 전체 서비스가 유료 플랜으로 전환될 수 있습니다.",
      en: "Some features or the full service may move to paid plans after beta or after your free benefit ends.",
    },
    {
      ko: "이 이벤트로 확정된 무료 이용 기간은 안내된 기간 동안 유지하며, 향후 요금 정책 변경이나 유료 전환은 사전에 안내합니다.",
      en: "A confirmed free period from this event will be honored for the stated duration. Future pricing changes or paid transitions will be announced in advance.",
    },
  ],
};

export const MARKETING_EVENTS: readonly MarketingEvent[] = [BETA_OPEN_EVENT];

export function resolveMarketingEventStatus(
  event: MarketingEvent,
  now: Date = new Date(),
): EventStatus {
  const nowMs = now.getTime();
  if (nowMs < new Date(event.startsAt).getTime()) return "upcoming";
  if (event.endsAt && nowMs > new Date(event.endsAt).getTime()) return "ended";
  return "active";
}

export function findMarketingEvent(slug: string): MarketingEvent | undefined {
  return MARKETING_EVENTS.find((event) => event.slug === slug);
}
