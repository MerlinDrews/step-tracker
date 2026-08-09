import { createApi } from './api.js';
import {
  buildMonthGrid,
  formatDisplayDate,
  formatSteps,
  parseDateKey,
  todayKey,
  toLeaderboardView,
  validateSteps,
} from './domain/index.js';

const api = createApi();

/** @type {string} */
let selectedDate = todayKey();
/** @type {Record<string, number>} */
let history = {};
/** @type {{ year: number, monthIndex: number }} */
let viewMonth = (() => {
  const d = parseDateKey(selectedDate) || new Date();
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
})();

const els = {
  modeBadge: document.getElementById('mode-badge'),
  signedOut: document.getElementById('signed-out'),
  signedIn: document.getElementById('signed-in'),
  mockUsers: document.getElementById('mock-users'),
  clubLogin: document.getElementById('club-login'),
  memberName: document.getElementById('member-name'),
  signOut: document.getElementById('sign-out'),
  stepsInput: document.getElementById('steps-input'),
  stepsLabel: document.getElementById('steps-label'),
  dateInput: document.getElementById('date-input'),
  saveBtn: document.getElementById('save-btn'),
  formError: document.getElementById('form-error'),
  formSuccess: document.getElementById('form-success'),
  totalSteps: document.getElementById('total-steps'),
  leaderboard: document.getElementById('leaderboard'),
  calPrev: document.getElementById('cal-prev'),
  calNext: document.getElementById('cal-next'),
  calLabel: document.getElementById('cal-label'),
  calGrid: document.getElementById('cal-grid'),
};

function setMessage(el, text) {
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTotals(totals) {
  const view = toLeaderboardView(totals || { totalSteps: 0, contributors: [] });
  els.totalSteps.textContent = view.totalStepsLabel;
  els.leaderboard.innerHTML = view.rows
    .map(
      (row) => `
      <li class="leaderboard__row">
        <span class="leaderboard__rank">${row.rank}</span>
        <span class="leaderboard__name">${escapeHtml(row.name)}</span>
        <span class="leaderboard__steps">${row.stepsLabel}</span>
      </li>`,
    )
    .join('');
}

function updateFormLabels() {
  const label = formatDisplayDate(selectedDate);
  const isToday = selectedDate === todayKey();
  els.stepsLabel.textContent = isToday ? 'Steps today' : `Steps for ${label}`;
  els.saveBtn.textContent = isToday ? 'Save today’s steps' : `Save steps for ${label}`;
  els.dateInput.value = selectedDate;
  els.dateInput.max = todayKey();
}

function renderCalendar() {
  const grid = buildMonthGrid(viewMonth.year, viewMonth.monthIndex, {
    today: todayKey(),
    selected: selectedDate,
    history,
  });
  els.calLabel.textContent = grid.label;
  els.calGrid.innerHTML = grid.cells
    .map((cell) => {
      if (cell.type === 'empty') {
        return '<div class="calendar__cell calendar__cell--empty"></div>';
      }
      const classes = [
        'calendar__cell',
        'calendar__day',
        cell.isToday ? 'is-today' : '',
        cell.isSelected ? 'is-selected' : '',
        cell.hasEntry ? 'has-entry' : '',
        cell.isFuture ? 'is-future' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const title = cell.hasEntry
        ? `${formatDisplayDate(cell.date)}: ${formatSteps(cell.steps)} steps`
        : formatDisplayDate(cell.date);
      return `<button type="button" class="${classes}" data-date="${cell.date}" ${
        cell.isFuture ? 'disabled' : ''
      } title="${escapeHtml(title)}" aria-pressed="${cell.isSelected}">
        <span class="calendar__day-num">${cell.day}</span>
        ${cell.hasEntry ? '<span class="calendar__dot" aria-hidden="true"></span>' : ''}
      </button>`;
    })
    .join('');
}

function applyDaySteps(daySteps) {
  if (daySteps !== null && daySteps !== undefined) {
    els.stepsInput.value = String(daySteps);
  } else {
    els.stepsInput.value = '';
  }
}

async function selectDate(dateKey) {
  selectedDate = dateKey;
  const d = parseDateKey(dateKey);
  if (d) {
    viewMonth = { year: d.getFullYear(), monthIndex: d.getMonth() };
  }
  updateFormLabels();
  renderCalendar();

  const res = await api.getMe(selectedDate);
  if (!res.ok) return;
  history = res.history || {};
  applyDaySteps(res.daySteps);
  renderCalendar();
}

async function refreshTotals() {
  const res = await api.getTotals();
  if (res.ok) renderTotals(res.totals);
}

async function refreshMe() {
  const res = await api.getMe(selectedDate);
  if (!res.ok) {
    showSignedOut();
    return;
  }
  showSignedIn(res.member);
  history = res.history || {};
  if (res.selectedDate) selectedDate = res.selectedDate;
  applyDaySteps(res.daySteps);
  updateFormLabels();
  renderCalendar();
}

function showSignedOut() {
  els.signedOut.hidden = false;
  els.signedIn.hidden = true;
  history = {};
}

function showSignedIn(member) {
  els.signedOut.hidden = true;
  els.signedIn.hidden = false;
  els.memberName.textContent = member.name || member.email || 'Member';
}

function setupAuthUi() {
  const config = window.STEP_COUNTER_CONFIG || {};
  const root = document.getElementById('aiwcd-step-counter');
  if (config.EMBEDDED && root) {
    root.classList.add('embedded');
  }
  if (els.modeBadge) {
    els.modeBadge.textContent = api.mode === 'local' ? 'Local mock' : 'Production';
    els.modeBadge.dataset.mode = api.mode;
  }

  if (api.mode === 'local') {
    els.clubLogin.hidden = true;
    els.mockUsers.hidden = false;
    els.mockUsers.innerHTML = '';
    for (const user of api.listMockUsers()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--secondary';
      btn.textContent = `Sign in as ${user.label}`;
      btn.addEventListener('click', async () => {
        setMessage(els.formError, '');
        setMessage(els.formSuccess, '');
        selectedDate = todayKey();
        const res = await api.loginAs(user.id);
        if (!res.ok) {
          setMessage(els.formError, res.error);
          return;
        }
        await refreshMe();
        await refreshTotals();
      });
      els.mockUsers.appendChild(btn);
    }
  } else {
    els.mockUsers.hidden = true;
    els.clubLogin.hidden = false;
    els.clubLogin.addEventListener('click', () => api.startClubLogin());
  }

  els.signOut.addEventListener('click', async () => {
    await api.logout();
    showSignedOut();
    setMessage(els.formSuccess, '');
    setMessage(els.formError, '');
    els.stepsInput.value = '';
    selectedDate = todayKey();
    updateFormLabels();
    renderCalendar();
  });
}

function setupCalendar() {
  els.calPrev.addEventListener('click', () => {
    const d = new Date(viewMonth.year, viewMonth.monthIndex - 1, 1);
    viewMonth = { year: d.getFullYear(), monthIndex: d.getMonth() };
    renderCalendar();
  });

  els.calNext.addEventListener('click', () => {
    const d = new Date(viewMonth.year, viewMonth.monthIndex + 1, 1);
    viewMonth = { year: d.getFullYear(), monthIndex: d.getMonth() };
    renderCalendar();
  });

  els.calGrid.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-date]');
    if (!btn || btn.disabled) return;
    setMessage(els.formError, '');
    setMessage(els.formSuccess, '');
    await selectDate(btn.dataset.date);
  });

  els.dateInput.addEventListener('change', async () => {
    if (!els.dateInput.value) return;
    setMessage(els.formError, '');
    setMessage(els.formSuccess, '');
    await selectDate(els.dateInput.value);
  });
}

function setupForm() {
  els.saveBtn.addEventListener('click', async () => {
    setMessage(els.formError, '');
    setMessage(els.formSuccess, '');

    const validated = validateSteps(els.stepsInput.value);
    if (!validated.ok) {
      setMessage(els.formError, validated.error);
      return;
    }

    els.saveBtn.disabled = true;
    try {
      const res = await api.logSteps(validated.steps, selectedDate);
      if (!res.ok) {
        setMessage(els.formError, res.error);
        return;
      }
      if (res.date) selectedDate = res.date;
      history = res.history || history;
      setMessage(
        els.formSuccess,
        `Saved ${formatSteps(res.steps)} steps for ${formatDisplayDate(selectedDate)}`,
      );
      renderTotals(res.totals);
      updateFormLabels();
      renderCalendar();
    } finally {
      els.saveBtn.disabled = false;
    }
  });
}

async function init() {
  updateFormLabels();
  renderCalendar();
  setupAuthUi();
  setupCalendar();
  setupForm();
  await refreshTotals();

  const me = await api.getMe(selectedDate);
  if (me.ok) {
    showSignedIn(me.member);
    history = me.history || {};
    if (me.selectedDate) selectedDate = me.selectedDate;
    applyDaySteps(me.daySteps);
    updateFormLabels();
    renderCalendar();
  } else {
    showSignedOut();
  }
}

init();
