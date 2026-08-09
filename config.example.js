/** Copy to config.js and adjust. Never put WA client secrets here. */
window.STEP_COUNTER_CONFIG = {
  /** 'local' = CSV mock via npm run serve. 'prod' = Apps Script + Wild Apricot. */
  MODE: 'local',
  /** Hide mode badge; used by the Wild Apricot embed build. */
  EMBEDDED: false,
  /** Public Apps Script web app URL (prod only). */
  APPS_SCRIPT_URL: '',
  /** Club Wild Apricot site origin, e.g. https://www.aiwcduesseldorf.org */
  WA_SITE_URL: '',
  /** Optional: Apps Script path that starts OAuth (prod only). */
  AUTH_START_PATH: '?action=auth_start',
};
