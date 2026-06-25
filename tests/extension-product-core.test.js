const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const core = require(path.join(__dirname, "..", "extension", "product-core.js"));

test("extractAmazonProduct reads product details from an adapter", () => {
  const adapter = {
    title: "Amazon.com: Test Product Page",
    locationHref: "https://www.amazon.com/Example-Product/dp/B0TEST1234/ref=something",
    text(selector) {
      return {
        "#productTitle": "  Example Bright Desk Lamp, Black  ",
        "#bylineInfo": "Visit the ExampleCo Store",
        "#corePrice_feature_div .a-price .a-offscreen": "$24.99",
      }[selector] || "";
    },
    attr(selector, attribute) {
      if (selector === 'input[name="ASIN"]' && attribute === "value") return "B0TEST1234";
      if (selector === 'link[rel="canonical"]' && attribute === "href") return "https://www.amazon.com/dp/B0TEST1234";
      return "";
    },
    allText(selector) {
      if (selector === "#wayfinding-breadcrumbs_feature_div a,.a-breadcrumb a") {
        return ["Home & Kitchen", "Lighting", "Desk Lamps"];
      }
      return [];
    },
    detail(label) {
      return label === "Brand" ? "ExampleCo" : "";
    },
  };

  const product = core.extractAmazonProduct(adapter);

  assert.equal(product.asin, "B0TEST1234");
  assert.equal(product.title, "Example Bright Desk Lamp, Black");
  assert.equal(product.brand, "ExampleCo");
  assert.equal(product.category, "Desk Lamps");
  assert.equal(product.amazonPrice, 24.99);
  assert.equal(product.amazonLink, "https://www.amazon.com/dp/B0TEST1234");
});

test("buildBoughtProductRecord creates dashboard-compatible bought product data", () => {
  const captured = {
    asin: "B0TEST1234",
    title: "Example Bright Desk Lamp, Black",
    brand: "ExampleCo",
    category: "Desk Lamps",
    amazonPrice: 24.99,
    amazonLink: "https://www.amazon.com/dp/B0TEST1234",
  };

  const product = core.buildBoughtProductRecord(captured, {
    existingProduct: {
      id: "existing-id",
      createdAt: "2026-01-01T00:00:00.000Z",
      notes: "Old note",
      storefrontLink: "https://amazon.com/shop/example",
      videos: [{ id: "video-1", title: "Lamp review" }],
      resaleDate: "2026-07-01",
      filmedDate: "2026-06-26",
      postedDate: "2026-06-27",
    },
    purchasePrice: "19.50",
    purchaseDate: "2026-06-25",
    nowIso: "2026-06-25T15:30:00.000Z",
  });

  assert.equal(product.id, "existing-id");
  assert.equal(product.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(product.updatedAt, "2026-06-25T15:30:00.000Z");
  assert.equal(product.status, "bought");
  assert.equal(product.purchaseDate, "2026-06-25");
  assert.equal(product.purchasePrice, 19.5);
  assert.equal(product.tax, 0);
  assert.equal(product.shipping, 0);
  assert.equal(product.discounts, 0);
  assert.equal(product.refunds, 0);
  assert.equal(product.videoStatus, "not filmed");
  assert.equal(product.notes, "Old note");
  assert.equal(product.storefrontLink, "https://amazon.com/shop/example");
  assert.deepEqual(product.videos, [{ id: "video-1", title: "Lamp review" }]);
  assert.equal(product.resaleDate, "2026-07-01");
  assert.equal(product.filmedDate, "2026-06-26");
  assert.equal(product.postedDate, "2026-06-27");
});

test("buildBoughtProductRecord defaults omitted purchase price to captured Amazon price", () => {
  const product = core.buildBoughtProductRecord(
    {
      asin: "B0TEST1234",
      title: "Example Bright Desk Lamp, Black",
      amazonPrice: 24.99,
    },
    {
      purchaseDate: "2026-06-25",
      nowIso: "2026-06-25T15:30:00.000Z",
    }
  );

  assert.equal(product.purchasePrice, 24.99);
});

test("buildBoughtProductRecord creates the full new-record dashboard shape", () => {
  const product = core.buildBoughtProductRecord(
    {
      asin: "B0TEST1234",
      title: "Example Bright Desk Lamp, Black",
      brand: "ExampleCo",
      category: "Desk Lamps",
      amazonPrice: 24.99,
      amazonLink: "https://www.amazon.com/dp/B0TEST1234",
    },
    {
      purchaseDate: "2026-06-25",
      nowIso: "2026-06-25T15:30:00.000Z",
    }
  );

  assert.equal(product.id, "asin-B0TEST1234");
  assert.equal(product.createdAt, "2026-06-25T15:30:00.000Z");
  assert.equal(product.updatedAt, "2026-06-25T15:30:00.000Z");
  assert.equal(product.status, "bought");
  assert.equal(product.purchaseDate, "2026-06-25");
  assert.equal(product.purchasePrice, 24.99);
  assert.equal(product.tax, 0);
  assert.equal(product.shipping, 0);
  assert.equal(product.discounts, 0);
  assert.equal(product.refunds, 0);
  assert.equal(product.resaleAmount, 0);
  assert.equal(product.videoStatus, "not filmed");
  assert.equal(product.notes, "");
  assert.equal(product.storefrontLink, "");
  assert.deepEqual(product.videos, []);
  assert.equal(product.resaleDate, "");
  assert.equal(product.filmedDate, "");
  assert.equal(product.postedDate, "");
});

test("buildBoughtProductRecord refuses to save without an ASIN", () => {
  assert.throws(
    () => core.buildBoughtProductRecord({ title: "No ASIN", amazonPrice: 10 }, { purchaseDate: "2026-06-25" }),
    /ASIN is required/
  );
});

test("todayInputValue formats local dates for date inputs", () => {
  assert.equal(core.todayInputValue(new Date("2026-06-25T12:00:00")), "2026-06-25");
});
