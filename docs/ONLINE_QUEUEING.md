## Online oyunlar ve kuyruk sistemi (VR + PC/Mobil)

Bu projede “online oyun” (satranç/dama gibi) için bir **kuyruk (queue)** mantığı vardır.
Yeni bir online oyun eklerken en çok karışan konu **mesaId** ve VR/PC ayrımıdır. Bu dosya tek sayfalık, net bir kılavuzdur.

### Temel kavramlar

- **Queue**: Oyuncular “bekleme” durumuna girer. İki kişi eşleşince server bir `match` oluşturur.
- **Match**: Sunucuda DB’ye `..._matches` tablosuna “active/finished” olarak kaydedilen maç.
- **mesaId**: “hangi masa/kuyruk?” ayırıcı id.

### mesaId kuralları (çok önemli)

Bu kural seti kodda `js/online/mesa.js` içinde tek yerde tutulur.

- **`mesaId = 0`**: PC/mobil *sanal masa*.
  - Kampüsteki fiziksel VR masalarını **doldurmaz**.
  - PC/mobil oyuncu oyunu **overlay (ekran)** içinde oynar.
- **`mesaId = 1` / `2`**: VR fiziksel masalar.
  - Kampüste taşlar/tahta **world** üzerinde canlı güncellenebilir.
  - VR oyuncu masada oynar.

### Karma eşleşme (VR + PC/mobil)

Bu projede hedef davranış:

- Bir oyuncu VR, diğeri PC/mobil ise **eşleşebilsinler**.
- Maç **VR masasının** `mesaId`’si ile oluşsun (1 veya 2).
- PC/mobil oyuncu oyunu overlay’de oynar ama avatarı **masanın karşısına ışınlanabilir**.

Bu davranış server tarafında queue eşleştirmesinde uygulanır (satranç/dama servisleri).

### İstemci (frontend) entegrasyonu: nereleri çağıracağım?

PC/mobil veya VR farkını her seferinde `if (xrActive) ...` ile kopyalamak yerine:

- **Kuyruğa girerken**: `mesaIdForQueueJoin({ xrActive, spotMesaId })`
- **Queue state isterken**: `mesaIdForQueueState({ xrActive, activeSpotGame, activeSpotMesaId, fallbackMesaId })`

Bu fonksiyonlar:

- `js/online/mesa.js`

### “Live Matches” (Canlı maçlar) listesi

PC/mobil için aynı anda birden fazla maç olabileceği için server `queue:state` payload’ına şunlar gelebilir:

- `activeMatch`: (geriye uyum için) tek maç
- `activeMatches`: (yeni) çoklu maç listesi (özellikle `mesaId=0` için)

Frontend ESC → Canlı sekmesi artık `activeMatches` varsa onu listeler.

### Yeni online oyun ekleyecekler için checklist

- **DB**: queue + matches + match_state tabloları (satranç/dama modellerine benzer)
- **Server service**:
  - `queue:join/leave/list`
  - match create + state update + match end
  - `queue:state` payload’ında `mesaId`, `selfQueued`, `totalWaiting` ve mümkünse `activeMatches`
- **Client**:
  - `mesaId` hesaplarını `js/online/mesa.js` üzerinden yap
  - PC/mobil overlay + VR world davranışlarını ayır
  - Ana istemci orkestrasyonu: `js/campus-app.js` (modül haritası: `docs/CAMPUS_APP_MODULES.md`)

