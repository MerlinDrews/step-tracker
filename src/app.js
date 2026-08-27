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
/** @type {number|null} */
let clubTotalSteps = null;
/** @type {boolean} */
let isAdmin = false;

/** @type {Array<{ contactId: string, name: string, email?: string, steps: number }>} */
let adminContributors = [];
/** @type {string} */
let adminSelectedDate = todayKey();
/** @type {Record<string, number>} */
let adminHistory = {};
/** @type {{ year: number, monthIndex: number }} */
let adminViewMonth = (() => {
  const d = parseDateKey(adminSelectedDate) || new Date();
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
})();

function getConfig() {
  return window.STEP_COUNTER_CONFIG || {};
}

/** @returns {'total' | 'leaderboard' | 'track' | 'all'} */
function resolvePart() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('part');
  const raw = String(fromQuery || getConfig().PART || 'all').toLowerCase();
  if (raw === 'total' || raw === 'leaderboard' || raw === 'track' || raw === 'all') {
    return raw;
  }
  return 'all';
}

const root = document.getElementById('aiwcd-step-counter');
/** @type {'total' | 'leaderboard' | 'track' | 'all'} */
let part = resolvePart();
if (root) {
  root.dataset.aiwcdPart = part;
}

/** @param {string} id */
function $(id) {
  if (!root) return document.getElementById(id);
  return root.querySelector(`#${id}`);
}

const els = {
  root,
  modeBadge: $('mode-badge'),
  sectionTotal: $('section-total'),
  sectionTrack: $('section-track'),
  sectionLeaderboard: $('section-leaderboard'),
  trackHeading: $('track-heading'),
  trackCta: $('track-cta'),
  trackCtaTitle: $('track-cta-title'),
  trackCtaLede: $('track-cta-lede'),
  trackCtaAction: $('track-cta-action'),
  joinLink: $('join-link'),
  trackApp: $('track-app'),
  mockUsers: $('mock-users'),
  mockUsersBoard: $('mock-users-board'),
  memberName: $('member-name'),
  signOut: $('sign-out'),
  stepsInput: $('steps-input'),
  stepsLabel: $('steps-label'),
  dateInput: $('date-input'),
  saveBtn: $('save-btn'),
  formError: $('form-error'),
  formErrorTrack: $('form-error-track'),
  formErrorBoard: $('form-error-board'),
  formSuccess: $('form-success'),
  totalSteps: $('total-steps'),
  personalTotalWrap: $('personal-total-wrap'),
  personalSteps: $('personal-steps'),
  leaderboardCaption: $('leaderboard-caption'),
  boardGate: $('board-gate'),
  boardGateLede: $('board-gate-lede'),
  boardGateAction: $('board-gate-action'),
  boardLoginLink: $('board-login-link'),
  boardContent: $('board-content'),
  leaderboard: $('leaderboard'),
  calPrev: $('cal-prev'),
  calNext: $('cal-next'),
  calLabel: $('cal-label'),
  calGrid: $('cal-grid'),
  appLoading: $('app-loading'),
  appLoadingText: $('app-loading-text'),
  sectionAdmin: $('section-admin'),
  adminParticipant: $('admin-participant'),
  adminCalPrev: $('admin-cal-prev'),
  adminCalNext: $('admin-cal-next'),
  adminCalLabel: $('admin-cal-label'),
  adminCalGrid: $('admin-cal-grid'),
  adminDate: $('admin-date'),
  adminSteps: $('admin-steps'),
  adminStepsLabel: $('admin-steps-label'),
  adminSaveBtn: $('admin-save-btn'),
  adminFormError: $('admin-form-error'),
  adminFormSuccess: $('admin-form-success'),
};

function clubLoginUrl() {
  const site = String(getConfig().WA_SITE_URL || '').replace(/\/$/, '');
  return site ? `${site}/Sys/Login` : '#';
}

const DEFAULT_JOIN_URL = 'https://www.aiwcduesseldorf.org/event-6782449';

function joinUrl() {
  const config = getConfig();
  if (config.JOIN_URL) return String(config.JOIN_URL);
  return DEFAULT_JOIN_URL;
}

function setMessage(el, text) {
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
}

function setLoading(isLoading, message = 'Loading…') {
  if (!els.appLoading) return;
  if (els.appLoadingText) els.appLoadingText.textContent = message;
  els.appLoading.hidden = !isLoading;
  if (els.root) els.root.classList.toggle('is-loading', Boolean(isLoading));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showPartSections() {
  const present = [els.sectionTotal, els.sectionTrack, els.sectionLeaderboard].filter(Boolean);
  const showAll = part === 'all' || present.length !== 3 || present.length <= 1;

  if (showAll) {
    for (const section of present) {
      section.hidden = false;
      section.removeAttribute('hidden');
    }
  } else {
    // Local single-surface testing only (?part=total|leaderboard|track).
    if (els.sectionTotal) els.sectionTotal.hidden = part !== 'total';
    if (els.sectionTrack) els.sectionTrack.hidden = part !== 'track';
    if (els.sectionLeaderboard) els.sectionLeaderboard.hidden = part !== 'leaderboard';
  }
  if (els.root) {
    els.root.dataset.part = showAll ? 'all' : part;
  }
}

function renderPublicTotal(totalSteps, personalSteps = null) {
  if (totalSteps !== null && totalSteps !== undefined) {
    clubTotalSteps = totalSteps;
    if (els.totalSteps) els.totalSteps.textContent = formatSteps(totalSteps);
  }
  if (!els.personalTotalWrap || !els.personalSteps) return;
  if (personalSteps === null || personalSteps === undefined) {
    els.personalTotalWrap.hidden = true;
    return;
  }
  els.personalSteps.textContent = formatSteps(personalSteps);
  els.personalTotalWrap.hidden = false;
}

function renderLeaderboard(totals) {
  if (!els.leaderboard) return;
  const view = toLeaderboardView(totals || { totalSteps: 0, contributors: [] });
  if (els.leaderboardCaption) {
    els.leaderboardCaption.hidden = !view.hasMoreParticipants;
    if (view.hasMoreParticipants) {
      els.leaderboardCaption.textContent = `Top ${view.leaderboardLimit} of ${view.participantCount} participants`;
    }
  }
  if (!view.rows.length) {
    els.leaderboard.innerHTML =
      '<li class="leaderboard__empty">No recorded steps yet</li>';
    return;
  }
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
  if (!els.stepsLabel || !els.saveBtn || !els.dateInput) return;
  const label = formatDisplayDate(selectedDate);
  const isToday = selectedDate === todayKey();
  els.stepsLabel.textContent = isToday ? 'Steps today' : `Steps for ${label}`;
  els.saveBtn.textContent = isToday ? "Save today's steps" : `Save steps for ${label}`;
  els.dateInput.value = selectedDate;
  els.dateInput.max = todayKey();
}

function renderMonthCalendar({ labelEl, gridEl, month, selected, historyMap }) {
  if (!labelEl || !gridEl) return;
  const grid = buildMonthGrid(month.year, month.monthIndex, {
    today: todayKey(),
    selected,
    history: historyMap,
  });
  labelEl.textContent = grid.label;
  gridEl.innerHTML = grid.cells
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

function renderCalendar() {
  renderMonthCalendar({
    labelEl: els.calLabel,
    gridEl: els.calGrid,
    month: viewMonth,
    selected: selectedDate,
    historyMap: history,
  });
}

function renderAdminCalendar() {
  renderMonthCalendar({
    labelEl: els.adminCalLabel,
    gridEl: els.adminCalGrid,
    month: adminViewMonth,
    selected: adminSelectedDate,
    historyMap: adminHistory,
  });
}

function applyDaySteps(daySteps) {
  if (!els.stepsInput) return;
  if (daySteps !== null && daySteps !== undefined) {
    els.stepsInput.value = String(daySteps);
  } else {
    els.stepsInput.value = '';
  }
}

function showTrackCta(options = {}) {
  const { unauthorizedGroup = false, errorMessage = '' } = options;
  if (els.trackCta) els.trackCta.hidden = false;
  if (els.trackApp) els.trackApp.hidden = true;
  if (els.trackHeading) els.trackHeading.textContent = 'Walkathon';

  if (els.trackCtaTitle) {
    els.trackCtaTitle.textContent = unauthorizedGroup
      ? 'Walkathon members only'
      : 'Join the Walkathon!';
  }
  if (els.trackCtaLede) {
    els.trackCtaLede.textContent = unauthorizedGroup
      ? "You're signed in, but this challenge is for Walkathon members. Ask a club admin to add you to the group."
      : 'Log your daily steps with the club challenge. Participation is for Walkathon members.';
  }
  if (els.trackCtaAction && els.joinLink) {
    els.joinLink.href = joinUrl();
    els.joinLink.textContent = unauthorizedGroup ? 'Visit the club website' : 'Join the Walkathon!';
    els.trackCtaAction.hidden = api.mode !== 'prod';
  }
  if (unauthorizedGroup && errorMessage) {
    setMessage(els.formErrorTrack, errorMessage);
  } else {
    setMessage(els.formErrorTrack, '');
  }
}

function showTrackApp(member) {
  if (els.trackCta) els.trackCta.hidden = true;
  if (els.trackApp) els.trackApp.hidden = false;
  if (els.trackHeading) els.trackHeading.textContent = 'Log steps';
  if (els.memberName) {
    els.memberName.textContent = member.name || member.email || 'Member';
  }
  setMessage(els.formError, '');
  setMessage(els.formErrorTrack, '');
  setMessage(els.formSuccess, '');
}

function showBoardGate(options = {}) {
  const { inactive = false, needsConnect = false } = options;
  if (els.boardGate) els.boardGate.hidden = false;
  if (els.boardContent) els.boardContent.hidden = true;
  if (els.boardGateLede) {
    els.boardGateLede.textContent = inactive
      ? 'Your club membership is not active, so the leaderboard is unavailable.'
      : needsConnect
        ? 'Connect your club login once to see the leaderboard.'
        : 'You need to be an AIWCD club member to view the leaderboard.';
  }
  if (els.boardGateAction && els.boardLoginLink) {
    els.boardLoginLink.href = clubLoginUrl();
    els.boardLoginLink.textContent = inactive
      ? 'Visit the club website'
      : 'Connect club login';
    els.boardGateAction.hidden = api.mode !== 'prod';
  }
}

function showBoardContent(totals) {
  if (els.boardGate) els.boardGate.hidden = true;
  if (els.boardContent) els.boardContent.hidden = false;
  setMessage(els.formErrorBoard, '');
  renderLeaderboard(totals);
}

function maybeShowAdmin(member, contributors) {
  isAdmin = Boolean(member?.isAdmin);
  if (!isAdmin || !els.sectionAdmin) {
    if (els.sectionAdmin) els.sectionAdmin.hidden = true;
    return;
  }

  els.sectionAdmin.hidden = false;
  if (Array.isArray(contributors) && contributors.length) {
    adminContributors = contributors;
  }
  populateAdminParticipants();
  updateAdminFormLabels();
  renderAdminCalendar();
  if (els.adminParticipant?.value) {
    loadAdminParticipant();
  }
}

function updateAdminFormLabels() {
  if (!els.adminStepsLabel || !els.adminSaveBtn || !els.adminDate) return;
  const label = formatDisplayDate(adminSelectedDate);
  const isToday = adminSelectedDate === todayKey();
  els.adminStepsLabel.textContent = isToday ? 'Steps today' : `Steps for ${label}`;
  els.adminSaveBtn.textContent = isToday
    ? "Save today's steps for participant"
    : `Save steps for ${label}`;
  els.adminDate.value = adminSelectedDate;
  els.adminDate.max = todayKey();
}

function applyAdminDaySteps(daySteps) {
  if (!els.adminSteps) return;
  if (daySteps !== null && daySteps !== undefined) {
    els.adminSteps.value = String(daySteps);
  } else {
    els.adminSteps.value = '';
  }
}

async function loadAdminParticipant() {
  const contactId = els.adminParticipant?.value;
  if (!contactId || typeof api.adminParticipant !== 'function') return;

  setMessage(els.adminFormError, '');
  const res = await api.adminParticipant(contactId, adminSelectedDate);
  if (!res.ok) {
    setMessage(els.adminFormError, res.error);
    return;
  }

  adminHistory = res.history || {};
  if (res.selectedDate) adminSelectedDate = res.selectedDate;
  const d = parseDateKey(adminSelectedDate);
  if (d) {
    adminViewMonth = { year: d.getFullYear(), monthIndex: d.getMonth() };
  }
  applyAdminDaySteps(res.daySteps);
  updateAdminFormLabels();
  renderAdminCalendar();
}

async function selectAdminDate(dateKey) {
  adminSelectedDate = dateKey;
  const d = parseDateKey(dateKey);
  if (d) {
    adminViewMonth = { year: d.getFullYear(), monthIndex: d.getMonth() };
  }
  updateAdminFormLabels();
  renderAdminCalendar();

  const contactId = els.adminParticipant?.value;
  if (!contactId || typeof api.adminParticipant !== 'function') {
    applyAdminDaySteps(adminHistory[dateKey] ?? null);
    renderAdminCalendar();
    return;
  }

  setMessage(els.adminFormError, '');
  const res = await api.adminParticipant(contactId, adminSelectedDate);
  if (!res.ok) {
    setMessage(els.adminFormError, res.error);
    return;
  }
  adminHistory = res.history || {};
  if (res.selectedDate) adminSelectedDate = res.selectedDate;
  applyAdminDaySteps(res.daySteps);
  updateAdminFormLabels();
  renderAdminCalendar();
}

async function refreshAdminContributors() {
  if (!isAdmin || typeof api.adminContributors !== 'function') return;
  const res = await api.adminContributors();
  if (!res.ok) return;
  adminContributors = res.contributors || [];
  populateAdminParticipants();
  if (els.adminParticipant?.value) {
    await loadAdminParticipant();
  }
}

function populateAdminParticipants() {
  if (!els.adminParticipant) return;
  const previous = els.adminParticipant.value;
  const options = adminContributors.map(
    (c) =>
      `<option value="${escapeHtml(c.contactId)}">${escapeHtml(c.name || c.email || c.contactId)} (${formatSteps(c.steps)} total)</option>`,
  );
  els.adminParticipant.innerHTML =
    options.length > 0
      ? options.join('')
      : '<option value="">No participants yet</option>';
  if (previous && adminContributors.some((c) => String(c.contactId) === String(previous))) {
    els.adminParticipant.value = previous;
  }
}

function setupAdminPanel() {
  if (!els.adminSaveBtn || typeof api.adminSetSteps !== 'function') return;

  if (els.adminParticipant) {
    els.adminParticipant.addEventListener('change', async () => {
      setMessage(els.adminFormError, '');
      setMessage(els.adminFormSuccess, '');
      await loadAdminParticipant();
    });
  }

  if (els.adminCalPrev && els.adminCalNext && els.adminCalGrid && els.adminDate) {
    els.adminCalPrev.addEventListener('click', () => {
      const d = new Date(adminViewMonth.year, adminViewMonth.monthIndex - 1, 1);
      adminViewMonth = { year: d.getFullYear(), monthIndex: d.getMonth() };
      renderAdminCalendar();
    });

    els.adminCalNext.addEventListener('click', () => {
      const d = new Date(adminViewMonth.year, adminViewMonth.monthIndex + 1, 1);
      adminViewMonth = { year: d.getFullYear(), monthIndex: d.getMonth() };
      renderAdminCalendar();
    });

    els.adminCalGrid.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-date]');
      if (!btn || btn.disabled) return;
      setMessage(els.adminFormError, '');
      setMessage(els.adminFormSuccess, '');
      await selectAdminDate(btn.dataset.date);
    });

    els.adminDate.addEventListener('change', async () => {
      if (!els.adminDate.value) return;
      setMessage(els.adminFormError, '');
      setMessage(els.adminFormSuccess, '');
      await selectAdminDate(els.adminDate.value);
    });
  }

  els.adminSaveBtn.addEventListener('click', async () => {
    setMessage(els.adminFormError, '');
    setMessage(els.adminFormSuccess, '');

    const contactId = els.adminParticipant?.value;
    if (!contactId) {
      setMessage(els.adminFormError, 'Choose a participant');
      return;
    }

    const validated = validateSteps(els.adminSteps?.value);
    if (!validated.ok) {
      setMessage(els.adminFormError, validated.error);
      return;
    }

    const date = adminSelectedDate || els.adminDate?.value || todayKey();
    const contributor = adminContributors.find((c) => String(c.contactId) === String(contactId));

    els.adminSaveBtn.disabled = true;
    setLoading(true, 'Saving admin edit…');
    try {
      const res = await api.adminSetSteps(contactId, validated.steps, date, {
        name: contributor?.name,
        email: contributor?.email,
      });
      if (!res.ok) {
        setMessage(els.adminFormError, res.error);
        return;
      }
      setMessage(
        els.adminFormSuccess,
        `Saved ${formatSteps(res.steps)} steps for ${contributor?.name || contactId} on ${formatDisplayDate(date)}`,
      );
      adminHistory = { ...adminHistory, [date]: res.steps };
      adminSelectedDate = date;
      applyAdminDaySteps(res.steps);
      updateAdminFormLabels();
      renderAdminCalendar();
      if (res.totals) {
        renderPublicTotal(res.totals.totalSteps);
        if (part === 'all' || part === 'leaderboard') {
          showBoardContent(res.totals);
        }
        adminContributors = res.totals.contributors || adminContributors;
        populateAdminParticipants();
      } else {
        await refreshAdminContributors();
        if (part === 'all' || part === 'total') await initTotal();
        if (part === 'all' || part === 'leaderboard') {
          const board = await api.getLeaderboard();
          if (board.ok) showBoardContent(board.totals);
        }
      }
    } finally {
      els.adminSaveBtn.disabled = false;
      setLoading(false);
    }
  });
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

function fillMockUsers(container, onSuccess) {
  if (!container || api.mode !== 'local') return;
  container.hidden = false;
  container.innerHTML = '';
  for (const user of api.listMockUsers()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--secondary';
    btn.textContent = `Sign in as ${user.label}`;
    btn.addEventListener('click', async () => {
      setMessage(els.formError, '');
      setMessage(els.formErrorTrack, '');
      setMessage(els.formErrorBoard, '');
      setMessage(els.formSuccess, '');
      selectedDate = todayKey();
      const res = await api.loginAs(user.id);
      if (!res.ok) {
        setMessage(part === 'leaderboard' ? els.formErrorBoard : els.formErrorTrack, res.error);
        return;
      }
      await onSuccess();
    });
    container.appendChild(btn);
  }
}

function setupAuthUi() {
  if (els.modeBadge) {
    if (api.mode === 'local') {
      els.modeBadge.hidden = false;
      els.modeBadge.textContent = `Local mock · ${part}`;
      els.modeBadge.dataset.mode = 'local';
    } else {
      els.modeBadge.remove();
      els.modeBadge = null;
    }
  }

  if (els.joinLink) els.joinLink.href = joinUrl();
  if (els.boardLoginLink) {
    els.boardLoginLink.href = clubLoginUrl();
    if (api.mode === 'prod') {
      els.boardLoginLink.addEventListener('click', (event) => {
        event.preventDefault();
        setLoading(true, 'Connecting to club login…');
        Promise.resolve(api.startClubLogin()).catch((err) => {
          setLoading(false);
          setMessage(els.formErrorBoard, err?.message || String(err));
        });
      });
    }
  }

  if (api.mode === 'local' && (part === 'track' || part === 'all')) {
    fillMockUsers(els.mockUsers, async () => {
      const me = await api.getMe(selectedDate);
      if (!me.ok) {
        const groupDenied = /authorized member group/i.test(me.error || '');
        showTrackCta({ unauthorizedGroup: groupDenied, errorMessage: me.error });
        return;
      }
      showTrackApp(me.member);
      history = me.history || {};
      if (me.selectedDate) selectedDate = me.selectedDate;
      applyDaySteps(me.daySteps);
      updateFormLabels();
      renderCalendar();
    });
  }

  if (api.mode === 'local' && (part === 'leaderboard' || part === 'all')) {
    fillMockUsers(els.mockUsersBoard, async () => {
      const board = await api.getLeaderboard();
      if (!board.ok) {
        showBoardGate({ inactive: /not active/i.test(board.error || '') });
        setMessage(els.formErrorBoard, board.error);
        return;
      }
      showBoardContent(board.totals);
    });
  }

  if (els.signOut) {
    els.signOut.hidden = api.mode === 'prod';
    els.signOut.addEventListener('click', async () => {
      await api.logout();
      history = {};
      if (els.stepsInput) els.stepsInput.value = '';
      selectedDate = todayKey();
      updateFormLabels();
      renderCalendar();
      if (part === 'track' || part === 'all') showTrackCta();
      if (part === 'leaderboard' || part === 'all') showBoardGate();
    });
  }
}

function setupCalendar() {
  if (part !== 'track' && part !== 'all') return;
  if (!els.calPrev || !els.calNext || !els.calGrid || !els.dateInput) return;

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
  if ((part !== 'track' && part !== 'all') || !els.saveBtn) return;

  els.saveBtn.addEventListener('click', async () => {
    setMessage(els.formError, '');
    setMessage(els.formSuccess, '');

    const validated = validateSteps(els.stepsInput.value);
    if (!validated.ok) {
      setMessage(els.formError, validated.error);
      return;
    }

    els.saveBtn.disabled = true;
    setLoading(true, 'Saving steps…');
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
      updateFormLabels();
      renderCalendar();
      // Keep club total + leaderboard in sync with the save response (or refetch).
      if (res.totals) {
        renderPublicTotal(res.totals.totalSteps, res.personalTotal);
        if (part === 'all' || part === 'leaderboard') {
          showBoardContent(res.totals);
        }
      } else if (part === 'all' || part === 'total' || part === 'leaderboard') {
        await initTotal();
        if (part === 'all' || part === 'leaderboard') {
          const board = await api.getLeaderboard();
          if (board.ok) showBoardContent(board.totals);
        }
      }
    } finally {
      els.saveBtn.disabled = false;
      setLoading(false);
    }
  });
}

async function initTotal() {
  const res = await api.getPublicTotal();
  if (res.ok) renderPublicTotal(res.totalSteps);
  else renderPublicTotal(0);
}

async function initLeaderboard() {
  if (els.boardGate) els.boardGate.hidden = true;
  if (els.boardContent) els.boardContent.hidden = true;

  const board = await api.getLeaderboard();

  if (board.ok) {
    showBoardContent(board.totals);
    maybeShowAdmin(board.member, board.totals?.contributors);
    if (board.member?.isAdmin) refreshAdminContributors();
    renderPublicTotal(board.totals.totalSteps, board.canTrack ? board.personalTotal : null);
  } else {
    const notSignedIn = /not signed in/i.test(board.error || '');
    showBoardGate({
      inactive: /not active/i.test(board.error || ''),
      needsConnect: notSignedIn,
    });
    if (board.error && !notSignedIn) {
      setMessage(els.formErrorBoard, board.error);
    }
  }
}

async function initTrack() {
  updateFormLabels();
  renderCalendar();

  const me = await api.getMe(selectedDate);

  if (me.ok) {
    showTrackApp(me.member);
    history = me.history || {};
    if (me.selectedDate) selectedDate = me.selectedDate;
    applyDaySteps(me.daySteps);
    updateFormLabels();
    renderCalendar();
    maybeShowAdmin(me.member);
    if (me.member?.isAdmin) refreshAdminContributors();
    if (me.canTrack && me.personalTotal !== undefined) {
      renderPublicTotal(clubTotalSteps ?? me.personalTotal, me.personalTotal);
    }
  } else {
    const groupDenied = /authorized member group/i.test(me.error || '');
    showTrackCta({
      unauthorizedGroup: groupDenied,
      errorMessage: groupDenied ? me.error : '',
    });
  }
}

async function init() {
  showPartSections();

  setupAuthUi();
  setupCalendar();
  setupForm();
  setupAdminPanel();

  // Hide auth-gated panels until we know the session state (stops Connect flash).
  if (api.mode === 'prod') {
    if (els.boardGate) els.boardGate.hidden = true;
    if (els.boardContent) els.boardContent.hidden = true;
    if (els.trackCta) els.trackCta.hidden = true;
    if (els.trackApp) els.trackApp.hidden = true;
  }

  const showTotal = part === 'all' || part === 'total';
  // Public total needs no auth — start immediately (even during OAuth below).
  const totalPromise = showTotal ? initTotal() : null;

  setLoading(true, 'Loading step tracker…');
  try {
    if (api.completeOAuthFromRedirect) {
      setLoading(true, 'Finishing club login…');
      const oauth = await api.completeOAuthFromRedirect();
      if (oauth && oauth.ok === false) {
        setMessage(els.formErrorBoard, oauth.error);
      }
    }

    if (part === 'all') {
      await Promise.all([
        totalPromise ?? Promise.resolve(),
        initLeaderboard(),
        initTrack(),
      ]);
      return;
    }

    if (part === 'total') {
      if (totalPromise) await totalPromise;
      return;
    }

    if (part === 'leaderboard') {
      await initLeaderboard();
      return;
    }

    await initTrack();
  } finally {
    setLoading(false);
  }
}

const COOKIE_CONSENT_KEY = 'aiwcd-cookie-consent';
const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Raleway:wght@600;700&display=swap';

function getCookieConsent() {
  try {
    const value = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (value === 'all' || value === 'essential') return value;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

function setCookieConsent(value) {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
}

function loadGoogleFonts() {
  if (document.getElementById('aiwcd-google-fonts')) return;

  const preconnectApi = document.createElement('link');
  preconnectApi.rel = 'preconnect';
  preconnectApi.href = 'https://fonts.googleapis.com';
  document.head.appendChild(preconnectApi);

  const preconnectStatic = document.createElement('link');
  preconnectStatic.rel = 'preconnect';
  preconnectStatic.href = 'https://fonts.gstatic.com';
  preconnectStatic.crossOrigin = 'anonymous';
  document.head.appendChild(preconnectStatic);

  const stylesheet = document.createElement('link');
  stylesheet.id = 'aiwcd-google-fonts';
  stylesheet.rel = 'stylesheet';
  stylesheet.href = GOOGLE_FONTS_HREF;
  document.head.appendChild(stylesheet);
}

function applyCookieConsent(value) {
  if (value === 'all') loadGoogleFonts();
}

function initCookieBanner() {
  const banner = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('cookie-accept');
  const essentialBtn = document.getElementById('cookie-essential');
  const settingsBtn = document.getElementById('cookie-settings');
  if (!banner || !acceptBtn || !essentialBtn) return;

  const existing = getCookieConsent();
  if (existing) {
    applyCookieConsent(existing);
  } else {
    banner.hidden = false;
  }

  function choose(value) {
    setCookieConsent(value);
    applyCookieConsent(value);
    banner.hidden = true;
  }

  acceptBtn.addEventListener('click', () => choose('all'));
  essentialBtn.addEventListener('click', () => choose('essential'));
  settingsBtn?.addEventListener('click', () => {
    banner.hidden = false;
  });
}

initCookieBanner();
init();
