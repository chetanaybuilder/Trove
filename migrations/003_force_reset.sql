DROP TABLE IF EXISTS report_sections, reports, analyses, documents, users CASCADE;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  name text, avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL, original_filename text,
  file_type text NOT NULL CHECK (file_type IN ('txt','pdf','paste')),
  source_type text NOT NULL CHECK (source_type IN ('upload','paste')),
  file_size integer NOT NULL, character_count integer NOT NULL, line_count integer NOT NULL, estimated_tokens integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_user_created_idx ON documents (user_id, created_at DESC);

CREATE TABLE analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  analysis_mode text NOT NULL CHECK (analysis_mode IN ('quick','deep')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  stage text, chunks_done integer NOT NULL DEFAULT 0, chunks_total integer NOT NULL DEFAULT 0,
  started_at timestamptz, completed_at timestamptz, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  input_hash text, notes jsonb
);
CREATE INDEX analyses_user_idx ON analyses (user_id);
CREATE INDEX analyses_document_idx ON analyses (document_id);
CREATE INDEX analyses_status_idx ON analyses (status) WHERE status IN ('queued','running');
CREATE INDEX analyses_user_hash_idx ON analyses (user_id, input_hash) WHERE input_hash IS NOT NULL;

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL UNIQUE REFERENCES analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL, executive_summary text,
  report_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  is_favorite boolean NOT NULL DEFAULT false, share_token text UNIQUE
);
CREATE INDEX reports_user_created_idx ON reports (user_id, created_at DESC);
CREATE INDEX reports_user_fav_idx ON reports (user_id) WHERE is_favorite;

CREATE TABLE report_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  section_type text NOT NULL, title text NOT NULL, content jsonb NOT NULL, position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, position)
);
CREATE INDEX report_sections_report_idx ON report_sections (report_id, position);
