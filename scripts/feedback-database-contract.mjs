/** Managed first-party feedback and private business inquiry and supporter payment grants. The API itself never creates tables or indexes. */
function roleName(role) {
  if (typeof role !== "string" || role === "public" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(role)) {
    throw new Error("An explicit safe feedback runtime role is required");
  }
  return role;
}
const privileges = [
  ["feedback_post", "SELECT"], ["feedback_post", "INSERT"], ["feedback_post", "UPDATE"],
  ["feedback_reply", "SELECT"], ["feedback_reply", "INSERT"],
  ["feedback_vote", "SELECT"], ["feedback_vote", "INSERT"], ["feedback_vote", "DELETE"],
  ["business_inquiry", "SELECT"], ["business_inquiry", "INSERT"], ["business_inquiry", "UPDATE"],
  ["supporter_payment", "SELECT"], ["supporter_payment", "INSERT"], ["supporter_payment", "UPDATE"],
  ["supporter_funding_setting", "SELECT"], ["supporter_funding_setting", "UPDATE"],
  ["commerce_product_price", "SELECT"], ["commerce_product_price", "INSERT"], ["commerce_product_price", "UPDATE"],
  ["commerce_order", "SELECT"], ["commerce_order", "INSERT"], ["commerce_order", "UPDATE"],
  ["commerce_entitlement", "SELECT"], ["commerce_entitlement", "INSERT"], ["commerce_entitlement", "UPDATE"],
  ["commerce_payment_event", "SELECT"], ["commerce_payment_event", "INSERT"],
  ["creator_support_application", "SELECT"], ["creator_support_application", "INSERT"], ["creator_support_application", "UPDATE"],
  ["creator_support_offer", "SELECT"], ["creator_support_offer", "INSERT"], ["creator_support_offer", "UPDATE"],
];
export function buildFeedbackRuntimeAclSql(role) {
  const quoted = `"${roleName(role)}"`;
  return `
REVOKE ALL ON TABLE public.feedback_vote FROM PUBLIC;
REVOKE ALL ON TABLE public.feedback_vote FROM ${quoted};
REVOKE ALL ON TABLE public.business_inquiry FROM PUBLIC;
REVOKE ALL ON TABLE public.business_inquiry FROM ${quoted};
REVOKE ALL ON TABLE public.supporter_payment FROM PUBLIC;
REVOKE ALL ON TABLE public.supporter_payment FROM ${quoted};
REVOKE ALL ON TABLE public.supporter_funding_setting FROM PUBLIC;
REVOKE ALL ON TABLE public.supporter_funding_setting FROM ${quoted};
REVOKE ALL ON TABLE public.commerce_product_price, public.commerce_order, public.commerce_entitlement, public.commerce_payment_event FROM PUBLIC;
REVOKE ALL ON TABLE public.commerce_product_price, public.commerce_order, public.commerce_entitlement, public.commerce_payment_event FROM ${quoted};
REVOKE ALL ON TABLE public.creator_support_application FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_support_application FROM ${quoted};
REVOKE ALL ON TABLE public.creator_support_offer FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_support_offer FROM ${quoted};
GRANT SELECT, INSERT, UPDATE ON TABLE public.feedback_post TO ${quoted};
GRANT SELECT, INSERT ON TABLE public.feedback_reply TO ${quoted};
GRANT SELECT, INSERT, DELETE ON TABLE public.feedback_vote TO ${quoted};
GRANT SELECT, INSERT, UPDATE ON TABLE public.business_inquiry TO ${quoted};
GRANT SELECT, INSERT, UPDATE ON TABLE public.supporter_payment TO ${quoted};
GRANT SELECT, UPDATE ON TABLE public.supporter_funding_setting TO ${quoted};
GRANT SELECT, INSERT, UPDATE ON TABLE public.commerce_product_price, public.commerce_order, public.commerce_entitlement TO ${quoted};
GRANT SELECT, INSERT ON TABLE public.commerce_payment_event TO ${quoted};
GRANT SELECT, INSERT, UPDATE ON TABLE public.creator_support_application TO ${quoted};
GRANT SELECT, INSERT, UPDATE ON TABLE public.creator_support_offer TO ${quoted};
`;
}
export function buildFeedbackCapabilitySql(role) {
  const safeRole = roleName(role);
  const required = privileges.map(([table, privilege]) => `('${table}', '${privilege}')`).join(",\n    ");
  return `
DO $feedback_capability$
BEGIN
  IF to_regclass('public.feedback_post') IS NULL
    OR to_regclass('public.feedback_reply') IS NULL
    OR to_regclass('public.feedback_vote') IS NULL
    OR to_regclass('public.business_inquiry') IS NULL
    OR to_regclass('public.supporter_payment') IS NULL
    OR to_regclass('public.supporter_funding_setting') IS NULL
    OR to_regclass('public.commerce_product_price') IS NULL
    OR to_regclass('public.commerce_order') IS NULL
    OR to_regclass('public.commerce_entitlement') IS NULL
    OR to_regclass('public.commerce_payment_event') IS NULL
    OR to_regclass('public.creator_support_application') IS NULL
    OR to_regclass('public.creator_support_offer') IS NULL THEN
    RAISE EXCEPTION 'feedback/contact/supporter migration is missing';
  END IF;
  PERFORM id, "userId", category, title, text, tags, hidden, progress, metadata,
    status, "answeredAt", "createdAt" FROM public.feedback_post LIMIT 0;
  PERFORM id, "postId", "parentId", "userId", text, "isOfficial", "createdAt"
    FROM public.feedback_reply LIMIT 0;
  PERFORM "postId", "userId", "createdAt" FROM public.feedback_vote LIMIT 0;
  PERFORM id, type, organization, "contactName", email, website, message, "sourcePath",
    "consentVersion", fingerprint, status, "createdAt", "updatedAt"
    FROM public.business_inquiry LIMIT 0;
  PERFORM id, "orderId", amount, "balanceAmount", currency, "orderName", "supporterName", message, visibility,
    "showAmount", "showMessage", "publicHidden",
    "termsVersion", mode, "providerStatus", "paymentKey", method, "receiptUrl",
    "confirmIdempotencyKey", "cancelIdempotencyKey", "cancelReason", "approvedAt", "canceledAt",
    "webhookVerifiedAt", "createdAt", "updatedAt" FROM public.supporter_payment LIMIT 0;
  PERFORM id, "monthlyGoalAmount", "publicWallEnabled", "updatedAt"
    FROM public.supporter_funding_setting LIMIT 0;
  PERFORM id, "productType", "productId", amount, currency, active, "updatedBy", "createdAt", "updatedAt"
    FROM public.commerce_product_price LIMIT 0;
  PERFORM id, "orderId", "userId", "productType", "productId", "resourceId", "productName", amount, "balanceAmount", currency, provider, "providerMode", "providerStatus", "paymentKey", method, "receiptUrl", "termsVersion", "createIdempotencyKey", "confirmIdempotencyKey", "cancelIdempotencyKey", "cancelReason", "approvedAt", "canceledAt", "webhookVerifiedAt", "createdAt", "updatedAt"
    FROM public.commerce_order LIMIT 0;
  PERFORM id, "userId", "productType", "productId", "sourceOrderId", "grantedAt", "revokedAt", "updatedAt"
    FROM public.commerce_entitlement LIMIT 0;
  PERFORM id, "orderId", provider, "eventKey", "eventType", verified, "payloadHash", "createdAt"
    FROM public.commerce_payment_event LIMIT 0;
  PERFORM id, "creatorId", category, "ageBand", "applicantRole", title, story, "intendedUse",
    "supportNeeds", "portfolioUrl", "estimatedBudgetWon", "guardianConfirmed", "consentVersion", status,
    "reviewNote", "reviewedBy", "reviewedAt", "monetarySupportEnabled", "payoutStatus", "createdAt", "updatedAt"
    FROM public.creator_support_application LIMIT 0;
  PERFORM id, "applicationId", "supporterId", type, message, "contactEmail", "consentVersion", status,
    "createdAt", "updatedAt" FROM public.creator_support_offer LIMIT 0;
  IF EXISTS (SELECT 1 FROM (VALUES
    ${required}
  ) AS required(table_name, privilege_name)
    WHERE NOT pg_catalog.has_table_privilege('${safeRole}', 'public.' || table_name, privilege_name)) THEN
    RAISE EXCEPTION 'feedback/contact/supporter runtime DML privileges are incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'public.feedback_vote'::regclass
      AND constraint_record.contype = 'p'
      AND ARRAY(SELECT attribute.attname::text FROM unnest(constraint_record.conkey)
        WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_record.conrelid AND attribute.attnum = key_column.attnum
        ORDER BY key_column.position) = ARRAY['postId', 'userId']::text[]
  ) THEN
    RAISE EXCEPTION 'feedback vote uniqueness contract is missing';
  END IF;
END
$feedback_capability$;
`;
}
