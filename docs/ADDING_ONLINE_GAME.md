## Yeni Online Oyun Ekleme Şablonu (Queue + Match)

Bu dosya “sıfırdan online oyun” eklemek için **kopyala-yapıştır** şablonudur.
Satranç/dama akışı referanstır; burada genel bir pattern veriyoruz.

> Not: Bu projede VR/PC ayrımı ve `mesaId` kuralları için önce `docs/ONLINE_QUEUEING.md` oku.

---

### 0) İsimlendirme kararları (başta seç)

- **Oyun kodu** (kısa): örn. `ttt` / `rps` / `poker`
- **Event prefix**: örn. `ttt:*`
- **DB tablo prefix**: örn. `ttt_queue`, `ttt_matches`, `ttt_match_state`

Bu dosyada örnek olarak `ttt` kullanacağız.

---

## 1) DB: 3 tablo (minimum)

### 1.1 `ttt_queue`

- Amaç: bir mesaId kuyruğunda bekleyenleri tutmak

Örnek kolonlar (satranç/dama ile uyumlu):

```sql
CREATE TABLE IF NOT EXISTS ttt_queue (
  mesa_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  socket_id TEXT,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mesa_id, user_id)
);
```

### 1.2 `ttt_matches`

- Amaç: maç meta bilgisi (kimler, durum, mesaId, sonuç)

```sql
CREATE TABLE IF NOT EXISTS ttt_matches (
  id SERIAL PRIMARY KEY,
  white_user_id INTEGER NOT NULL,
  black_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|finished
  winner_user_id INTEGER,
  exit_reason TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  mesa_id INTEGER NOT NULL DEFAULT 1
);
```

> İstersen “white/black” yerine “p1/p2” kullanabilirsin. Client tarafında `yourColor` gibi alanlara göre UI yönlenir.

### 1.3 `ttt_match_state`

- Amaç: maçın canlı state’i (tek satır)

```sql
CREATE TABLE IF NOT EXISTS ttt_match_state (
  match_id INTEGER PRIMARY KEY REFERENCES ttt_matches(id) ON DELETE CASCADE,
  state_json JSONB NOT NULL,
  last_event_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 2) Server: model fonksiyonları (kopyala, oyuna göre uyarlayıp isimleri değiştir)

Dosya önerisi:

- `server/src/models/ttt.model.js`

Minimum fonksiyon seti (satranç/dama benzeri):

- `upsertQueueEntry({ userId, username, socketId, mesaId })`
- `removeQueueEntry(userId, mesaId)`
- `getFirstWaitingQueueEntry(exceptUserId, mesaId)`
- `getQueueCount(mesaId)`
- `isUserQueued(userId, mesaId)`
- `createMatch({ whiteUserId, blackUserId, state_json, mesaId })`
- `getActiveMatchForUser(userId)`
- `getMatchById(matchId)`
- `appendMoveAndUpdateState({ matchId, state_json })`
- `finishMatch({ matchId, winnerUserId, exitReason })`

---

## 3) Server: socket event sözleşmesi (minimum)

### Queue eventleri

- `ttt:queue:join`  payload: `{ mesaId }`
- `ttt:queue:leave` payload: `{ mesaId }`
- `ttt:queue:list`  payload: `{ mesaId }`
- Server → client: `ttt:queue:state` payload:

```js
{
  mesaId,
  selfQueued: boolean,
  waitingPlayer: { userId, username, joinedAt } | null,
  totalWaiting: number,
  activeMatch: { matchId, whiteUserId, blackUserId } | null,
  activeMatches: [{ matchId, whiteUserId, blackUserId }] | null // opsiyonel
}
```

### Match eventleri

- Server → players: `ttt:match:started` payload:

```js
{
  matchId,
  mesaId,
  white: { userId, username },
  black: { userId, username },
  yourColor: 'white'|'black',
  // ... oyunun state'i (örn. board/state_json)
}
```

- Server → room: `ttt:state:update` payload:
  - her hamlede oyunculara gönder
- Server → room + oyuncular: `ttt:match:ended` payload:

```js
{
  matchId,
  winnerUserId,
  winnerUsername,
  loserUserId,
  loserUsername,
  reason: 'checkmate'|'exit'|'disconnect'|'draw'|string,
  message: string
}
```

### Spectate (opsiyonel ama önerilir)

- Client → server: `ttt:watch` payload: `{ matchId }`
- Client → server: `ttt:watch:leave` payload: `{ matchId }`
- Server → client: `ttt:watch:ack` payload: `{ matchId, mesaId, ...state }`

---

## 4) Server: service iskeleti (satranç/dama gibi)

Dosya önerisi:

- `server/src/ttt.service.js`

Şablon mantığı:

- `queue:join` geldi:
  - kullanıcı aktif maçta mı kontrol et
  - aynı mesaId’de bekleyen var mı bak
  - varsa `createMatch` ile maç oluştur, oyuncuları aynı room’a al, `match:started` yayınla
  - yoksa `upsertQueueEntry` ile kuyruğa yaz
  - en sonda `queue:state` yayınla (gerekirse bütün masalar için)

Karma eşleşme istiyorsan (VR+PC):

- `mesaId=0` (PC) ile `mesaId=1/2` (VR) arasında çapraz eşleştirme uygulanabilir.
- Kural seti: `docs/ONLINE_QUEUEING.md`

---

## 5) Client: entegrasyon (mesaId ve queue)

### mesaId hesapları (kopyalama yapma)

Bu projede `mesaId` hesapları tek yerde:

- `js/online/mesa.js`
  - `mesaIdForQueueJoin({ xrActive, spotMesaId })`
  - `mesaIdForQueueState({ xrActive, activeSpotGame, activeSpotMesaId, fallbackMesaId })`

Yeni online oyun eklerken aynı mantığı izlemelisin.

`campus-app.js` neyin nereye taşındığını görmek için: `docs/CAMPUS_APP_MODULES.md`.

### Queue API yüzeyi

Hazır ince wrapper:

- `js/online/queueClient.js` → `createQueueClient(mpClient)`

Satranç/dama dışı oyun ekliyorsan kendi `mpClient` metodlarını ekleyip benzer wrapper yazabilirsin.

---

## 6) “Spot” (kampüste kuyruğa sokan masa/nokta)

Online oyun için `SPOTS`’a bir spot koy:

```js
SPOTS.push({
  id: 'ttt_online_1',
  icon: '🎮',
  title: 'Tic Tac Toe',
  sub: 'Online sıra',
  pos: { x: 0, z: 0 },
  game: 'ttt',
  mesaId: 1 // VR masası gibi davranacaksa
});
```

PC/mobil kuyrukta normalde `mesaId=0` kullanacağı için spot `mesaId` değeri daha çok VR masaları için anlamlıdır.

