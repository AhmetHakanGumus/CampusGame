-- Satranç maç kayıtlarında taş puanı (p=1, n/b=3, r=5, q=9; rakipten alınan toplam değer)
ALTER TABLE campus_scores ADD COLUMN IF NOT EXISTS chess_material INTEGER;
