## Bu projede “oyun eklemek” ne demek?

Kampüste bir oyun iki parçadan oluşur:

- **Mini-game implementation**: Canvas/Three.js üstünde oyunun kodu.
- **Spot (etkileşim noktası)**: Kampüste oyuncuya “Oynamak ister misin?” penceresini açtıran konum (`SPOTS`).

Bu iki parça ayrı tutulur ki yeni oyun eklemek kolay olsun.

## Hızlı karar ağacı (hangi tür oyun ekliyorum?)

- **Canvas/mini oyun (skor verip biten)**: `registerMiniGame(...)` ile registry’ye ekle, `SPOTS` içine spot koy.
- **Bilgisayara karşı (AI)**: Yine registry’den başlat ama `options.mode='ai'` gibi kendi oyunun içinde yönet.
- **Online (kuyruk + maç)**: Satranç/dama örneğini izle. Ayrıca `docs/ONLINE_QUEUEING.md` dosyasını oku.

## 1) Basit (canvas) oyun ekleme

### 1.1 Oyun sınıfını yaz

Mevcut basit oyunların kaynağı:
- `js/minigames/games.js` (TableTennis, FlappyBird, Penalti, Archery, Basketball)

Yeni bir oyun eklemek için iki yol var:

- **A) Aynı dosyaya ekle (kolay başlangıç)**: `js/minigames/games.js`
- **B) Yeni dosyada yaz (önerilen)**: `js/minigames/<your-game>.js`

Oyun sınıfının minimum sözleşmesi:
- constructor(canvas, W, H, done)
- start()
- destroy() (event listener cleanup için)
- bitince `done(score)` çağırır

### 1.2 Oyunu registry’ye kaydet

Dosya: `js/minigames/default-mini-games.js`

Burada oyunlar `type` kodu ile kaydedilir. Örn:
- `'tt'` → Masa Tenisi
- `'fb'` → Flappy Bird
- `'ft'` → Penaltı
- `'ok'` → Okçuluk
- `'bk'` → Basketbol

Yeni oyun örneği:

```js
import { registerMiniGame } from './registry.js';
import { MyNewGame } from './my-new-game.js';

registerMiniGame({
  type: 'ng', // 2-3 harflik kısa kod önerilir
  create: ({ canvas, W, H, endGame }) => new MyNewGame(canvas, W, H, endGame)
});
```



## 2) Kampüse spot ekle (oyunu haritada oynat)

Dosya: `js/content/spots.js`

`SPOTS` içine yeni nokta ekle:

```js
SPOTS.push({
  id: 'yeni_oyun_1',
  icon: '🧩',
  title: 'Yeni Oyun',
  sub: 'Açıklama metni',
  pos: { x: 25, z: -10 },
  game: 'ng' // registry’de verdiğin type
});
```

Spot alanları:
- **id**: skor kaydı ve UI için benzersiz id
- **icon/title/sub**: prompt UI’da görünen metinler
- **pos**: kampüs düzleminde X/Z
- **game**: mini-game type kodu (registry’deki `type`)
- (opsiyonel) **mesaId**: satranç/dama gibi “çoklu masa” mantığı için

## 3) Leaderboard’a (skor tablosuna) ekleme

Offline/canvas oyunlar bitince skorlarını leaderboard’a kaydedebilir. Bu iki parçadan oluşur:

### 3.1 UI sekmesi (ikon) ekle

Dosya: `index.html`

`#lb-tabs` içine bir buton eklenir ve **`data-game`** alanı leaderboard anahtarıdır.
Örnek:

```html
<button class="lb-tab" data-game="benim_oyunum" title="Benim Oyun">🧩</button>
```

Bu `data-game` değeri, backend’de skorların tutulduğu `campus_scores.game` alanına gider.

### 3.2 Skor kaydı (API)

Dosya: `js/api.js`

Kullanılan çağrılar:

- `saveScore(game, player_name, score, sessionToken)`
- `getLeaderboard(game)`

Önemli kurallar:

- **`game`**: `index.html`’de verdiğin `data-game` ile **birebir aynı** olmalı.
- **`player_name`**: ekranda görünen isim (max 64); login/misafir akışından gelir.
- **`score`**: integer (0+).

Not: Skor kaydı akışını normalde `js/campus-app.js` yönetir (oyun bitti → modal → kaydet).
Yeni oyun eklerken genelde sadece `done(score)` çağırman yeterli olur; gerisini overlay/score modal halleder.

## 4) “Nereden export ediliyor?” (import/export kılavuzu)

### SPOTS
- Kaynak: `js/content/spots.js` → `export const SPOTS = [...]`
- Re-export: `js/config.js` → `export { SPOTS } from './content/spots.js'`
- Kullanım: `import { SPOTS } from './config.js'`

### Mini-game registry
- Registry: `js/minigames/registry.js`
  - `registerMiniGame(def)`
  - `createMiniGameInstance(type, ctx)`
- Varsayılan kayıtlar: `js/minigames/default-mini-games.js`
  - `initCampusContent()` içinde `initDefaultMiniGames()` çağrılır (`js/campus/initCampusContent.js`; ayrıntı: `docs/CAMPUS_APP_MODULES.md`)

## 5) Online oyun ekleme (kuyruk sistemi ile)

Online oyun; sadece `registerMiniGame` ile bitmez. Ek olarak:

- **Server tarafı**: queue + match oluşturma + state update + match end eventleri gerekir.
- **Client tarafı**: `mesaId` (VR/PC ayrımı), overlay davranışı, spectator/canlı liste gibi akışlar gerekir.

Bu proje için tek sayfalık kural seti:

- `docs/ONLINE_QUEUEING.md`

## 6) Satranç/Dama gibi özel oyunlar

Satranç ve dama akışı (online kuyruk, world board, VR overlay vs.) `campus-app.js` içinde özel mantık.

Bu doküman basit oyunlar içindir. Eğer “online/VR gibi özel lifecycle” gerektiren bir oyun ekleyeceksen, registry’ye “starter” katmanı eklemek mümkündür; şimdilik mevcut akış bozulmasın diye satranç/dama aynı şekilde bırakıldı.

