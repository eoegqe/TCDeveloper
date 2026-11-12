import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen,
  Check, ChevronDown, ChevronRight, CircleHelp, Code2, Copy, ExternalLink,
  FileCode2, Globe2, KeyRound, LayoutDashboard, LifeBuoy, LogOut, Menu,
  Plus, RefreshCw, Search, Settings2, ShieldCheck, Smartphone, Trash2,
  Webhook, X
} from "lucide-react";

const ACCOUNTS = "https://accounts.theegget.com";
const CLIENT_ID = "tc_tcdeveloper_portal_20261112";
const REDIRECT_URI = "https://dev.theegget.com/auth/callback";
const TOKEN_KEY = "tcdeveloper_access_token";
const NAV = [
  { section: "WORKSPACE", items: [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "applications", label: "Applications", icon: Code2 }
  ]},
  { section: "DEVELOP", items: [
    { id: "docs", label: "Documentation", icon: BookOpen },
    { id: "guides", label: "Integration guides", icon: FileCode2 }
  ]},
  { section: "RESOURCES", items: [
    { id: "status", label: "Platform status", icon: Activity },
    { id: "help", label: "Help & support", icon: LifeBuoy }
  ]}
];

const randomString = (length = 64) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const prettyDate = value => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

async function api(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "The request could not be completed.");
  return data;
}

async function startLogin() {
  const state = randomString(32);
  const verifier = randomString(64);
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem("tcdev_oauth_state", state);
  sessionStorage.setItem("tcdev_oauth_verifier", verifier);
  const url = new URL("/oauth/authorize", ACCOUNTS);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();
  window.location.assign(url.toString());
}

function IconButton({ children, onClick, title }) {
  return <button className="icon-button" onClick={onClick} title={title}>{children}</button>;
}

function Badge({ children, tone = "neutral" }) {
  return <span className={"badge badge-" + tone}><i />{children}</span>;
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [apps, setApps] = useState([]);
  const [page, setPage] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", redirect_uris: "", scopes: ["profile"] });

  const load = async activeToken => {
    const [identity, registered] = await Promise.all([
      fetch(ACCOUNTS + "/oauth/userinfo", { headers: { authorization: "Bearer " + activeToken } }).then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error("Your TC Accounts session has expired. Sign in again.");
        return d;
      }),
      api("/api/apps", activeToken)
    ]);
    setUser(identity);
    setApps(registered.apps || []);
  };

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          const state = params.get("state") || "";
          const expected = sessionStorage.getItem("tcdev_oauth_state") || "";
          const verifier = sessionStorage.getItem("tcdev_oauth_verifier") || "";
          if (!state || state !== expected || !verifier) throw new Error("The sign-in request could not be verified. Please try again.");
          const body = new URLSearchParams({ grant_type: "authorization_code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code, code_verifier: verifier });
          const response = await fetch(ACCOUNTS + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error_description || result.error || "TC sign-in failed.");
          sessionStorage.setItem(TOKEN_KEY, result.access_token);
          setError("");
          sessionStorage.removeItem("tcdev_oauth_state");
          sessionStorage.removeItem("tcdev_oauth_verifier");
          window.history.replaceState({}, "", "/");
          if (active) setToken(result.access_token);
          return;
        }
        if (params.has("error")) throw new Error("TC sign-in was cancelled or could not be completed.");
        const existing = sessionStorage.getItem(TOKEN_KEY) || "";
        if (existing) {
          if (active) { setToken(existing); await load(existing); }
        }
      } catch (e) {
        sessionStorage.removeItem(TOKEN_KEY);
        if (active) { setToken(""); setError(e.message); }
      } finally {
        if (active) setLoading(false);
      }
    }
    initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!token || user) return;
    let active = true;
    load(token).catch(e => { sessionStorage.removeItem(TOKEN_KEY); if (active) { setToken(""); setError(e.message); } });
    return () => { active = false; };
  }, [token, user]);

  const filteredApps = useMemo(() => apps.filter(app => (app.name + " " + app.client_id).toLowerCase().includes(search.toLowerCase())), [apps, search]);

  const signOut = async () => {
    const oldToken = token;
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(""); setUser(null); setApps([]);
    try { await fetch(ACCOUNTS + "/oauth/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: oldToken }) }); } catch {}
  };

  const openCreate = () => {
    setForm({ name: "", redirect_uris: "", scopes: ["profile"] });
    setModal({ mode: "create" }); setError("");
  };
  const openEdit = app => {
    setForm({ name: app.name, redirect_uris: app.redirect_uris.join("\n"), scopes: app.scopes || ["profile"] });
    setModal({ mode: "edit", app }); setError("");
  };
  const saveApp = async event => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const payload = { name: form.name.trim(), redirect_uris: form.redirect_uris.split(/[\n,]/).map(x => x.trim()).filter(Boolean), scopes: form.scopes };
      if (modal.mode === "create") {
        const result = await api("/api/apps", token, { method: "POST", body: JSON.stringify(payload) });
        setApps(current => [result.app, ...current]);
        setNotice("Application registered. Copy its client ID into your integration.");
      } else {
        const result = await api("/api/apps/" + encodeURIComponent(modal.app.client_id), token, { method: "PUT", body: JSON.stringify(payload) });
        setApps(current => current.map(x => x.client_id === result.app.client_id ? result.app : x));
        setNotice("Application settings updated.");
      }
      setModal(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const deleteApp = async app => {
    if (!window.confirm("Delete " + app.name + "? Apps using this client ID will no longer be able to sign in with TC.")) return;
    setBusy(true); setError("");
    try {
      await api("/api/apps/" + encodeURIComponent(app.client_id), token, { method: "DELETE" });
      setApps(current => current.filter(x => x.client_id !== app.client_id));
      setNotice("Application deleted.");
      setModal(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const copy = async value => {
    try { await navigator.clipboard.writeText(value); setNotice("Copied to clipboard."); }
    catch { setNotice("Clipboard access is unavailable in this browser."); }
  };

  if (loading) return <div className="loading-screen"><div className="tc-mark">TC</div><div className="loader" /><span>Loading TC Developer</span></div>;
  if (!token || !user) return <div className="auth-screen"><div className="auth-card"><div className="brand-lockup"><div className="tc-mark">TC</div><div><strong>Theegget Creations</strong><span>DEVELOPER PORTAL</span></div></div><div className="auth-divider" /><Badge tone="success">TC Accounts authentication</Badge><h1>Build with TC.</h1><p>Register your application and let people use their TC identity to sign in to your service.</p>{error && <div className="notice notice-error">{error}</div>}<button className="button button-primary full" onClick={() => startLogin()}>Continue with TC <ArrowRight size={15} /></button><div className="auth-foot"><ShieldCheck size={14} /> Your TC account credentials stay with TC Accounts.</div></div></div>;

  const currentTitle = NAV.flatMap(x => x.items).find(x => x.id === page)?.label || "Overview";
  return <div className="app-shell">
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <aside className={"sidebar " + (mobileNav ? "sidebar-open" : "")}>
      <div className="brand-row"><div className="tc-mark">TC</div><div className="brand-text"><strong>Theegget Creations</strong><span>DEVELOPER PORTAL</span></div><button className="mobile-close" onClick={() => setMobileNav(false)}><X size={17} /></button></div>
      <div className="workspace-switcher"><div className="workspace-avatar">{(user.preferred_username || "T").slice(0,1).toUpperCase()}</div><div><strong>{user.preferred_username}</strong><span>Developer workspace</span></div><ChevronDown size={14} /></div>
      <nav className="side-nav">{NAV.map(group => <div className="nav-section" key={group.section}><div className="nav-heading">{group.section}</div>{group.items.map(item => <button key={item.id} className={"nav-item " + (page === item.id ? "active" : "")} onClick={() => { setPage(item.id); setMobileNav(false); }}><item.icon size={16} /><span>{item.label}</span>{item.id === "applications" && <small>{apps.length}</small>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={15} /><strong>Secure by design</strong><p>OAuth 2.0 with PKCE. No client secrets are issued to browser apps.</p></div><button className="profile-row" onClick={signOut}><div className="profile-avatar">{(user.preferred_username || "T").slice(0,1).toUpperCase()}</div><div className="profile-info"><strong>{user.preferred_username}</strong><span>Signed in with TC</span></div><LogOut size={15} /></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={18} /></button><div className="breadcrumbs"><span>TC Developer</span><ChevronRight size={13} /><strong>{currentTitle}</strong></div></div><div className="topbar-actions"><span className="environment-pill"><i /> Production</span><span className="topbar-divider" /><div className="topbar-avatar">{(user.preferred_username || "T").slice(0,1).toUpperCase()}</div></div></header>
      <div className="page-content">
        {notice && <div className="inline-notice"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
        {error && <div className="inline-notice error-notice">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
        {page === "overview" && <Overview apps={apps} setPage={setPage} openCreate={openCreate} />}
        {page === "applications" && <section>
          <div className="page-heading"><div><div className="eyebrow">WORKSPACE <span>/</span> APPLICATIONS</div><h1>Applications</h1><p>Manage the applications connected to your TC identity.</p></div><button className="button button-primary" onClick={openCreate}><Plus size={15} /> Create application</button></div>
          <div className="panel"><div className="toolbar"><div className="search-box"><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search applications..." /></div><span className="toolbar-count">{filteredApps.length} of {apps.length} applications</span></div>
            {filteredApps.length ? <div className="table-wrap"><table><thead><tr><th>APPLICATION</th><th>CLIENT ID</th><th>CREATED</th><th /></tr></thead><tbody>{filteredApps.map(app => <tr key={app.client_id}><td><div className="app-name-cell"><div className="app-icon"><Code2 size={16} /></div><div><strong>{app.name}</strong><span>{app.redirect_uris.length} redirect URI{app.redirect_uris.length === 1 ? "" : "s"}</span></div></div></td><td><button className="copy-value" onClick={() => copy(app.client_id)}><code>{app.client_id}</code><Copy size={13} /></button></td><td className="muted-cell">{prettyDate(app.created_at)}</td><td><button className="row-action" onClick={() => openEdit(app)} title="Edit application"><Settings2 size={15} /></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><div><Code2 size={22} /></div><strong>{search ? "No matching applications" : "No applications yet"}</strong><span>{search ? "Try another search term." : "Register your first application to get a client ID."}</span>{!search && <button className="button button-secondary" onClick={openCreate}><Plus size={14} /> Create application</button>}</div>}
            <div className="panel-footer"><span>Application credentials are scoped to your TC account.</span><span>{apps.length} total</span></div>
          </div>
        </section>}
        {page === "docs" && <Docs />}
        {page === "guides" && <Guides />}
        {page === "status" && <Status />}
        {page === "help" && <Help />}
        <footer className="page-footer"><span>© {new Date().getFullYear()} Theegget Creations</span><span><ShieldCheck size={12} /> TC identity services <i /> <a href="https://accounts.theegget.com">TC Accounts <ExternalLink size={11} /></a></span></footer>
      </div>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal-card"><div className="modal-header"><div><div className="eyebrow">APPLICATION SETTINGS</div><h2>{modal.mode === "create" ? "Create application" : "Edit application"}</h2></div><IconButton onClick={() => setModal(null)} title="Close"><X size={17} /></IconButton></div><form onSubmit={saveApp}><label className="field"><span>Application name</span><input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="My application" /></label><label className="field"><span>Redirect URIs</span><textarea required rows={4} value={form.redirect_uris} onChange={e => setForm({ ...form, redirect_uris: e.target.value })} placeholder={"https://example.com/auth/callback"} /><small>One exact callback URL per line. HTTPS is required except localhost development and supported TC app schemes.</small></label><div className="field"><span>Permissions (scopes)</span><div className="scope-options"><label><input type="checkbox" checked={form.scopes.includes("profile")} onChange={e => setForm({ ...form, scopes: e.target.checked ? [...form.scopes, "profile"] : form.scopes.filter(x => x !== "profile") })} /><span><strong>profile</strong><small>TC account ID and username</small></span></label><label><input type="checkbox" checked={form.scopes.includes("email")} onChange={e => setForm({ ...form, scopes: e.target.checked ? [...form.scopes, "email"] : form.scopes.filter(x => x !== "email") })} /><span><strong>email</strong><small>Email address on the TC account</small></span></label></div></div><div className="modal-actions">{modal.mode === "edit" && <button type="button" className="button button-danger" onClick={() => deleteApp(modal.app)} disabled={busy}><Trash2 size={14} /> Delete</button>}<button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || !form.scopes.length}>{busy ? "Saving..." : "Save application"} <ArrowRight size={14} /></button></div></form></section></div>}
  </div>;
}

function Overview({ apps, setPage, openCreate }) {
  return <><div className="page-heading"><div><div className="eyebrow">THEEGGET CREATIONS <span>/</span> DEVELOPER</div><h1>Developer overview</h1><p>Everything you need to connect your service to TC Accounts.</p></div><button className="button button-primary" onClick={openCreate}><Plus size={15} /> New application</button></div>
    <div className="stats-grid"><div className="stat-card"><div className="stat-icon"><Code2 size={17} /></div><div><span>Registered applications</span><strong>{apps.length}</strong><small>Owned by your TC account</small></div></div><div className="stat-card"><div className="stat-icon purple"><KeyRound size={17} /></div><div><span>Authentication</span><strong>OAuth 2.0</strong><small>Authorization Code + PKCE</small></div></div><div className="stat-card"><div className="stat-icon green"><ShieldCheck size={17} /></div><div><span>Client secrets</span><strong>Not issued</strong><small>Public clients use PKCE</small></div></div><div className="stat-card"><div className="stat-icon amber"><Globe2 size={17} /></div><div><span>Identity provider</span><strong>TC Accounts</strong><small>accounts.theegget.com</small></div></div></div>
    <div className="overview-grid"><section className="panel"><div className="panel-header"><div><h2>Your applications</h2><p>Recently registered applications and their client IDs.</p></div><button className="text-link" onClick={() => setPage("applications")}>View all <ArrowRight size={13} /></button></div>{apps.length ? <div className="recent-list">{apps.slice(0,4).map(app => <div className="recent-row" key={app.client_id}><div className="app-icon"><Code2 size={16} /></div><div className="recent-main"><strong>{app.name}</strong><span>{app.client_id}</span></div><Badge tone="success">Active</Badge></div>)}</div> : <div className="empty-state compact"><div><Code2 size={22} /></div><strong>Start with your first application</strong><span>Create an application to receive a client ID.</span><button className="button button-secondary" onClick={openCreate}><Plus size={14} /> Create application</button></div>}<div className="panel-footer"><span>Manage redirect URIs and permissions</span><button onClick={() => setPage("applications")}>Manage applications <ArrowRight size={12} /></button></div></section>
      <section className="panel"><div className="panel-header"><div><h2>Quick start</h2><p>Get your first TC sign-in integration running.</p></div><BookOpen size={17} /></div><div className="quick-links"><button onClick={() => setPage("docs")}><span className="quick-icon"><BookOpen size={15} /></span><span><strong>Read the OAuth documentation</strong><small>Endpoints, scopes and token exchange</small></span><ChevronRight size={15} /></button><button onClick={() => setPage("guides")}><span className="quick-icon"><FileCode2 size={15} /></span><span><strong>Follow an integration guide</strong><small>Web app and mobile app examples</small></span><ChevronRight size={15} /></button><button onClick={() => setPage("applications")}><span className="quick-icon"><KeyRound size={15} /></span><span><strong>Register a client ID</strong><small>Configure your callback URLs</small></span><ChevronRight size={15} /></button></div></section></div>
    <section className="panel policy-panel"><div className="panel-header"><div><h2>Built around your users</h2><p>TC sign-in is designed to keep identity credentials under TC Accounts.</p></div></div><div className="principles-grid"><div><ShieldCheck size={18} /><strong>Credentials stay with TC</strong><p>Your app receives an authorization code and access token, not a user's TC password.</p></div><div><KeyRound size={18} /><strong>PKCE required</strong><p>Every authorization request uses S256 Proof Key for Code Exchange.</p></div><div><Settings2 size={18} /><strong>Developer-owned apps</strong><p>Each developer can manage only applications registered under their own TC account.</p></div></div></section>
  </>;
}

function Docs() {
  return <section><div className="page-heading"><div><div className="eyebrow">DEVELOP <span>/</span> DOCUMENTATION</div><h1>Sign in with TC</h1><p>Integrate TC Accounts using OAuth 2.0 Authorization Code with PKCE.</p></div><Badge tone="success">OAuth 2.0</Badge></div>
    <div className="docs-layout"><aside className="docs-toc"><strong>ON THIS PAGE</strong><a href="#overview">Overview</a><a href="#endpoints">Endpoints</a><a href="#scopes">Scopes</a><a href="#flow">Authorization flow</a><a href="#security">Security</a></aside><article className="panel docs-article"><section id="overview"><h2>Overview</h2><p>Sign in with TC lets people authenticate to your application using their Theegget Creations identity. TC Accounts handles the sign-in and consent process. Your application never receives the user's TC password.</p><div className="callout"><ShieldCheck size={17} /><span><strong>Public clients only</strong><br />TC currently uses PKCE for authorization-code exchange. Do not embed a client secret in a browser or mobile application.</span></div></section><section id="endpoints"><h2>OAuth endpoints</h2><div className="endpoint-list"><div><span>Authorization</span><code>GET https://accounts.theegget.com/oauth/authorize</code></div><div><span>Token</span><code>POST https://accounts.theegget.com/oauth/token</code></div><div><span>User information</span><code>GET https://accounts.theegget.com/oauth/userinfo</code></div><div><span>Revocation</span><code>POST https://accounts.theegget.com/oauth/revoke</code></div><div><span>Discovery</span><code>GET https://accounts.theegget.com/.well-known/oauth-authorization-server</code></div></div></section><section id="scopes"><h2>Available scopes</h2><div className="scope-row"><code>profile</code><span>TC account identifier (<code>sub</code>) and username (<code>preferred_username</code>).</span></div><div className="scope-row"><code>email</code><span>Email address associated with the TC account. Request this scope only when your app needs the email address.</span></div></section><section id="flow"><h2>Authorization flow</h2><ol className="steps"><li><strong>Register your application.</strong><p>Create an application in the portal and add the exact callback URL. Copy its client ID.</p></li><li><strong>Create a PKCE verifier and challenge.</strong><p>Generate a cryptographically random verifier, then SHA-256 hash it and Base64URL-encode the result. Set <code>code_challenge_method=S256</code>.</p></li><li><strong>Redirect to TC Accounts.</strong><pre>{`GET /oauth/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=YOUR_REDIRECT_URI
  &response_type=code
  &scope=profile
  &state=RANDOM_STATE
  &code_challenge=BASE64URL_SHA256
  &code_challenge_method=S256`}</pre></li><li><strong>Exchange the returned code.</strong><p>Send a form-encoded POST to <code>/oauth/token</code> with <code>grant_type=authorization_code</code>, <code>client_id</code>, <code>redirect_uri</code>, <code>code</code>, and the original <code>code_verifier</code>.</p></li><li><strong>Request the user's identity.</strong><p>Call <code>/oauth/userinfo</code> with the access token in the Authorization Bearer header.</p></li></ol></section><section id="security"><h2>Security requirements</h2><ul className="security-list"><li>Always generate and verify a unique, unpredictable <code>state</code> value.</li><li>Use PKCE S256. The token endpoint rejects requests without a valid verifier.</li><li>Compare the callback URL exactly with the URL registered for the client.</li><li>Keep access tokens private, store them securely, and revoke them when signing out.</li><li>Request only the scopes your application needs.</li><li>Use HTTPS for production redirect URIs.</li></ul></section></article></div>
  </section>;
}

function Guides() {
  return <section><div className="page-heading"><div><div className="eyebrow">DEVELOP <span>/</span> GUIDES</div><h1>Integration guides</h1><p>Practical notes for adding TC authentication to your app.</p></div></div><div className="guide-grid"><div className="panel guide-card"><div className="guide-icon"><Globe2 size={19} /></div><Badge tone="info">Web</Badge><h2>Web applications</h2><p>Use the authorization-code flow with PKCE. Keep the verifier in the initiating browser session and validate state before exchanging the code.</p><button className="text-link" onClick={() => window.location.hash = "web-guide"}>Read the web flow <ArrowRight size={13} /></button></div><div className="panel guide-card"><div className="guide-icon"><Smartphone size={19} /></div><Badge tone="info">Mobile</Badge><h2>Mobile applications</h2><p>Use the system browser for sign-in, a registered app callback, PKCE, and secure platform storage for tokens.</p><button className="text-link" onClick={() => window.location.hash = "mobile-guide"}>Read mobile notes <ArrowRight size={13} /></button></div></div><div className="panel guide-detail" id="web-guide"><h2>Web integration checklist</h2><ol><li>Register a client ID and HTTPS callback URI.</li><li>Generate a unique state and PKCE verifier for each login.</li><li>Redirect the browser to the authorization endpoint.</li><li>Validate state and exchange the code using the verifier.</li><li>Call userinfo and establish your own application session.</li></ol></div><div className="panel guide-detail" id="mobile-guide"><h2>Mobile integration checklist</h2><ol><li>Register the exact callback URI your app can receive.</li><li>Open TC Accounts in the device's system browser.</li><li>Use PKCE S256 and a one-time state value.</li><li>Exchange the code from the app using the verifier.</li><li>Store tokens in secure platform storage and support revocation.</li></ol></div></section>;
}

function Status() {
  return <section><div className="page-heading"><div><div className="eyebrow">RESOURCES <span>/</span> PLATFORM STATUS</div><h1>Platform status</h1><p>Service destinations used by Sign in with TC.</p></div><Badge tone="success">Status not monitored here</Badge></div><div className="status-list"><div className="panel status-row"><div className="status-icon"><KeyRound size={17} /></div><div><strong>TC Accounts</strong><span>accounts.theegget.com · OAuth authorization and identity</span></div><a href="https://accounts.theegget.com" target="_blank" rel="noreferrer">Open <ExternalLink size={13} /></a></div><div className="panel status-row"><div className="status-icon"><Code2 size={17} /></div><div><strong>TC Developer</strong><span>dev.theegget.com · Application management and docs</span></div><Badge tone="success">Current page</Badge></div></div><div className="callout wide"><CircleHelp size={17} /><span>This page does not perform live uptime checks. For account or authentication problems, contact <a href="mailto:support@theegget.com">support@theegget.com</a>.</span></div></section>;
}

function Help() {
  return <section><div className="page-heading"><div><div className="eyebrow">RESOURCES <span>/</span> SUPPORT</div><h1>Help & support</h1><p>Get help with your developer account or TC integration.</p></div></div><div className="help-grid"><div className="panel help-card"><LifeBuoy size={20} /><h2>Developer support</h2><p>For issues with application registration, redirect URIs, or TC sign-in.</p><a className="button button-secondary" href="mailto:support@theegget.com?subject=TC%20Developer%20Support">Contact support <ArrowUpRight size={14} /></a></div><div className="panel help-card"><BookOpen size={20} /><h2>OAuth documentation</h2><p>Review the supported endpoints, scopes, and authorization flow.</p><button className="button button-secondary" onClick={() => window.location.hash = "docs"}>View documentation <ArrowRight size={14} /></button></div></div></section>;
}

export default App;
