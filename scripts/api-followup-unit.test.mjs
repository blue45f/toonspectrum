import assert from "node:assert/strict";

import {
  parseSearchPageQuery,
  searchPageItems,
  searchPagination,
  searchPageQueryFromParams,
  searchParamsFromBody,
} from "../packages/core/src/search-pagination.ts";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("search defaults, explicit pages, upper bounds and empty saved collection", () => {
  assert.deepEqual(parseSearchPageQuery({}), { page: 1, pageSize: 24 });
  const options = parseSearchPageQuery({ page: "2", pageSize: "80", ids: "one,one,two" });
  assert.deepEqual([...options.ids], ["one", "two"]);
  assert.equal(parseSearchPageQuery({ ids: "" }).ids.size, 0);
  assert.deepEqual(
    searchPageItems(Array.from({ length: 200 }, (_, index) => index), options),
    Array.from({ length: 80 }, (_, index) => index + 80),
  );
  assert.deepEqual(searchPagination(200, options), {
    page: 2,
    pageSize: 80,
    total: 200,
    hasMore: true,
    nextPage: 3,
  });
  assert.equal(searchPagination(160, options).hasMore, false);
});

for (const value of ["", "0", "-1", "1.5", "1e2", "NaN", "Infinity", "81", [], {}, ["1", "2"], "1\n"]) {
  test(`reject invalid pageSize ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseSearchPageQuery({ pageSize: value }));
  });
}

test("reject repeated URL fields, oversized IDs and excessive page numbers", () => {
  for (const name of ["page", "pageSize", "ids"]) {
    const query = searchPageQueryFromParams(new URLSearchParams(`${name}=1&${name}=2`));
    assert.throws(() => parseSearchPageQuery(query));
  }
  assert.throws(() => parseSearchPageQuery({ page: 1_000_001 }));
  assert.throws(() => parseSearchPageQuery({ ids: "x".repeat(129) }));
  assert.throws(() => parseSearchPageQuery({ ids: Array(1001).fill("x").join(",") }));
});

test("all pages are bounded and concatenate without loss or duplicates", () => {
  for (const total of [0, 1, 23, 24, 25, 80, 81, 193, 1001]) {
    const values = Array.from({ length: total }, (_, id) => ({ id }));
    for (const pageSize of [1, 24, 80]) {
      let page = 1;
      const collected = [];
      do {
        const options = parseSearchPageQuery({ page, pageSize });
        const items = searchPageItems(values, options);
        assert.ok(items.length <= pageSize);
        collected.push(...items);
        page = searchPagination(total, options).nextPage;
      } while (page !== null);
      assert.deepEqual(collected, values);
    }
  }
});

test("saved search bodies reject invalid shapes and preserve empty filters", () => {
  assert.equal(searchParamsFromBody({ ids: "", page: "1", pageSize: "24" }).get("ids"), "");
  for (const invalid of [null, [], "q=x", { ids: ["one"] }, { unknown: "x" }, { pageSize: "81" }]) {
    assert.throws(() => searchParamsFromBody(invalid));
  }
  assert.throws(() => searchPageQueryFromParams(new URLSearchParams("q=one&q=two")));
});
