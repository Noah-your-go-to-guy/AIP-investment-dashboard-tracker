(function initAipSupabaseApi(globalScope) {
  const SUPABASE_URL = "https://gvifstpfolidkvxjeftx.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fnM9Bw4WbLAqibtuCv2pJA_hMwErdoC";
  const DASHBOARD_URL = "https://aip-investment-dashboard-tracker.vercel.app";

  function requestHeaders(accessToken) {
    const headers = {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    return headers;
  }

  async function parseResponse(response) {
    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      if (!response.ok) {
        throw new Error("Supabase request failed");
      }
    }
    if (!response.ok) {
      throw new Error(payload.error_description || payload.message || payload.error || "Supabase request failed");
    }
    return payload;
  }

  function withExpiresAt(payload, nowMs) {
    return {
      ...payload,
      expires_at: (nowMs || Date.now()) + Number(payload.expires_in || 3600) * 1000,
    };
  }

  async function signInWithPassword(email, password, options) {
    const settings = options || {};
    const fetchImpl = settings.fetchImpl || fetch;
    const response = await fetchImpl(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ email, password }),
    });
    return withExpiresAt(await parseResponse(response), settings.nowMs);
  }

  async function refreshSession(refreshToken, options) {
    const settings = options || {};
    const fetchImpl = settings.fetchImpl || fetch;
    const response = await fetchImpl(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return withExpiresAt(await parseResponse(response), settings.nowMs);
  }

  async function findExistingProductByAsin(asin, userId, accessToken, options) {
    const settings = options || {};
    const fetchImpl = settings.fetchImpl || fetch;
    const response = await fetchImpl(
      `${SUPABASE_URL}/rest/v1/dashboard_records?store=eq.products&user_id=eq.${encodeURIComponent(userId)}&select=id,data&order=updated_at.desc&limit=1000`,
      {
        method: "GET",
        headers: requestHeaders(accessToken),
      }
    );
    const rows = await parseResponse(response);
    const normalizedAsin = String(asin || "").toUpperCase();
    const match = rows.find((row) => String((row.data && row.data.asin) || "").toUpperCase() === normalizedAsin);
    return match && match.data ? { ...match.data, id: match.id || match.data.id } : null;
  }

  async function upsertProductRecord(userId, product, accessToken, options) {
    const settings = options || {};
    const fetchImpl = settings.fetchImpl || fetch;
    const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/dashboard_records?on_conflict=user_id,store,id`, {
      method: "POST",
      headers: {
        ...requestHeaders(accessToken),
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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
