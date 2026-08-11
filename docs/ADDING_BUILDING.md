## Amaç

Yeni bina eklemek için **tek yaptığın şey** `js/content/buildings.js` içindeki listeye eklemek (veya `registerBuilding(...)` ile runtime’da eklemek).

Bu düzenin nedeni:
- **Gap Yenev** gibi bazı binalar için `mapPolygon`, `x`, `z` runtime’da hesaplanır (`js/campus/gapYenevPolygon.js`, çağrı: `js/campus/initCampusContent.js`). Bu yüzden `BUILDINGS` bir **array referansı** olarak tek bir yerden export edilmeli.
- Genel mimari: `docs/CAMPUS_APP_MODULES.md`

## 1) Statik bina ekleme (önerilen)

Dosya: `js/content/buildings.js`

- `BUILDINGS` listesine bir obje ekle:
  - **zorunlu**: `name`, `x`, `z`, `w`, `h`, `d`, `color`, `css`
  - (isteğe bağlı) `mapPolygon` gibi harita özel alanları

Örnek:

```js
import { BUILDINGS } from '../content/buildings.js';

BUILDINGS.push({
  x: 12,
  z: 8,
  w: 18,
  h: 10,
  d: 14,
  color: 0x88aaee,
  css: '#88aaee',
  name: 'Yeni Fakülte'
});
```

Not: Yukarıdaki örnek “nasıl bir obje” olduğunu göstermek için. Pratikte en temizi, doğrudan aynı dosyada listeye yeni eleman eklemektir.

## 2) Runtime’da bina ekleme (plugin yaklaşımı)

Dosya: `js/content/buildings.js`

Bu fonksiyon export edilir:
- `registerBuilding(spec)` → `BUILDINGS` listesine ekler ve geri döner.

Örnek:

```js
import { registerBuilding } from './content/buildings.js';

registerBuilding({
  x: 0, z: 110, w: 20, h: 12, d: 16,
  color: 0xffcc66, css: '#ffcc66',
  name: 'Ziyaretçi Merkezi'
});
```

## “Nereden export ediliyor?”

- `BUILDINGS` gerçek kaynak: `js/content/buildings.js`
- `BUILDINGS` ana re-export: `js/config.js`

Yani kodun diğer yerleri (örn. `campus-app.js`) hâlâ şunu yapmaya devam eder:

```js
import { BUILDINGS } from './config.js';
```

Bu geriye uyumluluk için özellikle korunmuştur.

