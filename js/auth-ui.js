'use strict';

import { registerUser, loginUser, guestLogin } from './api.js';

export function setupAuthUI(onLoginSuccess) {
    const screen = document.getElementById('auth-screen');
    if (!screen) return;

    const tabLogin = document.getElementById('auth-tab-login');
    const tabRegister = document.getElementById('auth-tab-register');
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const msg = document.getElementById('auth-msg');

    const switchTab = (mode) => {
        const isLogin = mode === 'login';
        tabLogin.classList.toggle('active', isLogin);
        tabRegister.classList.toggle('active', !isLogin);
        loginForm.style.display = isLogin ? 'block' : 'none';
        registerForm.style.display = isLogin ? 'none' : 'block';
        msg.textContent = '';
        msg.className = 'auth-msg';
    };

    const setMessage = (text, ok = false) => {
        msg.textContent = text;
        msg.className = `auth-msg ${ok ? 'ok' : 'err'}`;
    };

    tabLogin.addEventListener('click', () => switchTab('login'));
    tabRegister.addEventListener('click', () => switchTab('register'));

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
                const u = res?.username || 'Misafir';
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
            switchTab('login');
            document.getElementById('auth-login-username').value = username;
        } catch (err) {
            setMessage(err.message || 'Kayıt başarısız.');
        }
    });

    switchTab('login');
}

