const COMMUNITY_CAFE_PRIVILEGES = Object.freeze({
  community_cafe: Object.freeze(["SELECT", "INSERT", "UPDATE"]),
  community_cafe_member: Object.freeze([
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
  ]),
  community_cafe_join_request: Object.freeze(["SELECT", "INSERT", "UPDATE"]),
  community_cafe_invite: Object.freeze(["SELECT", "INSERT", "UPDATE"]),
  community_cafe_ban: Object.freeze([
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
  ]),
  community_cafe_moderation_log: Object.freeze(["SELECT", "INSERT"]),
});

const COMMUNITY_CAFE_RELATIONS = Object.freeze(
  Object.keys(COMMUNITY_CAFE_PRIVILEGES),
);

const TABLE_PRIVILEGES = Object.freeze([
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
]);

function roleName(role) {
  if (
    typeof role !== "string" ||
    role === "public" ||
    !/^[a-z_][a-z0-9_]{0,62}$/u.test(role)
  ) {
    throw new Error("An explicit safe community runtime role is required");
  }
  return role;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function relationSqlList() {
  return COMMUNITY_CAFE_RELATIONS.map(
    (relation) => `  public.${relation}`,
  ).join(",\n");
}

function requiredPrivilegeValues(indent = "    ") {
  return Object.entries(COMMUNITY_CAFE_PRIVILEGES)
    .flatMap(([relation, privileges]) =>
      privileges.map(
        (privilege) => `${indent}('${relation}', '${privilege}')`,
      ),
    )
    .join(",\n");
}

export function buildCommunityCafeRuntimeAclSql(role) {
  const safeRole = roleName(role);
  const quoted = `"${safeRole}"`;
  const grants = Object.entries(COMMUNITY_CAFE_PRIVILEGES)
    .map(
      ([relation, privileges]) =>
        `GRANT ${privileges.join(", ")} ON TABLE public.${relation} TO ${quoted};`,
    )
    .join("\n");
  return `
REVOKE ALL ON TABLE
${relationSqlList()}
FROM PUBLIC;

REVOKE ALL ON TABLE
${relationSqlList()}
FROM ${quoted};

${grants}
`;
}

export function buildCommunityCafeCapabilitySql(role) {
  const safeRole = roleName(role);
  const roleLiteral = sqlLiteral(safeRole);
  const relationValues = COMMUNITY_CAFE_RELATIONS.map(
    (relation) => `    ('${relation}')`,
  ).join(",\n");
  const expectedPrivileges = requiredPrivilegeValues();
  const allPrivileges = TABLE_PRIVILEGES.map((privilege) => `'${privilege}'`).join(", ");
  return `
DO $community_cafe_capability$
BEGIN
  IF to_regclass('public.community_cafe') IS NULL
    OR to_regclass('public.community_cafe_member') IS NULL
    OR to_regclass('public.community_cafe_join_request') IS NULL
    OR to_regclass('public.community_cafe_invite') IS NULL
    OR to_regclass('public.community_cafe_ban') IS NULL
    OR to_regclass('public.community_cafe_moderation_log') IS NULL THEN
    RAISE EXCEPTION 'community cafe governance migration is missing';
  END IF;

  PERFORM id, slug, name, description, genre, kind, tags, visibility,
    "joinPolicy", "postingPolicy", rules, status, "createdBy", hidden,
    "createdAt", "updatedAt" FROM public.community_cafe LIMIT 0;
  PERFORM "cafeId", "userId", role, "joinedAt"
    FROM public.community_cafe_member LIMIT 0;
  PERFORM id, "cafeId", "userId", message, status, "reviewedBy",
    "reviewedAt", "createdAt", "updatedAt"
    FROM public.community_cafe_join_request LIMIT 0;
  PERFORM id, "cafeId", "codeHash", "createdBy", "maxUses", "useCount",
    "expiresAt", "revokedAt", "createdAt"
    FROM public.community_cafe_invite LIMIT 0;
  PERFORM "cafeId", "userId", reason, "bannedBy", "expiresAt", "createdAt"
    FROM public.community_cafe_ban LIMIT 0;
  PERFORM id, "cafeId", "actorId", action, "targetUserId", "targetPostId",
    metadata, "createdAt" FROM public.community_cafe_moderation_log LIMIT 0;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
${expectedPrivileges}
    ) AS required(relation_name, privilege_name)
    WHERE NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.' || required.relation_name,
      required.privilege_name
    )
  ) THEN
    RAISE EXCEPTION 'community cafe runtime DML privileges are incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
${relationValues}
    ) AS relation(relation_name)
    CROSS JOIN unnest(ARRAY[${allPrivileges}]::text[])
      AS granted(privilege_name)
    WHERE pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.' || relation.relation_name,
      granted.privilege_name
    )
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES
${expectedPrivileges}
        ) AS expected(relation_name, privilege_name)
        WHERE expected.relation_name = relation.relation_name
          AND expected.privilege_name = granted.privilege_name
      )
  ) THEN
    RAISE EXCEPTION 'community cafe runtime role has unexpected privileges';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) AS privilege
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        SELECT relation_name
        FROM (VALUES
${relationValues}
        ) AS governed_relation(relation_name)
      )
      AND privilege.grantee = 0
      AND privilege.privilege_type = ANY(
        ARRAY[${allPrivileges}]::text[]
      )
  ) THEN
    RAISE EXCEPTION 'community cafe relations are exposed to PUBLIC';
  END IF;
END
$community_cafe_capability$;
`;
}

export { COMMUNITY_CAFE_PRIVILEGES, COMMUNITY_CAFE_RELATIONS };
