import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Structured logger ──
const LOG_LEVEL = (Deno.env.get("LOG_LEVEL") || "info") as "debug" | "info" | "warn" | "error";
const LEVEL_PRIORITY: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: string, tag: string, msg: string, data?: Record<string, unknown>) {
  if ((LEVEL_PRIORITY[level] ?? 1) < (LEVEL_PRIORITY[LOG_LEVEL] ?? 1)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    tag,
    msg,
    ...(data || {}),
  };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(JSON.stringify(entry));
}

function startTimer() {
  const start = performance.now();
  return {
    elapsed: () => Math.round(performance.now() - start),
    elapsedStr: () => `${Math.round(performance.now() - start)}ms`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestTimer = startTimer();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuperAdmin) throw new Error("Only super admins can trigger the scan worker");

    log("info", "worker", "start", { user_id: user.id });

    const SCAN_FUNCTION_URL = `${supabaseUrl}/functions/v1/scan-invoice`;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const maxJobs = 5;
    let processed = 0;
    let claimed = 0;
    let failed = 0;
    const results: any[] = [];
    const jobTimings: Record<string, unknown>[] = [];

    for (let i = 0; i < maxJobs; i++) {
      const claimTimer = startTimer();
      const { data: claimResult } = await supabase.rpc("claim_next_scan_job");

      if (!claimResult?.claimed) {
        log("debug", "worker", "no_more_jobs", { checked: i + 1, max: maxJobs });
        break;
      }

      const job = claimResult;
      claimed++;
      log("info", "worker", "job_claimed", {
        job_id: job.id,
        company_id: job.company_id,
        file_count: job.file_paths?.length || 0,
        claim_elapsed_ms: claimTimer.elapsed(),
      });

      const jobTimer = startTimer();
      try {
        await supabase.rpc("update_scan_job", {
          _job_id: job.id,
          _status: "processing",
          _stage: "downloading",
          _stage_progress: 10,
        });

        log("info", "worker", "job_processing", {
          job_id: job.id,
          company_id: job.company_id,
          files: job.file_paths?.length || 0,
        });

        const scanRes = await fetch(SCAN_FUNCTION_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_paths: job.file_paths,
            company_id: job.company_id,
          }),
        });

        const scanData = await scanRes.json();

        if (!scanRes.ok) {
          throw new Error(scanData.error || `Scan failed with status ${scanRes.status}`);
        }

        await supabase.rpc("update_scan_job", {
          _job_id: job.id,
          _status: "completed",
          _result: scanData,
          _stage: "completed",
          _stage_progress: 100,
        });

        const jobElapsed = jobTimer.elapsed();
        log("info", "worker", "job_completed", {
          job_id: job.id,
          company_id: job.company_id,
          elapsed_ms: jobElapsed,
          invoice_number: scanData?.invoice_number || "unknown",
          line_items: scanData?.line_items?.length || 0,
          supplier: scanData?.supplier_name || "unknown",
        });

        results.push({ job_id: job.id, status: "completed" });
        jobTimings.push({ job_id: job.id, status: "completed", elapsed_ms: jobElapsed });
        processed++;
      } catch (jobError) {
        const errMsg = jobError instanceof Error ? jobError.message : "Unknown error";
        log("error", "worker", "job_failed", {
          job_id: job.id,
          company_id: job.company_id,
          error: errMsg,
          elapsed_ms: jobTimer.elapsed(),
        });

        await supabase.rpc("update_scan_job", {
          _job_id: job.id,
          _status: "failed",
          _error: errMsg,
          _stage: "failed",
        });

        results.push({ job_id: job.id, status: "failed", error: errMsg });
        jobTimings.push({ job_id: job.id, status: "failed", elapsed_ms: jobTimer.elapsed() });
        failed++;
      }
    }

    const totalElapsed = requestTimer.elapsed();
    log("info", "worker", "done", {
      total_elapsed_ms: totalElapsed,
      claimed,
      processed,
      failed,
      job_timings: jobTimings,
    });

    return new Response(JSON.stringify({
      processed,
      claimed,
      failed,
      total_elapsed_ms: totalElapsed,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    log("error", "worker", "fatal", {
      error: e instanceof Error ? e.message : "Unknown error",
      elapsed_ms: requestTimer.elapsed(),
    });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
