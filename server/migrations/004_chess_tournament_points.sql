-- Eski satranç satırları: galibiyet 50 → turnuva kuralı 1 puan = 100 birim
UPDATE campus_scores SET score = 100 WHERE game = 'satranc' AND score = 50;
