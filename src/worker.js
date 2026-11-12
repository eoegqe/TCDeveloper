const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const PORTAL_CLIENT_ID = "tc_tcdeveloper_portal_20261112";
const random = (length = 24) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

async function authenticate(request) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length > 2048) return { response: json({ error: "not_authenticated", message: "Sign in with TC to continue." }, 401) };
  try {
    const response = await fetch("https://accounts.theegget.com/oauth/userinfo", {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cf: { cacheTtl: 0 }
    });
    if (!response.ok) return { response: json({ error: "invalid_session", message: "Your TC session has expired. Sign in again." }, 401) };
    const identity = await response.json();
    const id = String(identity.sub || "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { response: json({ error: "invalid_identity" }, 401) };
    return { user: { id, username: String(identity.preferred_username || "TC developer") } };
  } catch {
    return { response: json({ error: "accounts_unavailable", message: "TC Accounts could not be reached. Try again shortly." }, 503) };
  }
}

function validateRedirects(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 10) return null;
  const unique = [...new Set(values.map(value => typeof value === "string" ? value.trim() : ""))];
  if (unique.some(value => !value || value.length > 2048)) return null;
  for (const value of unique) {
    try {
      const url = new URL(value);
      const local = ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      const web = url.protocol === "https:" && !url.username && !url.password;
      const tac = url.protocol === "tac:" && url.hostname === "oauth" && url.pathname === "/callback" && !url.search;
      const eggs = url.protocol === "eggsys:" && url.hostname === "spotify-callback" && !url.pathname;
      const tc = url.protocol === "tc:" && url.hostname === "oauth" && url.pathname === "/callback" && !url.search;
      if ((!local && !web && !tac && !eggs && !tc) || url.username || url.password || url.hash) return null;
    } catch { return null; }
  }
  return unique;
}

function validateBody(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const redirects = validateRedirects(body?.redirect_uris);
  const scopes = Array.isArray(body?.scopes) ? [...new Set(body.scopes)] : [];
  if (name.length < 2 || name.length > 80) return { error: "Application name must be between 2 and 80 characters." };
  if (!redirects) return { error: "Add 1–10 valid redirect URIs. Production URLs must use HTTPS." };
  if (!scopes.length || scopes.some(scope => !["profile", "email"].includes(scope))) return { error: "Select at least one supported permission." };
  return { value: { name, redirects, scopes } };
}

async function apps(request, env, user) {
  if (request.method === "GET") {
    const result = await env.TC.prepare(
      "SELECT client_id, name, redirect_uris_json, scopes_json, created_at FROM oauth_clients WHERE owner_user_id = ? AND client_id != ? ORDER BY created_at DESC"
    ).bind(user.id, PORTAL_CLIENT_ID).all();
    return json({ apps: (result.results || []).map(row => ({
      client_id: row.client_id,
      name: row.name,
      redirect_uris: JSON.parse(row.redirect_uris_json || "[]"),
      scopes: JSON.parse(row.scopes_json || '["profile"]'),
      created_at: row.created_at
    })) });
  }
  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const parsed = validateBody(body);
    if (parsed.error) return json({ error: "invalid_application", message: parsed.error }, 400);
    const clientId = "tc_" + random(24);
    const createdAt = new Date().toISOString();
    try {
      await env.TC.prepare(
        "INSERT INTO oauth_clients (client_id, owner_user_id, name, redirect_uris_json, scopes_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(clientId, user.id, parsed.value.name, JSON.stringify(parsed.value.redirects), JSON.stringify(parsed.value.scopes), createdAt).run();
      return json({ app: { client_id: clientId, name: parsed.value.name, redirect_uris: parsed.value.redirects, scopes: parsed.value.scopes, created_at: createdAt } }, 201);
    } catch (error) {
      console.error("TC Developer app registration failed:", String(error?.message || error));
      return json({ error: "registration_failed", message: "The application could not be registered. Confirm the TC Accounts OAuth migration is applied." }, 503);
    }
  }
  return json({ error: "method_not_allowed" }, 405);
}

async function appDetail(request, env, user, clientId) {
  if (!clientId || clientId === PORTAL_CLIENT_ID) return json({ error: "not_found" }, 404);
  if (request.method === "DELETE") {
    const result = await env.TC.prepare("DELETE FROM oauth_clients WHERE client_id = ? AND owner_user_id = ?").bind(clientId, user.id).run();
    return result.meta?.changes ? json({ success: true }) : json({ error: "not_found", message: "Application not found in your workspace." }, 404);
  }
  if (request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const parsed = validateBody(body);
    if (parsed.error) return json({ error: "invalid_application", message: parsed.error }, 400);
    const result = await env.TC.prepare(
      "UPDATE oauth_clients SET name = ?, redirect_uris_json = ?, scopes_json = ? WHERE client_id = ? AND owner_user_id = ?"
    ).bind(parsed.value.name, JSON.stringify(parsed.value.redirects), JSON.stringify(parsed.value.scopes), clientId, user.id).run();
    if (!result.meta?.changes) return json({ error: "not_found", message: "Application not found in your workspace." }, 404);
    const row = await env.TC.prepare("SELECT created_at FROM oauth_clients WHERE client_id = ? AND owner_user_id = ?").bind(clientId, user.id).first();
    return json({ app: { client_id: clientId, name: parsed.value.name, redirect_uris: parsed.value.redirects, scopes: parsed.value.scopes, created_at: row?.created_at || null } });
  }
  return json({ error: "method_not_allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") return json({ status: "ok", service: "tcdeveloper" });
    if (url.pathname.startsWith("/api/")) {
      const auth = await authenticate(request);
      if (auth.response) return auth.response;
      try {
        if (url.pathname === "/api/apps") return await apps(request, env, auth.user);
        if (url.pathname.startsWith("/api/apps/")) {
          const clientId = decodeURIComponent(url.pathname.slice("/api/apps/".length));
          return await appDetail(request, env, auth.user, clientId);
        }
        return json({ error: "not_found" }, 404);
      } catch (error) {
        console.error("TC Developer API error:", String(error?.message || error));
        return json({ error: "internal_error", message: "The request could not be completed." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
