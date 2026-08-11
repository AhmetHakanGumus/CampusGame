'use strict';

import { registerUser, loginUser, guestLogin } from './api.js';
import { sanitizePlainText } from './security.js';

export function setupAuthUI(onLoginSuccess) {
    const screen = document.getElementById('auth-screen');
    if (!screen) return;

    const panelLogin = document.getElementById('auth-panel-login');
    const panelRegister = document.getElementById('auth-panel-register');
    const heading = document.getElementById('auth-heading');
    const sub = document.getElementById('auth-sub');
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const msg = document.getElementById('auth-msg');
    const showRegister = document.getElementById('auth-show-register');
    const showLogin = document.getElementById('auth-show-login');

    const setMessage = (text, ok = false) => {
        msg.textContent = sanitizePlainText(text, 800);
        msg.className = `auth-msg ${ok ? 'ok' : 'err'}`;
    };

    const switchMode = (mode) => {
        const isLogin = mode === 'login';
        if (panelLogin) panelLogin.hidden = !isLogin;
        if (panelRegister) panelRegister.hidden = isLogin;
        if (heading) heading.textContent = isLogin ? 'Harran Kampüs' : 'Hesap oluştur';
        if (sub) {
            sub.textContent = isLogin
                ? 'Hesabınla giriş yap veya misafir ol'
                : 'Kullanıcı adı ve şifre ile kayıt ol';
        }
        msg.textContent = '';
        msg.className = 'auth-msg';
    };

    showRegister?.addEventListener('click', () => switchMode('register'));
    showLogin?.addEventListener('click', () => switchMode('login'));

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-login-username').value.trim();
        const password = document.getElementById('auth-login-password').value;
        if (!username || !password) return setMessage('Lütfen tüm alanları doldur.');
        try {
            const loginRes = await loginUser(username, password);
            setMessage('Giriş başarılı. Yükleniyor...', true);
            screen.style.display = 'none';
            await onLoginSuccess(loginRes?.username || username, loginRes?.sessionToken || '');
        } catch (err) {
            setMessage(err.message || 'Giriş başarısız.');
        }
    });

    const guestBtn = document.getElementById('auth-guest-btn');
    if (guestBtn) {
        guestBtn.addEventListener('click', async () => {
            setMessage('Misafir oturumu açılıyor...', true);
            try {
                const res = await guestLogin();
                const u = sanitizePlainText(res?.username || 'Misafir', 128);
                setMessage(`Hoş geldin, ${u}. Yükleniyor...`, true);
                screen.style.display = 'none';
                await onLoginSuccess(u, res?.sessionToken || '');
            } catch (err) {
                setMessage(err.message || 'Misafir girişi başarısız.');
            }
        });
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-register-username').value.trim();
        const password = document.getElementById('auth-register-password').value;
        if (!username || !password) return setMessage('Lütfen tüm alanları doldur.');
        try {
            await registerUser(username, password);
            setMessage('Kayıt başarılı. Şimdi giriş yapabilirsin.', true);
            switchMode('login');
            document.getElementById('auth-login-username').value = username;
        } catch (err) {
            setMessage(err.message || 'Kayıt başarısız.');
        }
    });

    switchMode('login');
}
