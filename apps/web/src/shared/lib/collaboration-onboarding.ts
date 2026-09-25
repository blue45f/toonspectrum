const COLLABORATION_ONBOARDING_KEY = "toonspectrum-collaboration-onboarding:v1";
const COLLABORATION_ONBOARDING_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export interface CollaborationOnboardingContext {
  readonly postId: string;
  readonly applicationId: string;
  readonly candidateUserId: string;
  readonly candidateName: string;
  readonly candidateContact: string;
  readonly createdAt: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

export function collaborationOnboardingEmail(contact: string): string | null {
  const normalized = contact.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : null;
}

export function saveCollaborationOnboarding(
  storage: StorageLike,
  value: Omit<CollaborationOnboardingContext, "createdAt">,
  now = Date.now(),
): CollaborationOnboardingContext {
  const context: CollaborationOnboardingContext = { ...value, createdAt: now };
  storage.setItem(COLLABORATION_ONBOARDING_KEY, JSON.stringify(context));
  return context;
}

export function readCollaborationOnboarding(
  storage: StorageLike,
  now = Date.now(),
): CollaborationOnboardingContext | null {
  const raw = storage.getItem(COLLABORATION_ONBOARDING_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const postId = text(value.postId, 160);
    const applicationId = text(value.applicationId, 160);
    const candidateUserId = text(value.candidateUserId, 160);
    const candidateName = text(value.candidateName, 160);
    const candidateContact = text(value.candidateContact, 250);
    const createdAt = typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      ? value.createdAt
      : null;
    if (
      !postId
      || !applicationId
      || !candidateUserId
      || !candidateName
      || !candidateContact
      || createdAt === null
      || createdAt > now + 60_000
      || now - createdAt > COLLABORATION_ONBOARDING_TTL_MS
    ) {
      storage.removeItem(COLLABORATION_ONBOARDING_KEY);
      return null;
    }
    return { postId, applicationId, candidateUserId, candidateName, candidateContact, createdAt };
  } catch {
    storage.removeItem(COLLABORATION_ONBOARDING_KEY);
    return null;
  }
}

export function clearCollaborationOnboarding(storage: StorageLike): void {
  storage.removeItem(COLLABORATION_ONBOARDING_KEY);
}
