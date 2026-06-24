const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function loadImportRemovalApi() {
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
    `${appJs}
globalThis.__importRemovalTestApi = {
  revenueRowsForImportBatch,
  deleteImportBatchData,
  setRevenueEntries(entries) { state.revenueEntries = entries; },
};`,
    sandbox
  );
  return sandbox.__importRemovalTestApi;
}

test("selected import batch finds only its own revenue rows", () => {
  const api = loadImportRemovalApi();
  api.setRevenueEntries([
    { id: "a-1", source: "csv", importBatchId: "batch-a" },
    { id: "b-1", source: "csv", importBatchId: "batch-b" },
    { id: "manual-1", source: "manual" },
    { id: "a-2", source: "csv", importBatchId: "batch-a" },
  ]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.revenueRowsForImportBatch("batch-a"))).map((row) => row.id),
    ["a-1", "a-2"]
  );
});

test("deleting one import removes its revenue rows and history record", async () => {
  const api = loadImportRemovalApi();
  api.setRevenueEntries([
    { id: "a-1", source: "csv", importBatchId: "batch-a" },
    { id: "b-1", source: "csv", importBatchId: "batch-b" },
    { id: "a-2", source: "csv", importBatchId: "batch-a" },
  ]);
  const calls = [];

  const result = await api.deleteImportBatchData(
    "batch-a",
    async (store, ids) => calls.push({ action: "many", store, ids }),
    async (store, id) => calls.push({ action: "one", store, id })
  );

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { action: "many", store: "revenueEntries", ids: ["a-1", "a-2"] },
    { action: "one", store: "importBatches", id: "batch-a" },
  ]);
  assert.equal(result.removedRows, 2);
});

test("each CSV import history card has a remove action", () => {
  assert.match(appJs, /data-remove-import-batch="\$\{batch\.id\}"/);
  assert.match(appJs, /removeImportBatch\(button\.dataset\.removeImportBatch/);
  assert.match(stylesCss, /\.import-history-actions/);
  assert.match(indexHtml, /CSV import history/);
});
