(function initAipContentScript() {
  const DASHBOARD_URL = "https://aip-investment-dashboard-tracker.vercel.app";

  const state = {
    visible: false,
    product: null,
    user: null,
  };

  function pageAdapter() {
    return {
      title: document.title,
      locationHref: window.location.href,
      text(selector) {
        return document.querySelector(selector)?.textContent || "";
      },
      attr(selector, attribute) {
        return document.querySelector(selector)?.getAttribute(attribute) || "";
      },
      allText(selector) {
        return Array.from(document.querySelectorAll(selector)).map((node) => node.textContent || "");
      },
      detail(label) {
        const normalizedLabel = AipProductCore.cleanText(label).toLowerCase();
        const rows = document.querySelectorAll(
          "#productOverview_feature_div tr,#prodDetails tr,#productDetails_techSpec_section_1 tr,#productDetails_detailBullets_sections1 tr"
        );

        for (const row of rows) {
          const heading = AipProductCore.cleanText(
            row.querySelector("th,.a-span3,.prodDetSectionEntry")?.textContent || ""
          ).replace(/[:\s]+$/g, "");
          const value = AipProductCore.cleanText(
            row.querySelector("td,.a-span9,.prodDetAttrValue")?.textContent || ""
          );

          if (heading.toLowerCase() === normalizedLabel && value) {
            return value;
          }
        }

        const bullets = document.querySelectorAll("#detailBullets_feature_div li,#detailBulletsWrapper_feature_div li");
        for (const bullet of bullets) {
          const text = AipProductCore.cleanText(bullet.textContent || "");
          const parts = text.split(":");
          if (parts.length >= 2 && AipProductCore.cleanText(parts[0]).toLowerCase() === normalizedLabel) {
            return AipProductCore.cleanText(parts.slice(1).join(":"));
          }
        }

        return "";
      },
    };
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
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

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function productField(label, value) {
    const displayValue = value || "Not detected";
    return `
      <div class="aip-field">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(displayValue)}</strong>
      </div>
    `;
  }

  async function refreshSession() {
    const response = await sendMessage({ type: "AIP_GET_SESSION" });
    state.user = response?.ok ? response.user || null : null;
    return response;
  }

  function extractCurrentProduct() {
    state.product = AipProductCore.extractAmazonProduct(pageAdapter());
    return state.product;
  }

  function render() {
    const root = ensureRoot();
    if (!state.visible) {
      root.innerHTML = "";
      return;
    }

    const product = state.product || extractCurrentProduct();
    const statusMessage = state.user
      ? `Signed in as ${state.user.email || "dashboard user"}`
      : "Sign in to save this product.";

    root.innerHTML = `
      <section class="aip-panel" role="dialog" aria-label="AIP Product Capture">
        <div class="aip-panel-header">
          <div>
            <span class="aip-eyebrow">AIP Portfolio</span>
            <h2>Save as bought</h2>
          </div>
          <button class="aip-icon-button" id="aipCloseButton" type="button" aria-label="Close">x</button>
        </div>
        <div class="aip-status" id="aipStatus" role="status">${escapeHtml(statusMessage)}</div>
        ${state.user ? renderProductForm(product) : renderSignInForm()}
      </section>
    `;

    bindPanelEvents();
  }

  function renderSignInForm() {
    return `
      <form class="aip-stack" id="aipSignInForm">
        <label for="aipEmail">Email</label>
        <input id="aipEmail" type="email" autocomplete="email" required>
        <label for="aipPassword">Password</label>
        <input id="aipPassword" type="password" autocomplete="current-password" required>
        <button class="aip-primary" type="submit">Sign in</button>
        <a class="aip-dashboard-link" href="${DASHBOARD_URL}" target="_blank" rel="noreferrer">Open Dashboard</a>
      </form>
    `;
  }

  function renderProductForm(product) {
    const priceValue = product.amazonPrice ? product.amazonPrice.toFixed(2) : "";
    const amazonPrice = priceValue ? `$${priceValue}` : "";
    const purchaseDate = AipProductCore.todayInputValue();
    const missingAsin = !product.asin;

    return `
      <div class="aip-product-summary">
        ${productField("Title", product.title)}
        ${productField("ASIN", product.asin)}
        ${productField("Brand", product.brand)}
        ${productField("Category", product.category)}
        ${productField("Amazon price", amazonPrice)}
      </div>
      <form class="aip-stack" id="aipSaveForm">
        <label for="aipPurchasePrice">Purchase price</label>
        <input id="aipPurchasePrice" type="number" min="0" step="0.01" value="${escapeHtml(priceValue)}">
        <label for="aipPurchaseDate">Purchase date</label>
        <input id="aipPurchaseDate" type="date" value="${escapeHtml(purchaseDate)}" required>
        <button class="aip-primary" type="submit"${missingAsin ? " disabled" : ""}>Save as bought</button>
        ${missingAsin ? '<p class="aip-error">ASIN was not detected. Open the Amazon product detail page and try again.</p>' : ""}
        <button class="aip-secondary" id="aipOpenDashboardButton" type="button">Open dashboard</button>
      </form>
    `;
  }

  function bindPanelEvents() {
    document.getElementById("aipCloseButton")?.addEventListener("click", () => {
      state.visible = false;
      render();
    });

    document.getElementById("aipOpenDashboardButton")?.addEventListener("click", () => {
      window.open(DASHBOARD_URL, "_blank", "noopener");
    });

    document.getElementById("aipSignInForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("Signing in...");

      const response = await sendMessage({
        type: "AIP_SIGN_IN",
        email: document.getElementById("aipEmail").value,
        password: document.getElementById("aipPassword").value,
      });

      if (!response?.ok) {
        setStatus(response?.error || "Sign in failed.", true);
        return;
      }

      state.user = response.user || null;
      render();
    });

    document.getElementById("aipSaveForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!state.product?.asin) {
        setStatus("ASIN was not detected. Open the Amazon product detail page and try again.", true);
        return;
      }

      setStatus("Saving...");
      const response = await sendMessage({
        type: "AIP_SAVE_BOUGHT_PRODUCT",
        product: state.product,
        purchasePrice: document.getElementById("aipPurchasePrice").value,
        purchaseDate: document.getElementById("aipPurchaseDate").value,
      });

      if (!response?.ok) {
        setStatus(response?.error || "Save failed.", true);
        return;
      }

      setStatus(response.updated ? "Updated existing product in AIP Dashboard." : "Saved to AIP Dashboard.");
    });
  }

  function setStatus(message, isError) {
    const status = document.getElementById("aipStatus");
    if (!status) {
      return;
    }
    status.textContent = message;
    status.classList.toggle("aip-status-error", Boolean(isError));
  }

  async function toggleOverlay() {
    state.visible = !state.visible;

    if (state.visible) {
      extractCurrentProduct();
      await refreshSession();
    }

    render();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "AIP_TOGGLE_OVERLAY") {
      return undefined;
    }

    toggleOverlay().then(() => sendResponse({ ok: true }));
    return true;
  });
})();
