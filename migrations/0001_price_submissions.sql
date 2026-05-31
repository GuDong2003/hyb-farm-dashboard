CREATE TABLE IF NOT EXISTS price_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  captured_bucket INTEGER NOT NULL,
  source TEXT NOT NULL,
  matched_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  price_signature TEXT NOT NULL,
  prices_json TEXT NOT NULL,
  submitter_hash TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  accepted_at INTEGER,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_submissions_consensus
  ON price_submissions (captured_bucket, price_signature, captured_at);

CREATE INDEX IF NOT EXISTS idx_price_submissions_submitted_at
  ON price_submissions (submitted_at);

CREATE TABLE IF NOT EXISTS default_prices (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  updated_at INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  submission_id INTEGER,
  matched_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  price_signature TEXT NOT NULL,
  prices_json TEXT NOT NULL
);
