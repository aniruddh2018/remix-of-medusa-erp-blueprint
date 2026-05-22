-- Phase 4.1 addendum: Extend file_type to include xml for Tally XML imports

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_file_type_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_file_type_check CHECK (file_type IN ('csv','xlsx','json','xml'));
