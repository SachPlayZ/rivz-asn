-- Migration 0018: Fix email notification default to enabled for new users
-- and opt-in all existing users who still have the old {email:false} default.

ALTER TABLE users
  ALTER COLUMN notif_prefs SET DEFAULT '{"in_app":true,"email":true,"web_push":true,"chat":false}';

-- Opt-in existing users whose email pref is still false (opt-out of the old bad default).
UPDATE users
SET notif_prefs = jsonb_set(notif_prefs, '{email}', 'true')
WHERE notif_prefs->>'email' = 'false';
