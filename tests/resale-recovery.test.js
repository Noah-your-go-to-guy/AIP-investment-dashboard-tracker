const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

function loadAppTestApi() {
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
globalThis.__testApi = {
  getProductStats,
  monthlyRecoveryRows: typeof monthlyRecoveryRows === "function" ? monthlyRecoveryRows : undefined,
  productExportRows,
  topProductGroups,
  setState(nextState) {
    state.products = nextState.products || [];
    state.revenueEntries = nextState.revenueEntries || [];
    state.approvedMatches = nextState.approvedMatches || [];
  },
};`,
    sandbox
  );
  return sandbox.__testApi;
}

test("resale proceeds increase total recovered without changing commission", () => {
  const api = loadAppTestApi();
  api.setState({
    products: [],
    revenueEntries: [
      {
        id: "revenue-1",
        productId: "product-1",
        amount: 40,
        matchStatus: "exact",
        date: "2026-05-10",
      },
    ],
  });

  const product = {
    id: "product-1",
    purchasePrice: 100,
    resaleAmount: 25,
    resaleDate: "2026-06-01",
    status: "earning",
  };
  const stats = api.getProductStats(product);

  assert.equal(stats.cost, 100);
  assert.equal(stats.commission, 40);
  assert.equal(stats.resale, 25);
  assert.equal(stats.recovered, 65);
  assert.equal(stats.net, -35);
  assert.equal(stats.unrecovered, 35);
  assert.equal(stats.paybackPercent, 65);
  assert.equal(stats.paidOff, false);
  assert.equal(product.status, "earning");
});

test("products without resale fields remain backward compatible", () => {
  const api = loadAppTestApi();
  api.setState({
    products: [],
    revenueEntries: [
      {
        id: "revenue-1",
        productId: "product-1",
        amount: 40,
        matchStatus: "exact",
        date: "2026-05-10",
      },
    ],
  });

  const stats = api.getProductStats({
    id: "product-1",
    purchasePrice: 100,
  });

  assert.equal(stats.commission, 40);
  assert.equal(stats.resale, 0);
  assert.equal(stats.recovered, 40);
  assert.equal(stats.net, -60);
});

test("monthly recovery places resale proceeds in the resale month", () => {
  const api = loadAppTestApi();
  assert.equal(typeof api.monthlyRecoveryRows, "function");
  api.setState({
    products: [
      {
        id: "product-1",
        purchaseDate: "2026-04-05",
        purchasePrice: 100,
        resaleAmount: 25,
        resaleDate: "2026-06-01",
      },
    ],
    revenueEntries: [
      {
        id: "revenue-1",
        productId: "product-1",
        amount: 40,
        matchStatus: "exact",
        date: "2026-05-10",
      },
    ],
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.monthlyRecoveryRows())),
    [
      ["2026-04", { cost: 100, commission: 0, resale: 0, recovered: 0 }],
      ["2026-05", { cost: 0, commission: 40, resale: 0, recovered: 40 }],
      ["2026-06", { cost: 0, commission: 0, resale: 25, recovered: 25 }],
    ]
  );
});

test("top products remains commission-only", () => {
  const api = loadAppTestApi();
  api.setState({
    products: [
      {
        id: "product-1",
        asin: "B000000001",
        title: "Tracked Product",
        resaleAmount: 25,
      },
    ],
    revenueEntries: [
      {
        id: "revenue-1",
        productId: "product-1",
        asin: "B000000001",
        title: "Tracked Product",
        amount: 40,
        source: "csv",
        matchStatus: "exact",
        date: "2026-05-10",
      },
    ],
  });

  const groups = api.topProductGroups();

  assert.equal(groups.length, 1);
  assert.equal(groups[0].earned, 40);
});

test("product export separates commission, resale, and total recovered", () => {
  const api = loadAppTestApi();
  api.setState({
    products: [
      {
        id: "product-1",
        title: "Tracked Product",
        purchasePrice: 100,
        resaleAmount: 25,
        resaleDate: "2026-06-01",
      },
    ],
    revenueEntries: [
      {
        id: "revenue-1",
        productId: "product-1",
        amount: 40,
        matchStatus: "exact",
        date: "2026-05-10",
      },
    ],
  });

  const [row] = api.productExportRows();

  assert.equal(row["Amazon Commission"], 40);
  assert.equal(row["Resale Proceeds"], 25);
  assert.equal(row["Resale Date"], "2026-06-01");
  assert.equal(row["Total Recovered"], 65);
  assert.equal(row["Net Profit"], -35);
});
