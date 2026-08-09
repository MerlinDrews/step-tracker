/**
 * Wild Apricot SSO + Google Sheets backend for Club Step Counter.
 *
 * Script Properties (File > Project properties > Script properties):
 *   WA_CLIENT_ID
 *   WA_CLIENT_SECRET
 *   WA_ACCOUNT_ID
 *   WA_SITE_URL          e.g. https://myclub.wildapricot.org
 *   SESSION_SECRET      random string for signing session tokens
 *   SHEET_ID            Google Sheet ID containing a "steps" tab
 *   FRONTEND_ORIGIN     e.g. https://user.github.io (for CORS / return_to allowlist)
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
    if (action === 'totals') {
      return jsonOk({ totals: getTotalsFromSheet() });
    }
    if (action === 'me') {
      return handleMe(e);
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
  var member = fetchContactMe(token.access_token);
  if (!Domain.assertActiveMember(member).ok) {
    return jsonErr('Membership is not active', 403);
  }

  var sessionToken = createSessionToken(member);
  var dest = returnTo || '/';
  var sep = dest.indexOf('?') >= 0 ? '&' : '?';
  // Frontend reads session from redirect query then stores it; prefer fragment-less query for Apps Script simplicity.
  var redirectUrl = dest + sep + 'sessionToken=' + encodeURIComponent(sessionToken);
  return HtmlService.createHtmlOutput(
    '<script>window.location.href=' + JSON.stringify(redirectUrl) + ';</script>',
  );
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
  };
}

function createSessionToken(member) {
  var payload = {
    contactId: member.contactId,
    email: member.email,
    name: member.name,
    membershipStatus: member.membershipStatus || 'Active',
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
  var auth = (e && e.parameter && e.parameter.sessionToken) || '';
  // Apps Script cannot easily read Authorization header in all contexts; also accept body token via doPost.
  return parseSessionToken(auth);
}

function handleMe(e) {
  var member = getSessionFromRequest(e);
  // Prefer Authorization header when available
  if (!member && e && e.postData) {
    /* no-op for GET */
  }
  var headerToken = extractBearer_(e);
  if (!member && headerToken) member = parseSessionToken(headerToken);
  if (!member) return jsonErr('Not signed in', 401);
  var gate = Domain.assertActiveMember(member);
  if (!gate.ok) return jsonErr(gate.error, 403);

  var rows = readStepsRows();
  var today = Domain.todayKey();
  var selected = (e.parameter && e.parameter.date) || today;
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
  var member = parseSessionToken(extractBearer_(e)) || getSessionFromRequest(e);
  if (!member && body && body.sessionToken) member = parseSessionToken(body.sessionToken);
  if (!member) return jsonErr('Not signed in', 401);
  var gate = Domain.assertActiveMember(member);
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
  var out = Object.assign({ ok: true }, obj);
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function jsonErr(message, code) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: message, status: code || 400 }),
  ).setMimeType(ContentService.MimeType.JSON);
}
