import { api } from "@/infrastructure/api";

import type { CareerConfirmationActionInput, CareerConfirmationCollaborator, CareerConfirmationPage, CareerConfirmationPreview, CareerConfirmationPublicSummary, CareerConfirmationReceipt, CareerConfirmationRequest, CareerConfirmationRequestInput, CareerConfirmationSelection } from "../../../../../../packages/contracts/src/creator-career-confirmation";

const root = "/collaborations/career-confirmations";
const options = (signal?: AbortSignal) => ({ signal, timeout: 20_000 });
export const careerConfirmationClient = {
  capability: (signal?: AbortSignal) => api.get<{ available: true }>(`${root}/capability`, options(signal)),
  collaborators: (after?: string, signal?: AbortSignal) => api.get<CareerConfirmationPage<CareerConfirmationCollaborator>>(`${root}/collaborators${after ? `?after=${encodeURIComponent(after)}` : ""}`, options(signal)),
  preview: (input: CareerConfirmationSelection, signal?: AbortSignal) => api.post<CareerConfirmationPreview>(`${root}/preview`, input, options(signal)),
  request: (input: CareerConfirmationRequestInput, signal?: AbortSignal) => api.post<CareerConfirmationReceipt>(`${root}/requests`, input, options(signal)),
  list: (direction: "sent" | "received", after?: string, signal?: AbortSignal) => api.get<CareerConfirmationPage<CareerConfirmationRequest>>(`${root}/requests?direction=${direction}${after ? `&after=${encodeURIComponent(after)}` : ""}`, options(signal)),
  action: (id: string, input: CareerConfirmationActionInput, signal?: AbortSignal) => api.post<CareerConfirmationReceipt>(`${root}/requests/${encodeURIComponent(id)}/actions`, input, options(signal)),
  publicSummaries: (careerIds: string[], signal?: AbortSignal) => api.post<CareerConfirmationPublicSummary[]>(`${root}/public-summaries`, { careerIds }, options(signal)),
};
