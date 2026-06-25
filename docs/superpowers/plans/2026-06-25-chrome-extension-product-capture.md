# Chrome Extension Product Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an unpacked Chrome extension MVP that lets users save an Amazon product directly to the AIP dashboard as `bought`.

**Architecture:** Add a dependency-free Manifest V3 extension under `extension/`. The content script reads the Amazon page and renders the overlay; the background service worker handles Supabase auth/session storage and database writes through the Supabase REST API. Shared pure helpers live in separate files so Node tests can verify extraction, product normalization, and Supabase request behavior without launching Chrome.

**Tech Stack:** Plain JavaScript, Chrome Extension Manifest V3, Chrome `storage` and `runtime` messaging APIs, Supabase REST/Auth endpoints, Node built-in test runner.

---

## File Structure

- Create `extension/manifest.json`: Manifest V3 permissions, Amazon content script, extension action, background worker, and host permissions for Supabase/dashboard.
- Create `extension/product-core.js`: pure extraction, cleaning, date, and product-normalization helpers. Exposes `globalThis.AipProductCore` and CommonJS exports for tests.
- Create `extension/supabase-api.js`: pure Supabase REST/Auth helper functions. Exposes `globalThis.AipSupabaseApi` and CommonJS exports for tests.
- Create `extension/background.js`: Chrome service worker for action click, auth session storage, token refresh, and product upsert.
- Create `extension/content.js`: Amazon page overlay UI, DOM extraction adapter, editable purchase price/date, sign-in state, and save flow.
- Create `extension/content.css`: overlay styling isolated with an `aip-` prefix.
- Create `extension/icons/icon.svg`: simple local icon so the unpacked extension has a visible identity.
- Modify `index.html`: update Setup tab to recommend the Chrome extension first and keep bookmarklet as fallback.
- Modify `styles.css`: add/adjust setup-card styling for the extension instructions.
- Modify `README.md` and `HOW_TO_SETUP.md`: explain unpacked extension install and the new preferred capture flow.
- Modify `agent.md`: record the new extension architecture and setup assumptions.
- Create `tests/extension-product-core.test.js`: tests extraction and product normalization.
- Create `tests/extension-supabase-api.test.js`: tests Supabase request building, sign-in handling, and upsert behavior with fake fetch.
- Create `tests/extension-setup-guide.test.js`: tests docs/setup copy references the extension-first workflow.

## Shared Constants

Use the existing dashboard Supabase values so extension saves records into the same account/table:

```js
const SUPABASE_URL = "https://gvifstpfolidkvxjeftx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fnM9Bw4WbLAqibtuCv2pJA_hMwErdoC";
const DASHBOARD_URL = "https://aip-investment-dashboard-tracker.vercel.app";
```

Use these product defaults when saving from the extension:

```js
{
  status: "bought",
  videoStatus: "not filmed",
  tax: 0,
  shipping: 0,
  discounts: 0,
  refunds: 0,
  resaleAmount: 0,
  resaleDate: "",
  storefrontLink: "",
  videos: [],
  filmedDate: "",
  postedDate: "",
  notes: "Saved from Chrome extension."
}
```

---

### Task 1: Shared Product Extraction And Normalization

**Files:**
- Create: `extension/product-core.js`
- Test: `tests/extension-product-core.test.js`

- [ ] **Step 1: Write the failing product-core tests**

Create `tests/extension-product-core.test.js`:

```js
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
    existingProduct: { id: "existing-id", createdAt: "2026-01-01T00:00:00.000Z", notes: "Old note" },
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
```

- [ ] **Step 2: Run the product-core tests to verify they fail**

Run:

```powershell
node --test tests/extension-product-core.test.js
```

Expected: FAIL because `extension/product-core.js` does not exist.

- [ ] **Step 3: Implement `extension/product-core.js`**

Create `extension/product-core.js`:

```js
(function initAipProductCore(globalScope) {
  function cleanText(value = "") {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeAsin(value = "") {
    return cleanText(value).toUpperCase();
  }

  function parseMoney(value = "") {
    const match = String(value || "").match(/\$?\s*([\d,]+(?:\.\d{1,2})?)/);
    return match ? Number(match[1].replace(/,/g, "")) : 0;
  }

  function extractAsinFromInput(value = "") {
    const input = String(value || "");
    const urlMatch = input.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([A-Z0-9]{10})/i);
    if (urlMatch) return normalizeAsin(urlMatch[1]);
    const queryMatch = input.match(/[?&](?:asin|ASIN)=([A-Z0-9]{10})/i);
    if (queryMatch) return normalizeAsin(queryMatch[1]);
    const rawMatch = input.match(/\bB0[A-Z0-9]{8}\b|\b[0-9]{9}[0-9X]\b/i);
    return rawMatch ? normalizeAsin(rawMatch[0]) : "";
  }

  function cleanAmazonTitle(value = "") {
    return cleanText(value).replace(/\s*:\s*Amazon\.com.*$/i, "");
  }

  function cleanBrandName(value = "") {
    return cleanText(value)
      .replace(/^Visit the\s+/i, "")
      .replace(/\s+Store$/i, "")
      .replace(/^Brand\s*:?\s*/i, "")
      .replace(/^by\s+/i, "");
  }

  function todayInputValue(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function firstText(adapter, selectors) {
    for (const selector of selectors) {
      const value = cleanText(adapter.text(selector));
      if (value) return value;
    }
    return "";
  }

  function extractAmazonProduct(adapter) {
    const asin =
      normalizeAsin(adapter.attr('input[name="ASIN"]', "value")) ||
      extractAsinFromInput(adapter.locationHref) ||
      extractAsinFromInput(adapter.attr('link[rel="canonical"]', "href"));
    const title = cleanAmazonTitle(firstText(adapter, ["#productTitle"]) || adapter.title || "");
    const brand = cleanBrandName(firstText(adapter, ["#bylineInfo"]) || adapter.detail("Brand") || adapter.detail("Manufacturer"));
    const priceText = firstText(adapter, [
      "#corePrice_feature_div .a-price .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      ".priceToPay .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      "#price_inside_buybox",
      "#sns-base-price .a-offscreen",
    ]);
    const breadcrumbs = adapter.allText("#wayfinding-breadcrumbs_feature_div a,.a-breadcrumb a").map(cleanText).filter(Boolean);
    const category = breadcrumbs[breadcrumbs.length - 1] || "";
    return {
      asin,
      title,
      brand,
      category,
      amazonPrice: parseMoney(priceText),
      amazonLink: asin ? `https://www.amazon.com/dp/${asin}` : cleanText(adapter.attr('link[rel="canonical"]', "href") || adapter.locationHref),
      sourceUrl: adapter.locationHref,
    };
  }

  function safeNumber(value) {
    const number = Number(String(value || "").replace(/[$,]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function buildBoughtProductRecord(captured, options = {}) {
    const asin = normalizeAsin(captured.asin);
    if (!asin) throw new Error("ASIN is required before saving.");
    const nowIso = options.nowIso || new Date().toISOString();
    const existing = options.existingProduct || {};
    return {
      id: existing.id || `asin-${asin}`,
      createdAt: existing.createdAt || nowIso,
      updatedAt: nowIso,
      title: cleanText(captured.title),
      brand: cleanBrandName(captured.brand),
      asin,
      category: cleanText(captured.category),
      purchaseDate: options.purchaseDate || todayInputValue(),
      status: "bought",
      amazonLink: captured.amazonLink || `https://www.amazon.com/dp/${asin}`,
      storefrontLink: existing.storefrontLink || "",
      videoStatus: existing.videoStatus || "not filmed",
      videos: Array.isArray(existing.videos) ? existing.videos : [],
      purchasePrice: safeNumber(options.purchasePrice || captured.amazonPrice),
      tax: safeNumber(existing.tax),
      shipping: safeNumber(existing.shipping),
      discounts: safeNumber(existing.discounts),
      refunds: safeNumber(existing.refunds),
      resaleAmount: safeNumber(existing.resaleAmount),
      resaleDate: existing.resaleDate || "",
      filmedDate: existing.filmedDate || "",
      postedDate: existing.postedDate || "",
      notes: existing.notes || "Saved from Chrome extension.",
    };
  }

  const api = {
    cleanText,
    normalizeAsin,
    parseMoney,
    extractAsinFromInput,
    cleanAmazonTitle,
    cleanBrandName,
    todayInputValue,
    extractAmazonProduct,
    buildBoughtProductRecord,
  };

  globalScope.AipProductCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: Run the product-core tests to verify they pass**

Run:

```powershell
node --test tests/extension-product-core.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add extension/product-core.js tests/extension-product-core.test.js
git commit -m "Add extension product capture helpers"
```

---

### Task 2: Supabase Extension API Helpers

**Files:**
- Create: `extension/supabase-api.js`
- Test: `tests/extension-supabase-api.test.js`

- [ ] **Step 1: Write the failing Supabase API tests**

Create `tests/extension-supabase-api.test.js`:

```js
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const api = require(path.join(__dirname, "..", "extension", "supabase-api.js"));

test("signInWithPassword calls Supabase Auth and returns session fields", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          user: { id: "user-1", email: "test@example.com" },
        };
      },
    };
  };

  const session = await api.signInWithPassword("test@example.com", "secret", { fetchImpl: fakeFetch, nowMs: 1000 });

  assert.equal(session.access_token, "access-token");
  assert.equal(session.refresh_token, "refresh-token");
  assert.equal(session.user.id, "user-1");
  assert.equal(session.expires_at, 3601000);
  assert.equal(calls[0].url, `${api.SUPABASE_URL}/auth/v1/token?grant_type=password`);
  assert.equal(calls[0].options.method, "POST");
});

test("findExistingProductByAsin scans product records for matching ASIN", async () => {
  const fakeFetch = async () => ({
    ok: true,
    async json() {
      return [
        { id: "other", data: { asin: "B0OTHER123" } },
        { id: "target", data: { asin: "B0TEST1234", title: "Existing product" } },
      ];
    },
  });

  const product = await api.findExistingProductByAsin("B0TEST1234", "token", { fetchImpl: fakeFetch });

  assert.equal(product.id, "target");
  assert.equal(product.title, "Existing product");
});

test("upsertProductRecord writes to dashboard_records with conflict merge", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, async json() { return []; } };
  };

  await api.upsertProductRecord(
    "user-1",
    { id: "asin-B0TEST1234", asin: "B0TEST1234", title: "Example" },
    "token",
    { fetchImpl: fakeFetch }
  );

  assert.match(calls[0].url, /\/rest\/v1\/dashboard_records\?on_conflict=user_id,store,id$/);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Prefer, "resolution=merge-duplicates");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    user_id: "user-1",
    store: "products",
    id: "asin-B0TEST1234",
    data: { id: "asin-B0TEST1234", asin: "B0TEST1234", title: "Example" },
  });
});
```

- [ ] **Step 2: Run the Supabase API tests to verify they fail**

Run:

```powershell
node --test tests/extension-supabase-api.test.js
```

Expected: FAIL because `extension/supabase-api.js` does not exist.

- [ ] **Step 3: Implement `extension/supabase-api.js`**

Create `extension/supabase-api.js`:

```js
(function initAipSupabaseApi(globalScope) {
  const SUPABASE_URL = "https://gvifstpfolidkvxjeftx.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fnM9Bw4WbLAqibtuCv2pJA_hMwErdoC";
  const DASHBOARD_URL = "https://aip-investment-dashboard-tracker.vercel.app";

  function headers(accessToken = "") {
    const base = {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    };
    if (accessToken) base.Authorization = `Bearer ${accessToken}`;
    return base;
  }

  async function parseResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error_description || payload.message || payload.error || "Supabase request failed.");
    }
    return payload;
  }

  async function signInWithPassword(email, password, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email, password }),
    });
    const payload = await parseResponse(response);
    return {
      ...payload,
      expires_at: (options.nowMs || Date.now()) + Number(payload.expires_in || 3600) * 1000,
    };
  }

  async function refreshSession(refreshToken, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const payload = await parseResponse(response);
    return {
      ...payload,
      expires_at: (options.nowMs || Date.now()) + Number(payload.expires_in || 3600) * 1000,
    };
  }

  async function findExistingProductByAsin(asin, accessToken, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(
      `${SUPABASE_URL}/rest/v1/dashboard_records?store=eq.products&select=id,data&order=updated_at.desc&limit=1000`,
      {
        method: "GET",
        headers: headers(accessToken),
      }
    );
    const rows = await parseResponse(response);
    const match = rows.find((row) => String(row.data?.asin || "").toUpperCase() === String(asin || "").toUpperCase());
    return match?.data ? { ...match.data, id: match.id || match.data.id } : null;
  }

  async function upsertProductRecord(userId, product, accessToken, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/dashboard_records?on_conflict=user_id,store,id`, {
      method: "POST",
      headers: {
        ...headers(accessToken),
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        user_id: userId,
        store: "products",
        id: product.id,
        data: product,
      }),
    });
    await parseResponse(response);
    return product;
  }

  const api = {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    DASHBOARD_URL,
    signInWithPassword,
    refreshSession,
    findExistingProductByAsin,
    upsertProductRecord,
  };

  globalScope.AipSupabaseApi = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: Run the Supabase API tests to verify they pass**

Run:

```powershell
node --test tests/extension-supabase-api.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add extension/supabase-api.js tests/extension-supabase-api.test.js
git commit -m "Add extension Supabase API helpers"
```

---

### Task 3: Extension Manifest, Background Worker, And Icon

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/icons/icon.svg`

- [ ] **Step 1: Create `extension/manifest.json`**

Create:

```json
{
  "manifest_version": 3,
  "name": "AIP Portfolio Capture",
  "description": "Save Amazon products directly to the AIP Portfolio dashboard.",
  "version": "0.1.0",
  "action": {
    "default_title": "Save to AIP Portfolio",
    "default_icon": {
      "16": "icons/icon.svg",
      "32": "icons/icon.svg",
      "48": "icons/icon.svg",
      "128": "icons/icon.svg"
    }
  },
  "icons": {
    "16": "icons/icon.svg",
    "32": "icons/icon.svg",
    "48": "icons/icon.svg",
    "128": "icons/icon.svg"
  },
  "permissions": ["storage", "tabs"],
  "host_permissions": [
    "https://*.amazon.com/*",
    "https://gvifstpfolidkvxjeftx.supabase.co/*",
    "https://aip-investment-dashboard-tracker.vercel.app/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://*.amazon.com/*"],
      "css": ["content.css"],
      "js": ["product-core.js", "content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Create `extension/icons/icon.svg`**

Create:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#0f766e"/>
  <path fill="#ffffff" d="M27 92h13l6-16h35l6 16h14L69 24H59L27 92Zm24-28 12-31 13 31H51Z"/>
  <path fill="#f7c948" d="M31 101c19 10 47 10 66-1 4-2 7 4 3 7-21 15-54 15-75 1-4-3 1-9 6-7Z"/>
</svg>
```

- [ ] **Step 3: Implement `extension/background.js`**

Create:

```js
importScripts("supabase-api.js", "product-core.js");

const SESSION_KEY = "aipSupabaseSession";

async function getStoredSession() {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return result[SESSION_KEY] || null;
}

async function setStoredSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

async function clearStoredSession() {
  await chrome.storage.local.remove(SESSION_KEY);
}

async function getFreshSession() {
  const session = await getStoredSession();
  if (!session) return null;
  if (session.expires_at && session.expires_at - Date.now() > 60000) return session;
  if (!session.refresh_token) return session;
  const refreshed = await AipSupabaseApi.refreshSession(session.refresh_token);
  return setStoredSession(refreshed);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "AIP_TOGGLE_OVERLAY" });
  } catch (error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    await chrome.action.setTitle({ tabId: tab.id, title: "Open an Amazon product page first" });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "AIP_GET_SESSION") {
      const session = await getFreshSession();
      sendResponse({ ok: true, user: session?.user || null });
      return;
    }

    if (message.type === "AIP_SIGN_IN") {
      const session = await AipSupabaseApi.signInWithPassword(message.email, message.password);
      await setStoredSession(session);
      sendResponse({ ok: true, user: session.user });
      return;
    }

    if (message.type === "AIP_SIGN_OUT") {
      await clearStoredSession();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "AIP_SAVE_BOUGHT_PRODUCT") {
      const session = await getFreshSession();
      if (!session?.access_token || !session?.user?.id) throw new Error("Sign in before saving.");
      const existingProduct = await AipSupabaseApi.findExistingProductByAsin(message.product.asin, session.access_token);
      const product = AipProductCore.buildBoughtProductRecord(message.product, {
        existingProduct,
        purchasePrice: message.purchasePrice,
        purchaseDate: message.purchaseDate,
      });
      await AipSupabaseApi.upsertProductRecord(session.user.id, product, session.access_token);
      sendResponse({ ok: true, product, updated: Boolean(existingProduct) });
      return;
    }

    sendResponse({ ok: false, error: "Unknown extension message." });
  })().catch((error) => sendResponse({ ok: false, error: error.message || "Something went wrong." }));
  return true;
});
```

- [ ] **Step 4: Validate manifest JSON and JS syntax**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8')); console.log('manifest ok')"
node --check extension/background.js
```

Expected: `manifest ok` and no syntax errors.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add extension/manifest.json extension/background.js extension/icons/icon.svg
git commit -m "Add Chrome extension manifest and background worker"
```

---

### Task 4: Amazon Overlay Content Script And Styling

**Files:**
- Create: `extension/content.js`
- Create: `extension/content.css`

- [ ] **Step 1: Implement `extension/content.js`**

Create:

```js
(function initAipContentScript() {
  const state = {
    visible: false,
    product: null,
    user: null,
  };

  function pageAdapter() {
    return {
      title: document.title,
      locationHref: location.href,
      text(selector) {
        return document.querySelector(selector)?.textContent || "";
      },
      attr(selector, attribute) {
        return document.querySelector(selector)?.getAttribute(attribute) || "";
      },
      allText(selector) {
        return [...document.querySelectorAll(selector)].map((node) => node.textContent || "");
      },
      detail(label) {
        const normalized = label.toLowerCase();
        const rows = [...document.querySelectorAll("#productOverview_feature_div tr,#prodDetails tr,#productDetails_techSpec_section_1 tr,#productDetails_detailBullets_sections1 tr")];
        for (const row of rows) {
          const cells = [...row.querySelectorAll("th,td,span")].map((node) => AipProductCore.cleanText(node.textContent)).filter(Boolean);
          const index = cells.findIndex((cell) => cell.toLowerCase().replace(/[:\s]+$/, "") === normalized);
          if (index >= 0 && cells[index + 1]) return cells[index + 1];
        }
        return "";
      },
    };
  }

  function sendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  }

  function ensureRoot() {
    let root = document.getElementById("aip-capture-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "aip-capture-root";
      document.documentElement.appendChild(root);
    }
    return root;
  }

  function field(label, value) {
    return `<div class="aip-field"><span>${label}</span><strong>${escapeHtml(value || "Not detected")}</strong></div>`;
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  async function refreshSession() {
    const response = await sendMessage({ type: "AIP_GET_SESSION" });
    state.user = response?.user || null;
  }

  function render() {
    const root = ensureRoot();
    if (!state.visible) {
      root.innerHTML = "";
      return;
    }

    const product = state.product || AipProductCore.extractAmazonProduct(pageAdapter());
    state.product = product;
    const today = AipProductCore.todayInputValue();
    const price = product.amazonPrice ? product.amazonPrice.toFixed(2) : "";

    root.innerHTML = `
      <section class="aip-panel" role="dialog" aria-label="AIP Product Capture">
        <div class="aip-panel-header">
          <div>
            <span class="aip-eyebrow">AIP Portfolio</span>
            <h2>Save as bought</h2>
          </div>
          <button class="aip-icon-btn" id="aipCloseBtn" type="button" aria-label="Close">x</button>
        </div>
        <div class="aip-status" id="aipStatus">${state.user ? `Signed in as ${escapeHtml(state.user.email || "dashboard user")}` : "Sign in to save this product."}</div>
        ${state.user ? renderProductForm(product, price, today) : renderSignInForm()}
      </section>
    `;

    bindPanelEvents();
  }

  function renderSignInForm() {
    return `
      <form id="aipSignInForm" class="aip-stack">
        <label>Email <input id="aipEmail" type="email" autocomplete="email" required></label>
        <label>Password <input id="aipPassword" type="password" autocomplete="current-password" required></label>
        <button class="aip-primary" type="submit">Sign in</button>
        <a class="aip-link" href="https://aip-investment-dashboard-tracker.vercel.app" target="_blank" rel="noreferrer">Open dashboard</a>
      </form>
    `;
  }

  function renderProductForm(product, price, today) {
    const missingAsin = !product.asin;
    return `
      <div class="aip-product-summary">
        ${field("Title", product.title)}
        ${field("ASIN", product.asin)}
        ${field("Brand", product.brand)}
        ${field("Category", product.category)}
        ${field("Amazon price", price ? `$${price}` : "")}
      </div>
      <form id="aipSaveForm" class="aip-stack">
        <label>Purchase price <input id="aipPurchasePrice" type="number" min="0" step="0.01" value="${escapeHtml(price)}" required></label>
        <label>Purchase date <input id="aipPurchaseDate" type="date" value="${today}" required></label>
        <button class="aip-primary" type="submit" ${missingAsin ? "disabled" : ""}>Save as bought</button>
        ${missingAsin ? `<p class="aip-error">I could not detect an ASIN. Open the product detail page and try again.</p>` : ""}
        <button class="aip-secondary" id="aipOpenDashboard" type="button">Open dashboard</button>
      </form>
    `;
  }

  function bindPanelEvents() {
    document.getElementById("aipCloseBtn")?.addEventListener("click", () => {
      state.visible = false;
      render();
    });

    document.getElementById("aipOpenDashboard")?.addEventListener("click", () => {
      window.open("https://aip-investment-dashboard-tracker.vercel.app", "_blank", "noopener");
    });

    document.getElementById("aipSignInForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("Signing in...");
      const response = await sendMessage({
        type: "AIP_SIGN_IN",
        email: document.getElementById("aipEmail").value,
        password: document.getElementById("aipPassword").value,
      });
      if (!response?.ok) return setStatus(response?.error || "Sign in failed.", true);
      state.user = response.user;
      render();
    });

    document.getElementById("aipSaveForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("Saving...");
      const response = await sendMessage({
        type: "AIP_SAVE_BOUGHT_PRODUCT",
        product: state.product,
        purchasePrice: document.getElementById("aipPurchasePrice").value,
        purchaseDate: document.getElementById("aipPurchaseDate").value,
      });
      if (!response?.ok) return setStatus(response?.error || "Save failed.", true);
      setStatus(response.updated ? "Updated existing product in AIP Dashboard." : "Saved to AIP Dashboard.");
    });
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById("aipStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("aip-error-text", isError);
  }

  async function toggleOverlay() {
    state.visible = !state.visible;
    if (state.visible) {
      state.product = AipProductCore.extractAmazonProduct(pageAdapter());
      await refreshSession();
    }
    render();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "AIP_TOGGLE_OVERLAY") return;
    toggleOverlay().then(() => sendResponse({ ok: true }));
    return true;
  });
})();
```

- [ ] **Step 2: Implement `extension/content.css`**

Create:

```css
#aip-capture-root {
  all: initial;
  color-scheme: light;
  font-family: Arial, Helvetica, sans-serif;
}

#aip-capture-root * {
  box-sizing: border-box;
}

.aip-panel {
  position: fixed;
  top: 88px;
  right: 24px;
  z-index: 2147483647;
  width: min(380px, calc(100vw - 32px));
  max-height: calc(100vh - 120px);
  overflow: auto;
  background: #fbfcf8;
  color: #111827;
  border: 1px solid #d8ded4;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.22);
  border-radius: 10px;
  padding: 16px;
  font-size: 14px;
  line-height: 1.35;
}

.aip-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #e3e7df;
  padding-bottom: 12px;
  margin-bottom: 12px;
}

.aip-eyebrow {
  display: block;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
}

.aip-panel h2 {
  margin: 2px 0 0;
  font-size: 22px;
  line-height: 1.15;
}

.aip-icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid #d8ded4;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  cursor: pointer;
  font-weight: 800;
}

.aip-status {
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  color: #065f46;
  padding: 10px;
  margin-bottom: 12px;
  font-weight: 700;
}

.aip-product-summary {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.aip-field {
  border: 1px solid #e3e7df;
  border-radius: 8px;
  padding: 9px;
  background: #fff;
}

.aip-field span,
.aip-stack label {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 5px;
}

.aip-field strong {
  display: block;
  color: #111827;
  font-size: 14px;
}

.aip-stack {
  display: grid;
  gap: 10px;
}

.aip-stack input {
  width: 100%;
  border: 1px solid #d8ded4;
  border-radius: 8px;
  padding: 10px;
  font: inherit;
}

.aip-primary,
.aip-secondary {
  border-radius: 8px;
  padding: 11px 12px;
  font-weight: 800;
  cursor: pointer;
}

.aip-primary {
  border: 1px solid #0f766e;
  background: #0f766e;
  color: #fff;
}

.aip-primary:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.aip-secondary {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f766e;
}

.aip-link {
  color: #0f766e;
  font-weight: 800;
  text-align: center;
}

.aip-error,
.aip-error-text {
  color: #991b1b;
}
```

- [ ] **Step 3: Run syntax checks**

Run:

```powershell
node --check extension/content.js
```

Expected: no syntax errors.

- [ ] **Step 4: Commit Task 4**

Run:

```powershell
git add extension/content.js extension/content.css
git commit -m "Add Amazon product capture overlay"
```

---

### Task 5: Dashboard Setup Copy And Documentation

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `README.md`
- Modify: `HOW_TO_SETUP.md`
- Modify: `agent.md`
- Test: `tests/extension-setup-guide.test.js`

- [ ] **Step 1: Write failing setup guide tests**

Create `tests/extension-setup-guide.test.js`:

```js
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
```

- [ ] **Step 2: Run setup guide tests to verify they fail**

Run:

```powershell
node --test tests/extension-setup-guide.test.js
```

Expected: FAIL because the dashboard/docs still recommend the bookmarklet first.

- [ ] **Step 3: Update `index.html` Setup tab**

In `index.html`, change the Setup title/intro around the setup tab to:

```html
<h2>Amazon capture tools</h2>
...
<p>Use the Chrome extension for the easiest product capture. The bookmarklet remains available as a fallback.</p>
```

Inside `.setup-panel`, add a new first section before the bookmarklet section:

```html
<section class="setup-guide-section setup-extension-section">
  <div class="setup-guide-heading">
    <span class="setup-phase">Recommended</span>
    <div>
      <h3>Chrome extension</h3>
      <p>Best for quickly saving Amazon products as bought without copying or uploading capture files.</p>
    </div>
  </div>
  <div class="setup-steps setup-use-steps">
    <article>
      <span class="setup-step-number">1</span>
      <strong>Open Chrome extensions</strong>
      <span>Go to <code>chrome://extensions</code> in Chrome.</span>
    </article>
    <article>
      <span class="setup-step-number">2</span>
      <strong>Turn on Developer mode</strong>
      <span>Use the switch in the top-right corner of Chrome's Extensions page.</span>
    </article>
    <article>
      <span class="setup-step-number">3</span>
      <strong>Load unpacked</strong>
      <span>Click <b>Load unpacked</b> and select the dashboard repo's <b>extension</b> folder.</span>
    </article>
    <article>
      <span class="setup-step-number">4</span>
      <strong>Pin AIP Portfolio Capture</strong>
      <span>Pin the extension so it is visible while you shop Amazon product pages.</span>
    </article>
    <article>
      <span class="setup-step-number">5</span>
      <strong>Save products from Amazon</strong>
      <span>Open an Amazon product page, click the extension, adjust purchase date or price if needed, then click <b>Save as bought</b>.</span>
    </article>
  </div>
</section>
```

Rename the existing bookmarklet section headings:

```html
<span class="setup-phase">Fallback</span>
<h3>Fallback: bookmarklet</h3>
```

- [ ] **Step 4: Update docs**

In `README.md`, add this section before bookmarklet instructions:

```md
## Preferred Product Capture: Chrome Extension

The easiest way to add products is the unpacked Chrome extension.

1. Download or clone this GitHub repo.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the repo's `extension` folder.
6. Pin `AIP Portfolio Capture`.
7. Open an Amazon product page.
8. Click the extension, sign in with your dashboard account, edit purchase date or purchase price if needed, and click `Save as bought`.

The bookmarklet still works as a fallback, but the extension is the recommended workflow.
```

In `HOW_TO_SETUP.md`, add the same plain-language section before the bookmarklet section and adjust numbering so users see the extension first.

In `agent.md`, add:

```md
# Chrome Extension MVP

- The preferred product capture path is now an unpacked Chrome Extension in `extension/`.
- The MVP only saves Amazon products as `bought`.
- It automatically reads title, ASIN, brand, category, Amazon price, and link from the Amazon page.
- Users can edit purchase date and purchase price before saving.
- The extension writes directly to Supabase `public.dashboard_records` using the signed-in user's account.
- The bookmarklet remains as a fallback.
```

- [ ] **Step 5: Run setup guide tests**

Run:

```powershell
node --test tests/extension-setup-guide.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```powershell
git add index.html styles.css README.md HOW_TO_SETUP.md agent.md tests/extension-setup-guide.test.js
git commit -m "Document Chrome extension product capture setup"
```

---

### Task 6: Local Manual Verification

**Files:**
- Modify only if verification finds issues.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
node --test
node --check app.js
node --check server.js
node --check extension/background.js
node --check extension/content.js
git diff --check
```

Expected: all tests pass, syntax checks pass, and `git diff --check` prints no whitespace errors.

- [ ] **Step 2: Load the extension in Chrome**

Manual:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select:

```text
C:\Users\noah_nichols\OneDrive - ASU-Newport\Desktop\Noahs Codex Projects\AIP investment dashboard\extension
```

Expected: Chrome shows `AIP Portfolio Capture` with no manifest errors.

- [ ] **Step 3: Test signed-out overlay**

Manual:

1. Open an Amazon product page.
2. Click the AIP extension icon.

Expected:

- Overlay appears on the Amazon page.
- It asks the user to sign in.
- It has an `Open dashboard` link.

- [ ] **Step 4: Test signed-in save flow**

Manual:

1. Sign in with the dashboard account.
2. Confirm the overlay detects title, ASIN, brand, category, Amazon price, and Amazon link.
3. Change purchase date.
4. Change purchase price.
5. Click `Save as bought`.
6. Open `https://aip-investment-dashboard-tracker.vercel.app`.

Expected:

- Product appears in Products.
- Status is `bought`.
- Purchase date matches the edited date.
- Purchase price matches the edited price.
- Tax, shipping, discounts, and refunds are `0`.

- [ ] **Step 5: Test duplicate ASIN update behavior**

Manual:

1. On the same Amazon product page, save again with a different purchase price.
2. Refresh the dashboard.

Expected:

- The product updates.
- No duplicate product row appears for the same ASIN.

- [ ] **Step 6: Commit verification fixes if needed**

If manual verification required fixes, commit them:

```powershell
git add extension app.js index.html styles.css README.md HOW_TO_SETUP.md agent.md tests
git commit -m "Fix Chrome extension product capture verification issues"
```

If no fixes were needed, skip this commit.

---

### Task 7: Push And Deployment Check

**Files:**
- No code changes expected.

- [ ] **Step 1: Push the branch**

Run:

```powershell
git push
```

Expected: push succeeds to GitHub `main`.

- [ ] **Step 2: Confirm Vercel deploy**

Because the extension is a static folder in the repo and the dashboard setup docs changed, Vercel should deploy after push.

Manual:

1. Open Vercel project deployments.
2. Confirm latest deployment is `Ready`.
3. Open:

```text
https://aip-investment-dashboard-tracker.vercel.app
```

Expected:

- Setup tab shows Chrome extension as recommended.
- Bookmarklet is still present as fallback.

---

## Self-Review

Spec coverage:

- Chrome extension overlay: Task 4.
- Amazon field extraction: Task 1 and Task 4.
- Save only as bought: Task 1, Task 4, Task 6.
- Auto-pull Amazon price: Task 1 and Task 4.
- Editable purchase price and purchase date: Task 1, Task 4, Task 6.
- Supabase cloud save: Task 2 and Task 3.
- Duplicate ASIN update behavior: Task 2, Task 3, Task 6.
- Unpacked extension GitHub setup: Task 5 and Task 6.
- Bookmarklet fallback: Task 5.
- Future report automation kept out of MVP: design/spec only, no implementation task.

Placeholder scan:

- No `TBD`, `TODO`, or placeholder-only tasks remain.

Type consistency:

- The shared product object uses dashboard-compatible fields: `purchaseDate`, `purchasePrice`, `status`, `tax`, `shipping`, `discounts`, `refunds`, `videoStatus`, `resaleAmount`, `resaleDate`, `videos`.
- Message names are consistent across content and background: `AIP_GET_SESSION`, `AIP_SIGN_IN`, `AIP_SIGN_OUT`, `AIP_SAVE_BOUGHT_PRODUCT`, `AIP_TOGGLE_OVERLAY`.
