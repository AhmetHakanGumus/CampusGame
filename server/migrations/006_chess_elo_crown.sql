-- Satranç: Arpad Elo tabanlı rating (user_id başına tek satır)
CREATE TABLE IF NOT EXISTS chess_elo_ratings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    player_name VARCHAR(64) NOT NULL,
    elo INTEGER NOT NULL DEFAULT 1500 CHECK (elo >= 100 AND elo <= 4000),
    games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
    draws INTEGER NOT NULL DEFAULT 0 CHECK (draws >= 0),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chess_elo_elo_desc ON chess_elo_ratings (elo DESC, games_played ASC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS crown_choice_game VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS crown_choice_place SMALLINT;
