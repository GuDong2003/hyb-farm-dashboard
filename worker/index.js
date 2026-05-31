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

const CONSENSUS_WINDOW_MS = 5 * 60 * 1000;
const REQUIRED_CONSENSUS = 2;
const MIN_MATCHED_PRICES = 15;
const MAX_PRICE_USD = 1000000;
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
  return jsonResponse({ ok: true, snapshot: row ? snapshotFromDefaultRow(row) : null }, 200, {
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
  const staleReason = current && normalized.capturedAt <= Number(current.captured_at)
    ? 'stale_or_existing_data'
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
      submitter_hash,
      accepted,
      accepted_at,
      rejection_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
  `).bind(
    now,
    normalized.capturedAt,
    normalized.capturedBucket,
    normalized.source,
    normalized.matchedCount,
    normalized.totalCount,
    normalized.priceSignature,
    normalized.pricesJson,
    submitterHash,
    staleReason || null
  ).run();

  const submissionId = Number(insertResult.meta && insertResult.meta.last_row_id) || 0;

  if (staleReason) {
    return jsonResponse({ ok: true, status: 'rejected', reason: staleReason, submissionId });
  }

  const consensus = await consensusFor(env, normalized);
  if (consensus.distinctSubmitters < REQUIRED_CONSENSUS) {
    return jsonResponse({
      ok: true,
      status: 'pending',
      submissionId,
      consensusCount: consensus.distinctSubmitters,
      required: REQUIRED_CONSENSUS
    });
  }

  await acceptConsensus(env, normalized, submissionId, now);

  return jsonResponse({
    ok: true,
    status: 'accepted',
    submissionId,
    consensusCount: consensus.distinctSubmitters,
    required: REQUIRED_CONSENSUS,
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

  return {
    ok: true,
    capturedAt,
    capturedBucket: Math.floor(capturedAt / CONSENSUS_WINDOW_MS),
    source: String(snapshot.source || 'dashboard-upload').slice(0, 64),
    matchedCount,
    totalCount: SEED_IDS.length,
    prices,
    pricesJson: JSON.stringify(prices),
    priceSignature
  };
}

async function consensusFor(env, normalized) {
  const row = await env.PRICE_DB.prepare(`
    SELECT
      COUNT(*) AS submissions,
      COUNT(DISTINCT submitter_hash) AS distinct_submitters
    FROM price_submissions
    WHERE rejection_reason IS NULL
      AND captured_bucket = ?
      AND price_signature = ?
      AND captured_at BETWEEN ? AND ?
  `).bind(
    normalized.capturedBucket,
    normalized.priceSignature,
    normalized.capturedAt - CONSENSUS_WINDOW_MS,
    normalized.capturedAt + CONSENSUS_WINDOW_MS
  ).first();

  return {
    submissions: Number(row && row.submissions) || 0,
    distinctSubmitters: Number(row && row.distinct_submitters) || 0
  };
}

async function acceptConsensus(env, normalized, submissionId, now) {
  await env.PRICE_DB.batch([
    env.PRICE_DB.prepare(`
      UPDATE price_submissions
      SET accepted = 1, accepted_at = ?
      WHERE rejection_reason IS NULL
        AND captured_bucket = ?
        AND price_signature = ?
        AND captured_at BETWEEN ? AND ?
    `).bind(
      now,
      normalized.capturedBucket,
      normalized.priceSignature,
      normalized.capturedAt - CONSENSUS_WINDOW_MS,
      normalized.capturedAt + CONSENSUS_WINDOW_MS
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
        prices_json
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        captured_at = excluded.captured_at,
        submission_id = excluded.submission_id,
        matched_count = excluded.matched_count,
        total_count = excluded.total_count,
        price_signature = excluded.price_signature,
        prices_json = excluded.prices_json
    `).bind(
      now,
      normalized.capturedAt,
      submissionId,
      normalized.matchedCount,
      normalized.totalCount,
      normalized.priceSignature,
      normalized.pricesJson
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
  return {
    version: 1,
    source: 'cloud-default',
    capturedAt: Number(row.captured_at),
    defaultUpdatedAt: Number(row.updated_at),
    prices: { shop: JSON.parse(row.prices_json || '{}') },
    matched: Number(row.matched_count) || 0,
    totalSeeds: Number(row.total_count) || SEED_IDS.length
  };
}

function snapshotFromNormalized(normalized, updatedAt) {
  return {
    version: 1,
    source: 'cloud-default',
    capturedAt: normalized.capturedAt,
    defaultUpdatedAt: updatedAt,
    prices: { shop: normalized.prices },
    matched: normalized.matchedCount,
    totalSeeds: normalized.totalCount
  };
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
