create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reschedule idempotently if the job already exists.
select cron.unschedule(jobid)
from cron.job
where jobname = 'global-chart-sync-hourly';

-- Invoke the global-chart-sync Edge Function every hour. The function URL and
-- sync secret are read from Supabase Vault (chart_sync_url / chart_sync_secret)
-- so no credentials live in source control.
select cron.schedule(
  'global-chart-sync-hourly',
  '10 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'chart_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-chart-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'chart_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
