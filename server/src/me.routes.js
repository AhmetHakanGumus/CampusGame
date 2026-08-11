import express from 'express';
import { getSessionByToken } from './session.store.js';
import { findUserByUsername, updateUserCrownChoice, clearUserCrownChoice } from './models/user.model.js';
import {
    getEligibleCrownBadges,
    resolveEquippedCrown
} from './leaderboardBadges.util.js';
import { assertLeaderboardGameId } from './inputValidation.js';

const router = express.Router();

function normalizeUsername(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

router.get('/leaderboard-badges', async (req, res) => {
    try {
        const token = String(req.query.sessionToken || '');
        const session = getSessionByToken(token);
        if (!session?.username) {
            return res.status(401).json({ message: 'Oturum gerekli.' });
        }
        const user = await findUserByUsername(session.username);
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı yok.' });
        }
        const nickQ = String(req.query.nickname || '').trim();
        const eligible = await getEligibleCrownBadges(user.id, [user.username, nickQ]);
        const equipped = user.crown_choice_hidden
            ? null
            : resolveEquippedCrown(eligible, user.crown_choice_game, user.crown_choice_place);
        return res.json({
            eligible,
            equipped,
            crownChoiceGame: user.crown_choice_game,
            crownChoicePlace: user.crown_choice_place,
            crownChoiceHidden: !!user.crown_choice_hidden
        });
    } catch (e) {
        console.error('leaderboard-badges', e);
        return res.status(500).json({ message: 'Rozetler alınamadı.' });
    }
});

router.post('/crown-choice', async (req, res) => {
    try {
        const { sessionToken, game: rawGame, place: rawPlace, nickname: rawNick, clear } = req.body || {};
        const session = getSessionByToken(String(sessionToken || ''));
        if (!session?.username) {
            return res.status(401).json({ message: 'Oturum gerekli.' });
        }
        const user = await findUserByUsername(session.username);
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı yok.' });
        }
        if (clear === true || rawGame === '' || rawGame == null) {
            await clearUserCrownChoice(user.id);
            return res.json({ ok: true, cleared: true });
        }
        const game = assertLeaderboardGameId(rawGame);
        const place = Number(rawPlace);
        if (!Number.isFinite(place) || place < 1 || place > 3) {
            return res.status(400).json({ message: 'Sıra 1, 2 veya 3 olmalı.' });
        }
        const nickPost = String(rawNick || '').trim();
        const eligible = await getEligibleCrownBadges(user.id, [user.username, nickPost]);
        const ok = eligible.some((b) => b.game === game && b.place === place);
        if (!ok) {
            return res.status(400).json({ message: 'Bu oyun ve sıra için taç hakkın yok.' });
        }
        await updateUserCrownChoice(user.id, game, place);
        return res.json({ ok: true, game, place });
    } catch (e) {
        if (e && e.statusCode === 400) {
            return res.status(400).json({ message: e.message || 'Geçersiz istek.' });
        }
        console.error('crown-choice', e);
        return res.status(500).json({ message: 'Tercih kaydedilemedi.' });
    }
});

export default router;
