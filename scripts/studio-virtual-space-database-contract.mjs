const TABLES = ["studio_virtual_space_decoration_layout", "studio_virtual_space_custom_furniture"];
const MUTABLE_LAYOUT_COLUMNS = ["presetKey", "presentationMode", "placements", "revision", "layoutWidth", "layoutHeight", "updatedAt"];

function identifier(value) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value)) {
    throw new Error("가상공간 DB 역할 이름이 올바르지 않습니다.");
  }
  if (["public", "anon", "authenticated", "service_role", "postgres"].includes(value)) {
    throw new Error("가상공간 전용 런타임 역할을 지정해야 합니다.");
  }
  return `"${value}"`;
}

/** 승인한 배포의 별도 migrator만 실행한다. 앱 부팅에서 권한을 변경하지 않는다. */
export function buildStudioVirtualSpaceRuntimeAclSql(runtimeRole) {
  const role = identifier(runtimeRole);
  return TABLES.map((table) => `
DO $acl$
DECLARE columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns
    FROM pg_catalog.pg_attribute WHERE attrelid = 'public.${table}'::regclass
      AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.${table} FROM ${role}', columns);
END $acl$;
REVOKE ALL ON TABLE public.${table} FROM ${role};
GRANT SELECT, INSERT ON TABLE public.${table} TO ${role};
DROP POLICY IF EXISTS studio_virtual_space_runtime ON public.${table};
CREATE POLICY studio_virtual_space_runtime ON public.${table}
  FOR ALL TO ${role} USING (true) WITH CHECK (true);
`).join("\n") + `
GRANT UPDATE (${MUTABLE_LAYOUT_COLUMNS.map((column) => `"${column}"`).join(", ")})
  ON TABLE public.studio_virtual_space_decoration_layout TO ${role};
`;
}

/** 실제 역할의 권한과 RLS 상태를 확인한다. 누락 시 성공한 배포로 취급하지 않는다. */
export function buildStudioVirtualSpaceCapabilitySql(runtimeRole) {
  identifier(runtimeRole);
  return `DO $capability$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (${TABLES.map((table) => `'${table}'`).join(", ")})
      AND NOT c.relrowsecurity
  ) THEN RAISE EXCEPTION '가상공간 RLS가 활성화되지 않았습니다'; END IF;
  ${TABLES.map((table) => `
  IF NOT has_table_privilege('${runtimeRole}', 'public.${table}', 'SELECT')
    OR NOT has_table_privilege('${runtimeRole}', 'public.${table}', 'INSERT')
    OR has_table_privilege('${runtimeRole}', 'public.${table}', 'DELETE')
    OR has_table_privilege('${runtimeRole}', 'public.${table}', 'UPDATE')
    OR has_table_privilege('${runtimeRole}', 'public.${table}', 'TRUNCATE')
    OR has_table_privilege('${runtimeRole}', 'public.${table}', 'SELECT WITH GRANT OPTION')
  THEN RAISE EXCEPTION '가상공간 최소 권한이 일치하지 않습니다'; END IF;`).join("\n")}
END $capability$;`;
}
