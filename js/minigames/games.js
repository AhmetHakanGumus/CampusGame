'use strict';

import { IS_MOB } from '../config.js';
import { G } from '../runtime.js';
import { playBeep, playArrowShoot } from '../audio.js';

class TableTennis {
    constructor(canvas, W, H, done) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d');
        this.W = W; this.H = H; this.done = done;
        this.vert = IS_MOB;
        this.totalScore = 0; this.rally = 0; this.gameOver = false;
        this.pPos = this.vert ? W / 2 : H / 2;
        this.cPos = this.vert ? W / 2 : H / 2;
        this._mm = e => this.onMouseMove(e);
        this._ts = e => this.onTouch(e);
        this._kb = e => this.onKey(e);
        this.resetBall();
    }
    resetBall() {
        this.bx = this.W / 2; this.by = this.H / 2;
        const spd = 5.5 + Math.min(this.rally * .1, 4);
        const ang = (Math.random() * .5 + .15) * (Math.random() < .5 ? 1 : -1);
        if (this.vert) {
            this.bvx = spd * Math.sin(ang);
            this.bvy = -Math.abs(spd * Math.cos(ang));
        } else {
            this.bvx = Math.abs(spd * Math.cos(ang));
            this.bvy = spd * Math.sin(ang);
        }
        this.br = 7;
        this.pLen = this.vert ? this.W * .28 : this.H * .22;
        this.rThick = 12;
        this.maxSpd = 16; this.rally = 0;
    }
    start() {
        document.addEventListener('mousemove', this._mm);
        this.canvas.addEventListener('touchstart', this._ts, { passive: false });
        this.canvas.addEventListener('touchmove', this._ts, { passive: false });
        document.addEventListener('keydown', this._kb);
        this.loop();
    }
    destroy() {
        document.removeEventListener('mousemove', this._mm);
        this.canvas.removeEventListener('touchstart', this._ts);
        this.canvas.removeEventListener('touchmove', this._ts);
        document.removeEventListener('keydown', this._kb);
    }
    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.pPos = Math.max(this.pLen / 2, Math.min(this.H - this.pLen / 2, (e.clientY - rect.top)));
    }
    onTouch(e) {
        e.preventDefault(); e.stopPropagation();
        const rect = this.canvas.getBoundingClientRect();
        const t = e.touches[0] || e.changedTouches[0]; if (!t) return;
        if (this.vert) {
            this.pPos = Math.max(this.pLen / 2, Math.min(this.W - this.pLen / 2, t.clientX - rect.left));
        } else {
            this.pPos = Math.max(this.pLen / 2, Math.min(this.H - this.pLen / 2, t.clientY - rect.top));
        }
    }
    onKey(e) {
        if (this.vert) {
            if (e.code === 'ArrowLeft') this.pPos = Math.max(this.pLen / 2, this.pPos - 20);
            if (e.code === 'ArrowRight') this.pPos = Math.min(this.W - this.pLen / 2, this.pPos + 20);
        } else {
            if (e.code === 'ArrowUp') this.pPos = Math.max(this.pLen / 2, this.pPos - 18);
            if (e.code === 'ArrowDown') this.pPos = Math.min(this.H - this.pLen / 2, this.pPos + 18);
        }
    }
    loop() { G.gameRaf = requestAnimationFrame(() => this.loop()); if (!this.gameOver) this.update(); this.draw(); }
    update() {
        if (this.vert) this.updateVert();
        else this.updateHoriz();
        document.getElementById('game-score-txt').textContent = `Skor: ${this.totalScore}`;
        document.getElementById('game-info-txt').textContent = `Rally: ${this.rally} | Her vuruş puan kazandırır!`;
    }
    updateVert() {
        const W = this.W, H = this.H, br = this.br;
        if (this.bvy < 0) this.cPos = Math.max(this.pLen / 2, Math.min(W - this.pLen / 2, this.bx));
        this.bx += this.bvx; this.by += this.bvy;
        if (this.bx - br < 0) { this.bx = br; this.bvx *= -1; playBeep(600, .07); }
        if (this.bx + br > W) { this.bx = W - br; this.bvx *= -1; playBeep(600, .07); }
        const cy = this.rThick + 2;
        if (this.by - br < cy + this.rThick && this.by > cy && this.bx > this.cPos - this.pLen / 2 && this.bx < this.cPos + this.pLen / 2) {
            this.by = cy + this.rThick + br + 1;
            this.bvy = Math.abs(this.bvy) * 1.02;
            this.bvx += (this.bx - this.cPos) / this.pLen * 3;
            this.bvy = Math.min(this.maxSpd, this.bvy);
            this.bvx = Math.max(-this.maxSpd, Math.min(this.maxSpd, this.bvx));
            playBeep(480, .07, .35);
        }
        const py = H - this.rThick - 2;
        if (this.by + br > py - this.rThick && this.by < py && this.bx > this.pPos - this.pLen / 2 && this.bx < this.pPos + this.pLen / 2) {
            this.by = py - this.rThick - br - 1;
            this.bvy = -Math.abs(this.bvy) * 1.04;
            this.bvx += (this.bx - this.pPos) / this.pLen * 4;
            this.bvy = Math.max(-this.maxSpd, this.bvy);
            this.bvx = Math.max(-this.maxSpd, Math.min(this.maxSpd, this.bvx));
            this.rally++;
            const pts = this.rally <= 3 ? 5 : this.rally <= 8 ? 8 : 12;
            this.totalScore += pts;
            playBeep(400, .07, .4);
        }
        if (this.by - br > H) {
            this.gameOver = true; playBeep(150, .4, .6);
            cancelAnimationFrame(G.gameRaf); G.gameRaf = null;
            this.drawGameOver();
            setTimeout(() => { document.getElementById('game-overlay').classList.remove('active'); G.gameRunning = false; this.done(this.totalScore); }, 1200);
        }
        if (this.by + br < 0) this.resetBall();
    }
    updateHoriz() {
        const W = this.W, H = this.H, br = this.br;
        const cx = W - this.rThick - 2;
        if (this.bvx > 0) this.cPos = Math.max(this.pLen / 2, Math.min(H - this.pLen / 2, this.by));
        this.bx += this.bvx; this.by += this.bvy;
        if (this.by - br < 0) { this.by = br; this.bvy *= -1; playBeep(600, .07); }
        if (this.by + br > H) { this.by = H - br; this.bvy *= -1; playBeep(600, .07); }
        if (this.bx + br > cx - this.rThick && this.bx < cx && this.by > this.cPos - this.pLen / 2 && this.by < this.cPos + this.pLen / 2) {
            this.bx = cx - this.rThick - br - 1;
            this.bvx = -Math.abs(this.bvx) * 1.02;
            this.bvy += (this.by - this.cPos) / this.pLen * 3;
            this.bvx = Math.max(-this.maxSpd, this.bvx);
            this.bvy = Math.max(-this.maxSpd, Math.min(this.maxSpd, this.bvy));
            playBeep(480, .07, .35);
        }
        const px = this.rThick + 2;
        if (this.bx - br < px + this.rThick && this.bx > px && this.by > this.pPos - this.pLen / 2 && this.by < this.pPos + this.pLen / 2) {
            this.bx = px + this.rThick + br + 1;
            this.bvx = Math.abs(this.bvx) * 1.04;
            this.bvy += (this.by - this.pPos) / this.pLen * 4;
            this.bvx = Math.min(this.maxSpd, this.bvx);
            this.bvy = Math.max(-this.maxSpd, Math.min(this.maxSpd, this.bvy));
            this.rally++;
            const pts = this.rally <= 3 ? 5 : this.rally <= 8 ? 8 : 12;
            this.totalScore += pts;
            playBeep(400, .07, .4);
        }
        if (this.bx - br < 0) {
            this.gameOver = true; playBeep(150, .4, .6);
            cancelAnimationFrame(G.gameRaf); G.gameRaf = null;
            this.drawGameOver();
            setTimeout(() => { document.getElementById('game-overlay').classList.remove('active'); G.gameRunning = false; this.done(this.totalScore); }, 1200);
        }
        if (this.bx + br > W) this.resetBall();
    }
    drawGameOver() {
        const c = this.ctx, W = this.W, H = this.H;
        this.draw();
        c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(0, 0, W, H);
        c.fillStyle = '#e74c3c'; c.font = `bold ${Math.min(W, H) * .1}px Cinzel,serif`; c.textAlign = 'center';
        c.fillText('OYUN BİTTİ', W / 2, H * .42);
        c.fillStyle = '#e8c870'; c.font = `bold ${Math.min(W, H) * .07}px Inter,Arial`;
        c.fillText(`Skor: ${this.totalScore}`, W / 2, H * .58);
    }
    draw() {
        const c = this.ctx, W = this.W, H = this.H;
        c.fillStyle = '#1a1a2e'; c.fillRect(0, 0, W, H);
        if (this.vert) {
            c.setLineDash([8, 8]); c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); c.setLineDash([]);
            c.fillStyle = 'rgba(50,200,50,.12)'; c.fillRect(0, 0, W, 8); c.fillRect(0, H - 8, W, 8);
            c.fillStyle = '#e74c3c';
            c.fillRect(this.cPos - this.pLen / 2, this.rThick + 2, this.pLen, this.rThick);
            c.fillStyle = '#e8c870';
            c.fillRect(this.pPos - this.pLen / 2, H - this.rThick * 2 - 2, this.pLen, this.rThick);
            c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, H / 2 - 2, W, 4);
            c.fillStyle = 'rgba(255,50,50,.5)'; c.font = `${H * .035}px Inter,Arial`; c.textAlign = 'center';
            c.fillText('BİLGİSAYAR', W / 2, this.rThick + 30);
            c.fillStyle = 'rgba(232,200,112,.5)';
            c.fillText('SEN', W / 2, H - this.rThick - 20);
        } else {
            c.setLineDash([8, 8]); c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.setLineDash([]);
            c.fillStyle = 'rgba(50,200,50,.12)'; c.fillRect(0, 0, W, 8); c.fillRect(0, H - 8, W, 8);
            c.fillStyle = '#e8c870';
            c.fillRect(this.rThick + 2, this.pPos - this.pLen / 2, this.rThick, this.pLen);
            c.fillStyle = '#e74c3c';
            c.fillRect(W - this.rThick * 2 - 2, this.cPos - this.pLen / 2, this.rThick, this.pLen);
        }
        c.fillStyle = '#fff'; c.beginPath(); c.arc(this.bx, this.by, this.br, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,.9)';
        c.font = `bold ${Math.min(W, H) * .1}px Cinzel,serif`; c.textAlign = 'center';
        c.fillText(this.totalScore, W / 2, this.vert ? H * .5 - 16 : H * .14);
        c.fillStyle = 'rgba(255,255,255,.25)';
        c.font = `${Math.min(W, H) * .04}px Inter,Arial`;
        c.fillText('SKOR', W / 2, this.vert ? H * .5 + 12 : H * .22);
        if (this.rally > 3) {
            c.fillStyle = 'rgba(232,200,112,.7)';
            c.font = `${Math.min(W, H) * .038}px Inter,Arial`;
            c.fillText(`🔥 ${this.rally} rally!`, W / 2, this.vert ? H * .5 + 36 : H * .88);
        }
    }
}

/* ════════════════════════════════════════════════
   ══ FLAPPY BIRD ══════════════════════════════
════════════════════════════════════════════════ */
class FlappyBird {
    constructor(canvas, W, H, done) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d');
        this.W = W; this.H = H; this.done = done;
        this._kb = e => { if (e.code === 'Space') this.flap(); };
        this._tc = e => { e.preventDefault(); e.stopPropagation(); this.flap(); };
        this._cl = () => this.flap();
    }
    start() {
        this.bird = { x: this.W * .22, y: this.H / 2, vy: 0, r: 16 };
        this.gravity = 0.42; this.flapPow = -8.5; this.pipes = [];
        this.pipeW = 54; this.gap = this.H * .32; this.pipeTimer = 0; this.pipeInterval = 110;
        this.score = 0; this.alive = true; this.started = false;
        this.frame = 0;
        document.addEventListener('keydown', this._kb);
        this.canvas.addEventListener('touchstart', this._tc, { passive: false });
        this.canvas.addEventListener('click', this._cl);
        this.loop();
    }
    destroy() {
        document.removeEventListener('keydown', this._kb);
        this.canvas.removeEventListener('touchstart', this._tc);
        this.canvas.removeEventListener('click', this._cl);
    }
    flap() {
        if (!this.alive) { return; }
        if (!this.started) this.started = true;
        this.bird.vy = this.flapPow;
        playBeep(700, .06, .3);
    }
    loop() {
        G.gameRaf = requestAnimationFrame(() => this.loop());
        this.update(); this.draw();
    }
    update() {
        if (!this.started || !this.alive) return;
        this.frame++;
        this.bird.vy += this.gravity;
        this.bird.y += this.bird.vy;
        if (this.bird.y - this.bird.r < 0 || this.bird.y + this.bird.r > this.H) { this.die(); return; }
        this.pipeTimer++;
        if (this.pipeTimer >= this.pipeInterval) {
            this.pipeTimer = 0;
            const top = this.H * .15 + Math.random() * (this.H * .55);
            this.pipes.push({ x: this.W, top, scored: false });
        }
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const p = this.pipes[i]; p.x -= 3.5;
            if (!p.scored && p.x + this.pipeW < this.bird.x) { p.scored = true; this.score++; playBeep(880, .08); }
            if (p.x + this.pipeW < 0) { this.pipes.splice(i, 1); continue; }
            const bx = this.bird.x, by = this.bird.y, br = this.bird.r;
            if (bx + br > p.x && bx - br < p.x + this.pipeW && (by - br < p.top || by + br > p.top + this.gap)) { this.die(); return; }
        }
        document.getElementById('game-score-txt').textContent = `Skor: ${this.score}`;
        document.getElementById('game-info-txt').textContent = 'Boşluklardan geç!';
    }
    die() {
        this.alive = false; playBeep(200, .3, .5);
        setTimeout(() => {
            cancelAnimationFrame(G.gameRaf); G.gameRaf = null;
            document.getElementById('game-overlay').classList.remove('active');
            G.gameRunning = false;
            this.done(this.score);
        }, 900);
    }
    draw() {
        const c = this.ctx, W = this.W, H = this.H;
        const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#87ceeb'); sky.addColorStop(1, '#c9e8f5');
        c.fillStyle = sky; c.fillRect(0, 0, W, H);
        c.fillStyle = '#8b6914'; c.fillRect(0, H - 24, W, 24);
        c.fillStyle = '#5a8a1a'; c.fillRect(0, H - 30, W, 8);
        this.pipes.forEach(p => {
            c.fillStyle = '#2ecc71';
            c.fillRect(p.x, 0, this.pipeW, p.top);
            c.fillRect(p.x, p.top + this.gap, this.pipeW, H - p.top - this.gap);
            c.fillStyle = '#27ae60';
            c.fillRect(p.x - 4, p.top - 18, this.pipeW + 8, 18);
            c.fillRect(p.x - 4, p.top + this.gap, this.pipeW + 8, 18);
        });
        const b = this.bird;
        c.save(); c.translate(b.x, b.y);
        c.rotate(Math.max(-0.5, Math.min(0.8, b.vy * .06)));
        c.fillStyle = '#f39c12'; c.beginPath(); c.arc(0, 0, b.r, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#e67e22'; c.beginPath(); c.arc(4, -4, b.r * .55, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'white'; c.beginPath(); c.arc(6, -6, b.r * .3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#333'; c.beginPath(); c.arc(8, -6, b.r * .15, 0, Math.PI * 2); c.fill();
        c.restore();
        c.fillStyle = 'rgba(0,0,0,.55)'; c.font = `bold ${H * .085}px Cinzel,serif`; c.textAlign = 'center';
        c.fillText(this.score, W / 2 + 2, H * .15 + 2); c.fillStyle = 'white'; c.fillText(this.score, W / 2, H * .15);
        if (!this.started) {
            c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 0, W, H);
            c.fillStyle = 'white'; c.font = `bold ${H * .055}px Cinzel,serif`; c.textAlign = 'center';
            c.fillText('Başlamak için tıkla veya Boşluk', W / 2, H / 2);
        }
        if (!this.alive) {
            c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, H);
            c.fillStyle = '#e74c3c'; c.font = `bold ${H * .08}px Cinzel,serif`; c.textAlign = 'center';
            c.fillText('GAME OVER', W / 2, H * .42);
            c.fillStyle = 'white'; c.font = `${H * .05}px Inter,Arial`;
            c.fillText('Skor: ' + this.score, W / 2, H * .55);
        }
    }
}

/* ════════════════════════════════════════════════
   ══ PENALTİ ATIŞI ════════════════════════════
════════════════════════════════════════════════ */
class Penalti {
    constructor(canvas, W, H, done) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d');
        this.W = W; this.H = H; this.done = done;
        this._cl = e => this.onClick(e);
        this._tc = e => this.onTap(e);
    }
    start() {
        this.shot = 0; this.goals = 0; this.missed = 0;
        this.state = 'aim';
        this.aimX = this.W / 2; this.aimY = this.H * .38;
        this.aimDx = 3.5; this.aimDy = 1.8;
        this.ballX = this.W / 2; this.ballY = this.H * .82;
        this.ballTx = 0; this.ballTy = 0;
        this.keeperX = this.W / 2; this.keeperDir = 1; this.keeperSpeed = 4.5;
        this.keeperDive = -1;
        this.msg = ''; this.msgT = 0;
        this.canvas.addEventListener('click', this._cl);
        this.canvas.addEventListener('touchstart', this._tc, { passive: false });
        this.loop();
    }
    destroy() {
        this.canvas.removeEventListener('click', this._cl);
        this.canvas.removeEventListener('touchstart', this._tc);
    }
    onClick(e) { const rect = this.canvas.getBoundingClientRect(); this.shoot(e.clientX - rect.left, e.clientY - rect.top); }
    onTap(e) { e.preventDefault(); e.stopPropagation(); const rect = this.canvas.getBoundingClientRect(); const t = e.touches[0] || e.changedTouches[0]; this.shoot(t.clientX - rect.left, t.clientY - rect.top); }
    shoot(mx, my) {
        if (this.state !== 'aim') return;
        this.ballTx = this.aimX; this.ballTy = this.aimY;
        this.keeperFrozenX = this.keeperX;
        this.state = 'fly'; this.flyT = 0;
        playBeep(300, .08, .5);
    }
    loop() { G.gameRaf = requestAnimationFrame(() => this.loop()); this.update(); this.draw(); }
    update() {
        const W = this.W, H = this.H;
        if (this.state === 'aim') {
            this.aimX += this.aimDx; this.aimY += this.aimDy;
            const goalL = W * .2, goalR = W * .8, goalT = H * .18, goalB = H * .48;
            if (this.aimX < goalL || this.aimX > goalR) this.aimDx *= -1;
            if (this.aimY < goalT || this.aimY > goalB) this.aimDy *= -1;
            this.keeperX += this.keeperDir * this.keeperSpeed;
            if (this.keeperX < W * .3 || this.keeperX > W * .7) this.keeperDir *= -1;
        } else if (this.state === 'fly') {
            this.flyT = Math.min(1, this.flyT + .05);
            this.ballX = this.W / 2 + (this.ballTx - this.W / 2) * this.flyT;
            this.ballY = H * .82 + (this.ballTy - H * .82) * this.flyT;
            if (this.flyT >= 1) {
                const tx = this.ballTx, ty = this.ballTy;
                const goalL = W * .22, goalR = W * .78, goalT = H * .18, goalB = H * .48;
                const inGoal = tx > goalL && tx < goalR && ty > goalT && ty < goalB;
                const keeperReach = 50;
                const keeperBlocks = inGoal && Math.abs(tx - this.keeperFrozenX) < keeperReach;
                if (inGoal && !keeperBlocks) {
                    this.goals++; this.msg = '⚽ GOL! +10'; playBeep(880, .2, .6); setTimeout(() => playBeep(1100, .15, .5), 200);
                } else if (!inGoal) {
                    this.missed++; this.msg = '😬 Kaçtı!'; playBeep(200, .25, .5);
                } else {
                    this.missed++; this.msg = '🧤 Kurtardı!'; playBeep(300, .2, .4);
                }
                this.msgT = 90; this.shot++;
                if (this.missed >= 3) {
                    this.state = 'gameover'; this.msgT = 120;
                    setTimeout(() => {
                        cancelAnimationFrame(G.gameRaf); G.gameRaf = null;
                        document.getElementById('game-overlay').classList.remove('active'); G.gameRunning = false;
                        this.done(this.goals * 10);
                    }, 1600);
                } else {
                    this.state = 'result';
                    this.keeperSpeed = 4.5 + Math.min(this.goals * .3, 4);
                    setTimeout(() => { this.state = 'aim'; this.ballX = this.W / 2; this.ballY = H * .82; }, 1400);
                }
            }
        }
        document.getElementById('game-score-txt').textContent = `Skor: ${this.goals * 10} | Gol: ${this.goals} | ❌ ${this.missed}/3`;
        document.getElementById('game-info-txt').textContent = '3 kaçırınca oyun biter!';
    }
    draw() {
        const c = this.ctx, W = this.W, H = this.H;
        c.fillStyle = '#2e7d32'; c.fillRect(0, 0, W, H);
        c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(W / 2, H * .75, W * .2, H * .12, 0, 0, Math.PI * 2); c.stroke();
        const gL = W * .2, gR = W * .8, gT = H * .18, gB = H * .48;
        c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(gL, gT, gR - gL, gB - gT);
        c.strokeStyle = 'white'; c.lineWidth = 3; c.strokeRect(gL, gT, gR - gL, gB - gT);
        c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 1;
        for (let x = gL + 40; x < gR; x += 40) { c.beginPath(); c.moveTo(x, gT); c.lineTo(x, gB); c.stroke(); }
        for (let y = gT + 28; y < gB; y += 28) { c.beginPath(); c.moveTo(gL, y); c.lineTo(gR, y); c.stroke(); }
        const kx = this.keeperX; const ky = gT + 8;
        const kBodyH = gB - ky - 4;
        c.fillStyle = '#e74c3c'; c.fillRect(kx - 22, ky, 44, kBodyH);
        c.fillStyle = '#f0c8a0'; c.beginPath(); c.arc(kx, ky - 14, 16, 0, Math.PI * 2); c.fill();
        if (this.state === 'aim') {
            c.strokeStyle = 'rgba(255,255,0,.8)'; c.lineWidth = 2;
            c.beginPath(); c.arc(this.aimX, this.aimY, 14, 0, Math.PI * 2); c.stroke();
            c.beginPath(); c.moveTo(this.aimX - 20, this.aimY); c.lineTo(this.aimX + 20, this.aimY); c.stroke();
            c.beginPath(); c.moveTo(this.aimX, this.aimY - 20); c.lineTo(this.aimX, this.aimY + 20); c.stroke();
        }
        c.fillStyle = 'white'; c.beginPath(); c.arc(this.ballX, this.ballY, 12, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#333'; c.lineWidth = 1.5; c.stroke();
        if (this.msg && this.msgT > 0) {
            this.msgT--;
            c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(W * .3, H * .55, W * .4, H * .14);
            c.fillStyle = '#ffdd44'; c.font = `bold ${H * .07}px Cinzel,serif`; c.textAlign = 'center';
            c.fillText(this.msg, W / 2, H * .65);
        }
        c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(W * .25, H * .03, W * .5, H * .1);
        c.fillStyle = 'white'; c.font = `bold ${H * .055}px Inter,Arial`; c.textAlign = 'center';
        c.fillText(`⚽ ${this.goals} Gol  ❌ ${this.missed || 0}/3`, W / 2, H * .1);
        if (this.state === 'aim') {
            c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `${H * .04}px Inter,Arial`;
            c.fillText('Ekrana tıkla – tam hedef üstüne!', W / 2, H * .94);
        }
        if (this.state === 'gameover') {
            c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, W, H);
            c.fillStyle = '#e74c3c'; c.font = `bold ${H * .09}px Cinzel,serif`; c.textAlign = 'center';
            c.fillText('OYUN BİTTİ', W / 2, H * .42);
            c.fillStyle = '#e8c870'; c.font = `bold ${H * .07}px Inter,Arial`;
            c.fillText(`Skor: ${this.goals * 10}`, W / 2, H * .58);
        }
    }
}

/* ════════════════════════════════════════════════
   ══ OKÇULUK ══════════════════════════════════
════════════════════════════════════════════════ */
class Archery {
    constructor(canvas, W, H, done) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d');
        this.W = W; this.H = H; this.done = done;
        this.points = 0;
        this.missLeft = 5;
        this.totalShots = 0;
        this.state = 'aim';
        this.tx = W / 2; this.ty = H * .32; this.tdx = 2.5;
        this.tr = Math.min(W, H) * .13;
        this.arrowFlyX = W / 2; this.arrowFlyY = H * .82;
        this.flyT = 0;
        this.msg = ''; this.msgT = 0;
        this.drawPct = 0; this.holding = false; this.holdStart = 0; this.DRAW_TIME = 500;
    }
    start() {
        this.drawPct = 0;
        this.holding = false;
        this.holdStart = 0;
        this.DRAW_TIME = 500;
        this._pd = e => { e.preventDefault(); this.pressDown(); };
        this._pu = e => { e.preventDefault(); this.pressUp(); };
        this._td = e => { e.preventDefault(); e.stopPropagation(); this.pressDown(); };
        this._tu = e => { e.preventDefault(); e.stopPropagation(); this.pressUp(); };
        this._kb = e => { if (e.code === 'Space') { e.preventDefault(); if (!this.holding) this.pressDown(); } };
        this._kr = e => { if (e.code === 'Space') { e.preventDefault(); this.pressUp(); } };
        this.canvas.addEventListener('mousedown', this._pd);
        document.addEventListener('mouseup', this._pu);
        this.canvas.addEventListener('touchstart', this._td, { passive: false });
        this.canvas.addEventListener('touchend', this._tu, { passive: false });
        document.addEventListener('keydown', this._kb);
        document.addEventListener('keyup', this._kr);
        this.loop();
    }
    destroy() {
        this.canvas.removeEventListener('mousedown', this._pd);
        document.removeEventListener('mouseup', this._pu);
        this.canvas.removeEventListener('touchstart', this._td);
        this.canvas.removeEventListener('touchend', this._tu);
        document.removeEventListener('keydown', this._kb);
        document.removeEventListener('keyup', this._kr);
    }
    pressDown() {
        if (this.state !== 'aim' || this.holding) return;
        this.holding = true;
        this.holdStart = performance.now();
        this.drawPct = 0;
        if (!this._bowAudio) {
            this._bowAudio = new Audio('/Sounds/bow_draw.mp3');
            this._bowAudio.volume = 0.7;
        }
        this._bowAudio.currentTime = 0;
        this._bowAudio.play().catch(() => { });
    }
    pressUp() {
        if (!this.holding) return;
        this.holding = false;
        if (this._bowAudio) { this._bowAudio.pause(); this._bowAudio.currentTime = 0; }
        if (this.state !== 'aim') return;
        if (this.drawPct >= 0.1) this.shoot();
        else this.drawPct = 0;
    }
    shoot() {
        if (this.state !== 'aim') return;
        this.arrowFlyX = this.W / 2;
        this.arrowFlyY = this.H * .82;
        this.state = 'fly'; this.flyT = 0; this.totalShots++;
        this.drawPct = 0;
        playArrowShoot();
    }
    loop() { G.gameRaf = requestAnimationFrame(() => this.loop()); this.update(); this.draw(); }
    update() {
        const W = this.W;
        if (this.holding && this.state === 'aim') {
            this.drawPct = Math.min(1, (performance.now() - this.holdStart) / this.DRAW_TIME);
        }
        this.tx += this.tdx;
        if (this.tx - this.tr < W * .08) this.tdx = Math.abs(this.tdx);
        if (this.tx + this.tr > W * .92) this.tdx = -Math.abs(this.tdx);

        if (this.state === 'fly') {
            this.flyT = Math.min(1, this.flyT + .07);
            this.arrowFlyY = this.H * .82 + (this.ty - this.H * .82) * this.flyT;
            if (this.flyT >= 1) {
                const hitDist = Math.abs(this.tx - this.W / 2);
                let pts = 0;
                if (hitDist < this.tr * .18) { pts = 100; this.msg = '🎯 TAM ORTA! +100'; }
                else if (hitDist < this.tr * .38) { pts = 70; this.msg = '🏹 Çok iyi! +70'; }
                else if (hitDist < this.tr * .62) { pts = 40; this.msg = '👍 Güzel! +40'; }
                else if (hitDist < this.tr) { pts = 10; this.msg = '✅ Değdi! +10'; }
                else { pts = 0; this.msg = '❌ Kaçtı!'; }
                this.points += pts;
                if (pts === 0) this.missLeft--;
                if (pts > 0) playBeep(880, .12, .4); else playBeep(220, .2, .4);
                this.msgT = 75;
                this.state = 'result';
                setTimeout(() => {
                    if (this.missLeft <= 0) {
                        cancelAnimationFrame(G.gameRaf); G.gameRaf = null;
                        document.getElementById('game-overlay').classList.remove('active'); G.gameRunning = false;
                        this.done(this.points);
                    } else {
                        this.state = 'aim';
                        const spd = Math.min(9, 2.5 + this.totalShots * 0.18);
                        this.tdx = spd * (this.tdx > 0 ? 1 : -1);
                    }
                }, 1200);
            }
        }
        if (this.msgT > 0) this.msgT--;
        document.getElementById('game-score-txt').textContent = `Skor: ${this.points}`;
        document.getElementById('game-info-txt').textContent = `❤️ ${this.missLeft} ıskalama hakkı | Basılı tut → Bırak!`;
    }
    draw() {
        const c = this.ctx, W = this.W, H = this.H;
        const bg = c.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#87ceeb'); bg.addColorStop(.55, '#87ceeb');
        bg.addColorStop(.551, '#4a7c3f'); bg.addColorStop(1, '#3a6230');
        c.fillStyle = bg; c.fillRect(0, 0, W, H);
        const rings = [{ r: this.tr, col: '#fff' }, { r: this.tr * .8, col: '#000' },
        { r: this.tr * .6, col: '#4169e1' }, { r: this.tr * .4, col: '#e74c3c' }, { r: this.tr * .2, col: '#ffd700' }];
        rings.forEach(({ r, col }) => { c.fillStyle = col; c.beginPath(); c.arc(this.tx, this.ty, r, 0, Math.PI * 2); c.fill(); });
        c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 1.5; c.beginPath(); c.arc(this.tx, this.ty, this.tr, 0, Math.PI * 2); c.stroke();
        if (this.state === 'aim') {
            const arr = this.tdx > 0 ? '→' : '←';
            c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `${H * .04}px Arial`; c.textAlign = 'center';
            c.fillText(arr, this.tx + (this.tdx > 0 ? this.tr + 14 : -(this.tr + 14)), this.ty + 5);
        }
        const cx = W / 2, cy = H * .82;
        c.strokeStyle = 'rgba(255,50,50,.9)'; c.lineWidth = 2;
        c.beginPath(); c.arc(cx, cy, 14, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(cx - 22, cy); c.lineTo(cx + 22, cy); c.stroke();
        c.beginPath(); c.moveTo(cx, cy - 22); c.lineTo(cx, cy + 22); c.stroke();
        c.fillStyle = 'rgba(255,80,80,.7)'; c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
        if (this.state === 'fly' || this.state === 'result') {
            const ax = this.W / 2, ay = this.arrowFlyY;
            c.strokeStyle = '#8b4513'; c.lineWidth = 3; c.lineCap = 'round';
            c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax, ay + 20); c.stroke();
            c.fillStyle = '#ccc'; c.beginPath();
            c.moveTo(ax, ay - 14); c.lineTo(ax - 5, ay); c.lineTo(ax + 5, ay); c.closePath(); c.fill();
        }
        c.fillStyle = '#1a4f8a'; c.fillRect(W / 2 - 12, H * .85, 24, 38);
        c.fillStyle = '#a0522d'; c.beginPath(); c.arc(W / 2, H * .82, 13, 0, Math.PI * 2); c.fill();
        const pct = this.drawPct || 0;
        const bowCurve = 20 + pct * 18;
        const bowAng = 0.55 + pct * 0.35;
        c.strokeStyle = '#8b4513'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(W / 2 - 16, H * .85, bowCurve, -bowAng, bowAng); c.stroke();
        const bowX1 = W / 2 - 16 + bowCurve * Math.cos(-bowAng), bowY1 = H * .85 + bowCurve * Math.sin(-bowAng);
        const bowX2 = W / 2 - 16 + bowCurve * Math.cos(bowAng), bowY2 = H * .85 + bowCurve * Math.sin(bowAng);
        if (pct > 0.05) {
            const pull = pct * 14;
            c.strokeStyle = '#ddd'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(bowX1, bowY1); c.lineTo(W / 2 + 6 + pull, H * .82); c.lineTo(bowX2, bowY2); c.stroke();
            c.strokeStyle = '#8b4513'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(W / 2, H * .82 - 16 - pct * 18); c.lineTo(W / 2 + 6 + pull, H * .82 + 4); c.stroke();
            c.fillStyle = '#ccc'; c.beginPath(); c.moveTo(W / 2, H * .82 - 28 - pct * 18); c.lineTo(W / 2 - 4, H * .82 - 16 - pct * 18); c.lineTo(W / 2 + 4, H * .82 - 16 - pct * 18); c.closePath(); c.fill();
        } else {
            c.strokeStyle = '#ddd'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(bowX1, bowY1); c.lineTo(bowX2, bowY2); c.stroke();
        }
        if (this.holding || pct > 0) {
            const bw = W * .5, bh = IS_MOB ? 20 : 14, bx2 = W * .25, by2 = H * .93;
            c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(bx2, by2, bw, bh);
            const gc = c.createLinearGradient(bx2, 0, bx2 + bw, 0);
            gc.addColorStop(0, '#2ecc71'); gc.addColorStop(0.6, '#f39c12'); gc.addColorStop(1, '#e74c3c');
            c.fillStyle = gc; c.fillRect(bx2, by2, bw * pct, bh);
            c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5; c.strokeRect(bx2, by2, bw, bh);
            c.strokeStyle = '#00ff88'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(bx2 + bw, by2 - 3); c.lineTo(bx2 + bw, by2 + bh + 3); c.stroke();
            c.fillStyle = 'white'; c.font = `${H * .034}px Inter,Arial`; c.textAlign = 'center';
            const label = pct >= 1 ? '🔥 TAM GERİLDİ – BIRAK!' : 'Basılı tut…';
            c.fillText(label, W / 2, by2 - 5);
        }
        if (this.msg && this.msgT > 0) {
            c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(W * .05, H * .58, W * .9, H * .12);
            c.fillStyle = '#ffdd44'; c.font = `bold ${H * .068}px Cinzel,serif`; c.textAlign = 'center';
            c.fillText(this.msg, W / 2, H * .66);
        }
        c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, H * .09);
        c.fillStyle = 'white'; c.font = `bold ${H * .052}px Inter,Arial`; c.textAlign = 'center';
        c.fillText(`🎯 ${this.points} puan`, W * .3, H * .065);
        let hearts = '';
        for (let i = 0; i < 5; i++) hearts += i < this.missLeft ? '❤️' : '🖤';
        c.font = `${H * .042}px Arial`; c.textAlign = 'center';
        c.fillText(hearts, W * .72, H * .063);
    }
}

/* ════════════════════════════════════════════════
   ══ BASKETBOL ════════════════════════════════
════════════════════════════════════════════════ */
class Basketball {
    constructor(canvas, W, H, done) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d');
        this.W = W; this.H = H; this.done = done;
        this.points = 0; this.attempts = 0; this.missLeft = 6;
        this.state = 'charge';
        this.power = 0; this.powerDir = 1; this.powerSpd = 1.8;
        this.bx = W * .18; this.by = H * .72;
        this.bvx = 0; this.bvy = 0; this.br = IS_MOB ? 14 : 18;
        this.hoopX = W * .78; this.hoopY = H * .28; this.hoopR = IS_MOB ? W * .06 : W * .055;
        this.msg = ''; this.msgT = 0; this.trail = []; this.frameN = 0;
        this._cl = e => this.onRelease();
        this._tc = e => { e.preventDefault(); e.stopPropagation(); this.tryShoot(); };
        this._km = e => { if (e.code === 'Space') this.tryShoot(); };
    }
    start() {
        this.canvas.addEventListener('click', this._cl);
        this.canvas.addEventListener('touchstart', this._tc, { passive: false });
        document.addEventListener('keydown', this._km);
        this.loop();
    }
    destroy() {
        this.canvas.removeEventListener('click', this._cl);
        this.canvas.removeEventListener('touchstart', this._tc);
        document.removeEventListener('keydown', this._km);
    }
    onRelease() { this.tryShoot(); }
    tryShoot() {
        if (this.state !== 'charge') return;
        const dx = this.hoopX - this.bx, dy = this.hoopY - this.by;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const baseSpd = dist * 0.022 * (0.6 + this.power / 100 * 0.65);
        const ang = Math.atan2(dy, dx);
        this.bvx = baseSpd * Math.cos(ang) * 0.7;
        this.bvy = baseSpd * Math.sin(ang) - baseSpd * 0.9;
        this.state = 'fly'; this.trail = [];
        playBeep(300, .08, .5);
    }
    loop() { G.gameRaf = requestAnimationFrame(() => this.loop()); this.frameN++; this.update(); this.draw(); }
    update() {
        const W = this.W, H = this.H;
        if (this.state === 'charge') {
            const spd = Math.min(3.5, 1.8 + this.attempts * 0.08);
            this.power += this.powerDir * spd;
            if (this.power >= 100) { this.power = 100; this.powerDir = -1; }
            if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
        } else if (this.state === 'fly') {
            this.bvy += 0.38;
            this.bx += this.bvx; this.by += this.bvy;
            this.trail.push({ x: this.bx, y: this.by });
            if (this.trail.length > 18) this.trail.shift();
            const dx = this.bx - this.hoopX, dy = this.by - this.hoopY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const scored = dist < this.hoopR + this.br * .6 && this.bvy > 0 && this.by > this.hoopY - 10;
            const missed = this.bx > W * 1.05 || this.by > H + 40 || this.bx < -20;
            if (scored || missed) {
                this.attempts++;
                if (scored) {
                    const pts = this.power > 40 && this.power < 70 ? 30 : 20;
                    this.points += pts;
                    this.msg = `🏀 BASKET! +${pts}`;
                    playBeep(880, .2, .5); setTimeout(() => playBeep(1100, .15, .4), 180);
                } else {
                    this.missLeft--;
                    this.msg = '❌ Kaçtı!'; playBeep(200, .22, .4);
                }
                this.msgT = 80; this.state = 'result';
                setTimeout(() => {
                    if (this.missLeft <= 0) {
                        cancelAnimationFrame(G.gameRaf); G.gameRaf = null;
                        document.getElementById('game-overlay').classList.remove('active'); G.gameRunning = false;
                        this.done(this.points);
                    } else {
                        this.bx = W * .18; this.by = H * .72; this.trail = [];
                        this.power = 0; this.powerDir = 1; this.state = 'charge';
                    }
                }, 1300);
            }
        } else if (this.state === 'result') { if (this.msgT > 0) this.msgT--; }
        document.getElementById('game-score-txt').textContent = `Skor: ${this.points}`;
        document.getElementById('game-info-txt').textContent = `❤️ ${this.missLeft} hak | Doğru anda tıkla!`;
    }
    draw() {
        const c = this.ctx, W = this.W, H = this.H;
        c.fillStyle = '#c47a20'; c.fillRect(0, 0, W, H * .85);
        c.fillStyle = '#5a3a10'; c.fillRect(0, H * .85, W, H * .15);
        c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * W / 7, 0); c.lineTo(i * W / 7, H * .85); c.stroke(); }
        c.beginPath(); c.arc(W / 2, H * .7, W * .18, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.88)'; c.fillRect(this.hoopX - W * .1, this.hoopY - H * .18, W * .19, H * .22);
        c.strokeStyle = '#e74c3c'; c.lineWidth = 2; c.strokeRect(this.hoopX - W * .055, this.hoopY - H * .08, W * .11, H * .1);
        c.strokeStyle = '#ff6600'; c.lineWidth = IS_MOB ? 4 : 5;
        c.beginPath(); c.arc(this.hoopX, this.hoopY, this.hoopR, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.2;
        for (let i = 0; i < 6; i++) {
            const a1 = i / 6 * Math.PI;
            c.beginPath(); c.moveTo(this.hoopX + this.hoopR * Math.cos(a1 + Math.PI / 6), this.hoopY + this.hoopR * Math.sin(a1 + Math.PI / 6));
            c.lineTo(this.hoopX + this.hoopR * .6 * Math.cos(a1 + Math.PI / 6 + .5), this.hoopY + this.hoopR * .8 + this.hoopR * .3 * Math.sin(.5));
            c.stroke();
        }
        c.fillStyle = '#888'; c.fillRect(this.hoopX + this.hoopR - 2, this.hoopY, 5, H * .7 - this.hoopY);
        this.trail.forEach((p, i) => {
            const a = i / this.trail.length;
            c.fillStyle = `rgba(231,76,60,${a * .4})`; c.beginPath(); c.arc(p.x, p.y, this.br * a * .6, 0, Math.PI * 2); c.fill();
        });
        c.fillStyle = '#e74c3c'; c.beginPath(); c.arc(this.bx, this.by, this.br, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#c0392b'; c.lineWidth = 1.5; c.stroke();
        c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(this.bx, this.by, this.br, 0, Math.PI); c.stroke();
        c.beginPath(); c.moveTo(this.bx - this.br, this.by); c.lineTo(this.bx + this.br, this.by); c.stroke();
        c.fillStyle = '#1a4f8a'; c.fillRect(this.W * .08, H * .58, 22, 38);
        c.fillStyle = '#a0522d'; c.beginPath(); c.arc(this.W * .09 + 11, H * .55, 13, 0, Math.PI * 2); c.fill();
        if (this.state === 'charge') {
            const bw = W * .5, bh = IS_MOB ? 22 : 16, bx2 = W * .25, by2 = H * .9;
            c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(bx2, by2, bw, bh);
            const pct = this.power / 100;
            const gc = c.createLinearGradient(bx2, 0, bx2 + bw, 0);
            gc.addColorStop(0, '#2ecc71'); gc.addColorStop(.5, '#f39c12'); gc.addColorStop(1, '#e74c3c');
            c.fillStyle = gc; c.fillRect(bx2, by2, bw * pct, bh);
            c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.5; c.strokeRect(bx2, by2, bw, bh);
            c.strokeStyle = '#00ff88'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(bx2 + bw * .4, by2 - 2); c.lineTo(bx2 + bw * .4, by2 + bh + 2); c.stroke();
            c.beginPath(); c.moveTo(bx2 + bw * .7, by2 - 2); c.lineTo(bx2 + bw * .7, by2 + bh + 2); c.stroke();
            c.fillStyle = '#00ff88'; c.font = `${H * .032}px Inter,Arial`; c.textAlign = 'center';
            c.fillText('İdeal', bx2 + bw * .55, by2 - 5);
            c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `${H * .038}px Inter,Arial`;
            c.fillText('Tıkla / Boşluk → At!', W / 2, by2 + bh + H * .04);
        }
        if (this.msg && this.msgT > 0) {
            c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(W * .1, H * .42, W * .8, H * .13);
            c.fillStyle = '#ffdd44'; c.font = `bold ${H * .08}px Cinzel,serif`; c.textAlign = 'center';
            c.fillText(this.msg, W / 2, H * .51);
        }
        c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, H * .08);
        c.fillStyle = 'white'; c.font = `bold ${H * .048}px Inter,Arial`; c.textAlign = 'center';
        c.fillText(`🏀 ${this.points} puan`, W * .3, H * .058);
        let hearts = '';
        for (let i = 0; i < 6; i++) hearts += i < this.missLeft ? '❤️' : '🖤';
        c.font = `${H * .038}px Arial`; c.textAlign = 'center';
        c.fillText(hearts, W * .72, H * .055);
    }
}

export { TableTennis, FlappyBird, Penalti, Archery, Basketball };
