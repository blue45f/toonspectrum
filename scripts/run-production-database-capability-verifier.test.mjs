import assert from "node:assert/strict";
import test from "node:test";

import { patchPersonalCloudPublicAclRole } from "./run-production-database-capability-verifier.mjs";

const verifierFragment = `before
      WHERE pg_catalog.has_table_privilege(
        'PUBLIC',
        'public.personal_cloud_connection',
        public_privilege
      )
after`;

test("patches the PostgreSQL PUBLIC pseudo-role to oid zero", () => {
  const patched = patchPersonalCloudPublicAclRole(verifierFragment);
  assert.match(patched, /has_table_privilege\(\s*0::oid,/u);
  assert.doesNotMatch(
    patched,
    /has_table_privilege\(\s*'PUBLIC',/u,
  );
});

test("fails closed when the expected verifier shape drifts", () => {
  assert.throws(
    () => patchPersonalCloudPublicAclRole("no matching verifier"),
    /exactly one personal-cloud PUBLIC ACL verifier occurrence/u,
  );
  assert.throws(
    () => patchPersonalCloudPublicAclRole(`${verifierFragment}${verifierFragment}`),
    /exactly one personal-cloud PUBLIC ACL verifier occurrence/u,
  );
});
