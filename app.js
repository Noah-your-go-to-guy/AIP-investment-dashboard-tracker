const DB_NAME = "aip-investment-dashboard";
const DB_VERSION = 1;
const SUPABASE_URL = "https://gvifstpfolidkvxjeftx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fnM9Bw4WbLAqibtuCv2pJA_hMwErdoC";
const STORES = ["products", "revenueEntries", "approvedMatches", "importBatches"];
const STATUSES = ["researched", "bought", "received", "filmed", "posted", "earning", "paid off", "retired"];
const PURCHASED_STATUSES = ["bought", "received", "filmed", "posted", "earning", "paid off"];
const VIDEO_STATUSES = ["not filmed", "filmed", "posted", "needs check"];
const OPTIONAL_MAPPING = "Do not import";
const MATCH_REVIEW_MIN_SCORE = 0.05;
const MATCH_SUGGESTION_MIN_SCORE = 0.48;
const GENERIC_IMPORT_LABELS = new Set([
  "other",
  "others",
  "unknown",
  "not available",
  "not set",
  "no title",
  "no asin",
  "none",
  "misc",
  "miscellaneous",
]);
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
let supabaseClient = null;
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
  topProductSearch: "",
  topProductSourceFilter: "all",
  topProductSort: "earned",
  matchSearch: "",
  revenueAuditSearch: "",
  showIgnoredAuditRows: false,
  cloudAvailable: false,
  cloudUser: null,
  pendingCsv: null,
  autofillSuggestion: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", async () => {
  db = await openDb();
  await initSupabase();
  populateStatusControls();
  bindEvents();
  await refreshState();
  await repairExactTitleRevenueMatches();
  await repairSharedImportTitleRevenueMatches();
  await restoreActionableIgnoredRevenueRows();
  await excludeWeakRevenueMatches();
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

async function initSupabase() {
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    state.cloudAvailable = false;
    return;
  }
  state.cloudAvailable = true;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.warn("Supabase session check failed", error);
    return;
  }
  state.cloudUser = data.session?.user || null;
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    state.cloudUser = session?.user || null;
    await refreshState();
    await repairExactTitleRevenueMatches();
    await repairSharedImportTitleRevenueMatches();
    await restoreActionableIgnoredRevenueRows();
    await excludeWeakRevenueMatches();
    render();
  });
}

function cloudStorageActive() {
  return Boolean(supabaseClient && state.cloudUser);
}

function localGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function localPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function localRemove(storeName, id) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function localClearStore(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
  if (!cloudStorageActive()) return localGetAll(storeName);
  const { data, error } = await supabaseClient
    .from("dashboard_records")
    .select("data")
    .eq("store", storeName)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => row.data).filter(Boolean);
}

async function put(storeName, value) {
  if (!cloudStorageActive()) return localPut(storeName, value);
  if (!value?.id) throw new Error(`Cannot save ${storeName} without an id.`);
  const { error } = await supabaseClient.from("dashboard_records").upsert(
    {
      user_id: state.cloudUser.id,
      store: storeName,
      id: value.id,
      data: value,
    },
    { onConflict: "user_id,store,id" }
  );
  if (error) throw error;
  return value;
}

async function putMany(storeName, values = []) {
  if (!values.length) return [];
  if (!cloudStorageActive()) {
    await Promise.all(values.map((value) => localPut(storeName, value)));
    return values;
  }
  const rows = values.map((value) => {
    if (!value?.id) throw new Error(`Cannot save ${storeName} without an id.`);
    return {
      user_id: state.cloudUser.id,
      store: storeName,
      id: value.id,
      data: value,
    };
  });
  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await supabaseClient
      .from("dashboard_records")
      .upsert(rows.slice(index, index + chunkSize), { onConflict: "user_id,store,id" });
    if (error) throw error;
  }
  return values;
}

async function remove(storeName, id) {
  if (!cloudStorageActive()) return localRemove(storeName, id);
  const { error } = await supabaseClient.from("dashboard_records").delete().eq("store", storeName).eq("id", id);
  if (error) throw error;
}

async function removeMany(storeName, ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return;
  if (!cloudStorageActive()) {
    await Promise.all(uniqueIds.map((id) => localRemove(storeName, id)));
    return;
  }
  const chunkSize = 500;
  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const { error } = await supabaseClient
      .from("dashboard_records")
      .delete()
      .eq("user_id", state.cloudUser.id)
      .eq("store", storeName)
      .in("id", uniqueIds.slice(index, index + chunkSize));
    if (error) throw error;
  }
}

async function clearStore(storeName) {
  if (!cloudStorageActive()) return localClearStore(storeName);
  const { error } = await supabaseClient.from("dashboard_records").delete().eq("store", storeName);
  if (error) throw error;
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

async function repairExactTitleRevenueMatches() {
  let fixed = 0;
  for (const entry of state.revenueEntries) {
    if (entry.productId || entry.matchStatus === "rejected") continue;
    const titleProduct = findExactTitleProduct(entry);
    if (!titleProduct) continue;
    await put("revenueEntries", {
      ...entry,
      productId: titleProduct.id,
      suggestedProductId: "",
      matchStatus: "exact",
      matchScore: 1,
    });
    fixed += 1;
  }
  if (fixed) await refreshState();
}

async function repairSharedImportTitleRevenueMatches() {
  const titleProducts = new Map();
  for (const entry of state.revenueEntries) {
    if (!entry.productId || entry.matchStatus === "rejected") continue;
    if (!hasActionableImportIdentity(entry)) continue;
    const titleKey = normalizeText(entry.title);
    if (!titleKey) continue;
    const productIds = titleProducts.get(titleKey) || new Set();
    productIds.add(entry.productId);
    titleProducts.set(titleKey, productIds);
  }

  let fixed = 0;
  for (const entry of state.revenueEntries) {
    if (entry.productId || entry.matchStatus === "rejected") continue;
    if (!hasActionableImportIdentity(entry)) continue;
    const titleKey = normalizeText(entry.title);
    const productIds = titleProducts.get(titleKey);
    if (!titleKey || !productIds || productIds.size !== 1) continue;
    const [productId] = [...productIds];
    await put("revenueEntries", {
      ...entry,
      productId,
      suggestedProductId: "",
      matchStatus: "exact",
      matchScore: 1,
    });
    fixed += 1;
  }
  if (fixed) await refreshState();
}

async function restoreActionableIgnoredRevenueRows() {
  let fixed = 0;
  for (const entry of state.revenueEntries) {
    if (entry.productId || entry.matchStatus !== "ignored") continue;
    if (!hasActionableImportIdentity(entry)) continue;
    const candidate = bestProductMatch(entry);
    await put("revenueEntries", {
      ...entry,
      suggestedProductId: candidate?.product?.id || "",
      matchStatus: candidate?.score >= MATCH_SUGGESTION_MIN_SCORE ? "suggested" : "unmatched",
      matchScore: candidate?.score || 0,
    });
    fixed += 1;
  }
  if (fixed) await refreshState();
}

async function excludeWeakRevenueMatches() {
  let fixed = 0;
  for (const entry of state.revenueEntries) {
    if (entry.productId || entry.matchStatus !== "unmatched") continue;
    const score = reviewMatchScore(entry);
    if (score >= MATCH_REVIEW_MIN_SCORE) continue;
    if (hasActionableImportIdentity(entry)) continue;
    await put("revenueEntries", {
      ...entry,
      suggestedProductId: "",
      matchStatus: "ignored",
      matchScore: 0,
    });
    fixed += 1;
  }
  if (fixed) await refreshState();
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
  $("#topProductSearch").addEventListener("input", (event) => {
    state.topProductSearch = event.target.value.trim().toLowerCase();
    renderTopProducts();
  });
  $("#topProductSourceFilter").addEventListener("change", (event) => {
    state.topProductSourceFilter = event.target.value;
    renderTopProducts();
  });
  $("#topProductSort").addEventListener("change", (event) => {
    state.topProductSort = event.target.value;
    renderTopProducts();
  });
  $("#matchSearch").addEventListener("input", (event) => {
    state.matchSearch = event.target.value.trim().toLowerCase();
    renderMatchQueue();
  });
  $("#massUnmatchBtn").addEventListener("click", massUnmatchReviewRows);
  $("#revenueAuditSearch").addEventListener("input", (event) => {
    state.revenueAuditSearch = event.target.value.trim().toLowerCase();
    renderRevenueAudit();
  });
  $("#showIgnoredAuditRows").addEventListener("change", (event) => {
    state.showIgnoredAuditRows = event.target.checked;
    renderRevenueAudit();
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
  $("#clearImportedRevenueBtn").addEventListener("click", clearImportedRevenue);
  $("#dedupeCsvRevenueBtn").addEventListener("click", removeDuplicateCsvRevenueRows);
  $("#seedDemoBtn").addEventListener("click", seedDemoData);
  $("#signInBtn").addEventListener("click", signInToCloud);
  $("#signUpBtn").addEventListener("click", signUpForCloud);
  $("#resendConfirmationBtn").addEventListener("click", resendCloudConfirmation);
  $("#signOutBtn").addEventListener("click", signOutOfCloud);
  $("#copyLocalToCloudBtn").addEventListener("click", copyLocalDataToCloud);
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
  renderCloudAccount();
  renderMetrics();
  renderTrendChart();
  renderRankings();
  renderTopProducts();
  renderProducts();
  renderImportHistory();
  renderRevenueProductOptions();
  renderMatchQueue();
  renderRevenueAudit();
}

function renderCloudAccount() {
  const signedIn = cloudStorageActive();
  $("#cloudStatusTitle").textContent = signedIn ? "Cloud account" : "Local browser";
  $("#cloudStatusPill").textContent = signedIn ? "Signed in" : "Local";
  $("#cloudStatusPill").classList.toggle("signed-in", signedIn);
  $("#cloudStatusPill").classList.toggle("local", !signedIn);
  $("#cloudStatusNote").textContent = signedIn
    ? `Signed in as ${state.cloudUser.email || "Supabase user"}`
    : state.cloudAvailable
      ? "Sign in to save dashboard data in Supabase."
      : "Cloud login unavailable. Local browser data is still active.";
  $("#cloudAuthFields").classList.toggle("hidden", signedIn || !state.cloudAvailable);
  $("#cloudSignedInActions").classList.toggle("hidden", !signedIn);
}

function getAuthCredentials() {
  return {
    email: $("#authEmail").value.trim(),
    password: $("#authPassword").value,
  };
}

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function signInToCloud() {
  if (!supabaseClient) {
    toast("Cloud login is not available yet.");
    return;
  }
  const { email, password } = getAuthCredentials();
  if (!email || !password) {
    toast("Enter an email and password first.");
    return;
  }
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    toast(authErrorMessage(error));
    return;
  }
  $("#authPassword").value = "";
  await refreshState();
  await repairExactTitleRevenueMatches();
  await repairSharedImportTitleRevenueMatches();
  await restoreActionableIgnoredRevenueRows();
  await excludeWeakRevenueMatches();
  render();
  toast("Signed in. Your cloud dashboard is active.");
}

async function signUpForCloud() {
  if (!supabaseClient) {
    toast("Cloud login is not available yet.");
    return;
  }
  const { email, password } = getAuthCredentials();
  if (!email || !password) {
    toast("Enter an email and password first.");
    return;
  }
  if (password.length < 6) {
    toast("Use a password with at least 6 characters.");
    return;
  }
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });
  if (error) {
    toast(error.message);
    return;
  }
  $("#authPassword").value = "";
  toast(data.session ? "Account created. Your cloud dashboard is active." : "Account created. Check your email to confirm it. If nothing arrives, use Resend confirmation.");
}

async function resendCloudConfirmation() {
  if (!supabaseClient) {
    toast("Cloud login is not available yet.");
    return;
  }
  const email = $("#authEmail").value.trim();
  if (!email) {
    toast("Enter your email first.");
    return;
  }
  const { error } = await supabaseClient.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });
  if (error) {
    toast(authErrorMessage(error));
    return;
  }
  toast("Confirmation email resent. Check your inbox and spam folder.");
}

function authErrorMessage(error) {
  const message = error?.message || "Cloud login failed.";
  if (/confirm|confirmed|verification/i.test(message)) {
    return "That email is not confirmed yet. Click Resend confirmation, then check your inbox and spam folder.";
  }
  return message;
}

async function signOutOfCloud() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    toast(error.message);
    return;
  }
  toast("Signed out. Local browser data is active.");
}

async function copyLocalDataToCloud() {
  if (!cloudStorageActive()) {
    toast("Sign in before copying local data to cloud.");
    return;
  }
  const localRecords = {};
  let recordCount = 0;
  for (const storeName of STORES) {
    localRecords[storeName] = await localGetAll(storeName);
    recordCount += localRecords[storeName].length;
  }
  if (!recordCount) {
    toast("No local browser data found to copy.");
    return;
  }
  if (!confirm(`Copy ${recordCount} local record${recordCount === 1 ? "" : "s"} to your cloud account? Existing cloud records with the same IDs will be updated.`)) {
    return;
  }
  for (const storeName of STORES) {
    for (const item of localRecords[storeName]) {
      await put(storeName, item);
    }
  }
  await refreshState();
  await repairExactTitleRevenueMatches();
  await repairSharedImportTitleRevenueMatches();
  await restoreActionableIgnoredRevenueRows();
  await excludeWeakRevenueMatches();
  render();
  toast("Local data copied to cloud.");
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

function renderTopProducts() {
  const groups = topProductGroups();
  const totalEarned = groups.reduce((sum, group) => sum + group.earned, 0);
  const investmentEarned = groups.filter((group) => group.matchedProducts.length).reduce((sum, group) => sum + group.earned, 0);
  const best = [...groups].sort((a, b) => b.earned - a.earned)[0];
  const metrics = [
    { label: "Imported earnings", value: money(totalEarned), note: `${groups.length} earning products`, tone: "earned" },
    { label: "Best product", value: money(best?.earned || 0), note: best?.title || "No imported earnings yet", tone: "positive" },
    { label: "Investment matched", value: money(investmentEarned), note: "Already tied to tracked products", tone: "neutral" },
    { label: "Not investment products", value: money(totalEarned - investmentEarned), note: "Useful for product opportunity review", tone: "warning" },
  ];
  $("#topProductsMetricGrid").innerHTML = metrics
    .map(
      ({ label, value, note, tone }) => `<article class="metric metric-${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${escapeHtml(note)}</small>
      </article>`
    )
    .join("");

  const query = normalizeText(state.topProductSearch);
  const rows = groups
    .filter((group) => {
      if (state.topProductSourceFilter === "investment" && !group.matchedProducts.length) return false;
      if (state.topProductSourceFilter === "notInvestment" && group.matchedProducts.length) return false;
      if (!query) return true;
      return topProductSearchText(group).includes(query);
    })
    .sort(sortTopProductRows);

  $("#topProductsTable").innerHTML = rows.length
    ? rows.map((group, index) => topProductRow(group, index + 1)).join("")
    : `<tr><td colspan="8">${emptyState(
        groups.length ? "No top products match the current filters." : "No imported product earnings yet.",
        groups.length ? "Try clearing search or changing the filter." : "Upload earnings CSVs to populate this section."
      )}</td></tr>`;
}

function topProductGroups() {
  const groups = new Map();
  for (const entry of state.revenueEntries.filter((item) => item.source === "csv" && numberValue(item.amount) > 0)) {
    const key = topProductGroupKey(entry);
    if (!key) continue;
    const group = groups.get(key) || {
      key,
      title: entry.title || entry.asin || "Imported product",
      brand: entry.brand || "",
      category: entry.category || "",
      asins: new Set(),
      earned: 0,
      clicks: 0,
      orders: 0,
      rows: 0,
      firstDate: "",
      latestDate: "",
      matchedProductIds: new Set(),
      sourceLinks: new Set(),
      matchStatuses: new Set(),
    };
    if ((entry.title || "").length > (group.title || "").length) group.title = entry.title;
    if (!group.brand && entry.brand) group.brand = entry.brand;
    if (!group.category && entry.category) group.category = entry.category;
    if (entry.asin) group.asins.add(entry.asin);
    if (entry.sourceLink) group.sourceLinks.add(entry.sourceLink);
    if (entry.productId) group.matchedProductIds.add(entry.productId);
    if (entry.matchStatus) group.matchStatuses.add(entry.matchStatus);
    group.earned += numberValue(entry.amount);
    group.clicks += numberValue(entry.clicks);
    group.orders += numberValue(entry.orders);
    group.rows += 1;
    if (entry.date) {
      group.firstDate = !group.firstDate || entry.date < group.firstDate ? entry.date : group.firstDate;
      group.latestDate = !group.latestDate || entry.date > group.latestDate ? entry.date : group.latestDate;
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    asins: [...group.asins],
    sourceLinks: [...group.sourceLinks],
    matchStatuses: [...group.matchStatuses],
    matchedProducts: [...group.matchedProductIds]
      .map((id) => state.products.find((product) => product.id === id))
      .filter(Boolean),
  }));
}

function topProductGroupKey(entry) {
  const titleKey = normalizeText(entry.title);
  if (titleKey.length > 8) return `title:${titleKey}`;
  const asin = normalizeAsin(entry.asin);
  if (asin) return `asin:${asin}`;
  return "";
}

function sortTopProductRows(a, b) {
  const sort = state.topProductSort;
  if (sort === "orders") return b.orders - a.orders || b.earned - a.earned;
  if (sort === "clicks") return b.clicks - a.clicks || b.earned - a.earned;
  if (sort === "latest") return String(b.latestDate || "").localeCompare(String(a.latestDate || "")) || b.earned - a.earned;
  if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
  return b.earned - a.earned || b.orders - a.orders;
}

function topProductRow(group, rank) {
  const primaryAsin = group.asins[0] || "";
  const amazonLink = group.sourceLinks[0] || (primaryAsin ? `https://www.amazon.com/dp/${encodeURIComponent(primaryAsin)}` : "");
  const asinsLabel = group.asins.length > 1 ? `${primaryAsin} +${group.asins.length - 1} more` : primaryAsin || "No ASIN";
  const matchedLabel = group.matchedProducts.length
    ? group.matchedProducts.map((product) => product.title || product.asin || "Tracked product").join("; ")
    : "Not tracked as investment";
  const activity = group.firstDate && group.latestDate && group.firstDate !== group.latestDate
    ? `${group.firstDate} to ${group.latestDate}`
    : group.latestDate || group.firstDate || "No date";
  return `<tr>
    <td class="numeric rank-number">#${rank}</td>
    <td>
      <div class="product-title">${escapeHtml(group.title || "Imported product")}</div>
      <div class="product-sub">${escapeHtml(group.brand || "No brand")} · ${escapeHtml(asinsLabel)}${group.category ? ` · ${escapeHtml(group.category)}` : ""}</div>
      ${amazonLink ? `<div class="product-sub"><a href="${escapeHtml(amazonLink)}" target="_blank" rel="noreferrer">Open listing</a></div>` : ""}
    </td>
    <td class="numeric rank-stat">${money(group.earned)}</td>
    <td class="numeric">${group.orders || 0}</td>
    <td class="numeric">${group.clicks || 0}</td>
    <td class="numeric">${group.rows}</td>
    <td>${escapeHtml(activity)}</td>
    <td>
      <span class="${group.matchedProducts.length ? "status-pill" : "match-pill"}">${escapeHtml(group.matchedProducts.length ? "Investment" : "Not investment")}</span>
      <div class="product-sub">${escapeHtml(matchedLabel)}</div>
    </td>
  </tr>`;
}

function topProductSearchText(group) {
  return normalizeText(
    [
      group.title,
      group.brand,
      group.category,
      group.asins.join(" "),
      group.matchedProducts.map((product) => [product.title, product.asin, product.brand].join(" ")).join(" "),
    ].join(" ")
  );
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
  await repairExactTitleRevenueMatches();
  await repairSharedImportTitleRevenueMatches();
  await restoreActionableIgnoredRevenueRows();
  await excludeWeakRevenueMatches();
  render();
  toast("Product saved.");
}

async function deleteCurrentProduct() {
  const productId = $("#productId").value;
  if (!productId || !confirm("Delete this product and detach its revenue rows?")) return;
  await remove("products", productId);
  const affectedRevenue = state.revenueEntries.filter((entry) => entry.productId === productId);
  for (const entry of affectedRevenue) {
    await put("revenueEntries", { ...entry, productId: "", suggestedProductId: "", matchStatus: "ignored", matchScore: 0 });
  }
  $("#productDialog").close();
  await refreshState();
  render();
  toast("Product deleted. Revenue rows were excluded from match review.");
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
  $("#revenueProduct").innerHTML = productSelectOptions();
}

function productSelectOptions(selectedProductId = "") {
  return (
    `<option value="">Leave unmatched</option>` +
    state.products
      .map((product) => {
        const selected = product.id === selectedProductId ? " selected" : "";
        return `<option value="${product.id}"${selected}>${escapeHtml(product.title || product.asin || "Untitled product")}</option>`;
      })
      .join("")
  );
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
  state.pendingCsv = {
    fileName: file.name,
    fileHash: await hashText(text),
    rows,
    fallbackDate: inferReportDateFromFileName(file.name),
  };
  renderMappingWizard(file.name, rows);
}

function renderMappingWizard(fileName, rows) {
  const headers = Object.keys(rows[0]);
  const guesses = guessMappings(headers);
  const fallbackDate = state.pendingCsv?.fallbackDate || "";
  const options = [OPTIONAL_MAPPING, ...headers]
    .map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`)
    .join("");
  $("#mappingWizard").classList.remove("hidden");
  $("#mappingWizard").innerHTML = `
    <div>
      <h3>${escapeHtml(fileName)}</h3>
      <p class="muted">${rows.length} rows found. Confirm the column meanings before import.</p>
      <p class="muted"><strong>Preview only:</strong> the table below shows the first 5 rows, but all ${rows.length} rows will be imported.</p>
      ${
        fallbackDate
          ? `<p class="muted">Report date detected from filename: <strong>${escapeHtml(fallbackDate)}</strong></p>`
          : `<p class="muted">No report date found in the file. Rows will use today's date unless you map a date column.</p>`
      }
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
  const importButton = $("#runImportBtn");
  if (importButton) {
    importButton.disabled = true;
    importButton.textContent = "Importing...";
  }
  $("#importSummary").innerHTML = `<article class="rank-card">
    <strong>Importing CSV...</strong>
    <span>Saving rows now. Keep this tab open until the import complete message appears.</span>
  </article>`;
  try {
    const duplicateBatch = state.pendingCsv.fileHash
      ? state.importBatches.find((batch) => batch.fileHash && batch.fileHash === state.pendingCsv.fileHash)
      : null;
    if (duplicateBatch) {
      $("#importSummary").innerHTML = `<article class="rank-card rank-negative">
        <strong>Duplicate CSV blocked</strong>
        <span>${escapeHtml(state.pendingCsv.fileName)} already appears to have been imported on ${escapeHtml(formatDateTime(duplicateBatch.createdAt))}.</span>
        <span>No rows were imported. Use Clear CSV data or Remove duplicate CSV rows if you need to fix a past upload.</span>
      </article>`;
      toast("Duplicate CSV blocked. No rows were imported.");
      return;
    }
    const mapping = Object.fromEntries($$("[data-map]").map((select) => [select.dataset.map, select.value]));
    const batch = {
      id: crypto.randomUUID(),
      fileName: state.pendingCsv.fileName,
      fileHash: state.pendingCsv.fileHash || "",
      createdAt: new Date().toISOString(),
      mapping,
      reportDate: state.pendingCsv.fallbackDate || "",
      rowCount: state.pendingCsv.rows.length,
      rawRows: state.pendingCsv.rows,
    };
    await put("importBatches", batch);

    const importedFingerprints = new Set(state.revenueEntries.map(revenueFingerprint).filter(Boolean));
    const summary = { exact: 0, approved: 0, suggested: 0, unmatched: 0, ignored: 0, lookupOnly: 0, duplicate: 0 };
    const revenueRows = [];
    for (const row of state.pendingCsv.rows) {
      const normalized = normalizeImportRow(row, mapping, state.pendingCsv.fallbackDate);
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
      revenueRows.push({
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
    $("#importSummary").innerHTML = `<article class="rank-card">
      <strong>Saving ${revenueRows.length} earning row${revenueRows.length === 1 ? "" : "s"}...</strong>
      <span>Duplicates and empty earnings have already been skipped. Finalizing the import now.</span>
    </article>`;
    await putMany("revenueEntries", revenueRows);
    batch.summary = summary;
    await put("importBatches", batch);
    state.pendingCsv = null;
    $("#csvInput").value = "";
    $("#mappingWizard").classList.add("hidden");
    $("#mappingWizard").innerHTML = "";
    $("#importSummary").innerHTML = `<article class="rank-card">
      <strong>Import complete</strong>
      <span>Money column: ${escapeHtml(mapping.amount || "Not mapped")} · Report date: ${escapeHtml(batch.reportDate || "mapped/default")}</span>
      <span>Rows found: ${batch.rowCount} · Rows imported: ${summary.exact + summary.approved + summary.suggested + summary.unmatched + summary.ignored} · Empty/no earnings skipped: ${summary.lookupOnly}</span>
      <span>Exact: ${summary.exact} · Approved: ${summary.approved} · Suggested: ${summary.suggested} · Review unmatched: ${summary.unmatched} · Ignored generic/noise: ${summary.ignored} · Duplicates skipped: ${summary.duplicate}</span>
    </article>`;
    await refreshState();
    await repairExactTitleRevenueMatches();
    await repairSharedImportTitleRevenueMatches();
    await restoreActionableIgnoredRevenueRows();
    await excludeWeakRevenueMatches();
    render();
    toast("CSV import complete.");
  } catch (error) {
    console.error("CSV import failed", error);
    $("#importSummary").innerHTML = `<article class="rank-card rank-negative">
      <strong>CSV import failed</strong>
      <span>${escapeHtml(error?.message || "Something went wrong while saving the CSV.")}</span>
      <span>No need to guess. Try again, or export a backup before troubleshooting.</span>
    </article>`;
    toast("CSV import failed. See the import summary.");
  } finally {
    if (state.pendingCsv && importButton) {
      importButton.disabled = false;
      importButton.textContent = "Import rows";
    }
  }
}

function renderImportHistory() {
  const target = $("#importHistory");
  if (!target) return;
  const batches = [...state.importBatches].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!batches.length) {
    target.innerHTML = emptyState("No CSV files imported yet.", "Uploaded weekly earnings files will show here.");
    return;
  }
  target.innerHTML = batches
    .map((batch) => {
      const importedRows = state.revenueEntries.filter((entry) => entry.importBatchId === batch.id).length;
      const duplicateCount = numberValue(batch.summary?.duplicate);
      const ignoredCount = numberValue(batch.summary?.ignored);
      return `<article class="import-history-card">
        <div>
          <strong>${escapeHtml(batch.fileName || "Imported CSV")}</strong>
          <span>${escapeHtml(formatDateTime(batch.createdAt))}</span>
        </div>
        <dl>
          <div><dt>Report date</dt><dd>${escapeHtml(batch.reportDate || "Mapped/default")}</dd></div>
          <div><dt>Money column</dt><dd>${escapeHtml(batch.mapping?.amount || "Not mapped")}</dd></div>
          <div><dt>Rows found</dt><dd>${numberValue(batch.rowCount)}</dd></div>
          <div><dt>Rows imported</dt><dd>${importedRows}</dd></div>
          <div><dt>Ignored generic/noise</dt><dd>${ignoredCount}</dd></div>
          <div><dt>Duplicates skipped</dt><dd>${duplicateCount}</dd></div>
        </dl>
      </article>`;
    })
    .join("");
}

function normalizeImportRow(row, mapping, fallbackDate = "") {
  const pick = (key) => (mapping[key] && mapping[key] !== OPTIONAL_MAPPING ? row[mapping[key]] || "" : "");
  return {
    asin: normalizeAsin(pick("asin")),
    title: pick("title").trim(),
    brand: pick("brand").trim(),
    category: pick("category").trim(),
    price: parseMoney(pick("price")),
    date: normalizeDate(pick("date")) || fallbackDate || new Date().toISOString().slice(0, 10),
    amount: parseMoney(pick("amount")),
    clicks: numberValue(pick("clicks")),
    orders: numberValue(pick("orders")),
    sourceLink: pick("sourceLink").trim(),
  };
}

function revenueFingerprint(row = {}) {
  const amount = numberValue(row.amount);
  if (!row.date || !amount) return row.fingerprint || "";
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

  const exactTitle = findExactTitleProduct(row);
  if (exactTitle) return { productId: exactTitle.id, suggestedProductId: "", matchStatus: "exact", matchScore: 1 };

  const approved = state.approvedMatches.find((match) => {
    const asinHit = row.asin && match.asin === row.asin;
    const titleHit = normalizeText(match.title) && normalizeText(match.title) === normalizeText(row.title);
    return asinHit || titleHit;
  });
  if (approved) return { productId: approved.productId, suggestedProductId: "", matchStatus: "approved", matchScore: 1 };

  const best = bestProductMatch(row);
  if (best?.score >= MATCH_SUGGESTION_MIN_SCORE) {
    return {
      productId: "",
      suggestedProductId: best.product.id,
      matchStatus: "suggested",
      matchScore: best.score,
    };
  }
  if (!best?.score || best.score < MATCH_REVIEW_MIN_SCORE) {
    if (!hasActionableImportIdentity(row)) {
      return { productId: "", suggestedProductId: "", matchStatus: "ignored", matchScore: 0 };
    }
    return { productId: "", suggestedProductId: best?.product?.id || "", matchStatus: "unmatched", matchScore: best?.score || 0 };
  }
  return { productId: "", suggestedProductId: best?.product?.id || "", matchStatus: "unmatched", matchScore: best?.score || 0 };
}

function hasActionableImportIdentity(row = {}) {
  if (isLikelyAsin(row.asin)) return true;
  const title = normalizeText(row.title);
  return title.length > 2 && !GENERIC_IMPORT_LABELS.has(title);
}

function isLikelyAsin(value = "") {
  return /^[A-Z0-9]{10}$/.test(normalizeAsin(value));
}

function findExactTitleProduct(row) {
  const rowTitle = normalizeText(row.title);
  if (!rowTitle) return null;
  return state.products.find((product) => normalizeText(product.title) === rowTitle) || null;
}

function bestProductMatch(row) {
  return state.products
    .map((product) => ({ product, score: fuzzyScore(row, product) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0];
}

function fuzzyScore(row, product) {
  const brandScore = brandMatchScore(row, product);
  const titleScore = tokenSimilarity(row.title, product.title) * 0.62;
  const asinPenalty = row.asin && product.asin && row.asin !== product.asin ? -0.03 : 0;
  const categoryBoost = row.title && product.category && normalizeText(row.title).includes(normalizeText(product.category)) ? 0.04 : 0;
  return Math.max(0, brandScore + titleScore + categoryBoost + asinPenalty);
}

function brandMatchScore(row, product) {
  const importedBrand = normalizeText(row.brand);
  const productBrand = normalizeText(product.brand);
  if (importedBrand && productBrand && importedBrand === productBrand) return 0.35;
  const importedTitleBrand = likelyTitleBrand(row.title);
  const productTitleBrand = likelyTitleBrand(product.title);
  if (productBrand && importedTitleBrand && importedTitleBrand === productBrand) return 0.24;
  if (importedTitleBrand && productTitleBrand && importedTitleBrand === productTitleBrand) return 0.2;
  return 0;
}

function likelyTitleBrand(title = "") {
  const firstToken = normalizeText(title).split(" ").find(Boolean) || "";
  const generic = new Set(["the", "new", "small", "large", "mini", "digital", "wireless", "portable", "handheld", "smart"]);
  return firstToken && !generic.has(firstToken) ? firstToken : "";
}

function renderMatchQueue() {
  const waiting = matchReviewRows();
  $("#matchQueue").innerHTML = waiting.length
    ? waiting.map(matchCard).join("")
    : emptyState(
        state.matchSearch ? "No imported rows match that search." : "No imported revenue rows are waiting for review.",
        "Generic rows such as others stay ignored, but vague campaign rows with real titles or ASINs wait here."
      );
  $("#massUnmatchBtn").disabled = !waiting.length;
  $$("#matchQueue [data-approve]").forEach((button) => {
    button.addEventListener("click", () => approveMatch(button.dataset.approve));
  });
  $$("#matchQueue [data-assign]").forEach((button) => {
    button.addEventListener("click", () => assignMatch(button.dataset.assign));
  });
  $$("#matchQueue [data-reject]").forEach((button) => {
    button.addEventListener("click", () => rejectMatch(button.dataset.reject));
  });
}

function matchReviewRows() {
  const query = normalizeText(state.matchSearch);
  return state.revenueEntries
    .filter((entry) => ["suggested", "unmatched"].includes(entry.matchStatus))
    .filter((entry) => matchReviewText(entry).includes(query))
    .sort((a, b) => {
      const scoreSort = reviewMatchScore(b) - reviewMatchScore(a);
      if (scoreSort) return scoreSort;
      return numberValue(b.amount) - numberValue(a.amount);
    });
}

function matchCard(entry) {
  const candidate = reviewMatchCandidate(entry);
  const product = candidate?.product || null;
  const selectedProductId = product?.id || "";
  const candidateScore = candidate?.score || 0;
  const isSuggested = entry.matchStatus === "suggested";
  const hasPossibleMatch = product && candidateScore > 0;
  return `<article class="match-card">
    <div><span class="match-pill">${
      isSuggested
        ? `${Math.round(candidateScore * 100)}% suggested`
        : hasPossibleMatch
          ? `${Math.round(candidateScore * 100)}% possible`
          : "Unmatched"
    }</span></div>
    <strong>${escapeHtml(entry.title || entry.asin || "Imported revenue row")}</strong>
    <span class="muted">Imported: ${escapeHtml(entry.brand || "No brand")} · ${escapeHtml(entry.asin || "No ASIN")} · ${money(entry.amount)} · ${entry.date || ""}</span>
    ${
      hasPossibleMatch
        ? `<span>Likeliest product: <strong>${escapeHtml(product?.title || "Missing product")}</strong></span>
           <span class="muted">${escapeHtml(product?.brand || "No brand")} · ${escapeHtml(product?.asin || "No ASIN")}</span>`
        : `<span class="muted">No confident product match was found. Pick the correct product below if this row belongs to one.</span>`
    }
    <label class="match-assign-label">Assign to product
      <select data-match-product="${entry.id}">${productSelectOptions(selectedProductId)}</select>
    </label>
    <div class="row-actions">
      ${isSuggested ? `<button class="primary-btn" data-approve="${entry.id}" type="button">Approve suggestion</button>` : ""}
      <button class="secondary-btn" data-assign="${entry.id}" type="button">Assign selected product</button>
      <button class="secondary-btn" data-reject="${entry.id}" type="button">Reject</button>
    </div>
  </article>`;
}

function matchReviewText(entry) {
  const suggestedProduct = reviewMatchCandidate(entry)?.product;
  return normalizeText(
    [
      entry.title,
      entry.asin,
      entry.brand,
      entry.date,
      entry.amount,
      suggestedProduct?.title,
      suggestedProduct?.asin,
      suggestedProduct?.brand,
    ].join(" ")
  );
}

function reviewMatchCandidate(entry) {
  const storedProduct = state.products.find((product) => product.id === entry.suggestedProductId);
  if (storedProduct) return { product: storedProduct, score: numberValue(entry.matchScore) };
  return bestProductMatch(entry);
}

function reviewMatchScore(entry) {
  return reviewMatchCandidate(entry)?.score || 0;
}

function renderRevenueAudit() {
  const target = $("#revenueAudit");
  if (!target) return;
  const query = normalizeText(state.revenueAuditSearch);
  const imported = state.revenueEntries
    .filter((entry) => entry.source === "csv")
    .filter((entry) => state.showIgnoredAuditRows || entry.matchStatus !== "ignored")
    .filter((entry) => revenueAuditText(entry).includes(query))
    .sort((a, b) => {
      const dateSort = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateSort) return dateSort;
      return numberValue(b.amount) - numberValue(a.amount);
    });
  if (!imported.length) {
    target.innerHTML = emptyState(
      state.revenueAuditSearch ? "No imported revenue rows match that search." : "No imported revenue rows yet.",
      state.showIgnoredAuditRows
        ? "Upload CSV earnings files to populate this audit list."
        : "Ignored rows are hidden. Turn on Show ignored rows if you want to inspect them."
    );
    return;
  }
  target.innerHTML = imported.map(revenueAuditCard).join("");
  $$("#revenueAudit [data-audit-assign]").forEach((button) => {
    button.addEventListener("click", () => reassignRevenueEntry(button.dataset.auditAssign));
  });
  $$("#revenueAudit [data-audit-unmatch]").forEach((button) => {
    button.addEventListener("click", () => unmatchRevenueEntry(button.dataset.auditUnmatch));
  });
}

function revenueAuditCard(entry) {
  const matchedProduct = state.products.find((product) => product.id === entry.productId);
  const suggestedProduct = state.products.find((product) => product.id === entry.suggestedProductId);
  const batch = state.importBatches.find((item) => item.id === entry.importBatchId);
  const productForSelect = entry.productId || entry.suggestedProductId || "";
  return `<article class="match-card revenue-audit-card">
    <div class="audit-card-topline">
      <span class="match-pill">${escapeHtml(titleCase(entry.matchStatus || "unmatched"))}</span>
      <strong>${money(entry.amount)}</strong>
    </div>
    <strong>${escapeHtml(entry.title || entry.asin || "Imported revenue row")}</strong>
    <span class="muted">Imported: ${escapeHtml(entry.asin || "No ASIN")} · ${entry.date || "No date"} · ${escapeHtml(batch?.fileName || "Unknown CSV")}</span>
    <span>Current product: <strong>${escapeHtml(matchedProduct?.title || "Not counted toward a product")}</strong></span>
    ${suggestedProduct ? `<span class="muted">Suggested product: ${escapeHtml(suggestedProduct.title || suggestedProduct.asin || "Untitled product")}</span>` : ""}
    <label class="match-assign-label">Move/count this row under product
      <select data-audit-product="${entry.id}">${productSelectOptions(productForSelect)}</select>
    </label>
    <div class="row-actions">
      <button class="secondary-btn" data-audit-assign="${entry.id}" type="button">Assign selected product</button>
      <button class="ghost-btn" data-audit-unmatch="${entry.id}" type="button">Leave unmatched</button>
    </div>
  </article>`;
}

function revenueAuditText(entry) {
  const matchedProduct = state.products.find((product) => product.id === entry.productId);
  const suggestedProduct = state.products.find((product) => product.id === entry.suggestedProductId);
  const batch = state.importBatches.find((item) => item.id === entry.importBatchId);
  return normalizeText(
    [
      entry.title,
      entry.asin,
      entry.brand,
      entry.date,
      entry.amount,
      entry.matchStatus,
      matchedProduct?.title,
      matchedProduct?.asin,
      matchedProduct?.brand,
      suggestedProduct?.title,
      suggestedProduct?.asin,
      suggestedProduct?.brand,
      batch?.fileName,
    ].join(" ")
  );
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

async function assignMatch(entryId) {
  const entry = state.revenueEntries.find((item) => item.id === entryId);
  const productId = $(`[data-match-product="${entryId}"]`)?.value || "";
  if (!entry || !productId) {
    toast("Choose a product first.");
    return;
  }
  await put("revenueEntries", { ...entry, productId, suggestedProductId: "", matchStatus: "approved", matchScore: 1 });
  await put("approvedMatches", {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    productId,
    asin: entry.asin,
    title: entry.title,
    brand: entry.brand,
  });
  await refreshState();
  render();
  toast("Revenue row assigned and ROI updated.");
}

async function reassignRevenueEntry(entryId) {
  const entry = state.revenueEntries.find((item) => item.id === entryId);
  const productId = $(`[data-audit-product="${entryId}"]`)?.value || "";
  if (!entry || !productId) {
    toast("Choose a product first.");
    return;
  }
  await put("revenueEntries", { ...entry, productId, suggestedProductId: "", matchStatus: "approved", matchScore: 1 });
  await put("approvedMatches", {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    productId,
    asin: entry.asin,
    title: entry.title,
    brand: entry.brand,
  });
  await refreshState();
  render();
  toast("Revenue row assigned and ROI updated.");
}

async function unmatchRevenueEntry(entryId) {
  const entry = state.revenueEntries.find((item) => item.id === entryId);
  if (!entry) return;
  await put("revenueEntries", { ...entry, productId: "", suggestedProductId: "", matchStatus: "ignored", matchScore: 0 });
  await refreshState();
  render();
  toast("Revenue row excluded from match review.");
}

async function rejectMatch(entryId) {
  const entry = state.revenueEntries.find((item) => item.id === entryId);
  if (!entry) return;
  await put("revenueEntries", { ...entry, matchStatus: "rejected", productId: "", suggestedProductId: "" });
  await refreshState();
  render();
  toast("Suggested match rejected.");
}

async function massUnmatchReviewRows() {
  const rows = matchReviewRows();
  if (!rows.length) {
    toast("No review rows to unmatch.");
    return;
  }
  const searchNote = state.matchSearch ? " matching your current search" : "";
  if (!confirm(`Mass unmatch ${rows.length} review row${rows.length === 1 ? "" : "s"}${searchNote}? They will be removed from Match Review but stay searchable in the revenue audit.`)) {
    return;
  }
  for (const entry of rows) {
    await put("revenueEntries", {
      ...entry,
      productId: "",
      suggestedProductId: "",
      matchStatus: "ignored",
      matchScore: 0,
    });
  }
  await refreshState();
  render();
  toast(`Mass unmatched ${rows.length} row${rows.length === 1 ? "" : "s"}.`);
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

async function clearImportedRevenue() {
  const csvRevenue = state.revenueEntries.filter((entry) => entry.source === "csv");
  if (!csvRevenue.length && !state.importBatches.length) {
    toast("No CSV imports to clear.");
    return;
  }
  if (!confirm("Clear imported CSV revenue rows and CSV import history? Products, videos, costs, manual revenue, and approved matches will stay.")) return;
  const clearButton = $("#clearImportedRevenueBtn");
  const dedupeButton = $("#dedupeCsvRevenueBtn");
  clearButton.disabled = true;
  dedupeButton.disabled = true;
  clearButton.textContent = "Clearing...";
  $("#importSummary").innerHTML = `<article class="rank-card">
    <strong>Clearing CSV data...</strong>
    <span>Removing ${csvRevenue.length} imported revenue row${csvRevenue.length === 1 ? "" : "s"} and ${state.importBatches.length} import histor${state.importBatches.length === 1 ? "y" : "ies"}. Products will stay.</span>
  </article>`;
  try {
    await removeMany("revenueEntries", csvRevenue.map((entry) => entry.id));
    await removeMany("importBatches", state.importBatches.map((batch) => batch.id));
    state.pendingCsv = null;
    $("#csvInput").value = "";
    $("#mappingWizard").classList.add("hidden");
    $("#mappingWizard").innerHTML = "";
    await refreshState();
    render();
    $("#importSummary").innerHTML = `<article class="rank-card">
      <strong>CSV data cleared</strong>
      <span>Removed ${csvRevenue.length} imported revenue row${csvRevenue.length === 1 ? "" : "s"} and ${state.importBatches.length} import histor${state.importBatches.length === 1 ? "y" : "ies"}.</span>
      <span>Products, videos, costs, manual revenue, and approved matches were kept.</span>
    </article>`;
    toast("CSV data cleared. Products and manual entries were kept.");
  } catch (error) {
    console.error("CSV clear failed", error);
    $("#importSummary").innerHTML = `<article class="rank-card rank-negative">
      <strong>Clear CSV data failed</strong>
      <span>${escapeHtml(error?.message || "Something went wrong while clearing CSV data.")}</span>
    </article>`;
    toast("Clear CSV data failed. See the import summary.");
  } finally {
    clearButton.disabled = false;
    dedupeButton.disabled = false;
    clearButton.textContent = "Clear CSV data (keep products)";
  }
}

async function removeDuplicateCsvRevenueRows() {
  const seen = new Map();
  const duplicates = [];
  const csvRevenue = state.revenueEntries
    .filter((entry) => entry.source === "csv")
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  for (const entry of csvRevenue) {
    const fingerprint = revenueFingerprint(entry);
    if (!fingerprint) continue;
    if (seen.has(fingerprint)) {
      duplicates.push(entry);
    } else {
      seen.set(fingerprint, entry.id);
    }
  }
  if (!duplicates.length) {
    toast("No duplicate CSV rows found.");
    return;
  }
  if (!confirm(`Remove ${duplicates.length} duplicate CSV revenue row${duplicates.length === 1 ? "" : "s"}? Products and the first copy of each row will be kept.`)) return;
  const dedupeButton = $("#dedupeCsvRevenueBtn");
  const clearButton = $("#clearImportedRevenueBtn");
  dedupeButton.disabled = true;
  clearButton.disabled = true;
  dedupeButton.textContent = "Removing...";
  $("#importSummary").innerHTML = `<article class="rank-card">
    <strong>Removing duplicate CSV rows...</strong>
    <span>Removing ${duplicates.length} duplicate row${duplicates.length === 1 ? "" : "s"} while keeping the first copy.</span>
  </article>`;
  try {
    await removeMany("revenueEntries", duplicates.map((entry) => entry.id));
    await refreshState();
    render();
    $("#importSummary").innerHTML = `<article class="rank-card">
      <strong>Duplicate CSV rows removed</strong>
      <span>Removed ${duplicates.length} duplicate row${duplicates.length === 1 ? "" : "s"} and kept the first copy of each imported earning row.</span>
    </article>`;
    toast(`Removed ${duplicates.length} duplicate CSV row${duplicates.length === 1 ? "" : "s"}.`);
  } catch (error) {
    console.error("Duplicate CSV cleanup failed", error);
    $("#importSummary").innerHTML = `<article class="rank-card rank-negative">
      <strong>Duplicate cleanup failed</strong>
      <span>${escapeHtml(error?.message || "Something went wrong while removing duplicate CSV rows.")}</span>
    </article>`;
    toast("Duplicate cleanup failed. See the import summary.");
  } finally {
    dedupeButton.disabled = false;
    clearButton.disabled = false;
    dedupeButton.textContent = "Remove duplicate CSV rows";
  }
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
  const delimiter = detectDelimiter(text);
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
    } else if (char === delimiter && !quoted) {
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

function detectDelimiter(text = "") {
  const sample = String(text).split(/\r?\n/).find((line) => line.trim()) || "";
  const candidates = [",", "\t", ";"];
  const counts = Object.fromEntries(candidates.map((candidate) => [candidate, 0]));
  let quoted = false;
  for (let index = 0; index < sample.length; index += 1) {
    const char = sample[index];
    const next = sample[index + 1];
    if (char === '"' && quoted && next === '"') {
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && candidates.includes(char)) {
      counts[char] += 1;
    }
  }
  return candidates.sort((a, b) => counts[b] - counts[a])[0] || ",";
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
    amount: findAmountHeader(headers),
    clicks: find("clicks"),
    orders: find("orders", "items shipped", "shipped items"),
    sourceLink: find("amazon link", "url", "link"),
  };
}

function findAmountHeader(headers) {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeText(header) }));
  const priority = [
    "total earnings",
    "commission earned",
    "commissions earned",
    "shipped earnings",
    "earnings",
    "fees",
    "income",
  ];
  for (const needle of priority) {
    const exact = normalizedHeaders.find(({ normalized }) => normalized === needle);
    if (exact) return exact.header;
  }
  for (const needle of priority) {
    const partial = normalizedHeaders.find(({ normalized }) => {
      if (!normalized.includes(needle)) return false;
      if (normalized.includes("rate") || normalized.includes("revenue") || normalized.includes("returned")) return false;
      return true;
    });
    if (partial) return partial.header;
  }
  return OPTIONAL_MAPPING;
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

function inferReportDateFromFileName(fileName = "") {
  const text = String(fileName).replace(/[_-]+/g, " ");
  const isoDates = String(fileName).match(/20\d{2}[-_]\d{1,2}[-_]\d{1,2}/g);
  if (isoDates?.length) return normalizeDate(isoDates.at(-1).replaceAll("_", "-"));

  const monthNames = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const currentYear = new Date().getFullYear();
  const baseYear = yearMatch ? Number(yearMatch[1]) : currentYear;
  const monthPattern = Object.keys(monthNames).join("|");
  const namedRange = text.match(
    new RegExp(`\\b(${monthPattern})\\w*\\s+(\\d{1,2})\\s*(?:to|through|thru)\\s*(?:(${monthPattern})\\w*\\s+)?(\\d{1,2})\\b`, "i")
  );
  if (namedRange) {
    const startMonth = monthNames[namedRange[1].toLowerCase().slice(0, 3)] || monthNames[namedRange[1].toLowerCase()];
    const endMonth = namedRange[3]
      ? monthNames[namedRange[3].toLowerCase().slice(0, 3)] || monthNames[namedRange[3].toLowerCase()]
      : startMonth;
    const year = endMonth < startMonth ? baseYear + 1 : baseYear;
    return dateFromParts(year, endMonth, Number(namedRange[4]));
  }

  const numericRange = text.match(/\b(\d{1,2})[./](\d{1,2})\s*(?:to|through|thru)\s*(?:(\d{1,2})[./])?(\d{1,2})\b/i);
  if (numericRange) {
    const startMonth = Number(numericRange[1]);
    const endMonth = Number(numericRange[3] || numericRange[1]);
    const year = endMonth < startMonth ? baseYear + 1 : baseYear;
    return dateFromParts(year, endMonth, Number(numericRange[4]));
  }

  return "";
}

function dateFromParts(year, month, day) {
  if (!year || !month || !day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toMonth(date) {
  return date ? String(date).slice(0, 7) : "";
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMonth(month) {
  const [year, monthNumber] = month.split("-");
  return `${monthNumber}/${year.slice(2)}`;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numberValue(value));
}

async function hashText(value = "") {
  const text = String(value || "");
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return `fallback-${hash.toString(16)}-${text.length}`;
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
