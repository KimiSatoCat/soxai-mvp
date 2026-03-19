/*
 * SOXAI MVP Proxy — Stage 6 (API-aligned, CSV-capable)
 *
 * Responsibilities:
 *   - Relay login to SOXAI API ({SOXAI_API_BASE}/api/login)
 *   - Relay data fetch to SOXAI API (DailyInfoData, DailyDetailData)
 *   - Parse CSV responses into JSON arrays when API returns CSV
 *   - Return raw response metadata for diagnostics
 *   - Maintain diagnostic log
 *
 * API reference (confirmed from documentation and prior working code):
 *   - Swagger: https://soxai-firebase.df.r.appspot.com/docs#/
 *   - ReDoc:   https://soxai-firebase.df.r.appspot.com/redoc#/
 *   - Login:   POST {SOXAI_API_BASE}/api/login  (email, password, returnSecureToken)
 *   - Data:    GET  {base}{endpoint}/{localId}?page=0&start_time=...&stop_time=...
 *   - DailyDetailData time field: UTC
 *   - DailyInfoData time field: local time
 *   - Data responses are CSV (Content-Type: application/octet-stream)
 *
 * Confirmed native score fields in DailyInfoData:
 *   activity_score, health_score, qol_score, sleep_score
 *
 * Error code taxonomy:
 *   CONFIG_MISSING            — required env var not set
 *   ENDPOINT_NOT_CONFIGURED   — endpoint path env var empty
 *   AUTH_FAILED               — auth error
 *   NETWORK_ERROR             — fetch threw (timeout, DNS, etc.)
 *   HTTP_ERROR                — non-2xx status from API
 *   EMPTY_RESPONSE            — 2xx but body is empty
 *   NON_JSON_RESPONSE         — body is not JSON and not recognizable CSV
 *   JSON_PARSE_ERROR          — body looks like JSON but parse failed
 *   CSV_PARSE_ERROR           — body looks like CSV but parsing failed
 *   UNEXPECTED_STRUCTURE      — parsed but structure unrecognizable
 *
 * NOT responsible for: analysis, scoring, normalization, UI.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PROXY_PORT || 3001;
const SOXAI_API_BASE = process.env.SOXAI_API_BASE || '';
const ENDPOINT_DAILY_INFO = process.env.ENDPOINT_DAILY_INFO || '';
const ENDPOINT_DAILY_DETAIL = process.env.ENDPOINT_DAILY_DETAIL || '';

/* ── diagnostic log ──────────────────────────────────────── */

const diagLog = [];
const MAX_LOG = 200;

function diag(stage, status, detail) {
  const entry = {
    timestamp: new Date().toISOString(),
    stage,
    status,
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500),
  };
  diagLog.unshift(entry);
  if (diagLog.length > MAX_LOG) diagLog.pop();
  console.log(`[${status.toUpperCase()}] ${stage}: ${entry.detail}`);
  return entry;
}

/* ── config check ────────────────────────────────────────── */

function checkConfig() {
  const missing = [];
  if (!SOXAI_API_BASE) missing.push('SOXAI_API_BASE');
  if (!ENDPOINT_DAILY_INFO) missing.push('ENDPOINT_DAILY_INFO');
  if (!ENDPOINT_DAILY_DETAIL) missing.push('ENDPOINT_DAILY_DETAIL');
  return missing;
}

/* ── URL construction (shared) ───────────────────────────── */

function buildDataUrl({ base, endpoint, localId, page = 0, startDate, endDate }) {
  if (!base) {
    throw new Error('SOXAI_API_BASE is empty');
  }
  if (!endpoint) {
    throw new Error('endpoint is empty');
  }
  if (!localId) {
    throw new Error('localId is empty');
  }

  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;

  const params = new URLSearchParams();
  params.set('page', String(page));

  if (startDate) params.set('start_time', startDate);
  if (endDate) params.set('stop_time', endDate);

  const url = `${normalizedBase}${normalizedEndpoint}/${localId}?${params.toString()}`;
  return { url, endpoint: normalizedEndpoint };
}

/* ── CSV detection and parsing ───────────────────────────── */

function looksLikeCsv(contentType, body) {
  if (contentType.includes('text/csv')) return true;
  var trimmed = body.trimStart();
  if (trimmed.length === 0) return false;
  var firstLine = trimmed.split(/\r?\n/)[0];
  var commaCount = (firstLine.match(/,/g) || []).length;
  if (commaCount >= 2 && !firstLine.trimStart().startsWith('{') && !firstLine.trimStart().startsWith('[')) {
    return true;
  }
  return false;
}

function parseCsv(body) {
  var lines = body.split(/\r?\n/).filter(function (line) { return line.trim().length > 0; });
  if (lines.length < 1) {
    return { ok: false, error: 'No lines found in CSV body' };
  }

  var headers = lines[0].split(',').map(function (h) { return h.trim(); });
  if (headers.length < 2) {
    return { ok: false, error: 'CSV header has fewer than 2 columns: ' + lines[0].slice(0, 200) };
  }

  var records = [];
  for (var i = 1; i < lines.length; i++) {
    var values = splitCsvLine(lines[i]);
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      var raw = j < values.length ? values[j] : '';
      row[key] = convertCsvValue(raw);
    }
    records.push(row);
  }

  return { ok: true, headers: headers, records: records };
}

function splitCsvLine(line) {
  var values = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuotes) {
      if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  values.push(current);
  return values;
}

function convertCsvValue(raw) {
  var trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'NULL') return null;
  if (/^\d{4}-\d{2}-\d{2}[\sT]/.test(trimmed)) return trimmed;
  if (/^\d{4}[_-]\d{2}$/.test(trimmed)) return trimmed;
  if (/^[a-zA-Z]/.test(trimmed)) return trimmed;
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  if (/^-?\d+$/.test(trimmed)) {
    var n = Number(trimmed);
    if (n >= Number.MIN_SAFE_INTEGER && n <= Number.MAX_SAFE_INTEGER) return n;
    return trimmed;
  }
  return trimmed;
}

/* ── GET /api/health ─────────────────────────────────────── */

app.get('/api/health', function (_req, res) {
  var missing = checkConfig();
  res.json({
    status: missing.length === 0 ? 'ok' : 'incomplete_config',
    missingEnvVars: missing,
    loginUrl: SOXAI_API_BASE ? SOXAI_API_BASE.replace(/\/+$/, '') + '/api/login' : '(SOXAI_API_BASE NOT SET)',
    endpoints: {
      dailyInfo: ENDPOINT_DAILY_INFO || '(NOT SET)',
      dailyDetail: ENDPOINT_DAILY_DETAIL || '(NOT SET)',
    },
    urlPattern: '{SOXAI_API_BASE}{ENDPOINT}/{localId}?page=0&start_time=...&stop_time=...',
  });
});

/* ── POST /api/login ─────────────────────────────────────── */

app.post('/api/login', async function (req, res) {
  var _a = req.body || {}, email = _a.email, password = _a.password;

  if (!email || !password) {
    var d = diag('login', 'failure', 'Missing email or password');
    return res.status(400).json({ success: false, errorCode: 'AUTH_FAILED', errorDetail: 'MISSING_CREDENTIALS', diagnostic: d });
  }
  if (!SOXAI_API_BASE) {
    var d = diag('login', 'failure', 'SOXAI_API_BASE not configured');
    return res.status(500).json({ success: false, errorCode: 'CONFIG_MISSING', errorDetail: 'SOXAI_API_BASE', diagnostic: d });
  }

  var loginUrl = SOXAI_API_BASE.replace(/\/+$/, '') + '/api/login';

  try {
    diag('login', 'info', 'POST ' + loginUrl + ' (email: ' + email + ')');

    var soxaiRes = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
    });

    var contentType = soxaiRes.headers.get('content-type') || 'unknown';
    var rawText = await soxaiRes.text();

    var meta = {
      httpStatus: soxaiRes.status,
      contentType: contentType,
      bodyLength: rawText.length,
      requestUrl: loginUrl,
    };

    if (!rawText || rawText.length === 0) {
      var d = diag('login', 'failure', 'Empty response. HTTP ' + soxaiRes.status);
      return res.status(502).json({ success: false, errorCode: 'EMPTY_RESPONSE', httpStatus: meta.httpStatus, contentType: meta.contentType, bodyLength: meta.bodyLength, requestUrl: meta.requestUrl, diagnostic: d });
    }

    var parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (_e) {
      var d = diag('login', 'failure', 'Non-JSON response. HTTP ' + soxaiRes.status + '. Content-Type: ' + contentType);
      return res.status(502).json({
        success: false,
        errorCode: contentType.includes('json') ? 'JSON_PARSE_ERROR' : 'NON_JSON_RESPONSE',
        httpStatus: meta.httpStatus, contentType: meta.contentType, bodyLength: meta.bodyLength, requestUrl: meta.requestUrl,
        bodyPreview: rawText.slice(0, 500), diagnostic: d,
      });
    }

    if (!soxaiRes.ok) {
      var errMsg = (parsed && parsed.error && parsed.error.message) || (parsed && parsed.message) || (parsed && parsed.detail) || 'UNKNOWN';
      var d = diag('login', 'failure', 'Auth error: ' + errMsg + ' (HTTP ' + soxaiRes.status + ')');
      return res.status(soxaiRes.status).json({
        success: false, errorCode: 'AUTH_FAILED', serverError: errMsg,
        httpStatus: meta.httpStatus, contentType: meta.contentType, bodyLength: meta.bodyLength, requestUrl: meta.requestUrl,
        responseKeys: Object.keys(parsed), diagnostic: d,
      });
    }

    var idToken = parsed.idToken || null;
    var localId = parsed.localId || null;

    if (!idToken || !localId) {
      var d = diag('login', 'warning', 'Tokens incomplete. Keys: ' + Object.keys(parsed).join(', '));
      return res.json({
        success: true, warning: 'INCOMPLETE_TOKENS',
        idToken: idToken, localId: localId, responseKeys: Object.keys(parsed),
        httpStatus: meta.httpStatus, contentType: meta.contentType, bodyLength: meta.bodyLength, requestUrl: meta.requestUrl,
        diagnostic: d,
      });
    }

    var d = diag('login', 'success', 'OK. localId=' + localId);
    return res.json({ success: true, idToken: idToken, localId: localId, httpStatus: meta.httpStatus, contentType: meta.contentType, bodyLength: meta.bodyLength, requestUrl: meta.requestUrl, diagnostic: d });

  } catch (err) {
    var d = diag('login', 'failure', 'Network error: ' + err.message);
    return res.status(500).json({ success: false, errorCode: 'NETWORK_ERROR', errorDetail: err.message, diagnostic: d });
  }
});

/* ── POST /api/fetch-data ────────────────────────────────── */

app.post('/api/fetch-data', async function (req, res) {
  var body = req.body || {};
  var idToken = body.idToken;
  var localId = body.localId;
  var startDate = body.startDate;
  var endDate = body.endDate;
  var dataType = body.dataType || 'both';

  if (!idToken || !localId) {
    var d = diag('fetch-data', 'failure', 'Missing idToken or localId');
    return res.status(400).json({ success: false, errorCode: 'AUTH_FAILED', errorDetail: 'MISSING_TOKENS', diagnostic: d });
  }
  if (!SOXAI_API_BASE) {
    var d = diag('fetch-data', 'failure', 'SOXAI_API_BASE not set');
    return res.status(500).json({ success: false, errorCode: 'CONFIG_MISSING', errorDetail: 'SOXAI_API_BASE', diagnostic: d });
  }

  var results = {};

  async function fetchOne(label, envPath) {
    if (!envPath) {
      var d = diag('fetch-' + label, 'failure', 'Endpoint env var is empty');
      return { success: false, errorCode: 'ENDPOINT_NOT_CONFIGURED', diagnostic: d };
    }

    const MAX_PAGES = 50;
    let allRecords = [];
    let lastStructure = null;
    let lastMeta = null;
    let pagesFetched = 0;
    let sourceFormat = null;

    for (let page = 0; page < MAX_PAGES; page++) {
  let built;

  try {
    built = buildDataUrl({
      base: SOXAI_API_BASE,
      endpoint: envPath,
      localId: localId,
      page: page,
      startDate: startDate,
      endDate: endDate,
    });
  } catch (err) {
    var d = diag('fetch-' + label, 'failure', 'URL build failed on page ' + page + ': ' + err.message);
    return {
      success: false,
      errorCode: 'CONFIG_MISSING',
      errorDetail: err.message,
      diagnostic: d,
    };
  }

  console.log(`[${label}] page=${page} url=${built.url}`);
  diag('fetch-' + label, 'info', 'GET ' + built.url);

      var apiRes;
      try {
        apiRes = await fetch(built.url, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + idToken,
  },
});
      } catch (err) {
        var d = diag('fetch-' + label, 'failure', 'Network error on page ' + page + ': ' + err.message);
        if (allRecords.length > 0) break;
        return { success: false, errorCode: 'NETWORK_ERROR', errorDetail: err.message, diagnostic: d };
      }

      var contentType = apiRes.headers.get('content-type') || 'unknown';
      var rawText;
      try {
        rawText = await apiRes.text();
      } catch (err) {
        if (allRecords.length > 0) break;
        var d = diag('fetch-' + label, 'failure', 'Body read failed on page ' + page);
        return { success: false, errorCode: 'NETWORK_ERROR', errorDetail: 'Body read failed', diagnostic: d };
      }

      lastMeta = {
        httpStatus: apiRes.status,
        contentType: contentType,
        bodyLength: rawText.length,
        bodyPreview: rawText.slice(0, 1500),
        requestUrl: built.url,
      };

      if (!apiRes.ok) {
        if (allRecords.length > 0) break;
        var d = diag('fetch-' + label, 'failure', 'HTTP ' + apiRes.status + ' on page ' + page);
        return { success: false, errorCode: 'HTTP_ERROR', httpStatus: lastMeta.httpStatus, contentType: lastMeta.contentType, bodyLength: lastMeta.bodyLength, bodyPreview: lastMeta.bodyPreview, requestUrl: lastMeta.requestUrl, diagnostic: d };
      }

      if (!rawText || rawText.trim().length === 0) {
        diag('fetch-' + label, 'info', 'Empty body on page ' + page + ' — stopping pagination');
        break;
      }

      // Try JSON
      var parsed = null;
      try { parsed = JSON.parse(rawText); } catch (_e) {}

      var pageRecords = [];
      console.log(`[${label}] page=${page} parsedType=${Array.isArray(parsed) ? 'array' : typeof parsed}`);
if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
  console.log(`[${label}] page=${page} keys=`, Object.keys(parsed));
}

      if (parsed !== null) {
        if (Array.isArray(parsed)) {
          pageRecords = parsed;
        } else if (typeof parsed === 'object') {
          // ネスト配列を探す（トップレベルキーに配列があればそれをレコードとして採用）
          for (var k of Object.keys(parsed)) {
            if (Array.isArray(parsed[k]) && parsed[k].length > 0
                && typeof parsed[k][0] === 'object' && parsed[k][0] !== null) {
              pageRecords = parsed[k];
              break;
            }
          }
          // 配列が見つからない場合は pageRecords = [] のまま（メタ情報 object を誤追加しない）
          console.log(`[${label}] page=${page} pageRecords.length=${pageRecords.length}`);
          if (pageRecords.length === 0) {
            diag('fetch-' + label, 'info', 'Page ' + page + ': parsed object has no nested record array — skipping');
          }
        }
        try { lastStructure = analyzeStructure(parsed); } catch (_e) {}
      } else if (looksLikeCsv(contentType, rawText)) {
        var csvResult = parseCsv(rawText);
        if (csvResult.ok) {
          pageRecords = csvResult.records;
          sourceFormat = 'csv';
          try { lastStructure = analyzeStructure(csvResult.records); } catch (_e) {}
        } else {
          diag('fetch-' + label, 'warning', 'CSV parse failed on page ' + page);
          break;
        }
      } else {
        diag('fetch-' + label, 'warning', 'Non-JSON/CSV on page ' + page + ' — stopping');
        break;
      }

      console.log(`[${label}] page=${page} pageRecords.length=${pageRecords.length}`);
      if (pageRecords.length === 0) {
        diag('fetch-' + label, 'info', '0 records on page ' + page + ' — stopping pagination');
        break;
      }

      allRecords = allRecords.concat(pageRecords);
      pagesFetched = page + 1;

      diag('fetch-' + label, 'info', 'Page ' + page + ': ' + pageRecords.length + ' records (total: ' + allRecords.length + ')');
    }

    if (allRecords.length === 0 && pagesFetched === 0) {
      var d = diag('fetch-' + label, 'warning', 'No data across all pages');
      return { success: false, errorCode: 'EMPTY_RESPONSE', httpStatus: lastMeta?.httpStatus, contentType: lastMeta?.contentType, bodyLength: lastMeta?.bodyLength, requestUrl: lastMeta?.requestUrl, diagnostic: d };
    }

    // Re-analyze structure on full dataset
    try { lastStructure = analyzeStructure(allRecords); } catch (_e) {}

    var d = diag('fetch-' + label, 'success', 'Total: ' + allRecords.length + ' records from ' + pagesFetched + ' page(s)');
    return {
      success: true,
      data: allRecords,
      structure: lastStructure,
      sourceFormat: sourceFormat,
      pagination: { pagesFetched: pagesFetched, totalRecords: allRecords.length },
      httpStatus: lastMeta?.httpStatus,
      contentType: lastMeta?.contentType,
      bodyLength: lastMeta?.bodyLength,
      requestUrl: lastMeta?.requestUrl,
      diagnostic: d,
    };
  }

  if (dataType === 'both' || dataType === 'dailyinfo') {
    results.dailyInfo = await fetchOne('dailyInfo', ENDPOINT_DAILY_INFO);
  }
  if (dataType === 'both' || dataType === 'dailydetail') {
    results.dailyDetail = await fetchOne('dailyDetail', ENDPOINT_DAILY_DETAIL);
  }

  return res.json({ success: true, results: results });
});

/* ── GET /api/diagnostics ────────────────────────────────── */

app.get('/api/diagnostics', function (_req, res) {
  res.json({ entries: diagLog });
});

/* ── structure analysis (zero assumptions) ───────────────── */

function analyzeStructure(data) {
  var out = {
    topLevelType: data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data,
    isArray: Array.isArray(data),
    recordCount: 0,
    fields: [],
    fieldTypes: {},
    sampleRecord: null,
    nestedArrayKey: null,
    nativeScoreCandidates: [],
    timeFieldCandidates: [],
  };

  if (data == null) return out;

  var records = [];

  if (Array.isArray(data)) {
    records = data;
  } else if (typeof data === 'object') {
    var topKeys = Object.keys(data);
    out.fields = topKeys;
    for (var i = 0; i < topKeys.length; i++) {
      out.fieldTypes[topKeys[i]] = Array.isArray(data[topKeys[i]]) ? 'array' : typeof data[topKeys[i]];
    }
    for (var i = 0; i < topKeys.length; i++) {
      if (Array.isArray(data[topKeys[i]])) {
        out.nestedArrayKey = topKeys[i];
        records = data[topKeys[i]];
        break;
      }
    }
  }

  out.recordCount = records.length;
  if (records.length > 0 && typeof records[0] === 'object' && records[0] !== null) {
    out.sampleRecord = records[0];
    var keys = Object.keys(records[0]);
    out.fields = keys;
    for (var i = 0; i < keys.length; i++) {
      out.fieldTypes[keys[i]] = typeof records[0][keys[i]];
    }

    var scoreKw = [
      'score', 'スコア', 'sleepscore', 'sleep_score', 'conditionscore',
      'condition_score', 'healthscore', 'health_score', 'qol',
      'activityscore', 'activity_score', 'exercisescore', 'exercise_score',
      'totalscore', 'total_score',
    ];
    var timeKw = [
      'time', 'date', 'timestamp', 'created', 'updated',
      'measured', 'recorded', '日時', '時刻',
    ];

    for (var i = 0; i < keys.length; i++) {
      var low = keys[i].toLowerCase();
      for (var s = 0; s < scoreKw.length; s++) {
        if (low.includes(scoreKw[s])) {
          out.nativeScoreCandidates.push({
            field: keys[i], sampleValue: records[0][keys[i]],
            note: 'CANDIDATE ONLY — not confirmed as SOXAI native score',
          });
          break;
        }
      }
      for (var t = 0; t < timeKw.length; t++) {
        if (low.includes(timeKw[t])) {
          out.timeFieldCandidates.push({
            field: keys[i], sampleValue: records[0][keys[i]], guessedFormat: guessTimeFmt(records[0][keys[i]]),
          });
          break;
        }
      }
    }
  }

  return out;
}

function guessTimeFmt(v) {
  if (v == null) return 'unknown';
  if (typeof v === 'number') return v > 1e12 ? 'unix_ms?' : v > 1e9 ? 'unix_s?' : 'numeric?';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return 'ISO8601?';
    if (/^\d{4}-\d{2}-\d{2}\s/.test(v)) return 'datetime_space?';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'YYYY-MM-DD?';
    if (/^\d{4}\/\d{2}\/\d{2}/.test(v)) return 'YYYY/MM/DD?';
  }
  return 'unknown';
}

/* ── start ───────────────────────────────────────────────── */

app.listen(PORT, function () {
  var missing = checkConfig();
  console.log('');
  console.log('=== SOXAI MVP Proxy (Stage 6, CSV-capable) ===');
  console.log('Port: ' + PORT);
  console.log('Login: ' + (SOXAI_API_BASE ? SOXAI_API_BASE.replace(/\/+$/, '') + '/api/login' : '(SOXAI_API_BASE NOT SET)'));
  console.log('Data:  {base}{endpoint}/{localId}?page=0&start_time=...&stop_time=...');
  console.log('Response handling: JSON or CSV (auto-detected)');
  if (missing.length > 0) {
    console.log('');
    console.log('WARNING: Missing required env vars: ' + missing.join(', '));
    console.log('Affected endpoints will return CONFIG_MISSING or ENDPOINT_NOT_CONFIGURED errors.');
    console.log('');
  } else {
    console.log('All required env vars are set.');
  }
  diag('startup', 'info', 'Started. Missing: [' + missing.join(', ') + ']');
});
