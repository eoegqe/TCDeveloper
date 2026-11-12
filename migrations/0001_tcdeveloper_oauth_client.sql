INSERT OR IGNORE INTO oauth_clients (
  client_id,
  owner_user_id,
  name,
  redirect_uris_json,
  scopes_json,
  created_at
) VALUES (
  'tc_tcdeveloper_portal_20261112',
  '1',
  'TC Developer Portal',
  '["https://dev.theegget.com/auth/callback"]',
  '["profile"]',
  '2026-11-12T00:00:00.000Z'
);
