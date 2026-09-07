const KO = {
  markPaid: "지급 완료 처리",
} as const;

const EN = {
  markPaid: "Mark paid",
} as const;

export type AdminRevenueCopy = typeof KO;

export function getAdminRevenueCopy(locale: string): AdminRevenueCopy {
  return locale.toLowerCase().startsWith("ko")
    ? KO
    : (EN as unknown as AdminRevenueCopy);
}
