const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function loadCloudLabelApi() {
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
globalThis.__cloudTestApi = { cloudWelcomeLabel };`,
    sandbox
  );
  return sandbox.__cloudTestApi;
}

test("signed-in account has a compact welcome element", () => {
  assert.match(indexHtml, /id="cloudWelcome"[\s\S]*Welcome,[\s\S]*id="cloudWelcomeEmail"/);
  assert.match(appJs, /classList\.toggle\("is-signed-in", signedIn\)/);
  assert.match(stylesCss, /\.cloud-account\.is-signed-in\s*\{/);
});

test("welcome uses the signed-in email address", () => {
  const api = loadCloudLabelApi();

  assert.equal(api.cloudWelcomeLabel({ email: "person@example.com" }), "person@example.com");
  assert.equal(api.cloudWelcomeLabel({}), "your cloud account");
});

test("local-to-cloud migration action is available from Setup instead of the compact account box", () => {
  const accountStart = indexHtml.indexOf('id="cloudAccount"');
  const accountEnd = indexHtml.indexOf("</div>", indexHtml.indexOf('id="cloudSignedInActions"'));
  const copyButtonIndex = indexHtml.indexOf('id="copyLocalToCloudBtn"');
  const setupIndex = indexHtml.indexOf('id="setup"');

  assert.ok(copyButtonIndex > accountEnd);
  assert.ok(copyButtonIndex > setupIndex);
  assert.match(indexHtml, /id="cloudTransferCard" class="setup-cloud-transfer hidden"/);
});

test("compact signed-in account stays compact on smaller screens", () => {
  assert.match(
    stylesCss,
    /@media \(max-width: 880px\)[\s\S]*\.cloud-account\.is-signed-in[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/
  );
  assert.match(
    stylesCss,
    /@media \(max-width: 880px\)[\s\S]*\.cloud-account\.is-signed-in \.cloud-signed-in-actions button[\s\S]*width:\s*auto/
  );
});
