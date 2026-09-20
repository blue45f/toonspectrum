/** Additive 0079 automation contract; does not change the 0078 contract. */
export const HIRING_RELATIONS = Object.freeze([
  { relation: 'creator_hiring_campaign_job', insert: true, remove: false, updates: ['generation','terms_revision','post_version','next_round','status','next_execution_at','attempts','lease_until','claim_token','terminal_reason','updated_at'] },
  { relation: 'creator_hiring_campaign_round', insert: true, remove: false, updates: [] },
]);
export const HIRING_FUNCTIONS = Object.freeze(['creator_hiring_automation_invalidate', 'creator_hiring_automation_receipt_immutable', 'creator_hiring_automation_require_ready']);
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
export function buildHiringAutomationRuntimeAclSql(role, schema = 'public', relations = HIRING_RELATIONS, functions = HIRING_FUNCTIONS, ready = 'creator_hiring_automation_require_ready') {
  const { quotedRole, prefix } = inputs(role, schema);
  return `BEGIN;
${relations.map(({ relation, insert, remove, updates }) => `
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
${functions.map((name) => `REVOKE ALL ON FUNCTION ${prefix}${name}() FROM PUBLIC, ${quotedRole};`).join('\n')}
GRANT EXECUTE ON FUNCTION ${prefix}${ready}() TO ${quotedRole};
COMMIT;`;
}
export function buildHiringAutomationCapabilitySql(role, schema = 'public', relations = HIRING_RELATIONS, functions = HIRING_FUNCTIONS, ready = 'creator_hiring_automation_require_ready') {
  const { prefix } = inputs(role, schema);
  const rows = relations.map(({ relation, insert, remove, updates }) => `('${relation}',${insert},${remove},${array(updates)})`).join(',\n');
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
  ${functions.map((name) => `IF has_function_privilege(0::oid,'${prefix}${name}()','EXECUTE')
    OR has_function_privilege('${role}','${prefix}${name}()','EXECUTE') IS DISTINCT FROM ${name === ready}
    OR has_function_privilege('${role}','${prefix}${name}()','EXECUTE WITH GRANT OPTION')
    OR EXISTS(SELECT 1 FROM pg_proc WHERE oid='${prefix}${name}()'::regprocedure AND prosecdef) THEN
    RAISE EXCEPTION 'creator hiring function privileges violate contract'; END IF;`).join('\n')}
  PERFORM ${prefix}${ready}();
END $hiring_capability$;`;
}
