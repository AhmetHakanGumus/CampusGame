import { sanitizeLeaderboardPlayerName } from './inputValidation.js';
import {
    applyDamaEloDraw,
    applyDamaEloWinLoss,
    getDamaRankSnapshotForUser,
    queryDamaEloTop,
    countDamaRatedPlayers
} from './models/damaElo.model.js';

function normName(name) {
    return sanitizeLeaderboardPlayerName(name) || '';
}

function emptyDamaSnapshot() {
    return {
        rank: 1,
        totalPlayers: 0,
        elo: 1500,
        wins: 0,
        losses: 0,
        draws: 0,
        games: 0,
        inTop10: false
    };
}

function snapshotToLegacyShape(s) {
    return {
        rank: s.rank,
        totalPlayers: s.totalPlayers,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        games: s.games,
        elo: s.elo,
        inTop10: s.inTop10
    };
}

export async function getDamaLeaderboardSnapshotByUserId(userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return emptyDamaSnapshot();
    const s = await getDamaRankSnapshotForUser(uid);
    return snapshotToLegacyShape(s);
}

export async function getDamaLeaderboardSnapshotByPlayerName(playerName) {
    const n = normName(playerName);
    if (!n) return emptyDamaSnapshot();
    const { pool } = await import('./db.js');
    const found = await pool.query(
        `SELECT user_id FROM dama_elo_ratings WHERE LOWER(TRIM(player_name)) = LOWER(TRIM($1)) ORDER BY updated_at DESC LIMIT 1`,
        [n]
    );
    const uid = found.rows[0]?.user_id;
    if (uid == null) {
        const total = await countDamaRatedPlayers();
        return snapshotToLegacyShape({
            rank: total + 1,
            totalPlayers: total,
            elo: 1500,
            wins: 0,
            losses: 0,
            draws: 0,
            games: 0,
            inTop10: false
        });
    }
    return getDamaLeaderboardSnapshotByUserId(Number(uid));
}

function top10Move(before, after) {
    const b = before.inTop10;
    const a = after.inTop10;
    if (!b && a) return 'entered';
    if (b && !a) return 'dropped';
    if (a) return 'stayed_in';
    return 'stayed_out';
}

function metaForPlayer(before, after) {
    return {
        rankBefore: before.rank,
        rankAfter: after.rank,
        totalPlayersAfter: after.totalPlayers,
        eloBefore: before.elo,
        eloAfter: after.elo,
        winsAfter: after.wins,
        lossesAfter: after.losses,
        drawsAfter: after.draws,
        gamesAfter: after.games,
        top10Move: top10Move(before, after)
    };
}

export async function recordDamaWinLossAndMeta(winnerName, loserName, winnerUserId, loserUserId) {
    const wid = Number(winnerUserId);
    const lid = Number(loserUserId);
    const wn = normName(winnerName) || `user-${wid}`;
    const ln = normName(loserName) || `user-${lid}`;

    const beforeW = Number.isFinite(wid) ? await getDamaLeaderboardSnapshotByUserId(wid) : emptyDamaSnapshot();
    const beforeL = Number.isFinite(lid) ? await getDamaLeaderboardSnapshotByUserId(lid) : emptyDamaSnapshot();

    if (Number.isFinite(wid) && Number.isFinite(lid)) {
        await applyDamaEloWinLoss(wid, lid, wn, ln);
    }

    const afterW = Number.isFinite(wid) ? await getDamaLeaderboardSnapshotByUserId(wid) : beforeW;
    const afterL = Number.isFinite(lid) ? await getDamaLeaderboardSnapshotByUserId(lid) : beforeL;

    const out = {};
    if (Number.isFinite(wid)) out[String(wid)] = metaForPlayer(beforeW, afterW);
    if (Number.isFinite(lid)) out[String(lid)] = metaForPlayer(beforeL, afterL);
    return out;
}

export async function recordDamaDrawAndMeta(whiteName, blackName, whiteUserId, blackUserId) {
    const wuid = Number(whiteUserId);
    const buid = Number(blackUserId);
    const wa = normName(whiteName) || `user-${wuid}`;
    const ba = normName(blackName) || `user-${buid}`;

    const beforeW = Number.isFinite(wuid) ? await getDamaLeaderboardSnapshotByUserId(wuid) : emptyDamaSnapshot();
    const beforeB = Number.isFinite(buid) ? await getDamaLeaderboardSnapshotByUserId(buid) : emptyDamaSnapshot();

    if (Number.isFinite(wuid) && Number.isFinite(buid)) {
        await applyDamaEloDraw(wuid, buid, wa, ba);
    }

    const afterW = Number.isFinite(wuid) ? await getDamaLeaderboardSnapshotByUserId(wuid) : beforeW;
    const afterB = Number.isFinite(buid) ? await getDamaLeaderboardSnapshotByUserId(buid) : beforeB;

    const out = {};
    if (Number.isFinite(wuid)) out[String(wuid)] = metaForPlayer(beforeW, afterW);
    if (Number.isFinite(buid)) out[String(buid)] = metaForPlayer(beforeB, afterB);
    return out;
}

export async function queryDamaLeaderboardRows(limit = 10) {
    const rows = await queryDamaEloTop(limit);
    return rows.map((r) => ({
        player_name: r.player_name,
        elo: Number(r.elo) || 1500,
        games: Number(r.games) || 0,
        wins: Number(r.wins) || 0,
        losses: Number(r.losses) || 0,
        draws: Number(r.draws) || 0,
        user_id: Number(r.user_id)
    }));
}

export async function getDamaLeaderboardSnapshot(playerName) {
    return getDamaLeaderboardSnapshotByPlayerName(playerName);
}
