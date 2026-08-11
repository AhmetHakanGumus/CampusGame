'use strict';

/** Görüntülenecek / alert ile gösterilecek metinlerde kontrol karakterlerini atar (XSS ve garip çıktı riskini azaltır). */
export function sanitizePlainText(input, maxLen = 2000) {
    if (input == null) return '';
    let s = String(input);
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (maxLen > 0 && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
}
