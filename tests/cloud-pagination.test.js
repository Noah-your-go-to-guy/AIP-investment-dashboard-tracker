const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

function loadCloudPaginationApi() {
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
    `${source}\nglobalThis.__cloudPaginationTestApi = { fetchAllCloudRecords };`,
    sandbox
  );
  return sandbox.__cloudPaginationTestApi;
}

test("cloud loader retrieves every page when a store exceeds 1000 records", async () => {
  const { fetchAllCloudRecords } = loadCloudPaginationApi();
  const rows = Array.from({ length: 1101 }, (_, index) => ({ id: `row-${index + 1}` }));
  const requestedRanges = [];
  const fetchPage = async (_storeName, from, to) => {
    requestedRanges.push([from, to]);
    return rows.slice(from, to + 1);
  };

  const result = await fetchAllCloudRecords("revenueEntries", fetchPage);

  assert.equal(result.length, 1101);
  assert.equal(result[0].id, "row-1");
  assert.equal(result[1100].id, "row-1101");
  assert.deepEqual(JSON.parse(JSON.stringify(requestedRanges)), [
    [0, 999],
    [1000, 1999],
  ]);
});

test("cloud loader requests one empty page when record count is exactly 1000", async () => {
  const { fetchAllCloudRecords } = loadCloudPaginationApi();
  const rows = Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index + 1}` }));
  const requestedRanges = [];

  const result = await fetchAllCloudRecords("revenueEntries", async (_storeName, from, to) => {
    requestedRanges.push([from, to]);
    return rows.slice(from, to + 1);
  });

  assert.equal(result.length, 1000);
  assert.deepEqual(JSON.parse(JSON.stringify(requestedRanges)), [
    [0, 999],
    [1000, 1999],
  ]);
});
