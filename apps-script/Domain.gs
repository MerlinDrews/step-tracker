/**
 * Pure domain helpers for Apps Script (ported from src/domain/).
 * Keep behavior in sync with the JS modules under src/domain/.
 */
var Domain = (function () {
  var MIN_STEPS = 0;
  var MAX_STEPS = 100000;
  var ACTIVE = { active: true, Active: true, ACTIVE: true };
  var DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function toDateKey(date) {
    var d = date || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1);
    if (m.length < 2) m = '0' + m;
    var day = String(d.getDate());
    if (day.length < 2) day = '0' + day;
    return y + '-' + m + '-' + day;
  }

  function todayKey() {
    return toDateKey(new Date());
  }

  function parseDateKey(dateKey) {
    var match = DATE_KEY_RE.exec(String(dateKey || ''));
    if (!match) return null;
    var y = Number(match[1]);
    var m = Number(match[2]);
    var d = Number(match[3]);
    var date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      return null;
    }
    return date;
  }

  function validateDateKey(value, today) {
    today = today || todayKey();
    if (value === null || value === undefined || value === '') {
      return { ok: false, error: 'Choose a date' };
    }
    var key = String(value).replace(/^\s+|\s+$/g, '');
    if (!parseDateKey(key)) return { ok: false, error: 'Date must be YYYY-MM-DD' };
    if (key > today) return { ok: false, error: 'Cannot log steps for a future date' };
    return { ok: true, date: key };
  }

  function validateSteps(value) {
    if (value === null || value === undefined || value === '') {
      return { ok: false, error: 'Enter a step count' };
    }
    var n = typeof value === 'number' ? value : Number(String(value).replace(/^\s+|\s+$/g, ''));
    if (!isFinite(n)) return { ok: false, error: 'Steps must be a number' };
    if (Math.floor(n) !== n) return { ok: false, error: 'Steps must be a whole number' };
    if (n < MIN_STEPS) return { ok: false, error: 'Steps cannot be negative' };
    if (n > MAX_STEPS) return { ok: false, error: 'Steps cannot exceed ' + MAX_STEPS };
    return { ok: true, steps: n };
  }

  function assertActiveMember(member) {
    if (!member || member.contactId === undefined || member.contactId === null || member.contactId === '') {
      return { ok: false, error: 'Not signed in' };
    }
    var status = member.membershipStatus;
    if (status === undefined || status === null || status === '') return { ok: true };
    if (!ACTIVE[String(status)]) return { ok: false, error: 'Membership is not active' };
    return { ok: true };
  }

  function upsertDailySteps(rows, entry) {
    var contactId = String(entry.contactId);
    var date = entry.date;
    var updated_at = entry.updated_at || new Date().toISOString();
    var next = rows.map(function (r) {
      return Object.assign({}, r);
    });
    var idx = -1;
    for (var i = 0; i < next.length; i++) {
      if (next[i].date === date && String(next[i].contactId) === contactId) {
        idx = i;
        break;
      }
    }
    var row = {
      date: date,
      contactId: entry.contactId,
      email: entry.email || '',
      name: entry.name || '',
      steps: entry.steps,
      updated_at: updated_at,
    };
    if (idx >= 0) {
      next[idx] = Object.assign({}, next[idx], row, {
        email: entry.email || next[idx].email,
        name: entry.name || next[idx].name,
      });
    } else {
      next.push(row);
    }
    return next;
  }

  function aggregateTotals(rows) {
    var byPerson = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var id = String(row.contactId);
      var steps = Number(row.steps) || 0;
      if (byPerson[id]) {
        byPerson[id].steps += steps;
        if (row.name) byPerson[id].name = row.name;
        if (row.email) byPerson[id].email = row.email;
      } else {
        byPerson[id] = {
          contactId: id,
          name: row.name || row.email || 'Member ' + id,
          email: row.email || '',
          steps: steps,
        };
      }
    }
    var contributors = Object.keys(byPerson).map(function (k) {
      return byPerson[k];
    });
    contributors.sort(function (a, b) {
      if (b.steps !== a.steps) return b.steps - a.steps;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    var totalSteps = 0;
    for (var j = 0; j < contributors.length; j++) totalSteps += contributors[j].steps;
    return { totalSteps: totalSteps, contributors: contributors };
  }

  function findStepsForDate(rows, contactId, dateKey) {
    var id = String(contactId);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].date === dateKey && String(rows[i].contactId) === id) {
        return Number(rows[i].steps);
      }
    }
    return null;
  }

  function historyForContact(rows, contactId) {
    var id = String(contactId);
    var history = {};
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].contactId) === id) {
        history[rows[i].date] = Number(rows[i].steps) || 0;
      }
    }
    return history;
  }

  return {
    toDateKey: toDateKey,
    todayKey: todayKey,
    parseDateKey: parseDateKey,
    validateDateKey: validateDateKey,
    validateSteps: validateSteps,
    assertActiveMember: assertActiveMember,
    upsertDailySteps: upsertDailySteps,
    aggregateTotals: aggregateTotals,
    findStepsForDate: findStepsForDate,
    findTodaySteps: findStepsForDate,
    historyForContact: historyForContact,
  };
})();
