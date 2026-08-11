## Example Online Game: `ttt` (Template Only)

Bu klasör **örnek/şablon** amaçlıdır.

- Projeye **import edilmez**.
- `app.js` içine eklenmez.
- Çalışan satranç/dama sistemini **değiştirmez**.

Amaç: yeni bir online oyun eklemek isteyen geliştiricinin elinde “model + service + migration + event sözleşmesi” örneği olsun.

### DB bağlantısı bu projede nasıl çalışıyor?

Bu projede tüm DB işlemleri `server/src/db.js` içindeki `pool` üzerinden yapılır:

- `import { pool } from '../db.js'` (veya göreli path ile)

Bağlantı config’i env üzerinden:

- **Tercih 1**: `DATABASE_URL`
- **Tercih 2**: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

### Bu example’ı gerçekten çalıştırmak istersen

1) Migration SQL’ini uygula:

- `server/src/examples/ttt/migrations/001_ttt_schema.sql`

2) `ttt.service.js`’i gerçek sisteme bağlamak istersen:

- `server/src/app.js` içinde `createTttService(...)` gibi bir servis yaratıp `io`’ya bind etmen gerekir.
- Bu repo için bunu **bilerek yapmıyoruz** (çalışan şeyi bozmamak için).

### Event sözleşmesi (özet)

`ttt:*` prefix’iyle:

- `ttt:queue:join|leave|list`  (client → server)
- `ttt:queue:state`           (server → client)
- `ttt:match:started`         (server → players)
- `ttt:state:update`          (server → room)
- `ttt:match:ended`           (server → room + players)

