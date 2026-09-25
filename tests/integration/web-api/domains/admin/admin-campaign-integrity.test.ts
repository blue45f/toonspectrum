import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const webSource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/components/AdminCampaigns.tsx"),
  "utf8",
);
const apiSource = readFileSync(
  join(process.cwd(), "apps/api/src/modules/admin/admin-campaigns.service.ts"),
  "utf8",
);

describe("admin campaign financial integrity", () => {
  it("does not expose or submit an editable raised-funds aggregate", () => {
    expect(webSource).not.toContain('register("raisedWon")');
    expect(webSource).not.toContain("raisedAmountCents: wonToCents");
  });

  it("preserves existing raised funds and starts new campaigns at zero", () => {
    expect(apiSource).not.toContain(
      "raisedAmountCents: parsed.raisedAmountCents",
    );
    expect(apiSource).toContain("raisedAmountCents: 0");
  });

  it("blocks hard deletion after revenue is linked", () => {
    expect(apiSource).toContain("revenueLedger.campaignId");
    expect(apiSource).toContain("후원 거래가 연결된 캠페인은 삭제할 수 없습니다");
  });

  it("records create, update, and delete audit actions", () => {
    expect(apiSource).toContain('"CAMPAIGN_CREATE"');
    expect(apiSource).toContain('"CAMPAIGN_UPDATE"');
    expect(apiSource).toContain('"CAMPAIGN_DELETE"');
  });
});
