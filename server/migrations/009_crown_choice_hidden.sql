-- Explicit "hide crown" preference (distinct from "auto equip")
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS crown_choice_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_crown_choice_hidden ON users (crown_choice_hidden);

