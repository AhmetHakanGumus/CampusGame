import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

function getPoolConfig() {
    if (process.env.DATABASE_URL) {
        const ssl =
            process.env.PGSSLMODE === 'require'
                ? { rejectUnauthorized: false }
                : undefined;
        return { connectionString: process.env.DATABASE_URL, ssl };
    }

    return {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'postgres'
    };
}

export const pool = new Pool(getPoolConfig());

export async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(64) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // bcrypt -> argon2id geçişinde uzun hash değerleri için kolon tipini garantiye al.
    await pool.query(`
        ALTER TABLE users
        ALTER COLUMN password_hash TYPE TEXT;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS campus_scores (
            id SERIAL PRIMARY KEY,
            game VARCHAR(64) NOT NULL,
            player_name VARCHAR(64) NOT NULL,
            score INTEGER NOT NULL CHECK (score >= 0),
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await pool.query(`
        ALTER TABLE campus_scores
        ADD COLUMN IF NOT EXISTS chess_material INTEGER;
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_campus_scores_game_player_norm
        ON campus_scores (game, (LOWER(TRIM(BOTH FROM player_name))));
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS chess_queue (
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
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS chess_matches (
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
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS chess_match_state (
            match_id BIGINT PRIMARY KEY REFERENCES chess_matches(id) ON DELETE CASCADE,
            fen TEXT NOT NULL,
            turn CHAR(1) NOT NULL,
            last_move_san VARCHAR(32),
            last_event_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`DROP TABLE IF EXISTS chess_moves`);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chess_queue_status_joined
        ON chess_queue(status, joined_at);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chess_matches_status_started
        ON chess_matches(status, started_at);
    `);

    await pool.query(`
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
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chess_elo_elo_desc
        ON chess_elo_ratings (elo DESC, games_played ASC);
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS dama_queue (
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
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS dama_matches (
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
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS dama_match_state (
            match_id BIGINT PRIMARY KEY REFERENCES dama_matches(id) ON DELETE CASCADE,
            board TEXT NOT NULL,
            turn CHAR(1) NOT NULL,
            last_move_san VARCHAR(32),
            chain_from_r SMALLINT,
            chain_from_c SMALLINT,
            last_event_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_dama_queue_status_joined
        ON dama_queue(status, joined_at);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_dama_matches_status_started
        ON dama_matches(status, started_at);
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS dama_elo_ratings (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            player_name VARCHAR(64) NOT NULL,
            elo INTEGER NOT NULL DEFAULT 1500 CHECK (elo >= 100 AND elo <= 4000),
            games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
            wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
            losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
            draws INTEGER NOT NULL DEFAULT 0 CHECK (draws >= 0),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_dama_elo_elo_desc
        ON dama_elo_ratings (elo DESC, games_played ASC);
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS crown_choice_game VARCHAR(64);
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS crown_choice_place SMALLINT;
    `);

    // Taç gizleme tercihi: kullanıcı "taç gösterme" seçince otomatik taç geri gelmesin.
    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS crown_choice_hidden BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await ensureMesaGameSchema();
}

async function ensureMesaGameSchema() {
    try {
        for (const tbl of ['chess_queue', 'dama_queue']) {
            await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS mesa_id SMALLINT NOT NULL DEFAULT 1`);
        }
        for (const tbl of ['chess_matches', 'dama_matches']) {
            await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS mesa_id SMALLINT NOT NULL DEFAULT 1`);
        }

        for (const tbl of ['chess_queue', 'dama_queue']) {
            const pk = await pool.query(
                `
                SELECT pg_get_constraintdef(c.oid) AS def
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                WHERE t.relname = $1 AND c.contype = 'p'
                `,
                [tbl]
            );
            const def = pk.rows[0]?.def || '';
            const hasCompositeMesa = def.includes('mesa_id');
            if (def.includes('PRIMARY KEY') && !hasCompositeMesa) {
                await pool.query(`ALTER TABLE ${tbl} DROP CONSTRAINT IF EXISTS ${tbl}_username_key`);
                await pool.query(`ALTER TABLE ${tbl} DROP CONSTRAINT ${tbl}_pkey`);
                await pool.query(`ALTER TABLE ${tbl} ADD PRIMARY KEY (mesa_id, user_id)`);
                await pool.query(
                    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_${tbl}_mesa_username ON ${tbl} (mesa_id, username)`
                );
            }
        }

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_chess_queue_mesa_status
            ON chess_queue(mesa_id, status, joined_at);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_dama_queue_mesa_status
            ON dama_queue(mesa_id, status, joined_at);
        `);
    } catch (e) {
        console.error('[db] ensureMesaGameSchema:', e.message || e);
    }
}

