import { readFileSync } from "node:fs";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { STUDIO_VIRTUAL_MAX_PLACEMENTS } from "@toonstudio/contracts/studio-virtual-space-placement-contract";

import {
  studioVirtualSpaceCustomFurniture,
  studioVirtualSpaceDecorationLayouts,
} from "./studio-virtual-space-decoration.schema";

const dialect = new PgDialect();

describe("가상 공간 스키마의 실행 가능한 CHECK DDL", () => {
  it.each([
    studioVirtualSpaceDecorationLayouts,
    studioVirtualSpaceCustomFurniture,
  ])("테이블 제약에는 PostgreSQL DDL에서 사용할 수 없는 bind parameter가 없다", (table) => {
    const config = getTableConfig(table);
    expect(config.checks.length).toBeGreaterThan(0);
    for (const constraint of config.checks) {
      const rendered = dialect.sqlToQuery(constraint.value);
      expect(rendered.params, constraint.name).toEqual([]);
      expect(rendered.sql, constraint.name).not.toMatch(/\$\d+/u);
    }
  });

  it("배치 상한은 36 리터럴이며 불변 0094 마이그레이션과 같은 제약이다", () => {
    const config = getTableConfig(studioVirtualSpaceDecorationLayouts);
    const constraint = config.checks.find(({ name }) => name === "studio_virtual_space_decoration_layout_placements_capped");
    if (!constraint) throw new Error("배치 수 제한 제약이 필요합니다.");
    const rendered = dialect.sqlToQuery(constraint.value);
    expect(STUDIO_VIRTUAL_MAX_PLACEMENTS).toBe(36);
    expect(rendered.sql).toBe('jsonb_array_length("studio_virtual_space_decoration_layout"."placements") <= 36');
    expect(rendered.params).toEqual([]);

    const migration = readFileSync(new URL("../migrations/0094_studio_virtual_space_decoration_layout.sql", import.meta.url), "utf8");
    const unqualified = rendered.sql.replaceAll(`"${config.name}".`, "");
    expect(migration).toContain(`CONSTRAINT ${constraint.name} CHECK (${unqualified})`);
  });
});
