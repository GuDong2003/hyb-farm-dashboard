ALTER TABLE price_submissions ADD COLUMN price_change_rates_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE price_submissions ADD COLUMN price_trends_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE default_prices ADD COLUMN price_change_rates_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE default_prices ADD COLUMN price_trends_json TEXT NOT NULL DEFAULT '{}';
