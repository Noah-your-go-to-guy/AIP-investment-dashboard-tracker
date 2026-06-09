const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

function loadStatusApi() {
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
    `${source}
globalThis.__statusTestApi = {
  statuses: [...STATUSES],
  productStatusOptions,
  updateProductStatus,
  setProducts(products) {
    state.products = products;
  },
  getProducts() {
    return state.products;
  },
};`,
    sandbox
  );
  return sandbox.__statusTestApi;
}

test("product statuses no longer include retired", () => {
  const api = loadStatusApi();

  assert.deepEqual(JSON.parse(JSON.stringify(api.statuses)), [
    "researched",
    "bought",
    "received",
    "filmed",
    "posted",
    "earning",
    "paid off",
  ]);
});

test("inline product status options select the current status", () => {
  const api = loadStatusApi();
  const html = api.productStatusOptions("received");

  assert.match(html, /<option value="received" selected>Received<\/option>/);
  assert.doesNotMatch(html, /Retired/i);
});

test("product table renders an immediate status control", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

  assert.match(source, /class="inline-status-select"/);
  assert.match(source, /data-product-status="\$\{product\.id\}"/);
  assert.match(source, /updateProductStatus/);
});

test("changing an inline status persists and updates the product record", async () => {
  const api = loadStatusApi();
  const saved = [];
  api.setProducts([{ id: "product-1", title: "Alarm clock", status: "researched" }]);

  await api.updateProductStatus("product-1", "filmed", async (storeName, product) => {
    saved.push({ storeName, product });
  });

  assert.equal(saved.length, 1);
  assert.equal(saved[0].storeName, "products");
  assert.equal(saved[0].product.status, "filmed");
  assert.match(saved[0].product.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(api.getProducts()[0].status, "filmed");
});
