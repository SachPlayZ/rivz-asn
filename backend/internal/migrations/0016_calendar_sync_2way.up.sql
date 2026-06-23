ALTER TABLE calendar_connections 
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS sync_token TEXT;
