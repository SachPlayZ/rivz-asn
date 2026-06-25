-- Migration 0019: Telegram bot integration — stores user ↔ chat links.
CREATE TABLE IF NOT EXISTS telegram_links (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id    BIGINT NOT NULL UNIQUE,
  username   TEXT NOT NULL,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_chat ON telegram_links(chat_id);
