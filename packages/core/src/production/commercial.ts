import type {
  ContractChangeOrder,
  ContractMilestone,
  DeliveryRevision,
  PaymentRecord,
  ProcurementProposal,
  ProductionAgreement,
  ProductionDispute,
  ProductionInvoice,
  ScopePackage,
  Submission,
} from "./types";

const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

function validateMoney(amountMinor: number, currency: string): string[] {
  const issues: string[] = [];
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) issues.push("money-amount-invalid");
  if (!CURRENCY_PATTERN.test(currency)) issues.push("money-currency-invalid");
  return issues;
}

export function validateProcurementProposal(
  proposal: ProcurementProposal,
  scopePackage: ScopePackage | null,
): readonly string[] {
  const issues = validateMoney(proposal.totalAmountMinor, proposal.currency);
  if (!scopePackage) return Object.freeze([...issues, "proposal-scope-package-missing"]);
  if (scopePackage.id !== proposal.scopePackageId || scopePackage.revision !== proposal.scopePackageRevision) {
    issues.push("proposal-scope-package-revision-mismatch");
  }
  if (scopePackage.status !== "published") issues.push("proposal-scope-package-not-published");
  if (!proposal.understanding.trim()) issues.push("proposal-understanding-missing");
  if (!proposal.approach.trim()) issues.push("proposal-approach-missing");
  if (proposal.includedRevisionRounds < scopePackage.includedRevisionRounds) {
    issues.push("proposal-revision-rounds-below-scope");
  }
  const milestoneTotal = proposal.milestoneDrafts.reduce((sum, milestone) => sum + milestone.amountMinor, 0);
  if (proposal.milestoneDrafts.some((milestone) => validateMoney(milestone.amountMinor, proposal.currency).length > 0)) {
    issues.push("proposal-milestone-money-invalid");
  }
  if (milestoneTotal !== proposal.totalAmountMinor) issues.push("proposal-milestone-total-mismatch");
  if (proposal.status === "submitted" && !proposal.submittedAt) issues.push("proposal-submitted-at-missing");
  return Object.freeze(issues);
}

export function validateProductionAgreement(input: {
  readonly agreement: ProductionAgreement;
  readonly scopePackage: ScopePackage | null;
  readonly proposal: ProcurementProposal | null;
}): readonly string[] {
  const { agreement, scopePackage, proposal } = input;
  const issues = validateMoney(agreement.totalAmountMinor, agreement.currency);
  if (!scopePackage) issues.push("agreement-scope-package-missing");
  else if (scopePackage.id !== agreement.scopePackageId || scopePackage.revision !== agreement.scopePackageRevision) {
    issues.push("agreement-scope-package-revision-mismatch");
  }
  if (agreement.selectedProposalId) {
    if (!proposal || proposal.id !== agreement.selectedProposalId) issues.push("agreement-proposal-missing");
    else if (proposal.totalAmountMinor !== agreement.totalAmountMinor || proposal.currency !== agreement.currency) {
      issues.push("agreement-proposal-money-mismatch");
    }
  }
  if (agreement.partyIds.length < 2) issues.push("agreement-parties-insufficient");
  if (new Set(agreement.partyIds).size !== agreement.partyIds.length) issues.push("agreement-parties-duplicate");
  if (["signed", "active", "completed"].includes(agreement.status) && agreement.signedEvidenceRefs.length === 0) {
    issues.push("agreement-signature-evidence-missing");
  }
  if (["active", "completed"].includes(agreement.status) && !agreement.effectiveAt) {
    issues.push("agreement-effective-at-missing");
  }
  if (!agreement.rightsPolicyRef || !agreement.creditPolicyRef || !agreement.compensationPlanRef) {
    issues.push("agreement-policy-links-missing");
  }
  return Object.freeze(issues);
}

export function validateContractChangeOrder(
  changeOrder: ContractChangeOrder,
  agreement: ProductionAgreement | null,
  knownChangeRequestIds: readonly string[],
  knownAddendumIds: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  if (!agreement || agreement.id !== changeOrder.agreementId) issues.push("change-order-agreement-missing");
  if (!knownChangeRequestIds.includes(changeOrder.sourceChangeRequestId)) issues.push("change-order-request-missing");
  if (!knownAddendumIds.includes(changeOrder.scopePackageAddendumId)) issues.push("change-order-addendum-missing");
  if (!Number.isSafeInteger(changeOrder.scheduleDeltaDays)) issues.push("change-order-schedule-delta-invalid");
  if (!Number.isSafeInteger(changeOrder.amountDeltaMinor)) issues.push("change-order-amount-delta-invalid");
  if (!CURRENCY_PATTERN.test(changeOrder.currency)) issues.push("change-order-currency-invalid");
  if (agreement && agreement.currency !== changeOrder.currency) issues.push("change-order-currency-mismatch");
  if (["approved", "implemented"].includes(changeOrder.status) && changeOrder.approvedByAssignmentIds.length === 0) {
    issues.push("change-order-approval-missing");
  }
  return Object.freeze(issues);
}

export function validateContractMilestones(
  agreement: ProductionAgreement,
  milestones: readonly ContractMilestone[],
): readonly string[] {
  const issues: string[] = [];
  const related = milestones.filter((milestone) => milestone.agreementId === agreement.id);
  if (related.length === 0 && ["active", "completed"].includes(agreement.status)) {
    issues.push("agreement-milestones-missing");
  }
  const sequences = related.map((milestone) => milestone.sequence);
  if (new Set(sequences).size !== sequences.length) issues.push("milestone-sequence-duplicate");
  for (const milestone of related) {
    issues.push(...validateMoney(milestone.amountMinor, milestone.currency).map((issue) => `${milestone.id}:${issue}`));
    if (milestone.currency !== agreement.currency) issues.push(`${milestone.id}:milestone-currency-mismatch`);
    if (milestone.acceptanceCriteria.length === 0) issues.push(`${milestone.id}:milestone-criteria-missing`);
    if (milestone.status === "accepted" && milestone.acceptedSubmissionIds.length === 0) {
      issues.push(`${milestone.id}:milestone-accepted-submission-missing`);
    }
  }
  const total = related.reduce((sum, milestone) => sum + milestone.amountMinor, 0);
  if (total > agreement.totalAmountMinor) issues.push("milestone-total-exceeds-agreement");
  if (agreement.status === "completed" && total !== agreement.totalAmountMinor) {
    issues.push("completed-agreement-milestone-total-mismatch");
  }
  return Object.freeze(issues);
}

export function validateDeliveryRevision(input: {
  readonly delivery: DeliveryRevision;
  readonly milestone: ContractMilestone | null;
  readonly submissions: readonly Submission[];
  readonly activeAssignmentIds: readonly string[];
}): readonly string[] {
  const { delivery, milestone } = input;
  const issues: string[] = [];
  if (!milestone || milestone.id !== delivery.milestoneId || milestone.agreementId !== delivery.agreementId) {
    issues.push("delivery-milestone-missing");
  }
  if (!input.activeAssignmentIds.includes(delivery.submittedByAssignmentId)) {
    issues.push("delivery-submitter-inactive");
  }
  if (delivery.submissionIds.length === 0) issues.push("delivery-submissions-missing");
  for (const submissionId of delivery.submissionIds) {
    if (!input.submissions.some((submission) => submission.id === submissionId)) {
      issues.push(`delivery-submission-missing:${submissionId}`);
    }
  }
  if (!/^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u.test(delivery.checksum)) {
    issues.push("delivery-checksum-invalid");
  }
  if (["submitted", "accepted"].includes(delivery.status) && !delivery.submittedAt) {
    issues.push("delivery-submitted-at-missing");
  }
  if (delivery.status === "accepted" && !delivery.acceptedAt) issues.push("delivery-accepted-at-missing");
  if (delivery.status === "accepted" && delivery.licenseEvidenceRefs.length === 0) {
    issues.push("delivery-license-evidence-missing");
  }
  return Object.freeze(issues);
}

export function validateInvoice(
  invoice: ProductionInvoice,
  agreement: ProductionAgreement | null,
  milestone: ContractMilestone | null,
): readonly string[] {
  const issues = validateMoney(invoice.amountMinor, invoice.currency);
  if (!agreement || agreement.id !== invoice.agreementId) issues.push("invoice-agreement-missing");
  else if (agreement.currency !== invoice.currency) issues.push("invoice-currency-mismatch");
  if (invoice.milestoneId && (!milestone || milestone.id !== invoice.milestoneId)) {
    issues.push("invoice-milestone-missing");
  }
  if (["issued", "verified", "disputed", "settled"].includes(invoice.status) && !invoice.issuedAt) {
    issues.push("invoice-issued-at-missing");
  }
  if (invoice.status === "settled" && !invoice.externalInvoiceRef) {
    issues.push("settled-invoice-external-reference-missing");
  }
  return Object.freeze(issues);
}

export function validatePaymentRecord(
  payment: PaymentRecord,
  invoice: ProductionInvoice | null,
  activeAssignmentIds: readonly string[],
): readonly string[] {
  const issues = validateMoney(payment.amountMinor, payment.currency);
  if (!invoice || invoice.id !== payment.invoiceId || invoice.agreementId !== payment.agreementId) {
    issues.push("payment-invoice-missing");
  } else {
    if (invoice.amountMinor !== payment.amountMinor || invoice.currency !== payment.currency) {
      issues.push("payment-invoice-money-mismatch");
    }
    if (payment.payerPartyId !== invoice.recipientPartyId || payment.payeePartyId !== invoice.issuerPartyId) {
      issues.push("payment-parties-mismatch");
    }
  }
  if (payment.status === "verified-paid") {
    if (!payment.provider || !payment.externalPaymentRef || payment.evidenceRefs.length === 0 || !payment.paidAt) {
      issues.push("verified-payment-evidence-incomplete");
    }
    if (!payment.verifiedByAssignmentId || !activeAssignmentIds.includes(payment.verifiedByAssignmentId)) {
      issues.push("payment-verifier-invalid");
    }
  }
  if (payment.status === "recorded-pending-verification" && payment.verifiedByAssignmentId) {
    issues.push("pending-payment-cannot-have-verifier");
  }
  return Object.freeze(issues);
}

export function validateProductionDispute(
  dispute: ProductionDispute,
  agreement: ProductionAgreement | null,
): readonly string[] {
  const issues: string[] = [];
  if (!agreement || agreement.id !== dispute.agreementId) issues.push("dispute-agreement-missing");
  if (!dispute.statement.trim()) issues.push("dispute-statement-missing");
  if (dispute.respondentPartyIds.length === 0) issues.push("dispute-respondent-missing");
  if (dispute.respondentPartyIds.includes(dispute.openedByPartyId)) issues.push("dispute-self-respondent");
  if (["resolved", "closed"].includes(dispute.status) && (!dispute.resolution || !dispute.resolvedAt)) {
    issues.push("dispute-resolution-incomplete");
  }
  return Object.freeze(issues);
}
