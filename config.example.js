/** Copy to config.js and adjust. Never put WA client secrets here. */
window.STEP_COUNTER_CONFIG = {
  /** 'local' = CSV mock via npm run serve. 'prod' = Apps Script + Wild Apricot. */
  MODE: 'local',
  /**
   * Which surface to show: 'all' | 'total' | 'leaderboard' | 'track'
   * Override locally with ?part=all|total|leaderboard|track
   */
  PART: 'all',
  /** True only in the WA launcher widget build (links out to APP_URL). */
  EMBEDDED: false,
  /** Public Apps Script web app URL (prod only). */
  APPS_SCRIPT_URL: '',
  /** Club Wild Apricot site origin, e.g. https://www.aiwcduesseldorf.org */
  WA_SITE_URL: '',
  /** Hosted tracker URL for the WA launcher (GitHub Pages). */
  APP_URL: '',
  /** Optional Walkathon join / info URL (defaults to site login). */
  JOIN_URL: '',
  /** Optional: Apps Script path that starts OAuth (legacy). */
  AUTH_START_PATH: '?action=auth_start',
};
