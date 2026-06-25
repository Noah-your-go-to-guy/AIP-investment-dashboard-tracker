const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
const setupGuide = fs.readFileSync(path.join(__dirname, "..", "HOW_TO_SETUP.md"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "extension", "manifest.json"), "utf8"));
const extensionZipPath = path.join(__dirname, "..", "downloads", "aip-portfolio-capture-extension.zip");
const windowsHelperPath = path.join(__dirname, "..", "downloads", "install-aip-extension-windows.cmd");
const macHelperPath = path.join(__dirname, "..", "downloads", "install-aip-extension-mac.command");
const extensionZipSha256 = "48E296691AD56394AFA21C8A4AE0970DB238FB687119B2931B287FA4C4F27063";

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

test("setup offers a downloadable Chrome extension zip", () => {
  assert.match(indexHtml, /Download Chrome extension ZIP/);
  assert.match(indexHtml, /href="\.\/downloads\/aip-portfolio-capture-extension\.zip"/);
  assert.match(indexHtml, /Unzip the download/);
  assert.match(readme, /Download Chrome extension ZIP/);
  assert.match(setupGuide, /Download Chrome extension ZIP/);
  assert.ok(fs.existsSync(extensionZipPath), "expected downloadable extension zip to exist");
});

test("setup offers friend-friendly helper downloads for Chrome extension setup", () => {
  assert.match(indexHtml, /Download Windows setup helper/);
  assert.match(indexHtml, /href="\.\/downloads\/install-aip-extension-windows\.cmd"/);
  assert.match(indexHtml, /Download Mac setup helper/);
  assert.match(indexHtml, /href="\.\/downloads\/install-aip-extension-mac\.command"/);
  assert.match(indexHtml, /copies the extension folder path/i);
  assert.match(readme, /setup helper/i);
  assert.match(setupGuide, /setup helper/i);
  assert.ok(fs.existsSync(windowsHelperPath), "expected Windows setup helper to exist");
  assert.ok(fs.existsSync(macHelperPath), "expected Mac setup helper to exist");
});

test("setup helpers download the official extension zip and verify its checksum", () => {
  const windowsHelper = fs.readFileSync(windowsHelperPath, "utf8");
  const macHelper = fs.readFileSync(macHelperPath, "utf8");

  for (const helper of [windowsHelper, macHelper]) {
    assert.match(helper, /aip-investment-dashboard-tracker\.vercel\.app\/downloads\/aip-portfolio-capture-extension\.zip/);
    assert.match(helper, new RegExp(extensionZipSha256, "i"));
    assert.match(helper, /AIP Portfolio Extension/);
    assert.match(helper, /chrome:\/\/extensions/);
  }
});

test("extension setup explains signed-in cloud storage requirement", () => {
  for (const doc of [indexHtml, readme, setupGuide]) {
    assert.match(doc, /sign in or create an account/i);
    assert.match(doc, /cloud account/i);
    assert.match(doc, /Supabase/i);
    assert.match(doc, /local-only[\s\S]*bookmarklet fallback/i);
  }
});

test("setup guide separates cloud extension use from local-only bookmarklet use", () => {
  assert.match(setupGuide, /Signed-out data stays in your own browser/);
  assert.match(setupGuide, /Supabase cloud account/);
  assert.match(setupGuide, /Add a Product With the Bookmarklet Fallback/);
  assert.match(setupGuide, /Skip this section if you are using the Chrome extension/);
  assert.match(setupGuide, /local-only capture/);
});

test("extension manifest targets Amazon and Supabase only for the MVP", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.host_permissions.includes("https://*.amazon.com/*"));
  assert.ok(manifest.host_permissions.includes("https://gvifstpfolidkvxjeftx.supabase.co/*"));
  assert.ok(manifest.permissions.includes("storage"));
});
