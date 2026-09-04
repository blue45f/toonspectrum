#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function replaceOnce(path, before, after) {
  const absolute = resolve(root, path);
  const source = readFileSync(absolute, "utf8");
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${path}: expected one replacement, found ${matches}`);
  }
  writeFileSync(absolute, source.replace(before, after), "utf8");
}

const service = "apps/api/src/modules/creator-marketplace/creator-marketplace-social.service.ts";
replaceOnce(
  service,
  `      id: row.userId,\n      name: "삭제됨",`,
  `      id: "deleted",\n      name: "삭제됨",`,
);
replaceOnce(
  service,
  `    const rootLimit = CREATOR_MARKETPLACE_SOCIAL_COMMENT_PAGE_SIZE;\n    const reviewLimit = CREATOR_MARKETPLACE_SOCIAL_REVIEW_PAGE_SIZE;`,
  `    const rootLimit = CREATOR_MARKETPLACE_SOCIAL_COMMENT_PAGE_SIZE;\n    const replyLimit = rootLimit * 5;\n    const reviewLimit = CREATOR_MARKETPLACE_SOCIAL_REVIEW_PAGE_SIZE;`,
);
replaceOnce(
  service,
  `          .limit(rootLimit + 1)\n      : [];\n    const replyPage = replyRows.slice(0, rootLimit);`,
  `          .limit(replyLimit + 1)\n      : [];\n    const replyPage = replyRows.slice(0, replyLimit);`,
);
replaceOnce(
  service,
  `          || replyRows.length > rootLimit\n          || totalCommentCount > commentRows.length,`,
  `          || replyRows.length > replyLimit\n          || totalCommentCount > commentRows.length,`,
);
replaceOnce(
  service,
  `          hidden: false,\n          createdAt: new Date(),\n        },`,
  `          hidden: false,\n        },`,
);

const serviceTest = "apps/api/src/modules/creator-marketplace/creator-marketplace-social.service.test.ts";
replaceOnce(
  serviceTest,
  `    expect(serviceSource).toContain('name: "삭제됨"');\n    expect(serviceSource).toContain("isAdminUser");`,
  `    expect(serviceSource).toContain('id: "deleted"');\n    expect(serviceSource).toContain('name: "삭제됨"');\n    expect(serviceSource).toContain("const replyLimit = rootLimit * 5");\n    expect(serviceSource).not.toContain("createdAt: new Date(),");\n    expect(serviceSource).toContain("isAdminUser");`,
);

const boundaryTest = "apps/api/src/modules/creator-marketplace/creator-marketplace-social-boundary.test.ts";
replaceOnce(
  boundaryTest,
  `    expect(hook).toContain('window.addEventListener("pageshow", refresh)');\n  });`,
  `    expect(hook).toContain('window.addEventListener("pageshow", refresh)');\n    expect(hook).toContain("MAX_MARKET_SOCIAL_STORES = 64");\n    expect(hook).toContain("store.mutationController?.abort()");\n    expect(hook).toContain("data: null");\n  });`,
);
replaceOnce(
  boundaryTest,
  `    expect(service).toContain("review.ownerId === userId");`,
  `    expect(service).toContain('id: "deleted"');\n    expect(service).toContain("const replyLimit = rootLimit * 5");\n    expect(service).not.toContain("createdAt: new Date(),");\n    expect(service).toContain("review.ownerId === userId");`,
);

console.log("Applied marketplace social backend hardening");
