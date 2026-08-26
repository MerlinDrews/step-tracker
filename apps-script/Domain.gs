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

  function parseAllowList(value) {
    if (!value) return [];
    return String(value)
      .split(/[\n,]+/)
      .map(function (s) {
        return s.replace(/^\s+|\s+$/g, '');
      })
      .filter(Boolean);
  }

  function parseGroupsFromFieldValues(fieldValues) {
    if (!fieldValues || !fieldValues.length) return [];
    var entry = null;
    for (var i = 0; i < fieldValues.length; i++) {
      var f = fieldValues[i];
      if (f && (f.SystemCode === 'Groups' || f.FieldName === 'Group participation')) {
        entry = f;
        break;
      }
    }
    if (!entry || entry.Value == null) return [];
    var raw = entry.Value;
    if (!raw || typeof raw.length !== 'number') return [];
    var out = [];
    for (var j = 0; j < raw.length; j++) {
      var g = raw[j] || {};
      var id = String(g.Id != null ? g.Id : g.id != null ? g.id : '');
      var label = String(
        g.Label != null
          ? g.Label
          : g.label != null
            ? g.label
            : g.Name != null
              ? g.Name
              : g.name != null
                ? g.name
                : '',
      );
      if (id || label) out.push({ id: id, label: label });
    }
    return out;
  }

  function assertAllowedGroups(groups, allowedIds, allowedNames) {
    allowedIds = allowedIds || [];
    allowedNames = allowedNames || [];
    var ids = [];
    var names = [];
    var i;
    for (i = 0; i < allowedIds.length; i++) ids.push(String(allowedIds[i]));
    for (i = 0; i < allowedNames.length; i++) names.push(String(allowedNames[i]).toLowerCase());
    if (ids.length === 0 && names.length === 0) return { ok: true };

    var memberGroups = groups || [];
    for (i = 0; i < memberGroups.length; i++) {
      var g = memberGroups[i];
      if (g.id && ids.indexOf(String(g.id)) >= 0) return { ok: true };
      if (g.label && names.indexOf(String(g.label).toLowerCase()) >= 0) return { ok: true };
    }
    return {
      ok: false,
      error: 'You are not in an authorized member group for this step challenge',
    };
  }

  function assertAuthorizedMember(member, allowedIds, allowedNames) {
    var active = assertActiveMember(member);
    if (!active.ok) return active;
    return assertAllowedGroups(member && member.groups, allowedIds, allowedNames);
  }

  function assertAdminMember(member, adminIds, adminNames) {
    var active = assertActiveMember(member);
    if (!active.ok) return active;
    adminIds = adminIds || [];
    adminNames = adminNames || [];
    if (adminIds.length === 0 && adminNames.length === 0) {
      return { ok: false, error: 'Admin access is not configured' };
    }
    var gate = assertAllowedGroups(member && member.groups, adminIds, adminNames);
    if (gate.ok) return gate;
    return { ok: false, error: 'Admin access required' };
  }

  function isAdminMember(member, adminIds, adminNames) {
    return assertAdminMember(member, adminIds, adminNames).ok;
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
    parseAllowList: parseAllowList,
    parseGroupsFromFieldValues: parseGroupsFromFieldValues,
    assertAllowedGroups: assertAllowedGroups,
    assertAuthorizedMember: assertAuthorizedMember,
    assertAdminMember: assertAdminMember,
    isAdminMember: isAdminMember,
    upsertDailySteps: upsertDailySteps,
    aggregateTotals: aggregateTotals,
    findStepsForDate: findStepsForDate,
    findTodaySteps: findStepsForDate,
    historyForContact: historyForContact,
  };
})();
