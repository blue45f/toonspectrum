/** 0078 contract. Only the reviewed runner grants these capabilities; HTTP never repairs schema. */
export const HIRING_RELATIONS = Object.freeze([
  ['resume', true, true, ['title', 'revision', 'updated_at', 'source_invalidated_at']],
  ['resume_version', true, false, []],
  ['application_snapshot', true, false, ['resume_payload', 'redacted_at', 'redaction_reason']],
  ['receipt', true, false, []],
  ['capacity', true, false, ['capacity']],
  ['availability', true, false, ['starts_at', 'ends_at', 'confirmed_at', 'expires_at', 'roles', 'tools', 'formats', 'min_rate', 'rate_unit', 'discoverable', 'notification_opt_in', 'revision']],
  ['slot', true, false, ['terms', 'starts_at', 'due_at', 'revision', 'updated_at', 'state']],
  ['offer', true, false, ['state']],
  ['commitment', true, false, ['state']],
  ['outbox', true, false, ['state']],
  ['campaign', true, false, ['round', 'state', 'next_dispatch_at']],
  ['invitation', true, false, ['state']],
  ['team', true, false, ['name', 'revision']],
  ['team_member', true, false, ['status', 'invite_expires_at', 'invite_revision']],
  ['group', true, true, ['name']],
  ['group_member', true, true, []],
  ['room', true, false, ['status', 'epoch']],
  ['admission', true, false, ['status', 'epoch']],
  ['room_message', true, true, []],
  ['career', true, true, ['revision', 'rights', 'visibility', 'content', 'updated_at']],
  ['career_version', true, false, []],
  // Ingestion is unconnected. Hiring HTTP may not award or reverse points.
  ['activity_ledger', false, false, []],
  ['resume_career_source', true, false, []],
].map(([suffix, insert, remove, updates]) => Object.freeze({ relation: `creator_hiring_${suffix}`, insert, remove, updates })));
export const HIRING_FUNCTIONS = Object.freeze([
  'redact_withdrawn_application', 'immutable_resume_version', 'redact_deleted_resume', 'snapshot_immutable',
  'post_unavailable', 'offer_immutable', 'revoke_application_rooms', 'revoke_member_rooms',
  'revoke_career_copies', 'account_unavailable', 'require_ready',
].map((suffix) => `creator_hiring_${suffix}`));
function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value)) throw new Error('An explicit safe hiring database identifier is required');
  return value;
}
function inputs(role, schema) {
  identifier(role); identifier(schema);
  if (role === 'public') throw new Error('An explicit safe hiring runtime role is required');
  return { quotedRole: `"${role}"`, prefix: `"${schema}".` };
}
const array = (values) => `ARRAY[${values.map((value) => `'${value}'`).join(',')}]::text[]`;
export function buildHiringRuntimeAclSql(role, schema = 'public') {
  const { quotedRole, prefix } = inputs(role, schema);
  return `BEGIN;
${HIRING_RELATIONS.map(({ relation, insert, remove, updates }) => `
REVOKE ALL ON TABLE ${prefix}${relation} FROM PUBLIC, ${quotedRole};
DO $hiring_columns$
DECLARE columns text;
BEGIN
  SELECT string_agg(format('%I',attname),',') INTO columns FROM pg_attribute
    WHERE attrelid='${prefix}${relation}'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE ${prefix}${relation} FROM PUBLIC, ${quotedRole}', columns);
END $hiring_columns$;
GRANT SELECT${insert ? ', INSERT' : ''}${remove ? ', DELETE' : ''} ON TABLE ${prefix}${relation} TO ${quotedRole};
${updates.length ? `GRANT UPDATE (${updates.map((column) => `"${column}"`).join(',')}) ON TABLE ${prefix}${relation} TO ${quotedRole};` : ''}`).join('\n')}
${HIRING_FUNCTIONS.map((name) => `REVOKE ALL ON FUNCTION ${prefix}${name}() FROM PUBLIC, ${quotedRole};`).join('\n')}
GRANT EXECUTE ON FUNCTION ${prefix}creator_hiring_require_ready() TO ${quotedRole};
-- Existing authorities are reused. Preserve their owner's ACL contract and grant
-- only the dependency capabilities needed here (including SELECT FOR UPDATE).
GRANT SELECT ON TABLE ${prefix}"user", ${prefix}member_message_block, ${prefix}creator_collab_post TO ${quotedRole};
GRANT UPDATE (version) ON TABLE ${prefix}creator_collab_post TO ${quotedRole};
GRANT SELECT, INSERT ON TABLE ${prefix}creator_collab_application TO ${quotedRole};
GRANT UPDATE (message,contact,"portfolioUrl",status,"createdAt","updatedAt") ON TABLE ${prefix}creator_collab_application TO ${quotedRole};
COMMIT;`;
}
export function buildHiringCapabilitySql(role, schema = 'public') {
  const { prefix } = inputs(role, schema);
  const rows = HIRING_RELATIONS.map(({ relation, insert, remove, updates }) => `('${relation}',${insert},${remove},${array(updates)})`).join(',\n');
  return `DO $hiring_capability$
DECLARE contract record; relation_id oid; attribute record; privilege text; expected boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls)
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='${role}'))
    OR has_schema_privilege('${role}','${schema}','CREATE') THEN
    RAISE EXCEPTION 'creator hiring runtime role has ownership or DDL capabilities';
  END IF;
  FOR contract IN SELECT * FROM (VALUES ${rows}) AS contracts(name,can_insert,can_delete,updates) LOOP
    relation_id := to_regclass(format('%I.%I','${schema}',contract.name));
    IF relation_id IS NULL THEN RAISE EXCEPTION 'creator hiring migration is missing'; END IF;
    IF EXISTS(SELECT 1 FROM pg_class WHERE oid=relation_id AND relowner=(SELECT oid FROM pg_roles WHERE rolname='${role}')) THEN
      RAISE EXCEPTION 'creator hiring runtime owns a relation';
    END IF;
    FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      expected := privilege='SELECT' OR (privilege='INSERT' AND contract.can_insert) OR (privilege='DELETE' AND contract.can_delete);
      IF has_table_privilege('${role}',relation_id,privilege) IS DISTINCT FROM expected
        OR has_table_privilege('${role}',relation_id,privilege || ' WITH GRANT OPTION')
        OR has_table_privilege(0::oid,relation_id,privilege) THEN
        RAISE EXCEPTION 'creator hiring runtime table privileges violate contract';
      END IF;
    END LOOP;
    FOR attribute IN SELECT attname FROM pg_attribute WHERE attrelid=relation_id AND attnum>0 AND NOT attisdropped LOOP
      FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
        expected := privilege='SELECT' OR (privilege='INSERT' AND contract.can_insert)
          OR (privilege='UPDATE' AND attribute.attname::text=ANY(contract.updates));
        IF has_column_privilege('${role}',relation_id,attribute.attname,privilege) IS DISTINCT FROM expected
          OR has_column_privilege('${role}',relation_id,attribute.attname,privilege || ' WITH GRANT OPTION')
          OR has_column_privilege(0::oid,relation_id,attribute.attname,privilege) THEN
          RAISE EXCEPTION 'creator hiring runtime column privileges violate contract';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  IF NOT has_table_privilege('${role}','${prefix}creator_collab_post','SELECT')
    OR NOT has_column_privilege('${role}','${prefix}creator_collab_post','version','UPDATE')
    OR NOT has_table_privilege('${role}','${prefix}creator_collab_application','INSERT')
    OR NOT has_column_privilege('${role}','${prefix}creator_collab_application','contact','UPDATE')
    OR NOT has_table_privilege('${role}','${prefix}member_message_block','SELECT')
    OR NOT has_table_privilege('${role}','${prefix}"user"','SELECT') THEN
    RAISE EXCEPTION 'creator hiring existing authority privileges are incomplete';
  END IF;
  ${HIRING_FUNCTIONS.map((name) => `IF has_function_privilege(0::oid,'${prefix}${name}()','EXECUTE')
    OR has_function_privilege('${role}','${prefix}${name}()','EXECUTE') IS DISTINCT FROM ${name === 'creator_hiring_require_ready'}
    OR has_function_privilege('${role}','${prefix}${name}()','EXECUTE WITH GRANT OPTION')
    OR EXISTS(SELECT 1 FROM pg_proc WHERE oid='${prefix}${name}()'::regprocedure AND prosecdef) THEN
    RAISE EXCEPTION 'creator hiring function privileges violate contract'; END IF;`).join('\n')}
  PERFORM ${prefix}creator_hiring_require_ready();
END $hiring_capability$;`;
}
