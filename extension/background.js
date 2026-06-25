importScripts("supabase-api.js", "product-core.js");

const SESSION_KEY = "aipSupabaseSession";
const SESSION_REFRESH_WINDOW_MS = 60 * 1000;

function getStoredSession() {
  return chrome.storage.local.get(SESSION_KEY).then((items) => items[SESSION_KEY] || null);
}

function setStoredSession(session) {
  return chrome.storage.local.set({ [SESSION_KEY]: session });
}

function clearStoredSession() {
  return chrome.storage.local.remove(SESSION_KEY);
}

async function getFreshSession() {
  const session = await getStoredSession();
  if (!session) {
    return null;
  }

  const expiresAt = Number(session.expires_at || 0);
  if (expiresAt && expiresAt - Date.now() > SESSION_REFRESH_WINDOW_MS) {
    return session;
  }

  if (!session.refresh_token) {
    await clearStoredSession();
    return null;
  }

  try {
    const refreshedSession = await AipSupabaseApi.refreshSession(session.refresh_token);
    await setStoredSession(refreshedSession);
    return refreshedSession;
  } catch (error) {
    await clearStoredSession();
    return null;
  }
}

function publicUser(session) {
  return session && session.user ? session.user : null;
}

function sendResponseFromPromise(sendResponse, work) {
  work()
    .then((payload) => sendResponse(payload))
    .catch((error) => sendResponse({ ok: false, error: error.message || "Extension request failed." }));
}

function requireSession(session) {
  if (!session || !session.user || !session.user.id || !session.access_token) {
    throw new Error("Sign in to AIP Portfolio before saving products.");
  }
  return session;
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "AIP_TOGGLE_OVERLAY" }, () => {
    if (chrome.runtime.lastError) {
      chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#D97706" });
      chrome.action.setTitle({ tabId: tab.id, title: "Open an Amazon product page to use AIP Portfolio Capture." });
      return;
    }

    chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    chrome.action.setTitle({ tabId: tab.id, title: "Save to AIP Portfolio" });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  sendResponseFromPromise(sendResponse, async () => {
    switch (message && message.type) {
      case "AIP_GET_SESSION": {
        const session = await getFreshSession();
        return { ok: true, user: publicUser(session) };
      }

      case "AIP_SIGN_IN": {
        const session = await AipSupabaseApi.signInWithPassword(message.email, message.password);
        await setStoredSession(session);
        return { ok: true, user: publicUser(session) };
      }

      case "AIP_SIGN_OUT": {
        await clearStoredSession();
        return { ok: true };
      }

      case "AIP_SAVE_BOUGHT_PRODUCT": {
        const session = requireSession(await getFreshSession());
        const product = message.product || {};
        const existingProduct = await AipSupabaseApi.findExistingProductByAsin(
          product.asin,
          session.user.id,
          session.access_token
        );
        const record = AipProductCore.buildBoughtProductRecord(product, {
          existingProduct,
          purchaseDate: message.purchaseDate,
          purchasePrice: message.purchasePrice,
        });

        await AipSupabaseApi.upsertProductRecord(session.user.id, record, session.access_token);
        return { ok: true, product: record, updated: Boolean(existingProduct) };
      }

      default:
        return { ok: false, error: "Unknown extension message." };
    }
  });

  return true;
});
