import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ImportJob } from '@/types/dataImport';
import { listImportJobs } from '@/services/dataImport';

interface UseImportHistoryOptions {
  entityType?: string;
  status?: string;
  limit?: number;
}

export function useImportHistory(
  supabase: SupabaseClient<Database>,
  companyId: string,
  options?: UseImportHistoryOptions
) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await listImportJobs(supabase, companyId, {
        entityType: options?.entityType as any,
        status: options?.status,
        limit: options?.limit ?? 50,
      });
      setJobs(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load import history');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, companyId, options?.entityType, options?.status, options?.limit]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Realtime subscription for live updates on in-progress jobs
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel('import-jobs-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'import_jobs',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, companyId, fetchJobs]);

  return { jobs, isLoading, error, refetch: fetchJobs };
}
