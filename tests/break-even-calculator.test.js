const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function loadCalculatorApi() {
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
    `${appJs}\nglobalThis.__calculatorTestApi = { calculateBreakEven };`,
    sandbox
  );
  return sandbox.__calculatorTestApi;
}

test("calculator reproduces the supplied 22 dollar monthly example", () => {
  const { calculateBreakEven } = loadCalculatorApi();
  const result = calculateBreakEven({
    monthlySales: 100,
    attributedVelocityPercent: 4,
    carouselVideos: 4,
    amazonPrice: 100,
    commissionPercent: 2,
    ccBonusPercent: 20,
    investmentPrice: 100,
    resaleValue: 50,
  });

  assert.equal(result.attributedSales, 1);
  assert.equal(result.monthlyEarnings, 22);
  assert.equal(result.netInvestment, 50);
  assert.ok(Math.abs(result.breakEvenDays - (50 / 22) * 30) < 0.000001);
  assert.equal(result.resaleSurplus, 0);
});

test("calculator handles zero earnings without returning an invalid day estimate", () => {
  const { calculateBreakEven } = loadCalculatorApi();
  const result = calculateBreakEven({
    monthlySales: 100,
    attributedVelocityPercent: 4,
    carouselVideos: 0,
    amazonPrice: 100,
    commissionPercent: 2,
    investmentPrice: 100,
  });

  assert.equal(result.attributedSales, 0);
  assert.equal(result.monthlyEarnings, 0);
  assert.equal(result.breakEvenDays, null);
});

test("calculator reports immediate coverage when expected resale exceeds investment", () => {
  const { calculateBreakEven } = loadCalculatorApi();
  const result = calculateBreakEven({
    monthlySales: 0,
    carouselVideos: 1,
    investmentPrice: 60,
    resaleValue: 75,
  });

  assert.equal(result.netInvestment, 0);
  assert.equal(result.breakEvenDays, 0);
  assert.equal(result.resaleSurplus, 15);
});

test("dashboard includes a temporary dedicated calculator tab", () => {
  assert.match(indexHtml, /data-tab="calculator"[^>]*>Calculator</);
  assert.match(indexHtml, /<section id="calculator" class="tab-panel">/);
  for (const id of [
    "calcMonthlySales",
    "calcAttributedVelocity",
    "calcCarouselVideos",
    "calcAmazonPrice",
    "calcCommissionRate",
    "calcCcBonusRate",
    "calcInvestmentPrice",
    "calcResaleValue",
  ]) {
    assert.match(indexHtml, new RegExp(`id="${id}"`));
  }
  assert.match(indexHtml, /Estimates only/i);
  assert.match(indexHtml, /id="calcBreakEvenDays"/);
  assert.match(appJs, /function renderBreakEvenCalculator\(/);
  assert.match(appJs, /#breakEvenCalculatorInputs/);
});

test("calculator uses a split desktop layout that stacks on smaller screens", () => {
  assert.match(stylesCss, /\.calculator-workspace\s*\{[\s\S]*grid-template-columns:/);
  assert.match(
    stylesCss,
    /@media \(max-width: 880px\)[\s\S]*\.calculator-workspace[\s\S]*grid-template-columns:\s*1fr/
  );
});
