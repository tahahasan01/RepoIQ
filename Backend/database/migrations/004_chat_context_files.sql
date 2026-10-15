-- Chat messages record which files they were asked about.
--
-- chat_service has always written context_files, but the PostgreSQL schema
-- (postgres_schema.sql) was written without it, so every chat insert failed
-- with UndefinedColumn and chat was entirely broken after the move off
-- Supabase. Fresh databases get the column from postgres_schema.sql; this
-- brings an existing one in line.
--
-- History is read per repository AND per user, newest first; the existing
-- index covers only the repository.

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS context_files JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_chat_repo_user_created
    ON public.chat_messages(repository_id, user_id, created_at DESC);
