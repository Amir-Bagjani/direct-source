CREATE TABLE IF NOT EXISTS web_auth_session (
  id uuid PRIMARY KEY,
  encrypted_tokens text NOT NULL,
  state text NOT NULL CHECK (state IN ('ready', 'refreshing')),
  closing boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS web_auth_session_expiry ON web_auth_session (expires_at);
