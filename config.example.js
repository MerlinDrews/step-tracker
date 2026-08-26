/** Copy to config.js and adjust. Never put WA client secrets here. */
window.STEP_COUNTER_CONFIG = {
  /** 'local' = CSV mock via npm run serve. 'prod' = Cloudflare Worker + Wild Apricot. */
  MODE: 'local',
  /**
   * Which surface to show: 'all' | 'total' | 'leaderboard' | 'track'
   * Override locally with ?part=all|total|leaderboard|track
   */
  PART: 'all',
  /** Cloudflare Worker URL (required for production). */
  WORKER_URL: '',
  /** Club Wild Apricot site origin, e.g. https://www.aiwcduesseldorf.org */
  WA_SITE_URL: '',
  /** Walkathon event page for the track CTA (override if the event URL changes). */
  JOIN_URL: 'https://www.aiwcduesseldorf.org/event-6782449',
};
