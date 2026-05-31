SELECT cron.unschedule('poll-smart-inbox-5min');

SELECT cron.schedule(
  'poll-smart-inbox-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--646285ee-aca4-406c-aa78-a85235d7e6e0.lovable.app/api/public/hooks/poll-smart-inbox',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpud2ZmenRtZGdzc2h1dnZ6c3ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1OTM0MTEsImV4cCI6MjA5MjE2OTQxMX0.ij0159FpLOCQGDPaEsoEslYpxzvqc41scKUyzl6beys"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);