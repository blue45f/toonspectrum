export type StudioPublishVisibility = "public" | "unlisted" | "private";
export type StudioPublishAudienceMode = "signed-in" | "anonymous";
export type StudioPublishEnvironment = "production" | "preview" | "local" | "unknown";

export interface StudioPublishSessionUser {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly email?: string | null;
  readonly image?: string | null;
  readonly role?: string | null;
}

export interface StudioPublisherIdentity {
  readonly id: string | null;
  readonly name: string;
  readonly email: string | null;
  readonly image: string | null;
  readonly role: string;
  readonly roleLabel: string;
  readonly elevated: boolean;
}

export interface StudioPublishAudienceReview {
  readonly label: string;
  readonly description: string;
  readonly anonymousAccessible: boolean;
  readonly discoverable: boolean;
}

const PRODUCTION_HOSTS = new Set([
  "toonstudio.cloud",
  "www.toonstudio.cloud",
  "toonspectrum.com",
  "www.toonspectrum.com",
]);

function normalizedText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function normalizedRole(value: string | null | undefined): string {
  return normalizedText(value)?.toLowerCase() ?? "user";
}

export function studioPublisherRoleLabel(role: string): string {
  if (role === "admin") return "관리자";
  if (role === "operator") return "운영자";
  if (role === "creator") return "창작자";
  return "일반 사용자";
}

export function resolveStudioPublisherIdentity(
  user: StudioPublishSessionUser | null | undefined,
): StudioPublisherIdentity {
  const id = normalizedText(user?.id);
  const email = normalizedText(user?.email);
  const role = normalizedRole(user?.role);
  return {
    id,
    name: normalizedText(user?.name) ?? email ?? "이름 없는 계정",
    email,
    image: normalizedText(user?.image),
    role,
    roleLabel: studioPublisherRoleLabel(role),
    elevated: role === "admin" || role === "operator",
  };
}

export function resolveStudioPublishEnvironment(
  hostname: string | null | undefined,
): StudioPublishEnvironment {
  const host = normalizedText(hostname)?.toLowerCase().replace(/\.$/u, "") ?? "";
  if (!host) return "unknown";
  if (
    host === "localhost"
    || host === "127.0.0.1"
    || host === "::1"
    || host === "[::1]"
    || host.endsWith(".local")
  ) {
    return "local";
  }
  if (PRODUCTION_HOSTS.has(host)) return "production";
  return "preview";
}

export function studioPublishEnvironmentLabel(
  environment: StudioPublishEnvironment,
): string {
  if (environment === "production") return "운영 환경";
  if (environment === "preview") return "미리보기 환경";
  if (environment === "local") return "로컬 환경";
  return "환경 확인 필요";
}

export function studioPublishEnvironmentDescription(
  environment: StudioPublishEnvironment,
): string {
  if (environment === "production") {
    return "실제 운영 서비스입니다. 전체 공개 또는 링크 공개로 게시하면 독자에게 즉시 노출될 수 있습니다.";
  }
  if (environment === "preview") {
    return "미리보기 환경입니다. 여기서 만든 게시 결과는 운영 사이트에 자동 반영되지 않습니다.";
  }
  if (environment === "local") {
    return "로컬 개발 환경입니다. 여기서 만든 게시 결과는 운영 사이트에 반영되지 않습니다.";
  }
  return "현재 호스트를 운영·미리보기·로컬 중 하나로 확인하지 못했습니다. URL을 검토한 뒤 계속하세요.";
}

export function resolveStudioPublishAudienceReview(
  visibility: StudioPublishVisibility,
  mode: StudioPublishAudienceMode,
): StudioPublishAudienceReview {
  if (visibility === "private") {
    return mode === "anonymous"
      ? {
          label: "비로그인 독자에게 비공개",
          description: "로그인하지 않은 독자는 이 원고를 열 수 없습니다.",
          anonymousAccessible: false,
          discoverable: false,
        }
      : {
          label: "소유 계정의 비공개 원고",
          description: "공개 작품으로 전환하기 전까지 일반 독자 화면과 탐색 목록에 노출되지 않습니다.",
          anonymousAccessible: false,
          discoverable: false,
        };
  }
  if (visibility === "unlisted") {
    return mode === "anonymous"
      ? {
          label: "직접 링크가 있는 비로그인 독자",
          description: "비로그인 독자도 정확한 작품 링크를 알고 있으면 열 수 있지만, 공개 탐색 목록에는 노출되지 않습니다.",
          anonymousAccessible: true,
          discoverable: false,
        }
      : {
          label: "링크 공개 독자",
          description: "로그인 여부와 관계없이 직접 링크로 접근할 수 있으며 공개 탐색 목록에는 노출되지 않습니다.",
          anonymousAccessible: true,
          discoverable: false,
        };
  }
  return mode === "anonymous"
    ? {
        label: "비로그인 독자도 공개 열람",
        description: "로그인하지 않은 독자도 작품 페이지를 열 수 있고 공개 탐색 대상이 됩니다.",
        anonymousAccessible: true,
        discoverable: true,
      }
    : {
        label: "전체 공개 독자",
        description: "로그인한 독자와 비로그인 독자 모두 작품을 열 수 있고 공개 탐색 대상이 됩니다.",
        anonymousAccessible: true,
        discoverable: true,
      };
}
