import type {
  CreatorSupportApplicationInput,
  CreatorSupportCategory,
  CreatorSupportOfferInput,
  CreatorSupportProject,
} from "@toonspectrum/core/creator-support";

import { api } from "@/infrastructure/api";

export interface CreatorSupportProjectListResponse {
  items: CreatorSupportProject[];
  monetarySupport: {
    ready: boolean;
    requested: boolean;
    disabledReason: string | null;
  };
}

export function listCreatorSupportProjects(
  category?: CreatorSupportCategory | "",
): Promise<CreatorSupportProjectListResponse> {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  return api.get<CreatorSupportProjectListResponse>(
    `/creator-support/projects${query}`,
    { cache: "no-store" },
  );
}

export function getMyCreatorSupportApplication(): Promise<{ item: unknown | null }> {
  return api.get<{ item: unknown | null }>("/creator-support/me/application", {
    cache: "no-store",
  });
}
export function submitCreatorSupportApplication(
  input: CreatorSupportApplicationInput,
): Promise<{ item: unknown | null; updated: boolean }> {
  return api.post<{ item: unknown | null; updated: boolean }>(
    "/creator-support/applications",
    input,
  );
}

export function submitCreatorSupportOffer(
  projectId: string,
  input: CreatorSupportOfferInput,
): Promise<{ received: true }> {
  return api.post<{ received: true }>(
    `/creator-support/projects/${encodeURIComponent(projectId)}/offers`,
    input,
  );
}

