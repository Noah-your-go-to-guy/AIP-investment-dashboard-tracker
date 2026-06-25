const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
const setupGuide = fs.readFileSync(path.join(__dirname, "..", "HOW_TO_SETUP.md"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "extension", "manifest.json"), "utf8"));

test("setup tab recommends the Chrome extension before the bookmarklet fallback", () => {
  const extensionIndex = indexHtml.indexOf("Recommended: Chrome extension");
  const fallbackIndex = indexHtml.indexOf("Fallback: bookmarklet");

  assert.notEqual(extensionIndex, -1);
  assert.notEqual(fallbackIndex, -1);
  assert.ok(extensionIndex < fallbackIndex);
  assert.match(indexHtml, /chrome:\/\/extensions/);
  assert.match(indexHtml, /Load unpacked/);
  assert.match(indexHtml, /Save as bought/);
});

test("docs explain unpacked extension setup from GitHub", () => {
  for (const doc of [readme, setupGuide]) {
    assert.match(doc, /chrome:\/\/extensions/);
    assert.match(doc, /Developer mode/);
    assert.match(doc, /Load unpacked/);
    assert.match(doc, /extension folder/i);
  }
});

test("extension manifest targets Amazon and Supabase only for the MVP", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.host_permissions.includes("https://*.amazon.com/*"));
  assert.ok(manifest.host_permissions.includes("https://gvifstpfolidkvxjeftx.supabase.co/*"));
  assert.ok(manifest.permissions.includes("storage"));
});
