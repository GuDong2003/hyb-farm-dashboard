const SEED_IDS = [
  'carrot',
  'tomato',
  'corn',
  'pumpkin',
  'blueberry',
  'strawberry',
  'watermelon',
  'mango',
  'golden_wheat',
  'emerald_cabbage',
  'dragon_fruit',
  'starfruit',
  'durian',
  'golden_apple',
  'blue_rose',
  'crystal_grape',
  'rainbow_pineapple',
  'moonflower',
  'weekly_lotus'
];

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const MIN_MATCHED_PRICES = 15;
const MAX_PRICE_USD = 1000000;
const MAX_TREND_POINTS_PER_SERIES = 200;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/default-prices' && request.method === 'GET') {
      return getDefaultPrices(env);
    }

    if (url.pathname === '/api/price-submissions' && request.method === 'POST') {
      return submitPrices(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse({ ok: false, error: 'not_found' }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

async function getDefaultPrices(env) {
  assertDatabase(env);
  const row = await env.PRICE_DB.prepare('SELECT * FROM default_prices WHERE id = 1').first();
  if (!row) {
    return jsonResponse({ ok: true, snapshot: null }, 200, {
      'cache-control': 'public, max-age=60'
    });
  }
  const snapshot = snapshotFromDefaultRow(row);
  await hydrateSnapshotTrends(env, snapshot);
  return jsonResponse({ ok: true, snapshot }, 200, {
    'cache-control': 'public, max-age=60'
  });
}

async function submitPrices(request, env) {
  assertDatabase(env);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: false, status: 'rejected', reason: 'invalid_json' }, 400);
  }

  const now = Date.now();
  const normalized = normalizeSubmission(body, now);
  if (!normalized.ok) {
    return jsonResponse({ ok: false, status: 'rejected', reason: normalized.reason }, 400);
  }

  const current = await env.PRICE_DB.prepare('SELECT * FROM default_prices WHERE id = 1').first();
  const currentCapturedAt = current ? Number(current.captured_at) : 0;
  const currentSignature = current ? String(current.price_signature || '') : '';
  const samePrices = currentSignature && currentSignature === normalized.priceSignature;
  const rejectionReason = current && normalized.capturedAt <= currentCapturedAt
    ? 'stale_or_existing_data'
    : current && samePrices && normalized.capturedAt < currentCapturedAt + REFRESH_INTERVAL_MS
      ? 'same_refresh_interval'
      : '';
  const submitterHash = await hashSubmitter(request);

  const insertResult = await env.PRICE_DB.prepare(`
    INSERT INTO price_submissions (
      submitted_at,
      captured_at,
      captured_bucket,
      source,
      matched_count,
      total_count,
      price_signature,
      prices_json,
      price_change_rates_json,
      price_trends_json,
      submitter_hash,
      accepted,
      accepted_at,
      rejection_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
  `).bind(
    now,
    normalized.capturedAt,
    normalized.capturedBucket,
    normalized.source,
    normalized.matchedCount,
    normalized.totalCount,
    normalized.priceSignature,
    normalized.pricesJson,
    normalized.priceChangeRatesJson,
    normalized.priceTrendsJson,
    submitterHash,
    rejectionReason || null
  ).run();

  const submissionId = Number(insertResult.meta && insertResult.meta.last_row_id) || 0;

  if (rejectionReason) {
    return jsonResponse({ ok: true, status: 'rejected', reason: rejectionReason, submissionId });
  }

  await acceptSubmission(env, normalized, submissionId, now);

  return jsonResponse({
    ok: true,
    status: 'accepted',
    mode: current ? 'new_refresh_interval' : 'bootstrap',
    submissionId,
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    snapshot: snapshotFromNormalized(normalized, now)
  });
}

function normalizeSubmission(body, now) {
  const snapshot = body && body.snapshot ? body.snapshot : body;
  if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'missing_snapshot' };

  const capturedAt = Math.floor(Number(snapshot.capturedAt));
  if (!Number.isFinite(capturedAt) || capturedAt <= 0) return { ok: false, reason: 'invalid_captured_at' };
  if (capturedAt > now + FUTURE_TOLERANCE_MS) return { ok: false, reason: 'future_captured_at' };

  const priceSource = snapshot.prices && snapshot.prices.shop ? snapshot.prices.shop : snapshot.prices;
  if (!priceSource || typeof priceSource !== 'object') return { ok: false, reason: 'missing_prices' };

  const prices = {};
  for (const id of SEED_IDS) {
    const value = Number(priceSource[id]);
    if (!Number.isFinite(value)) continue;
    if (value < 0 || value > MAX_PRICE_USD) return { ok: false, reason: 'price_out_of_range' };
    prices[id] = Number(value.toFixed(5));
  }

  const matchedCount = Object.keys(prices).length;
  if (matchedCount < MIN_MATCHED_PRICES) return { ok: false, reason: 'too_few_prices' };

  const priceSignature = Object.keys(prices)
    .sort()
    .map((id) => `${id}:${prices[id].toFixed(5)}`)
    .join('|');

  const priceChangeRates = normalizePriceChangeRates(snapshot.priceChangeRates || snapshot.changeRates || snapshot.priceRates || {});
  const priceTrends = normalizePriceTrends(snapshot.priceTrends || snapshot.trends || {});

  return {
    ok: true,
    capturedAt,
    capturedBucket: Math.floor(capturedAt / REFRESH_INTERVAL_MS),
    source: String(snapshot.source || 'dashboard-upload').slice(0, 64),
    matchedCount,
    totalCount: SEED_IDS.length,
    prices,
    pricesJson: JSON.stringify(prices),
    priceChangeRates,
    priceChangeRatesJson: JSON.stringify(priceChangeRates),
    priceTrends,
    priceTrendsJson: JSON.stringify(priceTrends),
    priceSignature
  };
}

function normalizePriceChangeRates(input) {
  const source = input && input.shop && typeof input.shop === 'object' ? input.shop : input;
  const out = {};
  for (const id of SEED_IDS) {
    const value = Number(source && source[id]);
    if (Number.isFinite(value)) out[id] = Number(value.toFixed(6));
  }
  return out;
}

function normalizePriceTrends(input) {
  const source = input && input.shop && typeof input.shop === 'object' ? input.shop : input;
  const out = {};
  for (const id of SEED_IDS) {
    const item = source && source[id];
    if (!item || typeof item !== 'object') continue;
    const hourly = normalizeTrendSeries(item.hourly || item.hour || []);
    const daily = normalizeTrendSeries(item.daily || item.day || []);
    const unitPrice = Number(item.unitPrice);
    const lastRefreshedAt = validIsoLike(item.lastRefreshedAt) ? String(item.lastRefreshedAt) : '';
    if (!hourly.length && !daily.length && !Number.isFinite(unitPrice) && !lastRefreshedAt) continue;
    out[id] = {};
    if (hourly.length) out[id].hourly = hourly;
    if (daily.length) out[id].daily = daily;
    if (Number.isFinite(unitPrice) && unitPrice >= 0) out[id].unitPrice = Number(unitPrice.toFixed(5));
    if (lastRefreshedAt) out[id].lastRefreshedAt = lastRefreshedAt;
  }
  return out;
}

function normalizeTrendSeries(series) {
  if (!Array.isArray(series)) return [];
  return series.map((point) => {
    const bucketStartedAt = validIsoLike(point && point.bucketStartedAt) ? String(point.bucketStartedAt) : '';
    const avgUnitPrice = Number(point && point.avgUnitPrice);
    if (!bucketStartedAt || !Number.isFinite(avgUnitPrice) || avgUnitPrice < 0) return null;
    return { bucketStartedAt, avgUnitPrice: Number(avgUnitPrice.toFixed(5)) };
  }).filter(Boolean)
    .sort((a, b) => Date.parse(a.bucketStartedAt) - Date.parse(b.bucketStartedAt))
    .slice(-MAX_TREND_POINTS_PER_SERIES);
}

function validIsoLike(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

async function acceptSubmission(env, normalized, submissionId, now) {
  await env.PRICE_DB.batch([
    env.PRICE_DB.prepare(`
      UPDATE price_submissions
      SET accepted = 1, accepted_at = ?
      WHERE id = ?
    `).bind(
      now,
      submissionId
    ),
    env.PRICE_DB.prepare(`
      INSERT INTO default_prices (
        id,
        updated_at,
        captured_at,
        submission_id,
        matched_count,
        total_count,
        price_signature,
        prices_json,
        price_change_rates_json,
        price_trends_json
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        captured_at = excluded.captured_at,
        submission_id = excluded.submission_id,
        matched_count = excluded.matched_count,
        total_count = excluded.total_count,
        price_signature = excluded.price_signature,
        prices_json = excluded.prices_json,
        price_change_rates_json = excluded.price_change_rates_json,
        price_trends_json = excluded.price_trends_json
    `).bind(
      now,
      normalized.capturedAt,
      submissionId,
      normalized.matchedCount,
      normalized.totalCount,
      normalized.priceSignature,
      normalized.pricesJson,
      normalized.priceChangeRatesJson,
      normalized.priceTrendsJson
    )
  ]);
}

async function hashSubmitter(request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown-ip';
  const ua = request.headers.get('user-agent') || 'unknown-ua';
  return sha256Hex(`${ip}\n${ua}`);
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function snapshotFromDefaultRow(row) {
  const priceChangeRates = safeJsonObject(row.price_change_rates_json);
  const priceTrends = safeJsonObject(row.price_trends_json);
  const snapshot = {
    version: 1,
    source: 'cloud-default',
    capturedAt: Number(row.captured_at),
    defaultUpdatedAt: Number(row.updated_at),
    prices: { shop: safeJsonObject(row.prices_json) },
    matched: Number(row.matched_count) || 0,
    totalSeeds: Number(row.total_count) || SEED_IDS.length
  };
  if (Object.keys(priceChangeRates).length) snapshot.priceChangeRates = { shop: priceChangeRates };
  if (Object.keys(priceTrends).length) snapshot.priceTrends = { shop: priceTrends };
  return snapshot;
}

function snapshotFromNormalized(normalized, updatedAt) {
  const snapshot = {
    version: 1,
    source: 'cloud-default',
    capturedAt: normalized.capturedAt,
    defaultUpdatedAt: updatedAt,
    prices: { shop: normalized.prices },
    matched: normalized.matchedCount,
    totalSeeds: normalized.totalCount
  };
  if (Object.keys(normalized.priceChangeRates || {}).length) snapshot.priceChangeRates = { shop: normalized.priceChangeRates };
  if (Object.keys(normalized.priceTrends || {}).length) snapshot.priceTrends = { shop: normalized.priceTrends };
  return snapshot;
}

async function hydrateSnapshotTrends(env, snapshot) {
  if (!snapshot || !snapshot.prices || !snapshot.prices.shop) return;
  const existingTrends = snapshot.priceTrends && snapshot.priceTrends.shop ? snapshot.priceTrends.shop : {};
  if (Object.keys(existingTrends).length >= MIN_MATCHED_PRICES) return;

  const rows = await env.PRICE_DB.prepare(`
    SELECT captured_at, prices_json
    FROM price_submissions
    WHERE accepted = 1
    ORDER BY captured_at DESC
    LIMIT 500
  `).all();
  const trendMap = buildTrendMapFromRows((rows && rows.results) || [], snapshot.prices.shop, Number(snapshot.capturedAt) || Date.now());
  if (Object.keys(trendMap).length) snapshot.priceTrends = { shop: Object.assign({}, trendMap, existingTrends) };
}

function buildTrendMapFromRows(rows, currentPrices, fallbackCapturedAt) {
  const sortedRows = rows.slice().sort((a, b) => Number(a.captured_at) - Number(b.captured_at));
  const buckets = {};
  for (const row of sortedRows) {
    const capturedAt = Number(row.captured_at);
    if (!Number.isFinite(capturedAt) || capturedAt <= 0) continue;
    const prices = safeJsonObject(row.prices_json);
    addTrendBucketPoints(buckets, prices, capturedAt, 'hourly', REFRESH_INTERVAL_MS);
    addTrendBucketPoints(buckets, prices, capturedAt, 'daily', 24 * REFRESH_INTERVAL_MS);
  }

  const refreshedAt = new Date(Number(fallbackCapturedAt) || Date.now()).toISOString();
  const out = {};
  for (const id of SEED_IDS) {
    const current = Number(currentPrices && currentPrices[id]);
    const hourly = bucketMapToSeries(buckets[`${id}:hourly`]);
    const daily = bucketMapToSeries(buckets[`${id}:daily`]);
    if (!hourly.length && !daily.length && !Number.isFinite(current)) continue;
    out[id] = { hourly, daily };
    if (Number.isFinite(current)) out[id].unitPrice = Number(current.toFixed(5));
    out[id].lastRefreshedAt = refreshedAt;
  }
  return out;
}

function addTrendBucketPoints(buckets, prices, capturedAt, seriesKey, bucketMs) {
  const bucketStartedAt = new Date(Math.floor(capturedAt / bucketMs) * bucketMs).toISOString();
  for (const id of SEED_IDS) {
    const price = Number(prices && prices[id]);
    if (!Number.isFinite(price) || price < 0) continue;
    const key = `${id}:${seriesKey}`;
    const series = buckets[key] || (buckets[key] = new Map());
    const aggregate = series.get(bucketStartedAt) || { sum: 0, count: 0 };
    aggregate.sum += price;
    aggregate.count += 1;
    series.set(bucketStartedAt, aggregate);
  }
}

function bucketMapToSeries(bucketMap) {
  if (!bucketMap) return [];
  return Array.from(bucketMap.entries())
    .map(([bucketStartedAt, aggregate]) => ({
      bucketStartedAt,
      avgUnitPrice: Number((aggregate.sum / Math.max(1, aggregate.count)).toFixed(5))
    }))
    .sort((a, b) => Date.parse(a.bucketStartedAt) - Date.parse(b.bucketStartedAt))
    .slice(-MAX_TREND_POINTS_PER_SERIES);
}

function safeJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function assertDatabase(env) {
  if (!env.PRICE_DB) throw new Error('PRICE_DB binding is not configured');
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}
