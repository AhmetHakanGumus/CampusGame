/** Oda içi taç yenilemesi — app.js kaydeder, leaderboard vb. tetikler. */
let refreshRoomCrowns = null;

export function registerCampusCrownRoomRefresh(fn) {
    refreshRoomCrowns = typeof fn === 'function' ? fn : null;
}

export function requestCampusCrownRoomRefresh() {
    refreshRoomCrowns?.();
}
