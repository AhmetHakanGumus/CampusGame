import { BUILDINGS } from '../content/buildings.js';
import { initDefaultMiniGames } from '../minigames/default-mini-games.js';
import { initGapYenevTriskelionMapPolygon } from './gapYenevPolygon.js';

/**
 * Central "one call" initializer for registries/content.
 *
 * Goal:
 * - New developers add registrations (games/buildings/spots plugins) in one place.
 * - `campus-app.js` stays as orchestrator and doesn't accumulate lots of imports.
 *
 * IMPORTANT:
 * - This function should be safe to call multiple times (idempotent or tolerant).
 */
export function initCampusContent() {
    initDefaultMiniGames();
    initGapYenevTriskelionMapPolygon(BUILDINGS);
}

