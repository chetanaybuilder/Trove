ALTER TABLE analyses ADD COLUMN input_hash text, ADD COLUMN notes jsonb;
CREATE INDEX analyses_user_hash_idx ON analyses (user_id, input_hash) WHERE input_hash IS NOT NULL;
ALTER TABLE reports ADD COLUMN is_favorite boolean NOT NULL DEFAULT false, ADD COLUMN share_token text UNIQUE;
CREATE INDEX reports_user_fav_idx ON reports (user_id) WHERE is_favorite;
