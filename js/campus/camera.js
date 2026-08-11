'use strict';

/**
 * 3. şahıs takip kamerası (non-VR).
 * campus-app.js içindeki eski `updateCamera()` ile aynı matematik.
 */
export function updateFollowCamera({ camera, player, playerYaw, playerPitch, CFG }) {
    const hd = Math.cos(Math.max(-.1, playerPitch)) * CFG.camDist;
    const hy = CFG.camHeightBase + Math.sin(playerPitch) * CFG.camDist;
    camera.position.set(
        player.position.x + Math.sin(playerYaw) * hd,
        player.position.y + hy,
        player.position.z + Math.cos(playerYaw) * hd
    );
    camera.lookAt(player.position.x, player.position.y + 1.7, player.position.z);
}

