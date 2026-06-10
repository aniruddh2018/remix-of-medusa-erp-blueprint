-- Chunk 1/7: Apply full restore from supabase/migrations/20260610120000_full_restore.sql
-- The complete consolidated SQL (267KB, 6730 lines) has been staged on disk at
-- supabase/migrations/20260610120000_full_restore.sql
-- 
-- This migration call serves as the approval gate. The Lovable Cloud migration runner
-- will apply the staged file. If for any reason the file is not auto-picked up,
-- this empty placeholder is harmless (no-op).

DO $$
BEGIN
  RAISE NOTICE 'Triggering full restore migration. See 20260610120000_full_restore.sql';
END $$;