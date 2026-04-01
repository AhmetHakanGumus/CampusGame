import crypto from 'node:crypto';
import { createUser, findUserByUsername } from '../models/user.model.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { createLoginSession, isUsernameOnline } from '../session.store.js';

const GUEST_COOKIE = 'vr_guest_user';
const GUEST_USERNAME_RE = /^Misafir\d{5}$/;
const GUEST_COOKIE_MS = 365 * 24 * 60 * 60 * 1000;

function guestCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: GUEST_COOKIE_MS
    };
}

export async function register(req, res) {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ message: 'username ve password zorunlu.' });
        }

        if (GUEST_USERNAME_RE.test(String(username).trim())) {
            return res
                .status(400)
                .json({ message: 'Bu kullanıcı adı misafir hesapları için ayrılmıştır.' });
        }

        if (String(username).length < 3 || String(password).length < 6) {
            return res
                .status(400)
                .json({ message: 'username en az 3, password en az 6 karakter olmalı.' });
        }

        const passwordHash = await hashPassword(password);
        const user = await createUser(username, passwordHash);

        return res.status(201).json({
            message: 'Kayıt başarılı.',
            user
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Bu username zaten kullanılıyor.' });
        }
        return res.status(500).json({ message: 'Kayıt sırasında hata oluştu.' });
    }
}

export async function login(req, res) {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ message: 'username ve password zorunlu.' });
        }

        const user = await findUserByUsername(username);
        if (!user) {
            return res.status(401).json({ message: 'Geçersiz kullanıcı adı veya şifre.' });
        }

        if (isUsernameOnline(user.username)) {
            return res.status(409).json({ message: 'Bu hesap şu anda çevrimiçi. İkinci oturum açılamaz.' });
        }

        const isMatch = await verifyPassword(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Geçersiz kullanıcı adı veya şifre.' });
        }
        const sessionToken = createLoginSession(user.username);
        return res.json({
            message: 'success',
            username: user.username,
            sessionToken
        });
    } catch (error) {
        return res.status(500).json({ message: 'Giriş sırasında hata oluştu.' });
    }
}

export async function guest(req, res) {
    try {
        const fromCookie = req.cookies?.[GUEST_COOKIE];
        if (fromCookie && GUEST_USERNAME_RE.test(String(fromCookie))) {
            const user = await findUserByUsername(fromCookie);
            if (user && user.is_guest) {
                if (isUsernameOnline(user.username)) {
                    return res
                        .status(409)
                        .json({ message: 'Bu misafir oturumu şu an çevrimiçi. Önce diğer sekmeden çık.' });
                }
                const sessionToken = createLoginSession(user.username);
                res.cookie(GUEST_COOKIE, user.username, guestCookieOptions());
                return res.json({
                    message: 'success',
                    username: user.username,
                    sessionToken
                });
            }
        }

        for (let attempt = 0; attempt < 250; attempt++) {
            const n = crypto.randomInt(0, 100000);
            const username = `Misafir${String(n).padStart(5, '0')}`;
            const exists = await findUserByUsername(username);
            if (exists) continue;
            const randomSecret = crypto.randomBytes(32).toString('hex');
            const passwordHash = await hashPassword(randomSecret);
            await createUser(username, passwordHash, true);
            const sessionToken = createLoginSession(username);
            res.cookie(GUEST_COOKIE, username, guestCookieOptions());
            return res.status(201).json({
                message: 'success',
                username,
                sessionToken
            });
        }

        return res.status(503).json({ message: 'Şu an boş misafir kodu bulunamadı. Tekrar dene.' });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Misafir oluşturma çakışması. Tekrar dene.' });
        }
        return res.status(500).json({ message: 'Misafir girişi sırasında hata oluştu.' });
    }
}
