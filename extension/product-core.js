(function () {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeAsin(value) {
    const text = cleanText(value).toUpperCase();
    const match = text.match(/[A-Z0-9]{10}/);
    return match ? match[0] : "";
  }

  function parseMoney(value) {
    const text = cleanText(value).replace(/,/g, "");
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function extractAsinFromInput(adapter) {
    const inputAsin = adapter && typeof adapter.attr === "function"
      ? adapter.attr('input[name="ASIN"]', "value")
      : "";
    if (inputAsin) return normalizeAsin(inputAsin);

    const href = adapter && adapter.locationHref;
    const fromUrl = cleanText(href).match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    return fromUrl ? normalizeAsin(fromUrl[1]) : "";
  }

  function cleanAmazonTitle(value) {
    return cleanText(value).replace(/^Amazon\.com:\s*/i, "");
  }

  function cleanBrandName(value) {
    return cleanText(value)
      .replace(/^Visit the\s+/i, "")
      .replace(/\s+Store$/i, "")
      .replace(/^Brand:\s*/i, "");
  }

  function todayInputValue(date) {
    const value = date || new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function extractAmazonProduct(adapter) {
    const text = typeof adapter.text === "function" ? adapter.text.bind(adapter) : () => "";
    const attr = typeof adapter.attr === "function" ? adapter.attr.bind(adapter) : () => "";
    const allText = typeof adapter.allText === "function" ? adapter.allText.bind(adapter) : () => [];
    const detail = typeof adapter.detail === "function" ? adapter.detail.bind(adapter) : () => "";
    const breadcrumbs = allText("#wayfinding-breadcrumbs_feature_div a,.a-breadcrumb a").map(cleanText).filter(Boolean);

    return {
      asin: extractAsinFromInput(adapter),
      title: cleanAmazonTitle(text("#productTitle") || adapter.title),
      brand: cleanBrandName(detail("Brand") || text("#bylineInfo")),
      category: breadcrumbs[breadcrumbs.length - 1] || "",
      amazonPrice: parseMoney(text("#corePrice_feature_div .a-price .a-offscreen")),
      amazonLink: cleanText(attr('link[rel="canonical"]', "href") || adapter.locationHref),
    };
  }

  function buildBoughtProductRecord(captured, options) {
    const source = captured || {};
    const settings = options || {};
    const existing = settings.existingProduct || {};
    const asin = normalizeAsin(source.asin);
    const nowIso = settings.nowIso || new Date().toISOString();
    const hasPurchasePrice = Object.prototype.hasOwnProperty.call(settings, "purchasePrice");

    if (!asin) {
      throw new Error("ASIN is required");
    }

    return {
      ...existing,
      ...source,
      asin,
      id: existing.id || `asin-${asin}`,
      createdAt: existing.createdAt || nowIso,
      updatedAt: nowIso,
      status: "bought",
      purchaseDate: settings.purchaseDate || todayInputValue(),
      purchasePrice: hasPurchasePrice ? parseMoney(settings.purchasePrice) : Number(source.amazonPrice || 0),
      tax: Number(existing.tax || 0),
      shipping: Number(existing.shipping || 0),
      discounts: Number(existing.discounts || 0),
      refunds: Number(existing.refunds || 0),
      resaleAmount: Number(existing.resaleAmount || 0),
      videoStatus: source.videoStatus || existing.videoStatus || "not filmed",
      notes: existing.notes || source.notes || "",
      storefrontLink: existing.storefrontLink || source.storefrontLink || "",
      videos: Array.isArray(existing.videos) ? existing.videos : (Array.isArray(source.videos) ? source.videos : []),
      resaleDate: existing.resaleDate || source.resaleDate || "",
      filmedDate: existing.filmedDate || source.filmedDate || "",
      postedDate: existing.postedDate || source.postedDate || "",
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

  globalThis.AipProductCore = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
