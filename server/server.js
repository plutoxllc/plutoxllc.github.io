// NexLaunch SP-API sandbox backend
// Zero-dependency Node 18+ server: node:http + global fetch only.
// Since Oct 2023 SP-API requires NO AWS SigV4 — only the LWA access token
// in the "x-amz-access-token" header. Do not add SigV4 signing here.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Env loading: server/.env (KEY=VALUE lines, # comments) with process.env wins
// ---------------------------------------------------------------------------
function loadEnvFile(filePath) {
  const out = {};
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return out; // no .env is fine
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // strip optional surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvFile(path.join(__dirname, '.env'));
function env(key, fallback) {
  if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
  if (fileEnv[key] !== undefined && fileEnv[key] !== '') return fileEnv[key];
  return fallback;
}

const CONFIG = {
  clientId: env('SPAPI_CLIENT_ID'),
  clientSecret: env('SPAPI_CLIENT_SECRET'),
  refreshToken: env('SPAPI_REFRESH_TOKEN'),
  spapiBase: env('SPAPI_BASE', 'https://sandbox.sellingpartnerapi-na.amazon.com'),
  port: Number(env('PORT', '4879')),
  marketplaceId: env('MARKETPLACE_ID', 'ATVPDKIKX0DER'),
};

function isConfigured() {
  return Boolean(CONFIG.clientId && CONFIG.clientSecret && CONFIG.refreshToken);
}

// ---------------------------------------------------------------------------
// LWA token exchange with cache (refresh ~60s before expiry)
// ---------------------------------------------------------------------------
const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
let tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: CONFIG.refreshToken,
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
  });
  const res = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LWA token exchange failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + (Number(json.expires_in) || 3600) * 1000,
  };
  return tokenCache.accessToken;
}

// ---------------------------------------------------------------------------
// SP-API helper: attach LWA token, parse JSON, throw with status on failure
// ---------------------------------------------------------------------------
async function spapiFetch(pathAndQuery, options = {}) {
  const accessToken = await getAccessToken();
  const res = await fetch(CONFIG.spapiBase + pathAndQuery, {
    method: options.method || 'GET',
    headers: {
      'x-amz-access-token': accessToken,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const err = new Error(
      `SP-API ${options.method || 'GET'} ${pathAndQuery.split('?')[0]} failed (HTTP ${res.status})`
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Run a sub-call; on failure return { error, status } instead of throwing.
async function safeCall(fn) {
  try {
    return await fn();
  } catch (err) {
    const section = { error: err.message || String(err) };
    if (err.status) section.status = err.status;
    if (err.body) section.detail = err.body;
    return section;
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------
async function handleHealth() {
  return { status: 200, body: { ok: true, configured: isConfigured() } };
}

async function handleXray(query) {
  if (!isConfigured()) {
    return {
      status: 503,
      body: {
        error: 'SP-API credentials not configured',
        hint: 'copy server/.env.example to server/.env and fill in your sandbox app client values',
      },
    };
  }
  const asin = (query.get('asin') || '').trim();
  if (!asin) {
    return { status: 400, body: { error: 'missing required query param: asin' } };
  }

  const mkt = CONFIG.marketplaceId;
  const encAsin = encodeURIComponent(asin);

  const [catalog, offers, fees] = await Promise.all([
    safeCall(() =>
      spapiFetch(
        `/catalog/2022-04-01/items/${encAsin}?marketplaceIds=${encodeURIComponent(mkt)}&includedData=attributes,salesRanks,summaries`
      )
    ),
    safeCall(() =>
      spapiFetch(
        `/products/pricing/v0/items/${encAsin}/offers?MarketplaceId=${encodeURIComponent(mkt)}&ItemCondition=New`
      )
    ),
    safeCall(() =>
      spapiFetch(`/products/fees/v0/items/${encAsin}/feesEstimate`, {
        method: 'POST',
        body: {
          FeesEstimateRequest: {
            MarketplaceId: mkt,
            IsAmazonFulfilled: true,
            PriceToEstimateFees: {
              ListingPrice: { CurrencyCode: 'USD', Amount: 29.99 },
            },
            Identifier: 'nexlaunch-request',
          },
        },
      })
    ),
  ]);

  return {
    status: 200,
    body: {
      source: CONFIG.spapiBase.includes('sandbox') ? 'sp-api-sandbox' : 'sp-api-production',
      asin, catalog, offers, fees,
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...CORS_HEADERS,
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let url;

  res.on('finish', () => {
    // Log method, path, status only — never query values or secrets.
    console.log(
      `${new Date().toISOString()} ${req.method} ${url ? url.pathname : '(unparseable url)'} -> ${res.statusCode} (${Date.now() - started}ms)`
    );
  });

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  try {
    // Parse inside the try block: a malformed request-target (e.g. an
    // absolute-form URL like `GET http://[/`) makes new URL throw, which
    // would otherwise be an unhandled rejection that kills the process.
    url = new URL(req.url, `http://localhost:${CONFIG.port}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      const { status, body } = await handleHealth();
      sendJson(res, status, body);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/xray') {
      const { status, body } = await handleXray(url.searchParams);
      sendJson(res, status, body);
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'internal server error' });
  }
});

server.listen(CONFIG.port, () => {
  console.log(`NexLaunch SP-API server listening on http://localhost:${CONFIG.port}`);
  console.log(`  SP-API base:    ${CONFIG.spapiBase}`);
  console.log(`  Marketplace:    ${CONFIG.marketplaceId}`);
  console.log(`  Credentials:    ${isConfigured() ? 'configured' : 'NOT configured (copy server/.env.example to server/.env)'}`);
});
