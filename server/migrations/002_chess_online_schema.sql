CREATE TABLE IF NOT EXISTS chess_queue (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(24) NOT NULL DEFAULT 'waiting',
    socket_id VARCHAR(64),
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chess_matches (
    id BIGSERIAL PRIMARY KEY,
    white_user_id INTEGER NOT NULL REFERENCES users(id),
    black_user_id INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    winner_user_id INTEGER REFERENCES users(id),
    exit_reason VARCHAR(64),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chess_match_state (
    match_id BIGINT PRIMARY KEY REFERENCES chess_matches(id) ON DELETE CASCADE,
    fen TEXT NOT NULL,
    turn CHAR(1) NOT NULL,
    last_move_san VARCHAR(32),
    last_event_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chess_moves (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES chess_matches(id) ON DELETE CASCADE,
    ply INTEGER NOT NULL,
    from_sq VARCHAR(2) NOT NULL,
    to_sq VARCHAR(2) NOT NULL,
    promotion VARCHAR(1),
    san VARCHAR(32) NOT NULL,
    fen_after TEXT NOT NULL,
    moved_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chess_queue_status_joined
ON chess_queue(status, joined_at);

CREATE INDEX IF NOT EXISTS idx_chess_matches_status_started
ON chess_matches(status, started_at);

CREATE INDEX IF NOT EXISTS idx_chess_moves_match_ply
ON chess_moves(match_id, ply);
