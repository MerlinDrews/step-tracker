/**
 * Wild Apricot SSO + Google Sheets backend for Club Step Counter.
 *
 * Script Properties (File > Project properties > Script properties):
 *   WA_CLIENT_ID
 *   WA_CLIENT_SECRET
 *   WA_ACCOUNT_ID
 *   WA_SITE_URL          e.g. https://myclub.wildapricot.org
 *   WA_API_KEY           optional API key (Settings → Apps → API key) for group lookups
 *   SESSION_SECRET      random string for signing session tokens
 *   SHEET_ID            Google Sheet ID containing a "steps" tab
 *   FRONTEND_ORIGIN     e.g. https://you.github.io/step-counter (where the interactive app is hosted)
 *
 * Wild Apricot authorized app:
 *   Trusted redirect domain = FRONTEND_ORIGIN host (GitHub Pages / app host) — required for SSO.
 *   The WA Custom HTML gadget cannot call Apps Script (WA CSP blocks script.googleusercontent.com);
 *   it only links out to FRONTEND_ORIGIN.
 *   ALLOWED_GROUP_IDS   optional; required for me/log (track). Leaderboard ignores these.
 *   ALLOWED_GROUP_NAMES optional; if both empty, any Active member may log steps.
 *
 * Deploy as Web App: Execute as Me, Who has access: Anyone.
 *
 * Keep Domain.gs in the same Apps Script project (copy from apps-script/Domain.gs).
 */

var STEPS_HEADERS = ['date', 'contactId', 'email', 'name', 'steps', 'updated_at'];

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  try {
    var action = (e.parameter && e.parameter.action) || '';
    var body = {};
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    if (action === 'auth_start') {
      return redirectToWaLogin(e.parameter.return_to);
    }
    if (action === 'auth_callback') {
      return handleAuthCallback(e.parameter);
    }
    if (action === 'auth_exchange' && method === 'POST') {
      return handleAuthExchange(body);
    }
    if (action === 'auth_resume' && method === 'POST') {
      return handleAuthResume(body);
    }
    if (action === 'public_config') {
      return jsonOk({
        waClientId: prop('WA_CLIENT_ID') || '',
        waAccountId: prop('WA_ACCOUNT_ID') || '',
        waSiteUrl: (prop('WA_SITE_URL') || '').replace(/\/$/, ''),
      });
    }
    if (action === 'public_total') {
      var totals = getTotalsFromSheet();
      return jsonOk({ totalSteps: totals.totalSteps || 0 });
    }
    if (action === 'leaderboard') {
      if (method !== 'POST') return jsonErr('Use POST for leaderboard', 405);
      return handleLeaderboard(e, body);
    }
    // Legacy alias: never expose contributor names publicly
    if (action === 'totals') {
      var legacy = getTotalsFromSheet();
      return jsonOk({ totalSteps: legacy.totalSteps || 0 });
    }
    if (action === 'me') {
      if (method !== 'POST') return jsonErr('Use POST for me', 405);
      return handleMe(e, body);
    }
    if (action === 'log' && method === 'POST') {
      return handleLog(e, body);
    }
    if (action === 'logout' && method === 'POST') {
      return jsonOk({});
    }
    return jsonErr('Unknown action', 404);
  } catch (err) {
    return jsonErr(String(err.message || err), 500);
  }
}

function prop(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function redirectToWaLogin(returnTo) {
  var clientId = prop('WA_CLIENT_ID');
  var site = prop('WA_SITE_URL').replace(/\/$/, '');
  var accountId = prop('WA_ACCOUNT_ID');
  var callback = ScriptApp.getService().getUrl() + '?action=auth_callback';
  if (returnTo) {
    callback += '&return_to=' + encodeURIComponent(returnTo);
  }
  var url =
    site +
    '/sys/login/OAuthLogin?client_id=' +
    encodeURIComponent(clientId) +
    '&redirect_uri=' +
    encodeURIComponent(callback) +
    '&scope=contacts_me' +
    '&claimed_account_id=' +
    encodeURIComponent(accountId) +
    '&response_type=authorization_code';
  return HtmlService.createHtmlOutput(
    '<script>window.location.href=' + JSON.stringify(url) + ';</script>',
  );
}

function handleAuthCallback(params) {
  var code = params.code;
  var returnTo = params.return_to || prop('FRONTEND_ORIGIN');
  if (!code) {
    return jsonErr('Missing authorization code', 400);
  }

  var token = exchangeCode(code, ScriptApp.getService().getUrl() + '?action=auth_callback' + (params.return_to ? '&return_to=' + encodeURIComponent(params.return_to) : ''));
  var member = enrichMemberGroups_(fetchContactMe(token.access_token));
  // Any Active member may establish a session (leaderboard). Group checks apply only to me/log.
  var gate = Domain.assertActiveMember(member);
  if (!gate.ok) {
    return jsonErr(gate.error, 403);
  }

  var sessionToken = createSessionToken(member);
  var loginCode = Utilities.getUuid();
  CacheService.getScriptCache().put('login_' + loginCode, sessionToken, 120);
  var dest = returnTo || '/';
  var sep = dest.indexOf('?') >= 0 ? '&' : '?';
  // One-time code in URL — exchanged via POST auth_resume (never put session tokens in GET URLs).
  var redirectUrl = dest + sep + 'login_code=' + encodeURIComponent(loginCode);
  return HtmlService.createHtmlOutput(
    '<script>window.location.href=' + JSON.stringify(redirectUrl) + ';</script>',
  );
}

/** Exchange a one-time login_code from auth_callback redirect (POST only). */
function handleAuthResume(body) {
  var code = body && body.login_code;
  if (!code) return jsonErr('Missing login_code', 400);
  var cache = CacheService.getScriptCache();
  var token = cache.get('login_' + code);
  if (!token) return jsonErr('Login code expired or invalid', 401);
  cache.remove('login_' + code);
  var member = parseSessionToken(token);
  if (!member) return jsonErr('Invalid session', 401);
  return jsonOk({ sessionToken: token, member: member });
}

/**
 * Browser-safe SSO: frontend redirects to Wild Apricot, then POSTs the code here via fetch.
 * Avoids top-level navigation to script.google.com (often shows a Google Drive error page).
 */
function handleAuthExchange(body) {
  var code = body && body.code;
  var redirectUri = body && body.redirect_uri;
  if (!code || !redirectUri) {
    return jsonErr('Missing code or redirect_uri', 400);
  }
  if (!isAllowedRedirectUri_(String(redirectUri))) {
    return jsonErr('redirect_uri is not allowed', 400);
  }

  var token = exchangeCode(String(code), String(redirectUri));
  var member = enrichMemberGroups_(fetchContactMe(token.access_token));
  var gate = Domain.assertActiveMember(member);
  if (!gate.ok) {
    return jsonErr(gate.error, 403);
  }

  return jsonOk({
    sessionToken: createSessionToken(member),
    member: member,
  });
}

function isAllowedRedirectUri_(uri) {
  var allowedHosts = {};
  function addOrigin(origin) {
    if (!origin) return;
    var host = String(origin)
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .toLowerCase();
    if (!host) return;
    allowedHosts[host] = true;
    if (host.indexOf('www.') === 0) allowedHosts[host.slice(4)] = true;
    else allowedHosts['www.' + host] = true;
  }
  addOrigin(prop('WA_SITE_URL'));
  addOrigin(prop('FRONTEND_ORIGIN'));
  var uriHost = String(uri)
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase();
  return Boolean(uriHost && allowedHosts[uriHost]);
}

function exchangeCode(code, redirectUri) {
  var clientId = prop('WA_CLIENT_ID');
  var clientSecret = prop('WA_CLIENT_SECRET');
  var basic = Utilities.base64Encode(clientId + ':' + clientSecret);
  var resp = UrlFetchApp.fetch('https://oauth.wildapricot.org/auth/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    headers: { Authorization: 'Basic ' + basic },
    payload: {
      grant_type: 'authorization_code',
      code: code,
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'contacts_me',
    },
    muteHttpExceptions: true,
  });
  var data = JSON.parse(resp.getContentText());
  if (resp.getResponseCode() >= 300) {
    throw new Error('Token exchange failed: ' + resp.getContentText());
  }
  return data;
}

function fetchContactMe(accessToken) {
  var accountId = prop('WA_ACCOUNT_ID');
  var resp = UrlFetchApp.fetch(
    'https://api.wildapricot.org/v2/accounts/' + accountId + '/contacts/me',
    {
      headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
      muteHttpExceptions: true,
    },
  );
  if (resp.getResponseCode() >= 300) {
    throw new Error('contacts/me failed: ' + resp.getContentText());
  }
  var raw = JSON.parse(resp.getContentText());
  return {
    contactId: String(raw.Id),
    email: raw.Email || '',
    name: [raw.FirstName, raw.LastName].filter(Boolean).join(' ') || raw.Email || 'Member',
    membershipStatus: raw.Status || 'Active',
    groups: Domain.parseGroupsFromFieldValues(raw.FieldValues),
  };
}

/** Admin API token — prefer WA_API_KEY (APIKEY:…); fall back to client_id:secret. */
function getAdminAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('wa_admin_token');
  if (cached) return cached;

  var apiKey = prop('WA_API_KEY');
  var clientId = prop('WA_CLIENT_ID');
  var clientSecret = prop('WA_CLIENT_SECRET');
  // API keys use "APIKEY:<key>"; SSO server apps use "clientId:clientSecret".
  var basic = apiKey
    ? Utilities.base64Encode('APIKEY:' + apiKey)
    : Utilities.base64Encode(clientId + ':' + clientSecret);
  var resp = UrlFetchApp.fetch('https://oauth.wildapricot.org/auth/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    headers: { Authorization: 'Basic ' + basic },
    payload: {
      grant_type: 'client_credentials',
      scope: 'auto',
    },
    muteHttpExceptions: true,
  });
  var data = JSON.parse(resp.getContentText());
  if (resp.getResponseCode() >= 300) {
    throw new Error('Admin token failed: ' + resp.getContentText());
  }
  var ttl = Math.max(60, Math.min(Number(data.expires_in || 1800) - 60, 21600));
  cache.put('wa_admin_token', data.access_token, ttl);
  return data.access_token;
}

function fetchContactAdmin_(contactId) {
  var accountId = prop('WA_ACCOUNT_ID');
  var resp = UrlFetchApp.fetch(
    'https://api.wildapricot.org/v2/accounts/' + accountId + '/contacts/' + encodeURIComponent(contactId),
    {
      headers: { Authorization: 'Bearer ' + getAdminAccessToken_(), Accept: 'application/json' },
      muteHttpExceptions: true,
    },
  );
  if (resp.getResponseCode() >= 300) {
    throw new Error('contacts/' + contactId + ' failed: ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText());
}

/**
 * Fill groups from Admin API when /contacts/me omits them.
 * Soft-fails so SSO login still works without WA_API_KEY (leaderboard only needs Active).
 */
function enrichMemberGroups_(member) {
  var groups = member.groups || [];
  if (groups.length > 0) {
    member.groups = groups;
    return member;
  }
  try {
    var raw = fetchContactAdmin_(member.contactId);
    groups = Domain.parseGroupsFromFieldValues(raw.FieldValues);
    if (raw.Status) member.membershipStatus = raw.Status;
    if (raw.Email) member.email = raw.Email;
    var name = [raw.FirstName, raw.LastName].filter(Boolean).join(' ');
    if (name) member.name = name;
  } catch (err) {
    // Common when the SSO app cannot use client_credentials — set WA_API_KEY for group gates.
    Logger.log('enrichMemberGroups_ skipped: ' + err);
    groups = [];
  }
  member.groups = groups;
  return member;
}

function allowedGroupConfig_() {
  return {
    ids: Domain.parseAllowList(prop('ALLOWED_GROUP_IDS')),
    names: Domain.parseAllowList(prop('ALLOWED_GROUP_NAMES')),
  };
}

function authorizeMember_(member) {
  var cfg = allowedGroupConfig_();
  return Domain.assertAuthorizedMember(member, cfg.ids, cfg.names);
}

function createSessionToken(member) {
  var payload = {
    contactId: member.contactId,
    email: member.email,
    name: member.name,
    membershipStatus: member.membershipStatus || 'Active',
    groups: member.groups || [],
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  var sig = Utilities.computeHmacSha256Signature(body, prop('SESSION_SECRET'));
  var sigB64 = Utilities.base64EncodeWebSafe(sig);
  return body + '.' + sigB64;
}

function parseSessionToken(token) {
  if (!token) return null;
  var parts = String(token).replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 2) return null;
  var expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(parts[0], prop('SESSION_SECRET')),
  );
  if (expected !== parts[1]) return null;
  var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function getSessionFromRequest(e) {
  // Session tokens are accepted via Authorization header or POST body only (never query strings).
  var headerToken = extractBearer_(e);
  return headerToken ? parseSessionToken(headerToken) : null;
}

function resolveMember_(e, body) {
  var member = getSessionFromRequest(e);
  var headerToken = extractBearer_(e);
  if (!member && headerToken) member = parseSessionToken(headerToken);
  if (!member && body && body.sessionToken) member = parseSessionToken(body.sessionToken);
  return member;
}

/** Members-only ranked list (Active membership; not group-restricted). */
function handleLeaderboard(e, body) {
  var member = resolveMember_(e, body);
  if (!member) return jsonErr('Not signed in', 401);
  var gate = Domain.assertActiveMember(member);
  if (!gate.ok) return jsonErr(gate.error, 403);
  return jsonOk({ totals: getTotalsFromSheet(), member: member });
}

function handleMe(e, body) {
  body = body || {};
  var member = resolveMember_(e, body);
  if (!member) return jsonErr('Not signed in', 401);
  var gate = authorizeMember_(member);
  if (!gate.ok) return jsonErr(gate.error, 403);

  var rows = readStepsRows();
  var today = Domain.todayKey();
  var selected = body.date || today;
  var dateCheck = Domain.validateDateKey(selected, today);
  if (!dateCheck.ok) return jsonErr(dateCheck.error, 400);
  var history = Domain.historyForContact(rows, member.contactId);
  var daySteps = Domain.findStepsForDate(rows, member.contactId, dateCheck.date);
  return jsonOk({
    member: member,
    today: today,
    selectedDate: dateCheck.date,
    daySteps: daySteps,
    todaySteps: Domain.findStepsForDate(rows, member.contactId, today),
    history: history,
  });
}

function handleLog(e, body) {
  var member = resolveMember_(e, body);
  if (!member) return jsonErr('Not signed in', 401);
  var gate = authorizeMember_(member);
  if (!gate.ok) return jsonErr(gate.error, 403);

  var validated = Domain.validateSteps(body.steps);
  if (!validated.ok) return jsonErr(validated.error, 400);

  var today = Domain.todayKey();
  var dateCheck = Domain.validateDateKey(body.date || today, today);
  if (!dateCheck.ok) return jsonErr(dateCheck.error, 400);

  var rows = readStepsRows();
  rows = Domain.upsertDailySteps(rows, {
    date: dateCheck.date,
    contactId: member.contactId,
    email: member.email,
    name: member.name,
    steps: validated.steps,
    updated_at: new Date().toISOString(),
  });
  writeStepsRows(rows);
  return jsonOk({
    date: dateCheck.date,
    today: today,
    steps: validated.steps,
    totals: Domain.aggregateTotals(rows),
    history: Domain.historyForContact(rows, member.contactId),
  });
}

function extractBearer_(e) {
  try {
    var headers = e.headers || e.parameter || {};
    var auth = headers.Authorization || headers.authorization || '';
    if (auth) return String(auth).replace(/^Bearer\s+/i, '');
  } catch (err) {}
  return '';
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(prop('SHEET_ID'));
  var sheet = ss.getSheetByName('steps');
  if (!sheet) {
    sheet = ss.insertSheet('steps');
    sheet.getRange(1, 1, 1, STEPS_HEADERS.length).setValues([STEPS_HEADERS]);
  }
  return sheet;
}

function readStepsRows() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0] && !r[1]) continue;
    rows.push({
      date: String(r[0]),
      contactId: String(r[1]),
      email: String(r[2] || ''),
      name: String(r[3] || ''),
      steps: Number(r[4]) || 0,
      updated_at: String(r[5] || ''),
    });
  }
  return rows;
}

function writeStepsRows(rows) {
  var sheet = getSheet_();
  sheet.clearContents();
  var data = [STEPS_HEADERS];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    data.push([r.date, r.contactId, r.email, r.name, r.steps, r.updated_at]);
  }
  sheet.getRange(1, 1, data.length, STEPS_HEADERS.length).setValues(data);
}

function getTotalsFromSheet() {
  return Domain.aggregateTotals(readStepsRows());
}

function jsonOk(obj) {
  return packJson_(Object.assign({ ok: true }, obj));
}

function jsonErr(message, code) {
  return packJson_({ ok: false, error: message, status: code || 400 });
}

function packJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
