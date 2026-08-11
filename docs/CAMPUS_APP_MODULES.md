## `campus-app.js` ve `js/campus/` modülleri

`js/campus-app.js` hâlâ **ana orkestrasyon** dosyasıdır (Three.js sahne, VR, input, HUD, online satranç/dama akışı vb.).  
Kod tabanını büyütmeden okunabilir tutmak için parçalar **`js/campus/`** altına taşınır.

### Şu an ayrılmış modüller

| Dosya | Ne işe yarar |
|--------|----------------|
| `js/campus/bootOverlay.js` | Yükleme/boot overlay’i |
| `js/campus/camera.js` | PC üçüncü şahıs takip kamerası (`updateFollowCamera`) |
| `js/campus/spawnStore.js` | Spawn konumunu `localStorage` ile saklama |
| `js/campus/gapYenevPolygon.js` | **Gap Yenev** binası için harita poligonu + merkez `x/z` (runtime mutate) |
| `js/campus/initCampusContent.js` | Tek çağrıda: mini-game registry + Gap Yenev init (`initCampusContent()`) |

### Yeni parça eklerken

- **Bina listesi / spot listesi**: `js/content/buildings.js`, `js/content/spots.js` (re-export: `js/config.js`)
- **Mini oyun kaydı**: `js/minigames/default-mini-games.js` → `initCampusContent()` zaten çağrılıyor
- **Kampüse özel “startup” geometri/polygon** gibi şeyler: mümkünse `js/campus/` altında küçük modül + `initCampusContent()` içine ekle

### Neden hepsi `campus-app.js`’ten çıkmadı?

Dosya büyük; taşıma **riskli** olduğu için parça parça yapılıyor.  
Yeni bir blok çıkarırken hedef: **tek sorumluluk**, **az global state**, **davranış değişmeden** test.
