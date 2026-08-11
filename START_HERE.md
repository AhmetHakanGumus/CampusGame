## Start Here (Projeyi yeni açanlar için)

Bu repo **tarayıcı tabanlı 3D kampüs** + **mini oyunlar** + **online satranç/dama** içerir.
Amacın neyse aşağıdaki bölüme git.
---

### Uygulama nasıl açılıyor?

- **Entry (frontend)**: `index.html` → `js/main.js`
- **Ana uygulama**: `js/campus-app.js`
- **Kampüs yardımcı modülleri** (boot, kamera, spawn, Gap Yenev polygon, içerik init): `js/campus/`
- **Orchestrator ↔ modül haritası**: `docs/CAMPUS_APP_MODULES.md`
- **Geliştirme**: `npm run dev` (frontend), `npm run server` (backend)

---

### Doküman haritası (README/DOCS) — nerede, ne anlatıyor?

- **Proje ana README**: `README.md`
  - Proje tanımı, kurulum/çalıştırma, ana doküman linkleri.
- **Hızlı yönlendirme**: `START_HERE.md`
  - “Hangi bilgi nerede?” haritası (bu dosya).
- **Bina ekleme rehberi**: `docs/ADDING_BUILDING.md`
  - `BUILDINGS` listesi, runtime bina ekleme, export/re-export mantığı.
- **Offline mini-game rehberi**: `docs/ADDING_GAME.md`
  - Yeni mini-game ekleme (registry + spot) ve **leaderboard** entegrasyonu (`data-game`, `saveScore`).
- **Online kuyruk rehberi**: `docs/ONLINE_QUEUEING.md`
  - VR/PC ayrımı, `mesaId` kuralları, canlı maç listesi mantığı.
- **Online oyun şablonu**: `docs/ADDING_ONLINE_GAME.md`
  - Yeni online oyun için DB tablo şeması, socket event sözleşmesi, server/client checklist.
- **`campus-app.js` modül haritası**: `docs/CAMPUS_APP_MODULES.md`
  - `js/campus-app.js` ile `js/campus/*` arasındaki ayrım ve “nereden bölünür?” rehberi.

---

### “Yeni bir şey eklemek istiyorum” 

- **Yeni bina ekleme**: `docs/ADDING_BUILDING.md`
  - Kaynak liste: `js/content/buildings.js`
  - Re-export: `js/config.js` (kullanım: `import { BUILDINGS } from './config.js'`)

- **Yeni spot (etkileşim noktası) ekleme**: `js/content/spots.js`
  - Re-export: `js/config.js` (kullanım: `import { SPOTS } from './config.js'`)

- **Yeni mini oyun (offline/canvas) ekleme**: `docs/ADDING_GAME.md`
  - Registry: `js/minigames/registry.js`
  - Varsayılan kayıtlar: `js/minigames/default-mini-games.js`
  - Başlangıçta registry + Gap Yenev polygon init: `js/campus/initCampusContent.js` (detay: `docs/CAMPUS_APP_MODULES.md`)
  - Leaderboard (skor/sekme): `index.html` (lb-tab `data-game`) + `js/api.js` (`saveScore/getLeaderboard`)

- **Yeni online oyun ekleme (queue + match şablonu)**: `docs/ADDING_ONLINE_GAME.md`
- **Online kuyruk/mesaId kuralları (VR + PC/mobil)**: `docs/ONLINE_QUEUEING.md`
  - mesaId kuralları (frontend tek kaynak): `js/online/mesa.js`

---

### “Online satranç/dama nerede?”

- **Frontend akış (UI/overlay/VR/sonuç/ESC canlı)**: `js/campus-app.js`
- **3D web overlay oyunları**:
  - Satranç: `js/minigames/online-chess-3d.js`
  - Dama: `js/minigames/online-dama-3d.js`
- **Backend**:
  - Server entry: `server/src/app.js`
  - DB bağlantısı + şema bootstrap: `server/src/db.js`
  - Chess service: `server/src/chess.service.js`
  - Dama service: `server/src/dama.service.js`
  - Chess/Dama modeller: `server/src/models/*`

---

### VR oyun / WebXR (kampüste VR’da oynanan oyun)

Burada iki farklı şey vardır; karıştırma:

1) **Registry’deki basit (canvas) mini oyunlar**  
   - Eklemek için yine `docs/ADDING_GAME.md` + spot (`SPOTS`).  
   - VR’da bir spot’a yaklaşıp controller ile tetikleyince, **satranç/dama değilse** genelde `startGame(...)` ile aynı mini oyun overlay’de açılır.  
   - VR kurulumu ve controller tetikleri: `js/campus-app.js` içinde `detectAndSetupVR()`, `setupVR()`, `xrActive`, `renderer.xr` (ilgili yorum bloklarına bak).

2) **Sahne içi özel VR deneyimi** (3D tahta/obje, el ile seçim vb.)  
   - Satranç/dama gibi: ayrı modüller + `campus-app.js` içinde yoğun entegrasyon.  
   - Örnek referanslar: `js/minigames/vr-chess-standalone.js`, `campus-app.js` içinde `getVrChessBoard` / `getVrDamaBoard` vb.

3) **Online oyun + VR fiziksel masa** (kuyruk, `mesaId` 1–2)  
   - Kurallar ve PC ile ayrım: `docs/ONLINE_QUEUEING.md`  
   - İstemci `mesaId` tek kaynak: `js/online/mesa.js`

Tam adım adım “yeni VR-only oyun” kılavuzu ayrı bir dosyada yok; **en hızlı yol** 1); **2)** için mevcut VR satranç/dama kodunu referans alıp parçalamak gerekir.

---

### “Auth / kullanıcı / oturum”

- UI: `js/auth-ui.js`
- API istemcisi: `js/api.js`
- Backend auth: `server/src/controllers/auth.controller.js` + `server/src/auth.routes.js`
- Session store: `server/src/session.store.js`

---

### “Konfig / içerik / ortak sabitler”

- Genel config + re-export’lar: `js/config.js`
- Güvenlik yardımcıları: `js/security.js`
- Runtime state: `js/runtime.js`

---

### Offline mini oyun akışı (1 dakikada)

Offline oyun = kampüste bir spot’a yaklaşınca açılan, `canvas` üzerinde çalışan ve bitince skor dönen oyundur.

- **1) Oyunu yaz**: `js/minigames/<your-game>.js`
  - Minimum sözleşme: `constructor(canvas, W, H, done)`, `start()`, `destroy()`
  - Bitince: `done(score)` çağır
- **2) Registry’ye kaydet**: `js/minigames/default-mini-games.js`
  - `registerMiniGame({ type:'xx', create:(ctx)=> new MyGame(...) })`
- **3) Spot ekle**: `js/content/spots.js`
  - `game: 'xx'` (registry type ile aynı)
- **4) Leaderboard’a ekle (opsiyonel ama önerilir)**:
  - `index.html` içinde `#lb-tabs` altına bir `lb-tab` ekle: `data-game="benim_oyun_key"`
  - Oyun bitince `saveScore('benim_oyun_key', playerName, score, sessionToken)` çağrılır (bu akışı `js/campus-app.js` yönetir)

### “Örnek/şablon dosyalar (projeye bağlı değil)”

Bu klasörler **import edilmez**, sadece örnek amaçlıdır:

- Online oyun template (server): `server/src/examples/ttt/`
  - `server/src/examples/ttt/README.md`: DB bağlantısı nasıl kullanılır, nasıl aktive edilir (isteğe bağlı)
  - `server/src/examples/ttt/migrations/001_ttt_schema.sql`: örnek DB şeması (manuel uygulanır)
  - `server/src/examples/ttt/ttt.model.js`: queue/match/state DB fonksiyonları (şablon)
  - `server/src/examples/ttt/ttt.service.js`: socket event/service iskeleti (şablon)

