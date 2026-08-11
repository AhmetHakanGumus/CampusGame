-- Example migration: online game schema for "ttt"
-- This is NOT applied automatically by the project.
-- Apply manually if you want to experiment.

CREATE TABLE IF NOT EXISTS ttt_queue (
  mesa_id SMALLINT NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'waiting',
  socket_id VARCHAR(64),
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mesa_id, user_id),
  UNIQUE (mesa_id, username)
);

CREATE INDEX IF NOT EXISTS idx_ttt_queue_mesa_status_joined
ON ttt_queue(mesa_id, status, joined_at);

CREATE TABLE IF NOT EXISTS ttt_matches (
  id BIGSERIAL PRIMARY KEY,
  white_user_id INTEGER NOT NULL REFERENCES users(id),
  black_user_id INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  winner_user_id INTEGER REFERENCES users(id),
  exit_reason VARCHAR(64),
  mesa_id SMALLINT NOT NULL DEFAULT 1,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ttt_matches_status_started
ON ttt_matches(status, started_at);

CREATE TABLE IF NOT EXISTS ttt_match_state (
  match_id BIGINT PRIMARY KEY REFERENCES ttt_matches(id) ON DELETE CASCADE,
  state_json JSONB NOT NULL,
  last_event_at TIMESTAMP NOT NULL DEFAULT NOW()
);

