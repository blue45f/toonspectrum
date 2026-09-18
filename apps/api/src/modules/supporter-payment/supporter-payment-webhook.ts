export interface SupporterWebhookIdentity {
  orderId: string;
  paymentKey: string;
}

export function parseSupporterWebhookIdentity(
  input: unknown,
): SupporterWebhookIdentity | null {
  if (!input || typeof input !== "object") return null;
  const envelope = input as Record<string, unknown>;
  const data = envelope.data;
  const payload = data && typeof data === "object"
    ? data as Record<string, unknown>
    : envelope;
  const orderId = typeof payload.orderId === "string"
    ? payload.orderId.trim().slice(0, 64)
    : "";
  const paymentKey = typeof payload.paymentKey === "string"
    ? payload.paymentKey.trim().slice(0, 200)
    : "";
  if (!orderId && !paymentKey) return null;
  if (orderId && !/^[A-Za-z0-9_-]{6,64}$/u.test(orderId)) return null;
  return { orderId, paymentKey };
}
