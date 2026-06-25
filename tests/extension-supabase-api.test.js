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
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return [
          { id: "other", data: { asin: "B0OTHER123" } },
          { id: "target", data: { asin: "B0TEST1234", title: "Existing product" } },
        ];
      },
    };
  };

  const product = await api.findExistingProductByAsin("B0TEST1234", "user/with space", "token", { fetchImpl: fakeFetch });

  assert.equal(product.id, "target");
  assert.equal(product.title, "Existing product");
  assert.match(calls[0].url, /user_id=eq\.user%2Fwith%20space/);
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

test("upsertProductRecord resolves when successful Supabase response has no JSON body", async () => {
  const fakeFetch = async () => ({
    ok: true,
    async json() {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  });

  const product = { id: "asin-B0EMPTY123", asin: "B0EMPTY123", title: "Empty response" };

  const result = await api.upsertProductRecord("user-1", product, "token", { fetchImpl: fakeFetch });

  assert.equal(result, product);
});
