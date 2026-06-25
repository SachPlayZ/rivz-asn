-- Revert email default back to false and re-disable for all users.
ALTER TABLE users
  ALTER COLUMN notif_prefs SET DEFAULT '{"in_app":true,"email":false,"web_push":true,"chat":false}';

UPDATE users
SET notif_prefs = jsonb_set(notif_prefs, '{email}', 'false')
WHERE notif_prefs->>'email' = 'true';
