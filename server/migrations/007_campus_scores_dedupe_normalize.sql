-- Aynı oyun + aynı normalize isim için tek satır kalsın (en yüksek skor, eşitlikte en eski created_at).
WITH keepers AS (
  SELECT DISTINCT ON (game, LOWER(TRIM(BOTH FROM player_name)))
    id
  FROM campus_scores
  ORDER BY game, LOWER(TRIM(BOTH FROM player_name)), score DESC, created_at ASC
)
DELETE FROM campus_scores cs
WHERE NOT EXISTS (SELECT 1 FROM keepers k WHERE k.id = cs.id);

DROP INDEX IF EXISTS idx_campus_scores_game_norm_name;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_campus_scores_game_player_norm
  ON campus_scores (game, (LOWER(TRIM(BOTH FROM player_name))));
