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

// İçerik (binalar/spotlar) ayrı modüllere taşındı.
// Önemli: Gap Yenev için mapPolygon/x/z hesabı `js/campus/initCampusContent.js` → `gapYenevPolygon.js` içinde yapılır.
// Bu yüzden aynı BUILDINGS array referansını re-export ediyoruz.
export { BUILDINGS } from './content/buildings.js';
export { SPOTS } from './content/spots.js';

export const NPC_COLORS = [0xe74c3c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xf39c12, 0x27ae60, 0xe91e63, 0x00bcd4, 0xff5722, 0x607d8b];

/** PC `CFG.walkSpeed` ile aynı taban; koşu çarpanı campus-app’te 1.8. */
export const VR_WALK_SPEED = CFG.walkSpeed;
export const VR_TURN_SPEED = 1.8;
export const VR_DEADZONE = 0.25;
export const SNAP_ANGLE = Math.PI / 6;
