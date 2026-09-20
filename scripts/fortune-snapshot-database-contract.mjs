const identifier = (value) => {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value)) throw new Error("Invalid fortune database identifier");
  return `"${value}"`;
};
/** Run only from the separately approved migration workflow, never application startup. */
export function buildFortuneSnapshotRuntimeAclSql(runtimeRole, schema = "public") {
  const role = identifier(runtimeRole), relation = `${identifier(schema)}.fortune_public_snapshot`;
  const columns = ["snapshot_key", "payload", "checked_at", "expires_at"].map(identifier).join(", ");
  return `
REVOKE ALL ON TABLE ${relation} FROM PUBLIC, ${role};
REVOKE ALL (${columns}) ON TABLE ${relation} FROM PUBLIC, ${role};
GRANT SELECT, INSERT, DELETE ON TABLE ${relation} TO ${role};
GRANT UPDATE (payload, checked_at, expires_at) ON TABLE ${relation} TO ${role};
`;
}
