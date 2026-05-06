const DB_NAME = "aip-investment-dashboard";
const DB_VERSION = 1;
const STORES = ["products", "revenueEntries", "approvedMatches", "importBatches"];
const STATUSES = ["researched", "bought", "received", "filmed", "posted", "earning", "paid off", "retired"];
const PURCHASED_STATUSES = ["bought", "received", "filmed", "posted", "earning", "paid off"];
const VIDEO_STATUSES = ["not filmed", "filmed", "posted", "needs check"];
const OPTIONAL_MAPPING = "Do not import";
const IMPORT_FIELDS = [
  ["asin", "ASIN"],
  ["title", "Title"],
  ["brand", "Brand"],
  ["category", "Category"],
  ["price", "Price"],
  ["date", "Date"],
  ["amount", "Commission earned"],
  ["clicks", "Clicks"],
  ["orders", "Orders"],
  ["sourceLink", "Amazon link"],
];

let db;
let state = {
  products: [],
  revenueEntries: [],
  approvedMatches: [],
  importBatches: [],
  search: "",
  statusFilter: "all",
  profitFilter: "all",
  sortKey: "net",
  sortDirection: "desc",
  pendingCsv: null,
  autofillSuggestion: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", async () => {
  db = await openDb();
  populateStatusControls();
  bindEvents();
  await refreshState();
  render();
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of STORES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function remove(storeName, id) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function refreshState() {
  const [products, revenueEntries, approvedMatches, importBatches] = await Promise.all(
    STORES.map((storeName) => getAll(storeName))
  );
  state.products = products.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  state.revenueEntries = revenueEntries;
  state.approvedMatches = approvedMatches;
  state.importBatches = importBatches;
}

function bindEvents() {
  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  $("#newProductBtn").addEventListener("click", () => openProductDialog());
  $("#newRevenueBtn").addEventListener("click", () => openRevenueDialog());
  $("#productForm").addEventListener("submit", handleProductSubmit);
  $("#revenueForm").addEventListener("submit", handleRevenueSubmit);
  $("#deleteProductBtn").addEventListener("click", deleteCurrentProduct);
  $("#addVideoBtn").addEventListener("click", () => addVideoRow());
  $("#videoRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-video]");
    if (button) button.closest(".video-row")?.remove();
  });
  $("#productSearch").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderProducts();
  });
  $("#statusFilter").addEventListener("change", (event) => {
    state.statusFilter = event.target.value;
    renderProducts();
  });
  $("#profitFilter").addEventListener("change", (event) => {
    state.profitFilter = event.target.value;
    renderProducts();
  });
  $$(".sort-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      state.sortDirection = state.sortKey === key && state.sortDirection === "desc" ? "asc" : "desc";
      state.sortKey = key;
      renderProducts();
    });
  });
  $(".import-drop").addEventListener("click", () => $("#csvInput").click());
  $("#csvInput").addEventListener("change", handleCsvSelection);
  $$(".export-grid [data-export]").forEach((button) => {
    button.addEventListener("click", () => exportCsv(button.dataset.export));
  });
  $("#exportBackupBtn").addEventListener("click", exportBackup);
  $("#backupInput").addEventListener("change", importBackup);
  $("#clearDataBtn").addEventListener("click", clearAllData);
  $("#seedDemoBtn").addEventListener("click", seedDemoData);
  $("#extractAsinBtn").addEventListener("click", handleExtractAsin);
  $("#lookupImportsBtn").addEventListener("click", handleImportLookup);
  $("#copyBookmarkletBtn").addEventListener("click", copyBookmarklet);
  $("#parseCaptureBtn").addEventListener("click", handleCapturePaste);
  $("#productCaptureInput").addEventListener("change", handleCaptureUpload);
  $("#productHtmlInput").addEventListener("change", handleHtmlUpload);
  $("#applyAutofillBtn").addEventListener("click", applyAutofillSuggestion);
  hydrateBookmarkletControls();
}

function populateStatusControls() {
  const statusOptions = STATUSES.map((status) => `<option value="${escapeHtml(status)}">${titleCase(status)}</option>`).join("");
  const videoStatusOptions = VIDEO_STATUSES.map((status) => `<option value="${escapeHtml(status)}">${titleCase(status)}</option>`).join("");
  $("#status").innerHTML = statusOptions;
  $("#videoStatus").innerHTML = videoStatusOptions;
  $("#statusFilter").innerHTML = `<option value="all">All statuses</option>${statusOptions}`;
}

function switchTab(tabName) {
  $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabName));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabName));
  if (tabName === "matches") renderMatchQueue();
}

function render() {
  renderMetrics();
  renderTrendChart();
  renderRankings();
  renderProducts();
  renderRevenueProductOptions();
  renderMatchQueue();
}

function getProductStats(product) {
  const cost = landedCost(product);
  const earned = state.revenueEntries
    .filter((entry) => entry.productId === product.id && entry.matchStatus !== "rejected")
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
  const net = earned - cost;
  const roi = cost > 0 ? (net / cost) * 100 : earned > 0 ? 100 : 0;
  const unrecovered = Math.max(cost - earned, 0);
  const paybackPercent = cost > 0 ? (earned / cost) * 100 : earned > 0 ? 100 : 0;
  return { cost, earned, net, roi, unrecovered, paybackPercent, paidOff: cost > 0 && earned >= cost };
}

function landedCost(product) {
  return (
    numberValue(product.purchasePrice) +
    numberValue(product.tax) +
    numberValue(product.shipping) -
    numberValue(product.discounts) -
    numberValue(product.refunds)
  );
}

function renderMetrics() {
  const totals = state.products.reduce(
    (acc, product) => {
      const stats = getProductStats(product);
      acc.cost += stats.cost;
      acc.earned += stats.earned;
      acc.net += stats.net;
      acc.unrecovered += stats.unrecovered;
      if (stats.paidOff) acc.paidOff += 1;
      return acc;
    },
    { cost: 0, earned: 0, net: 0, unrecovered: 0, paidOff: 0 }
  );
  const roi = totals.cost > 0 ? (totals.net / totals.cost) * 100 : 0;
  const paybackRate = state.products.length ? (totals.paidOff / state.products.length) * 100 : 0;
  const suggested = state.revenueEntries.filter((entry) => entry.matchStatus === "suggested").length;
  const metrics = [
    { label: "Total invested", value: money(totals.cost), note: `${state.products.length} products`, tone: "cost" },
    { label: "Total earned", value: money(totals.earned), note: `${state.revenueEntries.length} revenue rows`, tone: "earned" },
    { label: "Net profit", value: money(totals.net), note: totals.net >= 0 ? "Above cost" : "Still recovering", tone: totals.net >= 0 ? "positive" : "negative" },
    { label: "ROI", value: `${roi.toFixed(1)}%`, note: "Net profit / landed cost", tone: roi >= 0 ? "positive" : "negative" },
    { label: "Unrecovered", value: money(totals.unrecovered), note: "Cost still unpaid", tone: "warning" },
    { label: "Payback rate", value: `${paybackRate.toFixed(0)}%`, note: `${totals.paidOff} paid off`, tone: "neutral" },
    { label: "Needs review", value: String(suggested), note: "Suggested matches", tone: suggested ? "warning" : "neutral" },
  ];
  $("#metricGrid").innerHTML = metrics
    .map(
      ({ label, value, note, tone }) => `<article class="metric metric-${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </article>`
    )
    .join("");
}

function renderTrendChart() {
  const monthly = new Map();
  for (const product of state.products) {
    const month = toMonth(product.purchaseDate);
    if (!month) continue;
    const row = monthly.get(month) || { cost: 0, earned: 0 };
    row.cost += landedCost(product);
    monthly.set(month, row);
  }
  for (const entry of state.revenueEntries.filter((item) => item.productId && item.matchStatus !== "rejected")) {
    const month = toMonth(entry.date);
    if (!month) continue;
    const row = monthly.get(month) || { cost: 0, earned: 0 };
    row.earned += numberValue(entry.amount);
    monthly.set(month, row);
  }
  const rows = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  const maxValue = Math.max(1, ...rows.flatMap(([, row]) => [row.cost, row.earned]));
  $("#trendChart").innerHTML = rows.length
    ? rows
        .map(([month, row]) => {
          const earnedHeight = Math.max(2, (row.earned / maxValue) * 180);
          const costHeight = Math.max(2, (row.cost / maxValue) * 180);
          return `<div class="bar-group" title="${month}: earned ${money(row.earned)}, cost ${money(row.cost)}">
            <div class="bar-stack">
              <div class="bar earned" style="height:${earnedHeight}px"></div>
              <div class="bar cost" style="height:${costHeight}px"></div>
            </div>
            <div class="bar-label">${formatMonth(month)}</div>
          </div>`;
        })
        .join("")
    : emptyState("No monthly activity yet.", "Add products or import revenue to populate the trend.");
}

function renderRankings() {
  const rows = state.products.map((product) => ({ product, stats: getProductStats(product) }));
  const winners = rows.filter((row) => row.stats.net > 0).sort((a, b) => b.stats.net - a.stats.net).slice(0, 5);
  const laggards = rows.filter((row) => row.stats.unrecovered > 0).sort((a, b) => b.stats.unrecovered - a.stats.unrecovered).slice(0, 5);
  $("#topWinners").innerHTML = winners.length ? winners.map(rankCard).join("") : emptyState("No profitable products yet.", "Products show up here after revenue exceeds landed cost.");
  $("#laggards").innerHTML = laggards.length ? laggards.map(rankCard).join("") : emptyState("No unrecovered products yet.", "Products still recovering their cost will appear here.");
}

function rankCard({ product, stats }) {
  const tone = stats.net >= 0 ? "positive" : "negative";
  return `<article class="rank-card rank-${tone}">
    <strong>${escapeHtml(product.title || "Untitled product")}</strong>
    <span class="muted">${escapeHtml(product.brand || "No brand")} · ${escapeHtml(product.asin || "No ASIN")}</span>
    <span class="rank-stat">${money(stats.net)} net · ${stats.roi.toFixed(1)}% ROI</span>
  </article>`;
}

function renderProducts() {
  const rows = state.products
    .map((product) => ({ product, stats: getProductStats(product) }))
    .filter(({ product, stats }) => {
      const haystack = [product.title, product.brand, product.asin, product.category].join(" ").toLowerCase();
      if (state.search && !haystack.includes(state.search)) return false;
      if (state.statusFilter !== "all" && product.status !== state.statusFilter) return false;
      if (state.profitFilter === "purchased" && !PURCHASED_STATUSES.includes(product.status)) return false;
      if (state.profitFilter === "profitable" && stats.net <= 0) return false;
      if (state.profitFilter === "unrecovered" && stats.unrecovered <= 0) return false;
      if (state.profitFilter === "paidOff" && !stats.paidOff) return false;
      return true;
    })
    .sort(sortProductRows);

  $("#productsTable").innerHTML = rows.length
    ? rows.map(productRow).join("")
    : `<tr><td colspan="10">${emptyState("No products match the current filters.", "Try clearing search or adding a new investment product.")}</td></tr>`;

  $$("#productsTable [data-edit]").forEach((button) => {
    button.addEventListener("click", () => openProductDialog(button.dataset.edit));
  });
  $$("#productsTable [data-add-revenue]").forEach((button) => {
    button.addEventListener("click", () => openRevenueDialog(button.dataset.addRevenue));
  });
}

function sortProductRows(a, b) {
  const direction = state.sortDirection === "asc" ? 1 : -1;
  const key = state.sortKey;
  const values = {
    title: [a.product.title || "", b.product.title || ""],
    status: [a.product.status || "", b.product.status || ""],
    purchaseDate: [a.product.purchaseDate || "", b.product.purchaseDate || ""],
    cost: [a.stats.cost, b.stats.cost],
    earned: [a.stats.earned, b.stats.earned],
    net: [a.stats.net, b.stats.net],
    roi: [a.stats.roi, b.stats.roi],
  }[key];
  if (typeof values[0] === "number") return (values[0] - values[1]) * direction;
  return values[0].localeCompare(values[1]) * direction;
}

function productRow({ product, stats }) {
  const amazonLink = product.amazonLink || (product.asin ? `https://www.amazon.com/dp/${encodeURIComponent(product.asin)}` : "");
  const storefrontLink = product.storefrontLink || "";
  const netClass = stats.net >= 0 ? "money-positive" : "money-negative";
  const paybackWidth = Math.min(100, Math.max(0, stats.paybackPercent));
  const videoStatus = product.videoStatus || deriveVideoStatus(product);
  const videos = normalizeProductVideos(product);
  const videoCount = videos.length || numberValue(product.videoCount);
  const latestVideoLink = [...videos].reverse().find((video) => video.link)?.link || "";
  return `<tr>
    <td>
      <div class="product-title">${escapeHtml(product.title || "Untitled product")}</div>
      <div class="product-sub">${escapeHtml(product.brand || "No brand")} · ${escapeHtml(product.asin || "No ASIN")} · ${escapeHtml(product.category || "Uncategorized")}</div>
      ${amazonLink ? `<div class="product-sub"><a href="${escapeHtml(amazonLink)}" target="_blank" rel="noreferrer">Open Amazon</a></div>` : ""}
    </td>
    <td><span class="status-pill">${titleCase(product.status || "researched")}</span></td>
    <td class="numeric">${money(stats.cost)}</td>
    <td class="numeric">${money(stats.earned)}</td>
    <td class="numeric ${netClass}">${money(stats.net)}</td>
    <td class="numeric">${stats.roi.toFixed(1)}%</td>
    <td>
      <div class="payback-cell">
        <div class="payback-track" aria-label="Payback ${stats.paybackPercent.toFixed(0)}%">
          <span style="width:${paybackWidth}%"></span>
        </div>
        <small>${stats.paybackPercent.toFixed(0)}% · ${money(stats.unrecovered)} left</small>
      </div>
    </td>
    <td>
      <div class="video-cell">
        <span class="match-pill">${escapeHtml(titleCase(videoStatus))}</span>
        <small>${videoCount} video${videoCount === 1 ? "" : "s"}</small>
        ${latestVideoLink ? `<a href="${escapeHtml(latestVideoLink)}" target="_blank" rel="noreferrer">Open video</a>` : storefrontLink ? `<a href="${escapeHtml(storefrontLink)}" target="_blank" rel="noreferrer">Open storefront</a>` : ""}
      </div>
    </td>
    <td>${product.purchaseDate || ""}</td>
    <td>
      <div class="row-actions">
        <button class="link-btn" data-edit="${product.id}" type="button">Edit</button>
        <button class="link-btn" data-add-revenue="${product.id}" type="button">Revenue</button>
        ${storefrontLink ? `<a class="link-btn" href="${escapeHtml(storefrontLink)}" target="_blank" rel="noreferrer">Storefront</a>` : ""}
      </div>
    </td>
  </tr>`;
}

function deriveVideoStatus(product = {}) {
  const videos = normalizeProductVideos(product);
  if (videos.length) return "posted";
  if (product.videoStatus) return product.videoStatus;
  if (product.postedDate || product.status === "posted" || product.status === "earning" || product.status === "paid off") return "posted";
  if (product.filmedDate || product.status === "filmed") return "filmed";
  return "not filmed";
}

function normalizeProductVideos(product = {}) {
  return Array.isArray(product.videos)
    ? product.videos
        .map((video) => ({
          title: cleanText(video.title || ""),
          link: cleanText(video.link || ""),
          postedDate: video.postedDate || "",
          notes: cleanText(video.notes || ""),
        }))
        .filter((video) => video.title || video.link || video.postedDate || video.notes)
    : [];
}

function renderVideoRows(videos = []) {
  $("#videoRows").innerHTML = "";
  for (const video of videos) addVideoRow(video);
  if (!videos.length) {
    $("#videoRows").innerHTML = `<div class="empty-state compact-empty">
      <strong>No videos tracked yet.</strong>
      <span>Add each storefront video when it is posted.</span>
    </div>`;
  }
}

function addVideoRow(video = {}) {
  const empty = $("#videoRows .compact-empty");
  if (empty) $("#videoRows").innerHTML = "";
  const row = document.createElement("div");
  row.className = "video-row";
  row.innerHTML = `
    <label>Video title/name <input data-video-field="title" value="${escapeHtml(video.title || "")}" /></label>
    <label>Video link <input data-video-field="link" type="url" value="${escapeHtml(video.link || "")}" /></label>
    <label>Posted date <input data-video-field="postedDate" type="date" value="${escapeHtml(video.postedDate || "")}" /></label>
    <label>Notes <textarea data-video-field="notes" rows="2">${escapeHtml(video.notes || "")}</textarea></label>
    <button class="secondary-btn" data-remove-video type="button">Remove</button>`;
  $("#videoRows").appendChild(row);
}

function collectVideoRows() {
  return $$("#videoRows .video-row")
    .map((row) => {
      const read = (field) => row.querySelector(`[data-video-field="${field}"]`)?.value.trim() || "";
      return {
        title: read("title"),
        link: read("link"),
        postedDate: read("postedDate"),
        notes: read("notes"),
      };
    })
    .filter((video) => video.title || video.link || video.postedDate || video.notes);
}

function openProductDialog(productId = "") {
  const product = state.products.find((item) => item.id === productId);
  $("#productDialogTitle").textContent = product ? "Edit product" : "Add product";
  $("#productId").value = product?.id || "";
  resetAutofillHelper();
  for (const field of [
    "title",
    "brand",
    "asin",
    "category",
    "purchaseDate",
    "amazonLink",
    "storefrontLink",
    "videoStatus",
    "purchasePrice",
    "tax",
    "shipping",
    "discounts",
    "refunds",
    "filmedDate",
    "postedDate",
    "notes",
  ]) {
    $(`#${field}`).value = product?.[field] ?? "";
  }
  $("#status").value = product?.status || "researched";
  $("#videoStatus").value = product?.videoStatus || deriveVideoStatus(product || {});
  renderVideoRows(normalizeProductVideos(product || {}));
  $("#deleteProductBtn").classList.toggle("hidden", !product);
  $("#productDialog").showModal();
}

async function handleProductSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value !== "save") return $("#productDialog").close();
  const existing = state.products.find((item) => item.id === $("#productId").value);
  const product = {
    id: existing?.id || crypto.randomUUID(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: $("#title").value.trim(),
    brand: $("#brand").value.trim(),
    asin: normalizeAsin($("#asin").value),
    category: $("#category").value.trim(),
    purchaseDate: $("#purchaseDate").value,
    status: $("#status").value,
    amazonLink: $("#amazonLink").value.trim(),
    storefrontLink: $("#storefrontLink").value.trim(),
    videoStatus: $("#videoStatus").value,
    videos: collectVideoRows(),
    purchasePrice: numberValue($("#purchasePrice").value),
    tax: numberValue($("#tax").value),
    shipping: numberValue($("#shipping").value),
    discounts: numberValue($("#discounts").value),
    refunds: numberValue($("#refunds").value),
    filmedDate: $("#filmedDate").value,
    postedDate: $("#postedDate").value,
    notes: $("#notes").value.trim(),
  };
  await put("products", product);
  $("#productDialog").close();
  await refreshState();
  render();
  toast("Product saved.");
}

async function deleteCurrentProduct() {
  const productId = $("#productId").value;
  if (!productId || !confirm("Delete this product and detach its revenue rows?")) return;
  await remove("products", productId);
  const affectedRevenue = state.revenueEntries.filter((entry) => entry.productId === productId);
  for (const entry of affectedRevenue) {
    await put("revenueEntries", { ...entry, productId: "", matchStatus: "unmatched" });
  }
  $("#productDialog").close();
  await refreshState();
  render();
  toast("Product deleted. Revenue rows were left unmatched.");
}

function resetAutofillHelper() {
  state.autofillSuggestion = null;
  $("#amazonQuickInput").value = "";
  $("#amazonCaptureInput").value = "";
  $("#productCaptureInput").value = "";
  $("#productHtmlInput").value = "";
  $("#applyAutofillBtn").disabled = true;
  $("#autofillPreview").innerHTML = `<div class="muted">No suggestions yet. Nothing is written into the form until you apply it.</div>`;
}

function handleExtractAsin() {
  const input = $("#amazonQuickInput").value.trim() || $("#amazonLink").value.trim() || $("#asin").value.trim();
  const asin = extractAsinFromInput(input);
  if (!asin) {
    toast("I could not find an ASIN in that text or link.");
    return;
  }
  const suggestion = createAutofillSuggestion("ASIN/link parser", {
    asin: { value: asin, confidence: "exact" },
    amazonLink: { value: `https://www.amazon.com/dp/${asin}`, confidence: "exact" },
  });
  setAutofillSuggestion(suggestion, "ASIN extracted. Apply it when ready.");
}

function handleImportLookup() {
  const query = {
    asin: extractAsinFromInput($("#amazonQuickInput").value) || normalizeAsin($("#asin").value),
    title: $("#title").value.trim(),
    brand: $("#brand").value.trim(),
  };
  const suggestion = findProductDetailsFromImports(query);
  if (!suggestion) {
    toast("No strong match found in saved products or imported rows.");
    return;
  }
  setAutofillSuggestion(suggestion, "Found a local import match.");
}

function hydrateBookmarkletControls() {
  const code = buildAmazonBookmarklet();
  $("#bookmarkletCode").value = code;
  $("#bookmarkletLink").href = code;
}

async function copyBookmarklet() {
  const code = $("#bookmarkletCode").value || buildAmazonBookmarklet();
  try {
    await navigator.clipboard.writeText(code);
    toast("Bookmarklet copied. Save it as a browser bookmark URL.");
  } catch (error) {
    $("#bookmarkletCode").focus();
    $("#bookmarkletCode").select();
    toast("Copy the selected bookmarklet code into a browser bookmark URL.");
  }
}

function handleCapturePaste() {
  const value = $("#amazonCaptureInput").value.trim();
  if (!value) {
    toast("Paste the Amazon capture JSON first.");
    return;
  }
  const suggestion = parseAmazonCapture(value);
  if (!suggestion) {
    toast("That does not look like a product page capture.");
    return;
  }
  setAutofillSuggestion(suggestion, "Amazon page capture imported.");
}

async function handleCaptureUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const suggestion = parseAmazonCapture(await file.text());
  if (!suggestion) {
    toast("That file does not look like a product page capture.");
    return;
  }
  setAutofillSuggestion(suggestion, "Amazon capture file imported.");
}

async function handleHtmlUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const html = await file.text();
  const suggestion = parseAmazonHtml(html);
  if (!Object.keys(suggestion.fields).length) {
    toast("I could not find product details in that saved page.");
    return;
  }
  setAutofillSuggestion(suggestion, "Saved Amazon page parsed.");
}

function setAutofillSuggestion(suggestion, message) {
  state.autofillSuggestion = suggestion;
  renderAutofillPreview();
  $("#applyAutofillBtn").disabled = !Object.keys(suggestion.fields).length;
  toast(message);
}

function renderAutofillPreview() {
  const suggestion = state.autofillSuggestion;
  if (!suggestion) return resetAutofillHelper();
  const entries = Object.entries(suggestion.fields);
  const fieldsHtml = entries.length
    ? `<div class="suggestion-grid">${entries
        .map(
          ([field, detail]) => `<div class="suggestion-item">
            <span>${escapeHtml(fieldLabel(field))}</span>
            <strong>${escapeHtml(field === "purchasePrice" ? money(detail.value) : detail.value)}</strong>
            <div><span class="confidence-pill">${escapeHtml(detail.confidence || "manual")}</span></div>
          </div>`
        )
        .join("")}</div>`
    : `<div class="muted">No text fields were detected yet.</div>`;
  $("#autofillPreview").innerHTML = `
    <div>
      <strong>${escapeHtml(suggestion.source)}</strong>
      ${suggestion.note ? `<p class="muted">${escapeHtml(suggestion.note)}</p>` : ""}
    </div>
    ${fieldsHtml}
    `;
}

function applyAutofillSuggestion(options = {}) {
  if (!state.autofillSuggestion) return;
  for (const [field, detail] of Object.entries(state.autofillSuggestion.fields)) {
    const input = $(`#${field}`);
    if (input && detail.value !== undefined && detail.value !== "") input.value = detail.value;
  }
  if (!options.silent) toast("Autofill applied. Review the fields before saving.");
}

function openRevenueDialog(productId = "") {
  renderRevenueProductOptions();
  $("#revenueProduct").value = productId;
  $("#revenueDate").value = new Date().toISOString().slice(0, 10);
  for (const field of ["revenueAmount", "revenueAsin", "revenueTitle", "revenueBrand", "revenueClicks", "revenueOrders"]) {
    $(`#${field}`).value = "";
  }
  $("#revenueDialog").showModal();
}

function renderRevenueProductOptions() {
  $("#revenueProduct").innerHTML =
    `<option value="">Leave unmatched</option>` +
    state.products
      .map((product) => `<option value="${product.id}">${escapeHtml(product.title || product.asin || "Untitled product")}</option>`)
      .join("");
}

async function handleRevenueSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value !== "save") return $("#revenueDialog").close();
  const productId = $("#revenueProduct").value;
  await put("revenueEntries", {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: "manual",
    productId,
    suggestedProductId: "",
    matchStatus: productId ? "manual" : "unmatched",
    date: $("#revenueDate").value,
    amount: numberValue($("#revenueAmount").value),
    asin: normalizeAsin($("#revenueAsin").value),
    title: $("#revenueTitle").value.trim(),
    brand: $("#revenueBrand").value.trim(),
    clicks: numberValue($("#revenueClicks").value),
    orders: numberValue($("#revenueOrders").value),
  });
  $("#revenueDialog").close();
  await refreshState();
  render();
  toast("Revenue saved.");
}

async function handleCsvSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  if (!rows.length) {
    toast("That CSV did not contain readable rows.");
    return;
  }
  state.pendingCsv = { fileName: file.name, rows };
  renderMappingWizard(file.name, rows);
}

function renderMappingWizard(fileName, rows) {
  const headers = Object.keys(rows[0]);
  const guesses = guessMappings(headers);
  const options = [OPTIONAL_MAPPING, ...headers]
    .map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`)
    .join("");
  $("#mappingWizard").classList.remove("hidden");
  $("#mappingWizard").innerHTML = `
    <div>
      <h3>${escapeHtml(fileName)}</h3>
      <p class="muted">${rows.length} rows found. Confirm the column meanings before import.</p>
    </div>
    <div class="mapping-grid">
      ${IMPORT_FIELDS.map(
        ([key, label]) => `<label>${label}<select data-map="${key}">${options}</select></label>`
      ).join("")}
    </div>
    <div class="preview-table">${previewTable(rows.slice(0, 5), headers)}</div>
    <div class="dialog-actions">
      <span></span>
      <button id="runImportBtn" class="primary-btn" type="button">Import rows</button>
    </div>`;
  $$("[data-map]").forEach((select) => {
    select.value = guesses[select.dataset.map] || OPTIONAL_MAPPING;
  });
  $("#runImportBtn").addEventListener("click", runImport);
}

function previewTable(rows, headers) {
  return `<table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header] || "")}</td>`).join("")}</tr>`)
      .join("")}</tbody>
  </table>`;
}

async function runImport() {
  if (!state.pendingCsv) return;
  const mapping = Object.fromEntries($$("[data-map]").map((select) => [select.dataset.map, select.value]));
  const batch = {
    id: crypto.randomUUID(),
    fileName: state.pendingCsv.fileName,
    createdAt: new Date().toISOString(),
    mapping,
    rowCount: state.pendingCsv.rows.length,
    rawRows: state.pendingCsv.rows,
  };
  await put("importBatches", batch);

  const importedFingerprints = new Set(state.revenueEntries.map(revenueFingerprint).filter(Boolean));
  const summary = { exact: 0, approved: 0, suggested: 0, unmatched: 0, lookupOnly: 0, duplicate: 0 };
  for (const row of state.pendingCsv.rows) {
    const normalized = normalizeImportRow(row, mapping);
    if (!normalized.amount) {
      summary.lookupOnly += 1;
      continue;
    }
    const fingerprint = revenueFingerprint(normalized);
    if (fingerprint && importedFingerprints.has(fingerprint)) {
      summary.duplicate += 1;
      continue;
    }
    if (fingerprint) importedFingerprints.add(fingerprint);
    const match = findMatch(normalized);
    summary[match.matchStatus] += 1;
    await put("revenueEntries", {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      source: "csv",
      importBatchId: batch.id,
      fingerprint,
      raw: row,
      ...normalized,
      ...match,
    });
  }
  state.pendingCsv = null;
  $("#csvInput").value = "";
  $("#mappingWizard").classList.add("hidden");
  $("#mappingWizard").innerHTML = "";
  $("#importSummary").innerHTML = `<article class="rank-card">
    <strong>Import complete</strong>
    <span>Exact: ${summary.exact} · Approved: ${summary.approved} · Suggested: ${summary.suggested} · Unmatched: ${summary.unmatched} · Duplicates skipped: ${summary.duplicate}</span>
  </article>`;
  await refreshState();
  render();
  toast("CSV import complete.");
}

function normalizeImportRow(row, mapping) {
  const pick = (key) => (mapping[key] && mapping[key] !== OPTIONAL_MAPPING ? row[mapping[key]] || "" : "");
  return {
    asin: normalizeAsin(pick("asin")),
    title: pick("title").trim(),
    brand: pick("brand").trim(),
    category: pick("category").trim(),
    price: parseMoney(pick("price")),
    date: normalizeDate(pick("date")) || new Date().toISOString().slice(0, 10),
    amount: parseMoney(pick("amount")),
    clicks: numberValue(pick("clicks")),
    orders: numberValue(pick("orders")),
    sourceLink: pick("sourceLink").trim(),
  };
}

function revenueFingerprint(row = {}) {
  if (row.fingerprint) return row.fingerprint;
  const amount = numberValue(row.amount);
  if (!row.date || !amount) return "";
  return [
    normalizeDate(row.date) || row.date,
    normalizeAsin(row.asin),
    normalizeText(row.title),
    amount.toFixed(2),
  ].join("|");
}

function findMatch(row) {
  const exact = row.asin ? state.products.find((product) => product.asin && product.asin === row.asin) : null;
  if (exact) return { productId: exact.id, suggestedProductId: "", matchStatus: "exact", matchScore: 1 };

  const approved = state.approvedMatches.find((match) => {
    const asinHit = row.asin && match.asin === row.asin;
    const titleHit = normalizeText(match.title) && normalizeText(match.title) === normalizeText(row.title);
    return asinHit || titleHit;
  });
  if (approved) return { productId: approved.productId, suggestedProductId: "", matchStatus: "approved", matchScore: 1 };

  const suggestions = state.products
    .map((product) => ({ product, score: fuzzyScore(row, product) }))
    .filter((item) => item.score >= 0.48)
    .sort((a, b) => b.score - a.score);
  if (suggestions[0]) {
    return {
      productId: "",
      suggestedProductId: suggestions[0].product.id,
      matchStatus: "suggested",
      matchScore: suggestions[0].score,
    };
  }
  return { productId: "", suggestedProductId: "", matchStatus: "unmatched", matchScore: 0 };
}

function fuzzyScore(row, product) {
  const brandScore = row.brand && product.brand && normalizeText(row.brand) === normalizeText(product.brand) ? 0.35 : 0;
  const titleScore = tokenSimilarity(row.title, product.title) * 0.55;
  const asinPenalty = row.asin && product.asin && row.asin !== product.asin ? -0.03 : 0;
  const categoryBoost = row.title && product.category && normalizeText(row.title).includes(normalizeText(product.category)) ? 0.04 : 0;
  return Math.max(0, brandScore + titleScore + categoryBoost + asinPenalty);
}

function renderMatchQueue() {
  const suggested = state.revenueEntries
    .filter((entry) => entry.matchStatus === "suggested")
    .sort((a, b) => b.matchScore - a.matchScore);
  $("#matchQueue").innerHTML = suggested.length
    ? suggested.map(matchCard).join("")
    : emptyState("No suggested matches are waiting for review.", "Imported rows with uncertain matches will wait here.");
  $$("#matchQueue [data-approve]").forEach((button) => {
    button.addEventListener("click", () => approveMatch(button.dataset.approve));
  });
  $$("#matchQueue [data-reject]").forEach((button) => {
    button.addEventListener("click", () => rejectMatch(button.dataset.reject));
  });
}

function matchCard(entry) {
  const product = state.products.find((item) => item.id === entry.suggestedProductId);
  return `<article class="match-card">
    <div><span class="match-pill">${Math.round((entry.matchScore || 0) * 100)}% suggested</span></div>
    <strong>${escapeHtml(entry.title || entry.asin || "Imported revenue row")}</strong>
    <span class="muted">Imported: ${escapeHtml(entry.brand || "No brand")} · ${escapeHtml(entry.asin || "No ASIN")} · ${money(entry.amount)} · ${entry.date || ""}</span>
    <span>Suggested product: <strong>${escapeHtml(product?.title || "Missing product")}</strong></span>
    <span class="muted">${escapeHtml(product?.brand || "No brand")} · ${escapeHtml(product?.asin || "No ASIN")}</span>
    <div class="row-actions">
      <button class="primary-btn" data-approve="${entry.id}" type="button">Approve match</button>
      <button class="secondary-btn" data-reject="${entry.id}" type="button">Reject</button>
    </div>
  </article>`;
}

async function approveMatch(entryId) {
  const entry = state.revenueEntries.find((item) => item.id === entryId);
  if (!entry?.suggestedProductId) return;
  await put("revenueEntries", { ...entry, productId: entry.suggestedProductId, matchStatus: "approved" });
  await put("approvedMatches", {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    productId: entry.suggestedProductId,
    asin: entry.asin,
    title: entry.title,
    brand: entry.brand,
  });
  await refreshState();
  render();
  toast("Match approved and ROI updated.");
}

async function rejectMatch(entryId) {
  const entry = state.revenueEntries.find((item) => item.id === entryId);
  if (!entry) return;
  await put("revenueEntries", { ...entry, matchStatus: "rejected", productId: "", suggestedProductId: "" });
  await refreshState();
  render();
  toast("Suggested match rejected.");
}

function exportCsv(type) {
  const rows = {
    products: productExportRows(),
    revenue: state.revenueEntries.map(revenueExportRow),
    summary: summaryExportRows(),
  }[type];
  downloadText(`${type}-${dateStamp()}.csv`, toCsv(rows), "text/csv");
}

function productExportRows() {
  return state.products.map((product) => {
    const stats = getProductStats(product);
    const videos = normalizeProductVideos(product);
    return {
      Title: product.title,
      Brand: product.brand,
      ASIN: product.asin,
      Category: product.category,
      Status: product.status,
      "Purchase Date": product.purchaseDate,
      "Landed Cost": stats.cost,
      Earned: stats.earned,
      "Net Profit": stats.net,
      "ROI %": stats.roi.toFixed(2),
      "Payback %": stats.paybackPercent.toFixed(2),
      "Unrecovered Cost": stats.unrecovered,
      "Video Status": product.videoStatus || deriveVideoStatus(product),
      "Video Count": videos.length || numberValue(product.videoCount),
      Videos: formatVideosForExport(videos),
      "Amazon Link": product.amazonLink,
      "Storefront Link": product.storefrontLink,
      Notes: product.notes,
    };
  });
}

function revenueExportRow(entry) {
  const product = state.products.find((item) => item.id === entry.productId);
  return {
    Date: entry.date,
    Amount: entry.amount,
    ASIN: entry.asin,
    Title: entry.title,
    Brand: entry.brand,
    Clicks: entry.clicks,
    Orders: entry.orders,
    Source: entry.source,
    "Match Status": entry.matchStatus,
    "Matched Product": product?.title || "",
  };
}

function summaryExportRows() {
  return state.products.map((product) => {
    const stats = getProductStats(product);
    const videos = normalizeProductVideos(product);
    return {
      Product: product.title,
      Brand: product.brand,
      ASIN: product.asin,
      Cost: stats.cost,
      Earned: stats.earned,
      "Net Profit": stats.net,
      "ROI %": stats.roi.toFixed(2),
      "Payback %": stats.paybackPercent.toFixed(2),
      "Paid Off": stats.paidOff ? "Yes" : "No",
      "Video Status": product.videoStatus || deriveVideoStatus(product),
      "Video Count": videos.length || numberValue(product.videoCount),
    };
  });
}

function formatVideosForExport(videos = []) {
  return videos
    .map((video) => [video.title, video.link, video.postedDate, video.notes].filter(Boolean).join(" | "))
    .join("; ");
}

function exportBackup() {
  downloadText(
    `aip-investment-dashboard-backup-${dateStamp()}.json`,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        products: state.products,
        revenueEntries: state.revenueEntries,
        approvedMatches: state.approvedMatches,
        importBatches: state.importBatches,
      },
      null,
      2
    ),
    "application/json"
  );
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const backup = JSON.parse(await file.text());
  for (const storeName of STORES) {
    if (!Array.isArray(backup[storeName])) continue;
    for (const row of backup[storeName]) await put(storeName, row);
  }
  await refreshState();
  render();
  toast("Backup imported.");
}

async function clearAllData() {
  if (!confirm("Clear all products, revenue rows, matches, and imports from this browser?")) return;
  await Promise.all(STORES.map(clearStore));
  await refreshState();
  render();
  toast("All local data cleared.");
}

async function seedDemoData() {
  if (state.products.length && !confirm("Add sample data to your current dashboard?")) return;
  const productA = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title: "Cordless Mini Food Chopper",
    brand: "KitchenPilot",
    asin: "B0DEMO1001",
    category: "Kitchen/Cookware",
    purchaseDate: "2026-02-10",
    status: "earning",
    amazonLink: "https://www.amazon.com/dp/B0DEMO1001",
    storefrontLink: "https://www.amazon.com/shop/demo/video/B0DEMO1001",
    videoStatus: "posted",
    videoCount: 2,
    videos: [
      {
        title: "Meal prep chopper demo",
        link: "https://www.amazon.com/shop/demo/video/B0DEMO1001",
        postedDate: "2026-02-16",
        notes: "Main storefront demo.",
      },
      {
        title: "Quick onion chop follow-up",
        link: "",
        postedDate: "2026-02-20",
        notes: "Shorter angle for variation testing.",
      },
    ],
    purchasePrice: 29.99,
    tax: 2.7,
    shipping: 0,
    discounts: 5,
    refunds: 0,
    filmedDate: "2026-02-14",
    postedDate: "2026-02-16",
    notes: "Good demo angles with meal prep footage.",
  };
  const productB = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title: "Reusable Pet Hair Remover Roller",
    brand: "FurAway",
    asin: "B0DEMO2002",
    category: "Pet",
    purchaseDate: "2026-03-04",
    status: "posted",
    amazonLink: "https://www.amazon.com/dp/B0DEMO2002",
    storefrontLink: "https://www.amazon.com/shop/demo/video/B0DEMO2002",
    videoStatus: "posted",
    videoCount: 1,
    videos: [
      {
        title: "Pet hair roller couch test",
        link: "https://www.amazon.com/shop/demo/video/B0DEMO2002",
        postedDate: "2026-03-10",
        notes: "Shows before and after on dark fabric.",
      },
    ],
    purchasePrice: 18.49,
    tax: 1.61,
    shipping: 0,
    discounts: 0,
    refunds: 0,
    filmedDate: "2026-03-08",
    postedDate: "2026-03-10",
    notes: "Variant listings may show under different ASINs.",
  };
  await put("products", productA);
  await put("products", productB);
  await put("revenueEntries", {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: "manual",
    productId: productA.id,
    matchStatus: "manual",
    date: "2026-03-31",
    amount: 58.42,
    asin: productA.asin,
    title: productA.title,
    brand: productA.brand,
    clicks: 210,
    orders: 14,
  });
  await put("revenueEntries", {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: "csv",
    productId: "",
    suggestedProductId: productB.id,
    matchStatus: "suggested",
    matchScore: 0.83,
    date: "2026-04-30",
    amount: 9.2,
    asin: "B0DEMO2999",
    title: "FurAway pet hair remover roller blue variant",
    brand: "FurAway",
    clicks: 88,
    orders: 3,
  });
  await refreshState();
  render();
  toast("Sample data loaded.");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  const headers = rows.shift()?.map((header, index) => header.trim() || `Column ${index + 1}`) || [];
  return rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ""]))
  );
}

function extractAsinFromInput(value = "") {
  const input = String(value).trim();
  const urlMatch = input.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([A-Z0-9]{10})/i);
  if (urlMatch) return normalizeAsin(urlMatch[1]);
  const queryMatch = input.match(/[?&](?:asin|ASIN)=([A-Z0-9]{10})/i);
  if (queryMatch) return normalizeAsin(queryMatch[1]);
  const rawMatch = input.match(/\bB0[A-Z0-9]{8}\b|\b[0-9]{9}[0-9X]\b/i);
  return rawMatch ? normalizeAsin(rawMatch[0]) : "";
}

function createAutofillSuggestion(source, fields = {}, extras = {}) {
  return { source, fields, ...extras };
}

function buildAmazonBookmarklet() {
  const source = `(()=>{const d=document;const clean=v=>String(v||"").replace(/\\s+/g," ").trim();const one=s=>d.querySelector(s);const text=s=>clean(one(s)?.textContent);const attr=(s,a)=>one(s)?.getAttribute(a)||"";const meta=n=>attr('meta[property="'+n+'"],meta[name="'+n+'"]',"content");const money=v=>{const m=String(v||"").match(/\\$\\s*[\\d,]+(?:\\.\\d{2})?/);return m?m[0].replace(/\\s+/g,""):""};const asinFrom=v=>{v=String(v||"");let m=v.match(/(?:\\/dp\\/|\\/gp\\/product\\/|\\/product\\/)([A-Z0-9]{10})/i)||v.match(/[?&](?:asin|ASIN)=([A-Z0-9]{10})/i)||v.match(/\\bB0[A-Z0-9]{8}\\b|\\b[0-9]{9}[0-9X]\\b/i);return m?(m[1]||m[0]).toUpperCase():""};const cleanBrand=v=>clean(v).replace(/^Visit the\\s+/i,"").replace(/\\s+Store$/i,"").replace(/^Brand\\s*:?\\s*/i,"").replace(/^by\\s+/i,"");const detail=label=>{label=label.toLowerCase();const rows=[...d.querySelectorAll("#productOverview_feature_div tr,#prodDetails tr,#productDetails_techSpec_section_1 tr,#productDetails_detailBullets_sections1 tr")];for(const row of rows){const cells=[...row.querySelectorAll("th,td,span")].map(n=>clean(n.textContent)).filter(Boolean);const i=cells.findIndex(c=>c.toLowerCase().replace(/[:\\s]+$/,"")===label);if(i>=0&&cells[i+1])return cells[i+1];}const bullets=[...d.querySelectorAll("#detailBullets_feature_div li")];for(const item of bullets){const t=clean(item.textContent);if(t.toLowerCase().startsWith(label))return clean(t.replace(new RegExp("^"+label+"\\\\s*:?\\\\s*","i"),""));}return ""};const title=clean(text("#productTitle")||meta("og:title")||d.title).replace(/\\s*:\\s*Amazon\\.com.*$/i,"");const asin=asinFrom(attr('input[name="ASIN"]',"value"))||asinFrom(location.href)||asinFrom(attr('link[rel="canonical"]',"href"))||asinFrom(text("#ASIN"));const byline=text("#bylineInfo");const brand=cleanBrand(byline)||cleanBrand(detail("Brand"))||cleanBrand(detail("Manufacturer"));const price=money(text("#corePrice_feature_div .a-price .a-offscreen")||text("#apex_desktop .a-price .a-offscreen")||text(".priceToPay .a-offscreen")||text("#priceblock_ourprice")||text("#priceblock_dealprice")||text("#price_inside_buybox")||text("#sns-base-price .a-offscreen"));const breadcrumbs=[...d.querySelectorAll("#wayfinding-breadcrumbs_feature_div a,.a-breadcrumb a")].map(a=>clean(a.textContent)).filter(Boolean);const category=breadcrumbs[breadcrumbs.length-1]||"";const imageUrl=attr("#landingImage","data-old-hires")||attr("#landingImage","src")||meta("og:image");const couponHint=clean(text("#promoPriceBlockMessage_feature_div")||text("#vpcButton")||text("#couponText"));const payload={type:"aip-amazon-product",source:"amazon-bookmarklet",version:1,capturedAt:new Date().toISOString(),sourceUrl:location.href,asin,title,brand,price,category,breadcrumbs,amazonLink:asin?"https://www.amazon.com/dp/"+asin:(attr('link[rel="canonical"]',"href")||location.href),imageUrl,couponHint};const json=JSON.stringify(payload,null,2);const download=()=>{const a=d.createElement("a");a.href=URL.createObjectURL(new Blob([json],{type:"application/json"}));a.download="aip-amazon-product-"+(asin||"capture")+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);alert("Downloaded product capture JSON. Import it in the AIP dashboard product form.")};if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(json).then(()=>alert("Copied product capture JSON. Paste it in the AIP dashboard product form.")).catch(download)}else{download()}})();`;
  return `javascript:${source}`;
}

function parseAmazonCapture(value) {
  let payload = value;
  if (typeof value === "string") {
    try {
      payload = JSON.parse(value);
    } catch (error) {
      const objectText = value.match(/\{[\s\S]*\}/)?.[0];
      if (!objectText) return null;
      try {
        payload = JSON.parse(objectText);
      } catch (innerError) {
        return null;
      }
    }
  }
  if (!payload || typeof payload !== "object") return null;
  if (payload.product && typeof payload.product === "object") payload = payload.product;

  const asin = normalizeAsin(payload.asin || extractAsinFromInput(payload.amazonLink || payload.sourceUrl || ""));
  const title = cleanAmazonTitle(payload.title || "");
  const brand = cleanBrandName(payload.brand || payload.byline || payload.manufacturer || "");
  const breadcrumbs = Array.isArray(payload.breadcrumbs) ? payload.breadcrumbs.map(cleanText).filter(Boolean) : [];
  const category = cleanText(payload.category || breadcrumbs.at(-1) || payload.categoryPath || "");
  const price = parseMoney(payload.purchasePrice || payload.price || payload.priceText || "");
  const link = cleanText(payload.amazonLink || payload.canonicalUrl || payload.sourceUrl || "");
  const fields = {};

  if (asin) {
    fields.asin = { value: asin, confidence: "exact" };
    fields.amazonLink = { value: `https://www.amazon.com/dp/${asin}`, confidence: "exact" };
  } else if (link) {
    fields.amazonLink = { value: link, confidence: "likely" };
  }
  if (title) fields.title = { value: title, confidence: "likely" };
  if (brand) fields.brand = { value: brand, confidence: "likely" };
  if (category) fields.category = { value: category, confidence: "likely" };
  if (price) fields.purchasePrice = { value: price, confidence: "likely" };
  if (!fields.category && title) fields.category = { value: guessCategory(title), confidence: "weak" };
  if (!Object.keys(fields).length) return null;

  const notes = [];
  if (payload.capturedAt) notes.push(`Captured ${new Date(payload.capturedAt).toLocaleString()}`);
  if (payload.couponHint) notes.push(`Coupon hint: ${cleanText(payload.couponHint)}`);
  return createAutofillSuggestion("Amazon page importer", fields, {
    imageUrl: payload.imageUrl || "",
    note: notes.join(". "),
    capture: payload,
  });
}

function parseAmazonHtml(html) {
  const documentHtml = new DOMParser().parseFromString(html, "text/html");
  const text = documentHtml.body?.innerText || documentHtml.documentElement?.textContent || "";
  const title =
    cleanAmazonTitle(
      documentHtml.querySelector("#productTitle")?.textContent ||
        documentHtml.querySelector('meta[property="og:title"]')?.content ||
        documentHtml.querySelector("title")?.textContent ||
        ""
    );
  const brand = cleanText(
    documentHtml.querySelector("#bylineInfo")?.textContent ||
      findTextByPattern(text, /(?:Brand|Visit the)\s+([A-Z][A-Za-z0-9 &'-]{2,60})(?:\s+Store)?/i)
  );
  const price =
    parseMoney(documentHtml.querySelector(".a-price .a-offscreen")?.textContent) ||
    parseMoney(findTextByPattern(text, /\$[\d,]+(?:\.\d{2})?/));
  const category = cleanText(
    [...documentHtml.querySelectorAll("#wayfinding-breadcrumbs_feature_div a, .a-breadcrumb a")]
      .map((node) => node.textContent)
      .filter(Boolean)
      .pop() || ""
  );
  const asin = extractAsinFromInput(text) || extractAsinFromInput(html);
  const fields = {};
  if (title) fields.title = { value: title, confidence: "likely" };
  if (brand) fields.brand = { value: cleanBrandName(brand), confidence: "likely" };
  if (category) fields.category = { value: category, confidence: "likely" };
  if (price) fields.purchasePrice = { value: price, confidence: "likely" };
  if (asin) {
    fields.asin = { value: asin, confidence: "exact" };
    fields.amazonLink = { value: `https://www.amazon.com/dp/${asin}`, confidence: "exact" };
  }
  if (!fields.category && title) fields.category = { value: guessCategory(title), confidence: "weak" };
  return createAutofillSuggestion("Saved Amazon page", fields);
}

function findProductDetailsFromImports(query) {
  const candidates = [];
  for (const product of state.products) {
    candidates.push({
      source: "Saved product",
      row: product,
      asin: product.asin,
      title: product.title,
      brand: product.brand,
      category: product.category,
      price: product.purchasePrice,
    });
  }
  for (const entry of state.revenueEntries) {
    candidates.push({
      source: "Imported revenue row",
      row: entry.raw || entry,
      asin: entry.asin,
      title: entry.title,
      brand: entry.brand,
      category: entry.category,
      price: entry.price,
    });
  }
  for (const batch of state.importBatches) {
    for (const raw of batch.rawRows || []) {
      const normalized = normalizeImportRow(raw, batch.mapping || {});
      candidates.push({
        source: batch.fileName || "Imported CSV",
        row: raw,
        asin: normalized.asin,
        title: normalized.title,
        brand: normalized.brand,
        category: normalized.category,
        price: normalized.price,
      });
    }
  }
  const scored = candidates
    .map((candidate) => ({ candidate, score: importedCandidateScore(query, candidate) }))
    .filter((item) => item.score >= 0.34)
    .sort((a, b) => b.score - a.score);
  const best = scored[0]?.candidate;
  if (!best) return null;
  const confidence = scored[0].score > 0.9 ? "exact" : scored[0].score > 0.55 ? "likely" : "weak";
  const fields = {};
  if (best.asin) {
    fields.asin = { value: normalizeAsin(best.asin), confidence };
    fields.amazonLink = { value: `https://www.amazon.com/dp/${normalizeAsin(best.asin)}`, confidence };
  }
  if (best.title) fields.title = { value: best.title, confidence };
  if (best.brand) fields.brand = { value: best.brand, confidence };
  if (best.category) fields.category = { value: best.category, confidence };
  if (best.price) fields.purchasePrice = { value: numberValue(best.price), confidence };
  if (!fields.category && best.title) fields.category = { value: guessCategory(best.title), confidence: "weak" };
  return createAutofillSuggestion(best.source, fields);
}

function importedCandidateScore(query, candidate) {
  if (query.asin && candidate.asin && normalizeAsin(query.asin) === normalizeAsin(candidate.asin)) return 1;
  const brandScore = query.brand && candidate.brand && normalizeText(query.brand) === normalizeText(candidate.brand) ? 0.35 : 0;
  const titleScore = tokenSimilarity(query.title || $("#amazonQuickInput").value, candidate.title) * 0.65;
  return brandScore + titleScore;
}

function findTextByPattern(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? match[1] || match[0] : "";
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

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function fieldLabel(field) {
  return {
    asin: "ASIN",
    amazonLink: "Amazon link",
    title: "Title",
    brand: "Brand",
    category: "Category",
    purchasePrice: "Purchase price",
  }[field] || field;
}

function guessCategory(title = "") {
  const text = normalizeText(title);
  const rules = [
    ["Pet", ["pet", "dog", "cat", "litter", "leash", "fur"]],
    ["Kitchen/Cookware", ["kitchen", "cook", "food", "chopper", "pan", "utensil", "knife", "container"]],
    ["Cleaning/Laundry", ["clean", "laundry", "detergent", "scrub", "sponge", "microfiber"]],
    ["Beauty/Skincare", ["skin", "makeup", "beauty", "serum", "cream", "lash", "nail"]],
    ["Tech/Electronics", ["charger", "cable", "phone", "usb", "bluetooth", "camera", "electronic"]],
    ["Home/Decor", ["home", "decor", "lamp", "rug", "pillow", "organizer", "storage"]],
    ["Fitness", ["fitness", "workout", "yoga", "exercise", "dumbbell"]],
    ["Tools/Hardware", ["tool", "drill", "screw", "hardware", "wrench"]],
    ["Outdoor/Yard/Garden", ["garden", "outdoor", "patio", "yard", "plant"]],
  ];
  return rules.find(([, words]) => words.some((word) => text.includes(word)))?.[0] || "Other";
}

function guessMappings(headers) {
  const find = (...needles) =>
    headers.find((header) => needles.some((needle) => normalizeText(header).includes(normalizeText(needle)))) || OPTIONAL_MAPPING;
  return {
    asin: find("asin"),
    title: find("title", "product name", "item"),
    brand: find("brand"),
    category: find("category", "node", "department"),
    price: find("price", "new: 90 days avg.", "amazon: 90 days avg.", "buy box"),
    date: find("date", "month", "period"),
    amount: find("commission", "earnings", "revenue", "fees", "income"),
    clicks: find("clicks"),
    orders: find("orders", "items shipped", "shipped items"),
    sourceLink: find("amazon link", "url", "link"),
  };
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(fileName, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function tokenSimilarity(a = "", b = "") {
  const aTokens = new Set(normalizeText(a).split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(normalizeText(b).split(" ").filter((token) => token.length > 2));
  if (!aTokens.size || !bTokens.size) return 0;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
}

function normalizeText(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeAsin(value = "") {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function parseMoney(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
  return numberValue(cleaned);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const monthMatch = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!monthMatch) return "";
  const [, month, day, year] = monthMatch;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function toMonth(date) {
  return date ? String(date).slice(0, 7) : "";
}

function formatMonth(month) {
  const [year, monthNumber] = month.split("-");
  return `${monthNumber}/${year.slice(2)}`;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numberValue(value));
}

function titleCase(value = "") {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emptyState(message, detail = "") {
  return `<div class="empty-state">
    <strong>${escapeHtml(message)}</strong>
    ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
  </div>`;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function toast(message) {
  const toastEl = $("#toast");
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  window.clearTimeout(toastEl.timeoutId);
  toastEl.timeoutId = window.setTimeout(() => toastEl.classList.remove("visible"), 2600);
}
