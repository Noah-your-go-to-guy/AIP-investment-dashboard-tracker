const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("product form presents resale as a prominent full-width action", () => {
  assert.match(
    indexHtml,
    /id="toggleResaleBtn"[\s\S]*class="resale-action-btn"[\s\S]*Mark product as resold/
  );
  assert.match(stylesCss, /\.resale-action-btn\s*\{[\s\S]*width:\s*100%/);
});

test("resale action exposes its active state accessibly", () => {
  assert.match(indexHtml, /id="toggleResaleBtn"[\s\S]*aria-controls="resaleFields"[\s\S]*aria-expanded="false"/);
  assert.match(appJs, /toggle\("is-active", visible\)/);
  assert.match(appJs, /setAttribute\("aria-expanded", String\(visible\)\)/);
  assert.match(appJs, /visible \? "Resale details added" : "Mark product as resold"/);
});

test("resale fields expand directly beneath the resale action", () => {
  assert.match(
    indexHtml,
    /<div class="form-field">[\s\S]*id="purchasePrice"[\s\S]*id="toggleResaleBtn"[\s\S]*<section id="resaleFields"[\s\S]*<\/section>[\s\S]*<\/div>/
  );
  assert.match(stylesCss, /\.form-field > \.resale-fields\s*\{/);
  assert.match(stylesCss, /@media[\s\S]*\.form-field > \.resale-fields,[\s\S]*grid-template-columns:\s*1fr/);
});
