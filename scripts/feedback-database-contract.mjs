/** Managed feedback grants. The API itself never creates tables or indexes. */
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
];
export function buildFeedbackRuntimeAclSql(role) {
  const quoted = `"${roleName(role)}"`;
  return `
REVOKE ALL ON TABLE public.feedback_vote FROM PUBLIC;
REVOKE ALL ON TABLE public.feedback_vote FROM ${quoted};
GRANT SELECT, INSERT, UPDATE ON TABLE public.feedback_post TO ${quoted};
GRANT SELECT, INSERT ON TABLE public.feedback_reply TO ${quoted};
GRANT SELECT, INSERT, DELETE ON TABLE public.feedback_vote TO ${quoted};
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
    OR to_regclass('public.feedback_vote') IS NULL THEN
    RAISE EXCEPTION 'feedback community migration is missing';
  END IF;
  PERFORM id, "userId", category, title, text, tags, hidden, progress, metadata,
    status, "answeredAt", "createdAt" FROM public.feedback_post LIMIT 0;
  PERFORM id, "postId", "parentId", "userId", text, "isOfficial", "createdAt"
    FROM public.feedback_reply LIMIT 0;
  PERFORM "postId", "userId", "createdAt" FROM public.feedback_vote LIMIT 0;
  IF EXISTS (SELECT 1 FROM (VALUES
    ${required}
  ) AS required(table_name, privilege_name)
    WHERE NOT pg_catalog.has_table_privilege('${safeRole}', 'public.' || table_name, privilege_name)) THEN
    RAISE EXCEPTION 'feedback runtime DML privileges are incomplete';
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
