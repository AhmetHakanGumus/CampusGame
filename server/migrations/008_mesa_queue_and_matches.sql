-- Çoklu masa (ileride): kuyruk ve maçlar mesa_id ile ayrılır. Şimdilik her yerde mesa_id = 1.
-- Mevcut veritabanında chess_queue / dama_queue tek sütunlu PK (user_id) ise bir kez çalıştırın.
-- initDatabase() içindeki ensureMesaQueueSchema() aynı dönüşümü idempotent yapar.

BEGIN;

ALTER TABLE chess_queue ADD COLUMN IF NOT EXISTS mesa_id SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE dama_queue ADD COLUMN IF NOT EXISTS mesa_id SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE chess_queue DROP CONSTRAINT IF EXISTS chess_queue_username_key;
ALTER TABLE dama_queue DROP CONSTRAINT IF EXISTS dama_queue_username_key;

ALTER TABLE chess_queue DROP CONSTRAINT IF EXISTS chess_queue_pkey;
ALTER TABLE dama_queue DROP CONSTRAINT IF EXISTS dama_queue_pkey;

ALTER TABLE chess_queue ADD PRIMARY KEY (mesa_id, user_id);
ALTER TABLE dama_queue ADD PRIMARY KEY (mesa_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_chess_queue_mesa_username ON chess_queue (mesa_id, username);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dama_queue_mesa_username ON dama_queue (mesa_id, username);

ALTER TABLE chess_matches ADD COLUMN IF NOT EXISTS mesa_id SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE dama_matches ADD COLUMN IF NOT EXISTS mesa_id SMALLINT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_chess_queue_mesa_status ON chess_queue (mesa_id, status, joined_at);
CREATE INDEX IF NOT EXISTS idx_dama_queue_mesa_status ON dama_queue (mesa_id, status, joined_at);

COMMIT;
