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

/**
 * Per-gadget boot (set by build-widget just before this IIFE).
 * Lets multiple widgets coexist on one Wild Apricot page.
 */
const boot = window.__AIWCD_BOOT__ || {};

const bootConfig = {
  ...(window.STEP_COUNTER_CONFIG || {}),
  ...(boot.config || {}),
};

const api = createApi();
if (window.__AIWCD_BOOT__) {
  // Consume after createApi so the next gadget on the page gets its own boot.
  delete window.__AIWCD_BOOT__;
}const AUTH_ATTEMPT_KEY = 'step-counter-auth-attempted';
/** In-memory lock so parallel leaderboard/track inits only redirect once. */
let authRedirectStarted = false;

/** @type {string} */
let selectedDate = todayKey();
/** @type {Record<string, number>} */
let history = {};
/** @type {{ year: number, monthIndex: number }} */
let viewMonth = (() => {
  const d = parseDateKey(selectedDate) || new Date();
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
})();

function getConfig() {
  return { ...(window.STEP_COUNTER_CONFIG || {}), ...bootConfig };
}

/** @returns {'total' | 'leaderboard' | 'track' | 'all'} */
function resolvePart(rootEl) {
  const fromRoot = rootEl?.dataset?.aiwcdPart;
  const fromBoot = bootConfig.PART || boot.part;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('part');
  // Root attribute and boot win over ?part= so gadgets on one page stay independent.
  const raw = String(fromRoot || fromBoot || fromQuery || 'all').toLowerCase();
  if (raw === 'total' || raw === 'leaderboard' || raw === 'track' || raw === 'all') {
    return raw;
  }
  return 'all';
}

function findRoot() {
  if (boot.rootId) {
    const byId = document.getElementById(boot.rootId);
    if (byId) return byId;
  }
  const hinted = bootConfig.PART || boot.part;
  if (hinted) {
    const byPart = document.querySelector(
      `.aiwcd-step-counter[data-aiwcd-part="${hinted}"]:not([data-aiwcd-ready])`,
    );
    if (byPart) return byPart;
  }
  return (
    document.querySelector('.aiwcd-step-counter:not([data-aiwcd-ready])') ||
    document.getElementById('aiwcd-step-counter')
  );
}

const root = findRoot();
/** @type {'total' | 'leaderboard' | 'track' | 'all'} */
let part = resolvePart(root);
// WA embeds are always the combined gadget. Ignore stale PART:"track" in old pastes.
if (bootConfig.EMBEDDED) {
  part = 'all';
}
if (root) {
  root.dataset.aiwcdPart = part;
  root.dataset.aiwcdReady = '1';
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
};

function clubLoginUrl() {
  const site = String(getConfig().WA_SITE_URL || '').replace(/\/$/, '');
  return site ? `${site}/Sys/Login` : '#';
}

function joinUrl() {
  const config = getConfig();
  if (config.JOIN_URL) return String(config.JOIN_URL);
  return clubLoginUrl();
}

function hostedAppUrl() {
  return String(getConfig().APP_URL || '').replace(/\/$/, '');
}

/** WA Custom HTML cannot call Apps Script (CSP blocks googleusercontent). */
function isWaBridge() {
  return Boolean(getConfig().EMBEDDED);
}

function openHostedApp() {
  const url = hostedAppUrl();
  if (!url) {
    const msg =
      'Hosted tracker URL is missing. Rebuild with APP_URL=https://your.github.io/step-counter/';
    setMessage(els.formErrorBoard, msg);
    setMessage(els.formErrorTrack, msg);
    return;
  }
  window.location.href = url;
}

function setupWaBridgeUi() {
  if (els.root) {
    els.root.classList.add('embedded');
    els.root.dataset.part = 'all';
  }
  if (els.totalSteps) els.totalSteps.textContent = '—';

  showBoardGate({ needsConnect: true });
  if (els.boardGateLede) {
    els.boardGateLede.textContent =
      'Open the club step tracker to see the leaderboard and connect your login. (This page cannot reach the step API.)';
  }
  if (els.boardGateAction && els.boardLoginLink) {
    els.boardLoginLink.textContent = 'Open step tracker';
    els.boardLoginLink.href = hostedAppUrl() || '#';
    els.boardLoginLink.classList.add('btn', 'btn--primary');
    els.boardGateAction.hidden = false;
    els.boardLoginLink.addEventListener('click', (event) => {
      event.preventDefault();
      openHostedApp();
    });
  }

  showTrackCta();
  if (els.trackCtaLede) {
    els.trackCtaLede.textContent =
      'Log your daily Walkathon steps in the club step tracker.';
  }
  if (els.trackCtaAction && els.joinLink) {
    els.joinLink.textContent = 'Open step tracker';
    els.joinLink.href = hostedAppUrl() || '#';
    els.trackCtaAction.hidden = false;
    els.joinLink.addEventListener('click', (event) => {
      event.preventDefault();
      openHostedApp();
    });
  }

  if (!hostedAppUrl()) {
    const msg =
      'Rebuild widget with APP_URL pointing at your GitHub Pages tracker (Wild Apricot blocks Apps Script here).';
    setMessage(els.formErrorBoard, msg);
    setMessage(els.formErrorTrack, msg);
  }
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
  // Combined WA embed includes all three sections. Never hide them — even if PART
  // resolves to "track" (old paste, stripped data-attrs, or page ?part=).
  const embedded = Boolean(getConfig().EMBEDDED);
  const showAll =
    part === 'all' || embedded || present.length !== 3 || present.length <= 1;

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
    if (embedded) els.root.classList.add('embedded');
  }
}

function renderPublicTotal(totalSteps) {
  if (!els.totalSteps) return;
  els.totalSteps.textContent = formatSteps(totalSteps);
}

function renderLeaderboard(totals) {
  if (!els.leaderboard) return;
  const view = toLeaderboardView(totals || { totalSteps: 0, contributors: [] });
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

function renderCalendar() {
  if (!els.calLabel || !els.calGrid) return;
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
  const config = getConfig();
  const embedded = Boolean(config.EMBEDDED);

  if (els.modeBadge) {
    // Never show mock chrome in production / on GitHub Pages.
    if (api.mode === 'local' && !embedded) {
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
    els.signOut.hidden = embedded || api.mode === 'prod';
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
        renderPublicTotal(res.totals.totalSteps);
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

function maybeAutoConnect(result) {
  if (api.mode !== 'prod') return false;
  if (result.ok) {
    sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
    authRedirectStarted = false;
    return false;
  }

  const err = result.error || '';
  if (/authorized member group|not active|Membership/i.test(err)) {
    return false;
  }
  // Only kick off SSO when the API says we have no app session.
  if (err && !/not signed in/i.test(err)) {
    return false;
  }

  const config = getConfig();
  if (!config.APPS_SCRIPT_URL) return false;
  if (api.hasSession()) return false;
  if (authRedirectStarted || sessionStorage.getItem(AUTH_ATTEMPT_KEY)) return false;

  authRedirectStarted = true;
  sessionStorage.setItem(AUTH_ATTEMPT_KEY, '1');
  Promise.resolve(api.startClubLogin()).catch(() => {
    authRedirectStarted = false;
    sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
  });
  return true;
}

async function initTotal() {
  const res = await api.getPublicTotal();
  if (res.ok) renderPublicTotal(res.totalSteps);
  else renderPublicTotal(0);
}

async function initLeaderboard() {
  // Avoid flashing the Connect button while we still might auto-SSO.
  if (els.boardGate) els.boardGate.hidden = true;
  if (els.boardContent) els.boardContent.hidden = true;

  const board = await api.getLeaderboard();
  if (maybeAutoConnect(board)) {
    setLoading(true, 'Connecting to club login…');
    return;
  }

  if (board.ok) {
    showBoardContent(board.totals);
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
  if (maybeAutoConnect(me)) {
    setLoading(true, 'Connecting to club login…');
    return;
  }

  if (me.ok) {
    showTrackApp(me.member);
    history = me.history || {};
    if (me.selectedDate) selectedDate = me.selectedDate;
    applyDaySteps(me.daySteps);
    updateFormLabels();
    renderCalendar();
  } else {
    const groupDenied = /authorized member group/i.test(me.error || '');
    showTrackCta({
      unauthorizedGroup: groupDenied,
      errorMessage: groupDenied ? me.error : '',
    });
  }
}

/**
 * Prod: start WA SSO immediately when there is no session (no Connect click).
 * @returns {Promise<boolean>} true if a redirect was started
 */
async function maybeStartProdLogin() {
  if (api.mode !== 'prod') return false;
  if (api.hasSession()) return false;
  if (authRedirectStarted || sessionStorage.getItem(AUTH_ATTEMPT_KEY)) return false;
  if (!getConfig().APPS_SCRIPT_URL) return false;

  authRedirectStarted = true;
  sessionStorage.setItem(AUTH_ATTEMPT_KEY, '1');
  setLoading(true, 'Connecting to club login…');
  try {
    await api.startClubLogin();
  } catch (err) {
    authRedirectStarted = false;
    sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
    setLoading(false);
    setMessage(els.formErrorBoard, err?.message || String(err));
    return false;
  }
  return true;
}

async function init() {
  showPartSections();

  // Legacy EMBEDDED full-app boot (current WA gadget is a separate launcher build).
  if (isWaBridge()) {
    setupWaBridgeUi();
    return;
  }

  setupAuthUi();
  setupCalendar();
  setupForm();

  // Hide auth-gated panels until we know the session state (stops Connect flash).
  if (api.mode === 'prod') {
    if (els.boardGate) els.boardGate.hidden = true;
    if (els.boardContent) els.boardContent.hidden = true;
    if (els.trackCta) els.trackCta.hidden = true;
    if (els.trackApp) els.trackApp.hidden = true;
  }

  setLoading(true, 'Loading step tracker…');
  try {
    if (api.completeOAuthFromRedirect) {
      setLoading(true, 'Finishing club login…');
      const oauth = await api.completeOAuthFromRedirect();
      if (oauth && oauth.ok === false) {
        setMessage(els.formErrorBoard, oauth.error);
      } else if (oauth && oauth.ok && !oauth.skipped) {
        sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
      }
    }

    // Public total needs no auth — show it while SSO may redirect.
    if (part === 'all' || part === 'total') {
      setLoading(true, 'Loading totals…');
      await initTotal();
    }

    // Auto SSO before painting Connect / Walkathon CTAs.
    if (await maybeStartProdLogin()) return;

    if (part === 'all') {
      setLoading(true, 'Loading leaderboard…');
      await initLeaderboard();
      if (authRedirectStarted) return;
      setLoading(true, 'Loading your steps…');
      await initTrack();
      return;
    }
    if (part === 'total') {
      return;
    }
    if (part === 'leaderboard') {
      await initLeaderboard();
      return;
    }
    await initTrack();
  } finally {
    if (!authRedirectStarted) setLoading(false);
  }
}

init();
