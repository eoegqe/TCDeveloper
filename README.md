# TC Developer

The developer portal for Theegget Creations at https://dev.theegget.com.

## Stack

- React and Vite for the portal interface
- Cloudflare Workers and Workers Static Assets
- Cloudflare D1, shared with TC Accounts
- TC Accounts OAuth 2.0 Authorization Code flow with PKCE (S256)

## Local development

```sh
npm install
npm run dev
```

## D1 setup

The portal uses the existing TC Accounts D1 database. Apply the portal's bootstrap OAuth client migration to that database before deploying:

```sh
npx wrangler d1 migrations apply tc --remote
```

The migration registers the portal's own public OAuth client with the exact callback URL `https://dev.theegget.com/auth/callback`. The D1 binding in `wrangler.toml` must continue to point to the same TC database used by TC Accounts.

## Build and deploy

```sh
npm run build
npx wrangler deploy
```

The Worker serves the Vite build and handles authenticated application-management requests. The OAuth API uses short-lived bearer access tokens issued by TC Accounts. The portal keeps its token in the current browser session and uses PKCE; no client secret is embedded in the frontend.

## OAuth endpoints

- Authorization: `https://accounts.theegget.com/oauth/authorize`
- Token: `https://accounts.theegget.com/oauth/token`
- User information: `https://accounts.theegget.com/oauth/userinfo`
- Revocation: `https://accounts.theegget.com/oauth/revoke`
- Discovery: `https://accounts.theegget.com/.well-known/oauth-authorization-server`

Registered applications are stored in the shared `oauth_clients` table. Every API read, update, and deletion is scoped to the authenticated TC account's user ID.
