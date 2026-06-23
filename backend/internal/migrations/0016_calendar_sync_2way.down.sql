ALTER TABLE calendar_connections 
  DROP COLUMN IF EXISTS google_calendar_id,
  DROP COLUMN IF EXISTS sync_token;
