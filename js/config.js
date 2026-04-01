'use strict';

export const SB_URL = 'https://tjruztswfsgiufooahjr.supabase.co';
export const SB_KEY = 'sb_publishable_V_qyuWJxYJiuu46yG3PXPQ_vu71TAcD';
export const SB_TABLE = 'campus_scores';

export const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
export const IS_MOB = !IS_QUEST && (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 1)
    || window.matchMedia('(pointer:coarse)').matches
);

export const CFG = { walkSpeed: 6.5, npcSpeed: 1.9, npcCount: 18, camDist: 8.5, camHeightBase: 3.8, speakDist: 11, greetCool: 9, bubbleDurMs: 4000, mouseSens: .0022, touchSens: .007, proxDist: 20, joyRadius: 44, joyTurn: 2.2, interactDist: 7 };

export const DIALOGUES = ["Merhaba! 👋", "Bugün dersin var mı?", "Hocam çok anlatıyor...", "Kütüphaneye gidiyorum!", "Yemekhanede buluşalım!", "Sınavlar yaklaşıyor 😅", "Proje ödevim bitmedi!", "Harran'a hoş geldin! 🎓", "Nasılsın, iyi misin?", "Kampüs çok güzel değil mi?", "Şimdi derse gidiyorum.", "Bugün hava çok güzel!", "Bize katıl! 😄", "Koridorda görüşürüz!", "Ödev teslimi yarın...", "Ring yine mi dolu!"];

export const BUILDINGS = [
    { x: 0, z: -62, w: 42, h: 19, d: 22, color: 0xc9986a, css: '#c9986a', name: "Ana Bina" },
    { x: -56, z: -46, w: 29, h: 15, d: 19, color: 0x6a8faf, css: '#6a8faf', name: "Kütüphane" },
    { x: 56, z: -46, w: 29, h: 15, d: 19, color: 0x6a8faf, css: '#6a8faf', name: "Mühendislik Fak." },
    { x: -56, z: 14, w: 25, h: 13, d: 18, color: 0x78a878, css: '#78a878', name: "Fen-Edebiyat Fak." },
    { x: 56, z: 14, w: 25, h: 13, d: 18, color: 0x78a878, css: '#78a878', name: "İktisadi Bilimler" },
    { x: 0, z: 26, w: 34, h: 10, d: 22, color: 0xd0b28a, css: '#d0b28a', name: "Rektörlük" },
    { x: -80, z: -66, w: 18, h: 22, d: 30, color: 0xa07cb0, css: '#a07cb0', name: "Yurt A" },
    { x: 80, z: -66, w: 18, h: 22, d: 30, color: 0xa07cb0, css: '#a07cb0', name: "Yurt B" },
    { x: -30, z: -87, w: 19, h: 11, d: 15, color: 0x7aaac4, css: '#7aaac4', name: "Spor Salonu (BESYO)" },
    { x: 30, z: -87, w: 19, h: 11, d: 15, color: 0x7aaac4, css: '#7aaac4', name: "Sağlık Merkezi" },
    { x: 0, z: -33, w: 12, h: 5, d: 12, color: 0xc4b08a, css: '#c4b08a', name: "Güvenlik" },
];

export const SPOTS = [
    { id: 'masa_tenisi', icon: '🏓', title: 'Masa Tenisi', sub: 'BESYO yakınında masa tenisi masası', pos: { x: -18, z: -75 }, game: 'tt' },
    { id: 'flappy_bird', icon: '🕹️', title: 'Oyun Makinesi', sub: 'Mühendislik Fakültesi girişinde', pos: { x: 42, z: -36 }, game: 'fb' },
    { id: 'penalti', icon: '⚽', title: 'Penaltı Atışı', sub: 'BESYO spor alanında', pos: { x: -42, z: -78 }, game: 'ft' },
    { id: 'okculuk', icon: '🏹', title: 'Okçuluk', sub: 'Fen-Edebiyat yanı okçuluk pisti', pos: { x: -70, z: 28 }, game: 'ok' },
    { id: 'basket', icon: '🏀', title: 'Basketbol', sub: 'Yurt A karşısı basketbol sahası', pos: { x: -72, z: -44 }, game: 'bk' },
    { id: 'satranc', icon: '♟️', title: 'Satranç', sub: 'Ana meydan satranç masası', pos: { x: 10, z: 42 }, game: 'ch' }
];

export const NPC_COLORS = [0xe74c3c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xf39c12, 0x27ae60, 0xe91e63, 0x00bcd4, 0xff5722, 0x607d8b];

export const VR_WALK_SPEED = 5;
export const VR_TURN_SPEED = 1.8;
export const VR_DEADZONE = 0.25;
export const SNAP_ANGLE = Math.PI / 6;
