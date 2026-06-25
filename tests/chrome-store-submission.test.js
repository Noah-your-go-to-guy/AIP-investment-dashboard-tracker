const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const submissionGuidePath = path.join(root, "CHROME_WEB_STORE_SUBMISSION.md");
const privacyPath = path.join(root, "privacy.html");
const storeZipPath = path.join(root, "store-packages", "aip-portfolio-capture-0.1.0.zip");

test("Chrome Web Store submission guide includes upload-ready listing details", () => {
  const guide = fs.readFileSync(submissionGuidePath, "utf8");

  assert.match(guide, /Chrome Web Store Developer Dashboard/);
  assert.match(guide, /AIP Portfolio Capture/);
  assert.match(guide, /Single purpose/i);
  assert.match(guide, /Privacy policy URL/i);
  assert.match(guide, /Test instructions/i);
  assert.match(guide, /store-packages\/aip-portfolio-capture-0\.1\.0\.zip/);
});

test("privacy page explains what the extension collects and why", () => {
  const privacy = fs.readFileSync(privacyPath, "utf8");

  assert.match(privacy, /AIP Portfolio Capture Privacy Policy/);
  assert.match(privacy, /Amazon product page/i);
  assert.match(privacy, /Supabase/i);
  assert.match(privacy, /product title/i);
  assert.match(privacy, /ASIN/i);
  assert.match(privacy, /purchase price/i);
  assert.match(privacy, /We do not sell/i);
});

test("store package exists with manifest at the ZIP root", () => {
  assert.ok(fs.existsSync(storeZipPath), "expected Chrome Web Store package to exist");

  const zipText = fs.readFileSync(storeZipPath).toString("latin1");
  assert.match(zipText, /manifest\.json/);
  assert.doesNotMatch(zipText, /extension\/manifest\.json/);
  assert.match(zipText, /background\.js/);
  assert.match(zipText, /content\.js/);
});
