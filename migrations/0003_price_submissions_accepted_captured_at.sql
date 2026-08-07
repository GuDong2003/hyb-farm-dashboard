CREATE INDEX IF NOT EXISTS idx_price_submissions_accepted_captured_at
  ON price_submissions (accepted, captured_at DESC);
