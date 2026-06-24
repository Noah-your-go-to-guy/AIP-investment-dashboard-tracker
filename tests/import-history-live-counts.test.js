const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

function loadImportHistoryApi() {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    window: {
      supabase: null,
      location: { origin: "http://127.0.0.1:4173", pathname: "/" },
      crypto: {},
    },
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
  };
  vm.runInNewContext(
    `${source}\nglobalThis.__importHistoryTestApi = { summarizeImportBatchRows };`,
    sandbox
  );
  return sandbox.__importHistoryTestApi;
}

test("import history derives current matching totals from stored rows", () => {
  const { summarizeImportBatchRows } = loadImportHistoryApi();
  const summary = summarizeImportBatchRows([
    { productId: "product-1", matchStatus: "exact" },
    { productId: "product-1", matchStatus: "approved" },
    { productId: "", matchStatus: "suggested" },
    { productId: "", matchStatus: "unmatched" },
    { productId: "", matchStatus: "ignored" },
    { productId: "", matchStatus: "rejected" },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
    imported: 6,
    counted: 2,
    needsReview: 2,
    ignored: 2,
  });
});
