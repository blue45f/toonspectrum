/** Pending 0080 only. The coordinator wires this after numbered 0079 is integrated. */
export const CAREER_CONFIRMATION_RELATIONS = Object.freeze([
  { relation: 'creator_career_confirmation_request', updates: ['state', 'revision', 'confirmed_at', 'snapshot', 'redacted_at', 'redaction_reason'] },
  { relation: 'creator_career_confirmation_event', updates: [] },
  { relation: 'creator_career_confirmation_receipt', updates: [] },
]);
export const CAREER_CONFIRMATION_FUNCTIONS = Object.freeze(['immutable', 'invalidate', 'require_ready'].map((suffix) => `creator_career_confirmation_${suffix}`));
function identifiers(role, schema) {
  for (const value of [role, schema]) if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value)) throw new Error('Explicit safe confirmation role/schema required');
  if (role === 'public') throw new Error('An explicit runtime role is required');
  return { prefix: `"${schema}".`, quotedRole: `"${role}"` };
}
export function buildCareerConfirmationRuntimeAclSql(role, schema = 'public') {
  const { prefix, quotedRole } = identifiers(role, schema);
  return `BEGIN;
${CAREER_CONFIRMATION_RELATIONS.map(({ relation, updates }) => `
REVOKE ALL ON TABLE ${prefix}${relation} FROM PUBLIC, ${quotedRole};
DO $confirmation_columns$
DECLARE columns text;
BEGIN
  SELECT string_agg(format('%I',attname),',') INTO columns FROM pg_attribute WHERE attrelid='${prefix}${relation}'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE ${prefix}${relation} FROM PUBLIC, ${quotedRole}',columns);
END $confirmation_columns$;
GRANT SELECT, INSERT ON TABLE ${prefix}${relation} TO ${quotedRole};
${updates.length ? `GRANT UPDATE (${updates.map((column) => `"${column}"`).join(',')}) ON TABLE ${prefix}${relation} TO ${quotedRole};` : ''}`).join('\n')}
${CAREER_CONFIRMATION_FUNCTIONS.map((name) => `REVOKE ALL ON FUNCTION ${prefix}${name}() FROM PUBLIC, ${quotedRole};`).join('\n')}
GRANT EXECUTE ON FUNCTION ${prefix}creator_career_confirmation_require_ready() TO ${quotedRole};
COMMIT;`;
}
export function buildCareerConfirmationCapabilitySql(role, schema = 'public') {
  const { prefix, quotedRole } = identifiers(role, schema);
  return `BEGIN;
SET LOCAL search_path TO "${schema}";
SET LOCAL ROLE ${quotedRole};
SELECT ${prefix}creator_career_confirmation_require_ready();
COMMIT;`;
}
